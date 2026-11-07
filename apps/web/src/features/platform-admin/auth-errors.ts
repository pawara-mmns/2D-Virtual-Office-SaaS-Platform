import { AdminError } from './types.ts';

export type AdminFailureCategory = 'database_unavailable' | 'database_credentials_invalid' | 'missing_admin_schema'
  | 'database_permission_denied' | 'network_timeout' | 'tls_configuration_invalid' | 'invalid_configuration'
  | 'administrator_not_found' | 'invalid_credentials' | 'mfa_verification_failed' | 'mfa_configuration_invalid'
  | 'session_creation_failed' | 'database_query_failed' | 'authentication_failed';
export type AdminAuthStage = 'configuration' | 'connect' | 'runtime_role_check' | 'query' | 'transaction_begin'
  | 'transaction_commit' | 'login_rate_limit' | 'admin_lookup' | 'password_verification' | 'session_creation'
  | 'mfa_verification' | 'mfa_key_decryption' | 'audit_write' | 'request';
const messages: Record<AdminFailureCategory, string> = {
  database_unavailable: 'The administrator database is unavailable. Check that its database service is running and retry.',
  database_credentials_invalid: 'The administrator database rejected its server credentials. Contact the platform operator.',
  missing_admin_schema: 'The administrator database schema is missing or incomplete. Contact the platform operator.',
  database_permission_denied: 'The administrator database login lacks the required restricted access. Contact the platform operator.',
  network_timeout: 'The administrator database connection or operation timed out. Retry shortly.',
  tls_configuration_invalid: 'The administrator database secure connection could not be verified. Contact the platform operator.',
  invalid_configuration: 'Administrator authentication is not configured correctly. Contact the platform operator.',
  administrator_not_found: 'Credentials could not be verified.',
  invalid_credentials: 'Credentials could not be verified.',
  mfa_verification_failed: 'Verification failed. Use a new authenticator code and check your credentials.',
  mfa_configuration_invalid: 'Administrator MFA could not be opened securely. Contact the platform operator; keep your existing enrollment.',
  session_creation_failed: 'The administrator session could not be saved. Retry shortly.',
  database_query_failed: 'The administrator database operation failed. Contact the platform operator.',
  authentication_failed: 'Administrator authentication is temporarily unavailable. Retry shortly.',
};
export class AdminAuthError extends AdminError {
  readonly category: AdminFailureCategory;
  readonly stage: AdminAuthStage;
  readonly code?: string;
  constructor(category: AdminFailureCategory, stage: AdminAuthStage, code?: string) {
    super(['administrator_not_found', 'invalid_credentials', 'mfa_verification_failed'].includes(category) ? 401 : 503, messages[category]);
    this.category = category; this.stage = stage; this.code = code;
  }
}
const network = new Set(['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'EAI_AGAIN', '57P01', '57P03', '08006', '08001']);
const tls = new Set(['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']);
export function classifyAdminFailure(error: unknown, stage: AdminAuthStage = 'request'): AdminError {
  if (error instanceof AdminAuthError) {
    // Enrich a generic database stage with the actual authentication step.
    return ['connect', 'runtime_role_check', 'configuration'].includes(error.stage) || stage === 'request' ? error
      : new AdminAuthError(error.category === 'database_query_failed' && stage === 'session_creation' ? 'session_creation_failed' : error.category, stage, error.code);
  }
  if (error instanceof AdminError) return error;
  const raw = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown; errors?: unknown[] } : {};
  const code = typeof raw.code === 'string' ? raw.code : '';
  // pg uses fixed errors without codes for pool/connect deadlines. Do not retain their text.
  if (['ETIMEDOUT', '57014'].includes(code) || ['Connection terminated due to connection timeout', 'timeout exceeded when trying to connect'].includes(String(raw.message)))
    return new AdminAuthError('network_timeout', stage, code || undefined);
  if (network.has(code)) return new AdminAuthError('database_unavailable', stage, code);
  if (['28P01', '28000'].includes(code)) return new AdminAuthError('database_credentials_invalid', stage, code);
  if (['42P01', '3F000', '42703', '42704'].includes(code)) return new AdminAuthError('missing_admin_schema', stage, code);
  if (code === '3D000') return new AdminAuthError('invalid_configuration', stage, code);
  if (code === '42501') return new AdminAuthError('database_permission_denied', stage, code);
  if (tls.has(code)) return new AdminAuthError('tls_configuration_invalid', stage, code);
  if (Array.isArray(raw.errors) && raw.errors.length) return classifyAdminFailure(raw.errors[0], stage);
  return new AdminAuthError(stage === 'session_creation' ? 'session_creation_failed' : stage === 'mfa_key_decryption' ? 'mfa_configuration_invalid'
    : /^[0-9A-Z]{5}$/.test(code) ? 'database_query_failed' : 'authentication_failed', stage, /^[0-9A-Z]{5}$/.test(code) ? code : undefined);
}
export async function adminAuthStep<T>(stage: AdminAuthStage, work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { throw classifyAdminFailure(error, stage); }
}
export function adminFailureDiagnostic(error: unknown, requestId: string, action: string) {
  const failure = classifyAdminFailure(error);
  // Explicit projection: no error message/stack/cause, SQL, user input, or connection URL.
  return { requestId, operation: ['auth/login', 'auth/mfa', 'auth/reauth', 'auth/enroll-start', 'auth/password', 'auth/logout', 'auth/logout-all', 'pool/idle', 'check/auth'].includes(action) ? action : 'admin/request',
    category: failure instanceof AdminAuthError ? failure.category : failure.status === 429 ? 'rate_limited' : 'request_denied',
    stage: failure instanceof AdminAuthError ? failure.stage : 'request', code: failure instanceof AdminAuthError ? failure.code : undefined };
}
