// Read-only check of the actual independent administrator identity database.
// No password prompts, MFA decryption, login attempts, migrations, or writes.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { createAdminDatabase } from '../apps/web/src/features/platform-admin/database-runtime.ts';
import { AdminAuthError, adminFailureDiagnostic } from '../apps/web/src/features/platform-admin/auth-errors.ts';
const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const { Pool } = require('pg');
const fileEnv = file => existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
const env = { ...fileEnv(resolve(root, 'apps/web/.env')), ...fileEnv(resolve(root, 'apps/web/.env.local')), ...process.env };
let pool;
try {
  if (process.argv.length > 2 || !env.PLATFORM_ADMIN_DATABASE_URL) throw new AdminAuthError('invalid_configuration', 'configuration');
  let url;
  try { url = new URL(env.PLATFORM_ADMIN_DATABASE_URL); if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error(); }
  catch { throw new AdminAuthError('invalid_configuration', 'configuration'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  console.info(JSON.stringify({ databaseTarget: loopback ? 'loopback' : 'remote', port: url.port || '5432', credentialsPresent: !!url.username && !!url.password,
    sslMode: url.searchParams.get('sslmode') || 'driver default', poolMax: 4, connectionTimeoutMs: 4000, statementTimeoutMs: 8000,
    mfaKeyValidFormat: /^[a-f0-9]{64}$/i.test(env.PLATFORM_ADMIN_MFA_KEY || '') }));
  pool = new Pool({ connectionString: env.PLATFORM_ADMIN_DATABASE_URL, max: 4, connectionTimeoutMillis: 4000, statement_timeout: 8000 });
  pool.on('error', () => {});
  const db = createAdminDatabase(pool);
  const result = await db.transaction(async tx => {
    await tx.query('set transaction read only');
    // The runtime adapter checks the restricted role before this transaction.
    const schema = await tx.query(`select to_regclass('platform_private.platform_admins') is not null as admins,
      to_regclass('platform_private.platform_admin_sessions') is not null as sessions,
      to_regclass('platform_private.platform_admin_throttles') is not null as throttles,
      to_regclass('platform_private.platform_admin_audit_logs') is not null as audit`);
    if (Object.values(schema.rows[0]).some(value => value !== true)) throw new AdminAuthError('missing_admin_schema', 'admin_lookup');
    const accounts = await tx.query(`select count(*)::int as accounts, count(*) filter(where is_active)::int as active,
      count(*) filter(where password_hash like '$argon2id$%')::int as argon2id,
      count(*) filter(where mfa_enrolled_at is not null and mfa_secret_encrypted is not null)::int as enrolled_mfa
      from platform_private.platform_admins`);
    const sessions = await tx.query(`select count(*)::int as retained, count(*) filter(where mfa_verified_at is not null)::int as previously_mfa_verified
      from platform_private.platform_admin_sessions`);
    return { schema: schema.rows[0], accounts: accounts.rows[0], sessions: sessions.rows[0] };
  });
  console.info(JSON.stringify({ status: 'reachable', restrictedRuntimeRole: true, ...result }));
  console.info('Read-only checks passed. Password acceptance and fresh MFA still require an interactive login.');
} catch (error) {
  console.error(JSON.stringify(adminFailureDiagnostic(error, 'local-diagnostic', 'check/auth')));
  console.error('Authentication check failed. For a loopback database, start Docker Desktop and the existing project database container. Do not rerun setup, reset, bootstrap, or recovery to repair an outage.');
  process.exitCode = 1;
} finally { await pool?.end(); }
