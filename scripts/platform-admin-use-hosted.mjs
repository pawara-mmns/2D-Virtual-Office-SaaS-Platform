// Finish the approved move off Docker after the identity-only transfer.
// Verifies both identity equality and least privilege before the reversible local URL switch.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { createAdminDatabase } from '../apps/web/src/features/platform-admin/database-runtime.ts';
import { adminFailureDiagnostic } from '../apps/web/src/features/platform-admin/auth-errors.ts';
const root = resolve(import.meta.dirname, '..'), envPath = resolve(root, 'apps/web/.env.local');
const require = createRequire(resolve(root, 'apps/web/package.json')), { Pool } = require('pg');
let sourcePool, targetPool;
try {
  const activate = process.argv.slice(2).join(' ') === '--activate';
  if (process.argv.length !== 2 && !activate) throw Error('Only --activate is supported after separate cutover approval.');
  const env = { ...parseEnv(readFileSync(resolve(root, 'apps/web/.env'), 'utf8')), ...parseEnv(readFileSync(envPath, 'utf8')) };
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];
  const targetUrl = new URL(env.PLATFORM_ADMIN_HOSTED_DATABASE_URL);
  if (!targetUrl.hostname.endsWith('.pooler.supabase.com') || targetUrl.port !== '5432' || targetUrl.username !== `platform_admin_hosted.${ref}` ||
    targetUrl.searchParams.get('sslmode') !== 'verify-full' || !targetUrl.searchParams.get('sslrootcert')) throw Error('Invalid hosted target.');
  const sourceUrl = env.PLATFORM_ADMIN_PREVIOUS_DATABASE_URL || env.PLATFORM_ADMIN_DATABASE_URL;
  if (!['127.0.0.1','localhost','[::1]'].includes(new URL(sourceUrl).hostname)) throw Error('Invalid retained source.');
  sourcePool = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 5000 });
  targetPool = new Pool({ connectionString: targetUrl.toString(), max: 1, connectionTimeoutMillis: 10000 });
  sourcePool.on('error', () => {}); targetPool.on('error', () => {});
  const tls = await targetPool.connect();
  try { if (!tls.connection.stream.encrypted || !tls.connection.stream.authorized) throw Error('Verified TLS is required.'); }
  finally { tls.release(); }
  const source = createAdminDatabase(sourcePool), target = createAdminDatabase(targetPool);
  const permission = (await target.query(`select
    has_schema_privilege('anon','platform_private','usage') as anon_private,
    has_schema_privilege('authenticated','platform_private','usage') as authenticated_private,
    has_schema_privilege('service_role','platform_private','usage') as service_role_private,
    has_table_privilege(current_user,'public.organizations','select') as tenant_organizations,
    has_table_privilege(current_user,'public.offices','select') as tenant_offices,
    exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='auth' and c.relname='users' and has_table_privilege(current_user,c.oid,'select')) as auth_users,
    has_table_privilege(current_user,'platform_private.platform_admin_audit_logs','delete') as audit_delete,
    has_table_privilege(current_user,'platform_private.platform_admin_audit_logs','update') as audit_update`)).rows[0];
  if (Object.values(permission).some(value => value !== false)) throw Error('Hosted privilege boundary verification failed.');
  const rls = (await target.query("select bool_and(relrowsecurity) as protected from pg_class where relnamespace='platform_private'::regnamespace and relkind='r'")).rows[0];
  if (!rls.protected) throw Error('All identity tables must enforce RLS.');
  const columns = 'id,username,password_hash,is_active,is_root,mfa_secret_encrypted,mfa_enrolled_at,last_totp_step,credential_version,failed_attempts,locked_until,last_login_at,created_at,updated_at';
  const local = (await source.query(`select ${columns} from platform_private.platform_admins order by id`)).rows;
  const hosted = (await target.query(`select ${columns} from platform_private.platform_admins order by id`)).rows;
  if (!local.length || JSON.stringify(local) !== JSON.stringify(hosted)) throw Error('Admin identity no longer matches source; review before cutover.');
  if (activate) {
    let contents = readFileSync(envPath, 'utf8');
    for (const [key, value] of Object.entries({ PLATFORM_ADMIN_PREVIOUS_DATABASE_URL: sourceUrl, PLATFORM_ADMIN_DATABASE_URL: targetUrl.toString() })) {
      const line = `${key}=${JSON.stringify(value)}`, pattern = new RegExp(`^${key}=.*$`, 'm');
      contents = pattern.test(contents) ? contents.replace(pattern, () => line) : contents.replace(/\s*$/, '\n') + line + '\n';
    }
    writeFileSync(envPath, contents, { mode: 0o600 });
  }
  console.info(JSON.stringify({ status: activate ? 'local-app-switched-to-hosted-identities' : 'hosted-identities-ready-for-cutover', appConfigurationSwitched: activate, verifiedTls: true, restrictedRuntime: true, privateSchemaProtected: true,
    noDirectTenantOrAuthTableAccess: true, originalPasswordAndEncryptedMfaUnchanged: true, priorSessionsTransferred: false, priorHistoryRetainedLocally: true }));
} catch (error) {
  console.error(JSON.stringify(adminFailureDiagnostic(error, 'hosted-cutover', 'check/auth')));
  console.error('Hosted identity cutover stopped; no raw records or credentials were printed.'); process.exitCode = 1;
} finally { await sourcePool?.end(); await targetPool?.end(); }
