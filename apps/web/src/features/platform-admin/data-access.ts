import { AdminError, id, input, type Row } from './types.ts';

export type DataCategory = 'invalid_configuration' | 'database_unavailable' | 'permission_denied' | 'missing_schema' | 'query_failed' | 'invalid_response';
export class PlatformDataError extends AdminError {
  readonly category: DataCategory;
  constructor(category: DataCategory) {
    const messages: Record<DataCategory, string> = {
      invalid_configuration: 'Platform data configuration is missing or does not match the application Supabase project.',
      database_unavailable: 'The platform database or Auth service could not be reached. Retry shortly.',
      permission_denied: 'The platform data service denied access. Check the separate server administrator key and database grants.',
      missing_schema: 'A required platform table or column is missing from the configured project. No migrations were applied.',
      query_failed: 'The platform data query failed. Retry or check the server diagnostics.',
      invalid_response: 'The platform data service returned an invalid result. Counts are unavailable; they were not replaced with zero.',
    };
    super(503, messages[category]); this.category = category;
  }
}
export function classifyPlatformDataFailure(error: unknown): unknown {
  if (error instanceof AdminError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EHOSTUNREACH','57P01','57P03','08006','08001'].includes(code)) return new PlatformDataError('database_unavailable');
  if (code === '42501') return new PlatformDataError('permission_denied');
  if (['42P01','42703'].includes(code)) return new PlatformDataError('missing_schema');
  if (/^[0-9A-Z]{5}$/.test(code)) return new PlatformDataError('query_failed');
  return error;
}
export type PlatformDataConfig = { mode: 'supabase'; url: string; key: string; project: string; readOnly: true } | { mode: 'database'; project: string; readOnly: false };
const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);
export function platformDataConfig(env: Record<string, string | undefined>): PlatformDataConfig {
  // Local/test combined-store deployments must explicitly opt in. A missing
  // hosted key must never silently fall back to the local administrator store.
  if (env.PLATFORM_DATA_MODE === 'database') {
    try { if (!loopback(new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname)) throw new Error(); }
    catch { throw new PlatformDataError('invalid_configuration'); }
    return { mode: 'database', project: 'local development database', readOnly: false };
  }
  if (env.PLATFORM_DATA_MODE && env.PLATFORM_DATA_MODE !== 'supabase') throw new PlatformDataError('invalid_configuration');
  const url = env.PLATFORM_DATA_SUPABASE_URL, key = env.PLATFORM_DATA_SUPABASE_SECRET_KEY, expected = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !key || !expected) throw new PlatformDataError('invalid_configuration');
  try {
    const parsed = new URL(url), application = new URL(expected);
    if (parsed.origin !== url || parsed.origin !== application.origin || parsed.username || parsed.password ||
      parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback(parsed.hostname))) throw new Error();
    const project = loopback(parsed.hostname) ? `local:${parsed.port}` : parsed.hostname;
    if (env.PLATFORM_DATA_PROJECT_REF && parsed.hostname !== `${env.PLATFORM_DATA_PROJECT_REF}.supabase.co`) throw new Error();
    if (!key.startsWith('sb_secret_')) {
      const claims = JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString());
      if (claims.role !== 'service_role' || claims.ref && parsed.hostname !== `${claims.ref}.supabase.co`) throw new Error();
    }
    return { mode: 'supabase', url, key, project, readOnly: true };
  } catch { throw new PlatformDataError('invalid_configuration'); }
}
export function assertPlatformDataWritable(config: PlatformDataConfig) {
  if (config.readOnly) throw new AdminError(403, 'This Supabase connection is read-only. Tenant mutations and operational reloads are disabled; the existing independent admin login remains active.');
}
export type SafeAuthUser = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null;
  email_confirmed_at: string | null; banned_until: string | null; deleted_at: string | null };
export function safeAuthUser(value: unknown): SafeAuthUser {
  if (!value || typeof value !== 'object') throw new PlatformDataError('invalid_response');
  const row = value as Row;
  try { id(row.id); } catch { throw new PlatformDataError('invalid_response'); }
  if (typeof row.created_at !== 'string') throw new PlatformDataError('invalid_response');
  const optional = (key: string) => row[key] === null || row[key] === undefined ? null : typeof row[key] === 'string' ? row[key] as string : (() => { throw new PlatformDataError('invalid_response'); })();
  // Explicit projection: never forward metadata, identities, factors or tokens.
  return { id: row.id as string, email: optional('email'), created_at: row.created_at,
    last_sign_in_at: optional('last_sign_in_at'), email_confirmed_at: optional('email_confirmed_at'),
    banned_until: optional('banned_until'), deleted_at: optional('deleted_at') };
}
export interface PlatformDataGateway {
  table(name: string, params: Record<string, string>, countOnly?: boolean): Promise<{ rows: Row[]; total: number }>;
  users(page: number, perPage: number, filter?: string): Promise<{ users: SafeAuthUser[]; total: number }>;
  user(id: string): Promise<SafeAuthUser | null>;
}
const tables = new Set(['organizations', 'organization_members', 'profiles', 'offices', 'office_environment_settings', 'organization_invitations']);
export function createPlatformDataGateway(config: Extract<PlatformDataConfig, { mode: 'supabase' }>, fetcher: typeof fetch = fetch): PlatformDataGateway {
  async function request(path: string, params: Record<string, string>, method = 'GET') {
    // This separate server client permits only known read endpoints and never
    // accepts browser cookies, Authorization headers, user JWTs or request URLs.
    if (!['GET', 'HEAD'].includes(method)) throw new PlatformDataError('permission_denied');
    const url = new URL(path, config.url); url.search = new URLSearchParams(params).toString();
    let response: Response;
    try { response = await fetcher(url, { method, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, Prefer: 'count=exact', Accept: 'application/json' } }); }
    catch { throw new PlatformDataError('database_unavailable'); }
    if (response.status === 404 && path.startsWith('/auth/v1/admin/users/')) return null;
    if (!response.ok) {
      let code = ''; try { const body = await response.json(); if (typeof body.code === 'string') code = body.code; } catch { /* Sanitized category only. */ }
      throw new PlatformDataError([401, 403].includes(response.status) || code === '42501' ? 'permission_denied' :
        ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(code) ? 'missing_schema' : response.status >= 500 ? 'database_unavailable' : 'query_failed');
    }
    return response;
  }
  function count(value: string | null, contentRange = false) {
    const number = contentRange ? value?.match(/\/(\d+)$/)?.[1] : value;
    if (number === undefined || number === null || !/^\d+$/.test(number) || !Number.isSafeInteger(Number(number))) throw new PlatformDataError('invalid_response');
    return Number(number);
  }
  async function body(response: Response) { try { return await response.json(); } catch { throw new PlatformDataError('invalid_response'); } }
  return {
    async table(name, params, countOnly = false) {
      input(tables.has(name), 'Unsupported platform table.');
      const response = await request(`/rest/v1/${name}`, params, countOnly ? 'HEAD' : 'GET');
      if (!response) throw new PlatformDataError('invalid_response');
      const total = count(response.headers.get('content-range'), true), rows: unknown = countOnly ? [] : await body(response);
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new PlatformDataError('invalid_response');
      return { rows: rows as Row[], total };
    },
    async users(page, perPage, filter) {
      const response = await request('/auth/v1/admin/users', { page: String(page), per_page: String(perPage), ...(filter ? { filter } : {}) });
      if (!response) throw new PlatformDataError('invalid_response');
      const data = await body(response);
      if (!data || !Array.isArray(data.users)) throw new PlatformDataError('invalid_response');
      return { users: data.users.map(safeAuthUser), total: count(response.headers.get('x-total-count')) };
    },
    async user(target) {
      id(target); const response = await request(`/auth/v1/admin/users/${target}`, {});
      return response ? safeAuthUser(await body(response)) : null;
    },
  };
}
export function dataSourceInfo(config: PlatformDataConfig) {
  return { project: config.project, transport: config.mode === 'supabase' ? 'Supabase Data API + Auth Admin API' : 'restricted PostgreSQL', readOnly: config.readOnly,
    registeredUsersDefinition: config.mode === 'supabase' ? 'All Auth account records reported by the Auth Admin API, including retained soft-deleted accounts. Profiles are counted separately.' : 'Non-deleted Auth account records. Profiles are optional.' };
}
