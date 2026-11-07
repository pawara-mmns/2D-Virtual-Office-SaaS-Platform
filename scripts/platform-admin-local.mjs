// Prepare this project's genuine local Supabase stack. Never links, resets,
// seeds, or connects to a hosted database. Admin credentials stay interactive.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { Pool } = require('pg');
const cli = resolve(root, 'node_modules/supabase/dist/supabase.js');
const envPath = resolve(root, 'apps/web/.env.local');
const readEnv = file => existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
const localEnv = readEnv(envPath), baseEnv = readEnv(resolve(root, 'apps/web/.env'));
const env = { ...baseEnv, ...localEnv };
function localUrl(value, protocol) {
  const url = new URL(value);
  if (!protocol.includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Setup refused a non-loopback service URL. Hosted databases are never modified.');
  return url;
}
function runCli(args, phase) {
  return new Promise((done, fail) => {
    // Capture both streams: Supabase status/start can print authentication keys.
    const child = spawn(process.execPath, [cli, ...args, '--workdir', root], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', size = 0;
    const timer = setInterval(() => console.info(`${phase} is still running…`), 30000);
    child.stdout.on('data', chunk => { size += chunk.length; if (size < 8 * 1024 * 1024) output += chunk.toString(); });
    child.stderr.on('data', () => {});
    child.on('error', () => { clearInterval(timer); fail(new Error(`${phase} could not start. Check Docker Desktop and the installed Supabase CLI.`)); });
    child.on('exit', code => { clearInterval(timer); if (code !== 0) fail(new Error(`${phase} failed. Check local Docker availability, free ports 54321–54324, and container health. No raw CLI output was printed because it may contain secrets.`)); else done(output); });
  });
}
let pool;
try {
  if (process.argv.length > 2) throw new Error('This local-only setup command accepts no database URL or credentials as arguments.');
  console.info('Starting isolated local Supabase (database, Auth, API, and local email inbox). First startup may download images.');
  await runCli(['start', '--exclude', 'realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'], 'Local Supabase startup');
  console.info('Applying pending migrations to the local database only. Existing data is not reset or seeded.');
  await runCli(['migration', 'up', '--local'], 'Local additive migrations');
  const raw = await runCli(['status', '--output', 'json'], 'Local service inspection');
  const status = JSON.parse(raw);
  if (!status.DB_URL || !status.API_URL || !(status.SECRET_KEY || status.SERVICE_ROLE_KEY)) throw new Error('Local Supabase did not report the required database, Auth URL, and server key.');
  const ownerUrl = localUrl(status.DB_URL, ['postgres:', 'postgresql:']);
  const apiUrl = localUrl(status.API_URL, ['http:', 'https:']);
  const existing = env.PLATFORM_ADMIN_DATABASE_URL ? localUrl(env.PLATFORM_ADMIN_DATABASE_URL, ['postgres:', 'postgresql:']) : null;
  if (existing && (existing.port !== ownerUrl.port || existing.pathname !== ownerUrl.pathname || existing.username !== 'platform_admin_local'))
    throw new Error('An existing administrator database setting targets a different database/login. It was preserved; configure that target manually.');
  if (env.PLATFORM_ADMIN_MFA_KEY && !/^[a-f0-9]{64}$/i.test(env.PLATFORM_ADMIN_MFA_KEY)) throw new Error('The existing MFA encryption key is invalid. It was preserved.');
  pool = new Pool({ connectionString: ownerUrl.toString(), max: 1, connectionTimeoutMillis: 5000 });
  const client = await pool.connect();
  let runtimeUrl;
  try {
    const schema = await client.query(`select to_regclass('platform_private.platform_admins') is not null as installed`);
    if (!schema.rows[0]?.installed) throw new Error('The local platform administration migration is missing.');
    const role = await client.query(`select rolname from pg_roles where rolname='platform_admin_local'`);
    if (role.rows.length && !existing) throw new Error('The local runtime login already exists but its saved connection setting is missing. Recover its database credential through the local operator process; no password was rotated.');
    if (!role.rows.length && existing) throw new Error('Saved local credentials exist but the corresponding database login is missing. The saved credentials were preserved.');
    if (!role.rows.length) {
      const password = randomBytes(32).toString('base64url');
      await client.query('begin');
      try {
        // Parameters stay outside SQL text; the generated credential is neither
        // a command argument nor console output. Create only the restricted login.
        await client.query(`select set_config('platform_setup.runtime_password',$1,true)`, [password]);
        await client.query(`do $$ begin execute format('create role platform_admin_local login inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password %L', current_setting('platform_setup.runtime_password')); end $$`);
        await client.query('grant platform_admin_runtime to platform_admin_local');
        await client.query('commit');
      } catch (error) { await client.query('rollback'); throw error; }
      runtimeUrl = new URL(ownerUrl); runtimeUrl.username = 'platform_admin_local'; runtimeUrl.password = password;
    } else runtimeUrl = existing;
  } finally { client.release(); await pool.end(); pool = undefined; }
  pool = new Pool({ connectionString: runtimeUrl.toString(), max: 1, connectionTimeoutMillis: 5000 });
  const check = await pool.query(`select rolsuper,rolbypassrls,pg_has_role(current_user,'platform_admin_runtime','member') as allowed
    from pg_roles where rolname=current_user`);
  if (!check.rows[0]?.allowed || check.rows[0].rolsuper || check.rows[0].rolbypassrls) throw new Error('Local runtime role verification failed.');
  await pool.query('select id from platform_private.platform_admins limit 1');
  await pool.query('select id from platform_private.user_directory limit 1');
  const values = {
    PLATFORM_ADMIN_DATABASE_URL: runtimeUrl.toString(),
    PLATFORM_ADMIN_ORIGIN: env.PLATFORM_ADMIN_ORIGIN || 'http://localhost:3000',
    PLATFORM_ADMIN_MFA_KEY: env.PLATFORM_ADMIN_MFA_KEY || randomBytes(32).toString('hex'),
    SUPABASE_ADMIN_URL: apiUrl.origin,
    SUPABASE_SECRET_KEY: status.SECRET_KEY || status.SERVICE_ROLE_KEY,
  };
  localUrl(values.PLATFORM_ADMIN_ORIGIN, ['http:', 'https:']);
  let contents = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '# Local server-only administrator settings. Git-ignored. Do not share.\n';
  for (const [name, value] of Object.entries(values)) {
    const line = `${name}=${JSON.stringify(value)}`, pattern = new RegExp(`^${name}=.*$`, 'm');
    contents = pattern.test(contents) ? contents.replace(pattern, () => line) : contents.replace(/\s*$/, '\n') + line + '\n';
  }
  writeFileSync(envPath, contents, { mode: 0o600 });
  console.info('Local admin database, restricted login, MFA key, and Auth admin client are configured in apps/web/.env.local. No secrets were printed.');
  console.info('Existing normal-user Supabase settings were preserved. This console manages local development data, not hosted tenants.');
  console.info('Next: run pnpm.cmd admin:bootstrap, then restart the web app and open http://localhost:3000/superadmin/login.');
} catch (error) {
  // Database/CLI errors may contain SQL, credentials, or URLs. Only our fixed
  // explanatory errors are safe to show; provider errors get a generic message.
  console.error(error instanceof Error && !('code' in error) && !error.message.includes('password=') && !error.message.includes('postgresql://')
    ? error.message : 'Local administrator setup failed. No connection details or credentials were printed.');
  process.exitCode = 1;
} finally { await pool?.end(); }
