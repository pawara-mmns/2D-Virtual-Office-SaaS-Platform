import type pg from 'pg';
import type { AdminDatabase, Connection, Row } from './types.ts';
import { AdminAuthError, adminAuthStep } from './auth-errors.ts';

// Kept independent of Next's server-only marker for read-only CLI diagnostics and SQL tests.
export function createAdminDatabase(pool: pg.Pool): AdminDatabase {
  const connection = (client: pg.PoolClient): Connection => ({
    async query<T extends Row>(sql: string, values: unknown[] = []) {
      return adminAuthStep('query', async () => ({ rows: (await client.query(sql, values)).rows as T[] }));
    },
  });
  async function checkedClient() {
    const client = await adminAuthStep('connect', () => pool.connect());
    try {
      await adminAuthStep('runtime_role_check', async () => {
        const { rows } = await client.query(`select current_user as name, rolsuper, rolbypassrls,
          pg_has_role(current_user,'platform_admin_runtime','member') as allowed from pg_roles where rolname=current_user`);
        if (!rows[0]?.allowed || rows[0].rolsuper || rows[0].rolbypassrls || ['postgres','service_role','supabase_admin'].includes(rows[0].name))
          throw new AdminAuthError('database_permission_denied', 'runtime_role_check');
      });
      return client;
    } catch (error) { client.release(); throw error; }
  }
  return {
    async query<T extends Row>(sql: string, values: unknown[] = []) {
      const client = await checkedClient();
      try { return await connection(client).query<T>(sql, values); } finally { client.release(); }
    },
    async transaction<T>(work: (db: Connection) => Promise<T>) {
      const client = await checkedClient();
      try {
        await adminAuthStep('transaction_begin', () => client.query('begin'));
        const value = await work(connection(client));
        await adminAuthStep('transaction_commit', () => client.query('commit'));
        return value;
      } catch (error) {
        // Preserve the original failure if a dropped connection also prevents rollback.
        try { await client.query('rollback'); } catch { /* Failed transactions never grant sessions. */ }
        throw error;
      } finally { client.release(); }
    },
  };
}
