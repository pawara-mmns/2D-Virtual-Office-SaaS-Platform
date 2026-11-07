export type Row = Record<string, unknown>;
export interface Connection { query<T extends Row = Row>(sql: string, values?: unknown[]): Promise<{ rows: T[] }> }
export interface AdminDatabase extends Connection { transaction<T>(work: (db: Connection) => Promise<T>): Promise<T> }
export type AdminSession = { adminId: string; username: string; sessionHash: string; mfa: boolean; mfaAt: number; credentialVersion: number };
export type RequestContext = { requestId: string; session: AdminSession };
export class AdminError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function input(condition: unknown, message = 'Check the supplied information.'): asserts condition {
  if (!condition) throw new AdminError(400, message);
}
export function id(value: unknown): string {
  input(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 'Choose a valid identifier.');
  return value;
}
export function text(value: unknown, max = 80): string {
  input(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\u0000-\u001f\u007f]/u.test(value));
  return value.trim();
}
export function requireRecentAdminMfa(session: AdminSession, now = Date.now()) {
  if (!session.mfa || now - session.mfaAt > 300000 || session.mfaAt > now + 30000)
    throw new AdminError(403, 'Reauthenticate in Security before making changes (valid for five minutes).');
}
export async function audit(db: Connection, adminId: string | null, action: string, targetType: string, targetId: string | null,
  result: 'success' | 'failed' | 'denied' | 'pending', requestId: string, changes: Row = {}) {
  await db.query(`insert into platform_private.platform_admin_audit_logs(admin_id,action,target_type,target_id,result,request_id,changes)
    values($1,$2,$3,$4,$5,$6,$7::jsonb)`, [adminId, action, targetType, targetId, result, requestId, JSON.stringify(changes)]);
}
