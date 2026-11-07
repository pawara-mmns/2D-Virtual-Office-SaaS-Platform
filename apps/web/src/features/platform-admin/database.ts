import 'server-only';
import pg from 'pg';
import type { AdminDatabase } from './types';
import { createAdminDatabase } from './database-runtime';
import { AdminAuthError, adminFailureDiagnostic } from './auth-errors';

let pool: pg.Pool | undefined;
export function adminDatabase(): AdminDatabase {
  if (!process.env.PLATFORM_ADMIN_DATABASE_URL) throw new AdminAuthError('invalid_configuration', 'configuration');
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.PLATFORM_ADMIN_DATABASE_URL, max: 4,
    connectionTimeoutMillis: 4000, idleTimeoutMillis: 30000, statement_timeout: 8000,
    application_name: 'virtual-office-platform-admin' });
    pool.on('error', error => console.warn('Administrator database idle connection failed.', adminFailureDiagnostic(error, 'background', 'pool/idle')));
  }
  return createAdminDatabase(pool);
}
