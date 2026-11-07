// Authorized operator operation. No passwords, seeds, tokens, connection strings,
// exported records or raw CLI errors may be printed. Credentials stay in ignored env.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createAdminDatabase } from '../apps/web/src/features/platform-admin/database-runtime.ts';
import { adminFailureDiagnostic } from '../apps/web/src/features/platform-admin/auth-errors.ts';
const root = resolve(import.meta.dirname, '..'), envPath = resolve(root, 'apps/web/.env.local');
const require = createRequire(resolve(root, 'apps/web/package.json')), { Pool } = require('pg');
const loadEnv = path => existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
let phase = 'configuration', sourcePool, targetPool;
function saveEnv(values) {
  let contents = readFileSync(envPath, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${JSON.stringify(value)}`, pattern = new RegExp(`^${key}=.*$`, 'm');
    contents = pattern.test(contents) ? contents.replace(pattern, () => line) : contents.replace(/\s*$/, '\n') + line + '\n';
  }
  writeFileSync(envPath, contents, { mode: 0o600 });
}
function management(args) {
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules/supabase/dist/supabase.js'), 'db', 'query', '--linked', ...args, '--output', 'json'],
    { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60000 });
  if (result.status !== 0) throw Error('Management operation failed. Provider output was withheld.');
  let body;
  try { body = JSON.parse(result.stdout); } catch { throw Error('Invalid management response.'); }
  if (!Array.isArray(body.rows)) throw Error('Invalid management rows.');
  return body.rows;
}
const tables = {
  platform_admins: ['id','username','password_hash','is_active','is_root','mfa_secret_encrypted','mfa_enrolled_at','last_totp_step','credential_version','failed_attempts','locked_until','last_login_at','created_at','updated_at'],
};
function fingerprint(rows, columns) {
  const normalized = rows.map(row => JSON.stringify(columns.map(column => row[column]))).sort();
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
try {
  if (process.argv.slice(2).join(' ') !== '--apply-identity-only') throw Error('Explicit --apply-identity-only is required after authorization.');
  const env = { ...loadEnv(resolve(root, 'apps/web/.env')), ...loadEnv(envPath) };
  const application = new URL(env.NEXT_PUBLIC_SUPABASE_URL || '');
  const ref = readFileSync(resolve(root, 'supabase/.temp/project-ref'), 'utf8').trim();
  if (application.protocol !== 'https:' || application.hostname !== `${ref}.supabase.co`) throw Error('Project mismatch.');
  const sourceUrl = env.PLATFORM_ADMIN_PREVIOUS_DATABASE_URL || env.PLATFORM_ADMIN_DATABASE_URL;
  if (!['localhost','127.0.0.1','[::1]'].includes(new URL(sourceUrl).hostname)) throw Error('Source must be the existing loopback identity database.');
  if (!/^[a-f0-9]{64}$/i.test(env.PLATFORM_ADMIN_MFA_KEY || '')) throw Error('Existing MFA key is required.');
  const template = new URL(readFileSync(resolve(root, 'supabase/.temp/pooler-url'), 'utf8').trim());
  if (!template.hostname.endsWith('.pooler.supabase.com') || template.port !== '5432' || template.pathname !== '/postgres') throw Error('Unexpected session-pooler target.');
  const sourceOptions = { connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000 };
  sourcePool = new Pool(sourceOptions); sourcePool.on('error', () => {});
  const source = createAdminDatabase(sourcePool);
  await source.query('select id from platform_private.platform_admins limit 1');
  const throttles = await source.query("select count(*)::int as active from platform_private.platform_admin_throttles where window_at>now()-interval '15 minutes'");
  if (throttles.rows[0].active !== 0) throw Error('Source has active throttle windows. Wait until they expire; migration must not reset active limits.');
  phase = 'hosted-schema-verification';
  const flags = management(["select to_regclass('platform_private.platform_admins') is not null as installed, exists(select 1 from pg_roles where rolname='platform_admin_hosted') as login_exists"])[0];
  if (!flags?.installed) throw Error('Apply the approved identity-only schema first.');
  let targetUrl = env.PLATFORM_ADMIN_HOSTED_DATABASE_URL;
  if (!targetUrl) {
    if (flags.login_exists) throw Error('Existing hosted runtime configuration is missing; no password was rotated.');
    phase = 'hosted-login-provision';
    const rows = management(['--file', resolve(root, 'scripts/sql/platform-admin-hosted-runtime.sql')]);
    const password = rows.find(row => typeof row.runtime_password === 'string')?.runtime_password;
    if (!password || password.length < 64) throw Error('Runtime credential was not returned.');
    template.username = `platform_admin_hosted.${ref}`; template.password = password;
    template.search = '?sslmode=verify-full'; targetUrl = template.toString();
    saveEnv({ PLATFORM_ADMIN_HOSTED_DATABASE_URL: targetUrl });
  }
  const parsedTarget = new URL(targetUrl);
  if (parsedTarget.hostname !== template.hostname || parsedTarget.username !== `platform_admin_hosted.${ref}` || parsedTarget.searchParams.get('sslmode') !== 'verify-full') throw Error('Invalid saved hosted runtime target.');
  const rootCertificate = resolve(root, 'apps/web/certs/supabase-prod-ca-2021.crt');
  if (!existsSync(rootCertificate)) throw Error('The official public Supabase root CA is required.');
  parsedTarget.searchParams.set('sslrootcert', rootCertificate);
  targetUrl = parsedTarget.toString();
  saveEnv({ PLATFORM_ADMIN_HOSTED_DATABASE_URL: targetUrl });
  phase = 'hosted-tls-and-role-check';
  targetPool = new Pool({ connectionString: targetUrl, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  targetPool.on('error', () => {});
  const tlsClient = await targetPool.connect();
  try {
    if (!tlsClient.connection.stream.encrypted || !tlsClient.connection.stream.authorized) throw Error('Verified TLS required.');
  } finally { tlsClient.release(); }
  const target = createAdminDatabase(targetPool);
  await target.query('select id from platform_private.platform_admins limit 1');
  const targetCounts = {};
  for (const table of Object.keys(tables)) targetCounts[table] = Number((await target.query(`select count(*) as count from platform_private.${table}`)).rows[0].count);
  if (Object.values(targetCounts).some(count => count !== 0)) throw Error('Hosted identities already contain records; refusing to overwrite or duplicate.');
  phase = 'identity-transfer';
  await source.transaction(async sourceTx => {
    // Briefly freeze admin identity writes so accepted TOTP steps and lockouts
    // cannot change underneath the cross-database snapshot. No sessions are copied.
    await sourceTx.query('lock table platform_private.platform_admins in share mode');
    const snapshot = {};
    for (const [table, columns] of Object.entries(tables)) snapshot[table] = (await sourceTx.query(`select ${columns.join(',')} from platform_private.${table}`)).rows;
    if (!snapshot.platform_admins.length || !snapshot.platform_admins.some(row => row.is_active && row.is_root)) throw Error('No active source administrator.');
    await target.transaction(async targetTx => {
      for (const [table, columns] of Object.entries(tables)) {
        for (const row of snapshot[table]) await targetTx.query(`insert into platform_private.${table}(${columns.join(',')}) values(${columns.map((_, i) => '$' + (i + 1)).join(',')})`, columns.map(column => row[column]));
        const copied = (await targetTx.query(`select ${columns.join(',')} from platform_private.${table}`)).rows;
        if (fingerprint(snapshot[table], columns) !== fingerprint(copied, columns)) throw Error('Identity transfer verification mismatch.');
      }
      await targetTx.query(`insert into platform_private.platform_admin_audit_logs(admin_id,action,target_type,target_id,result,request_id,changes)
        values($1,'admin.identity_migrated','administrator',$2,'success',$3,$4::jsonb)`, [snapshot.platform_admins[0].id, snapshot.platform_admins[0].id, randomUUID(), JSON.stringify({ passwordHashPreserved:true, encryptedMfaPreserved:true, priorSessionsCopied:false, priorAuditHistoryCopied:false })]);
    });
    console.info(JSON.stringify({ status: 'hosted-identity-transfer-complete', verifiedTls: true, restrictedRuntime: true,
      transferred: Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, rows.length])),
      passwordHashPreserved: true, encryptedMfaPreserved: true, mfaKeyPreserved: true, priorSessionsCopied: false, priorAuditHistoryCopied: false, appConfigurationSwitched: false }));
  });
  console.info('Saved the pending hosted runtime URL privately. Existing app configuration is unchanged. The source account, sessions, and historical audits remain local; a fresh login is required after cutover.');
} catch (error) {
  console.error(JSON.stringify({ phase, ...adminFailureDiagnostic(error, 'hosted-transfer', 'check/auth') }));
  console.error('Hosted transfer stopped. No raw provider details or secrets were printed. Existing source data and MFA key were retained. Inspect the phase before resuming; do not rotate saved credentials.');
  process.exitCode = 1;
} finally { await sourcePool?.end(); await targetPool?.end(); }
