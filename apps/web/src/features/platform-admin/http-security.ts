import { AdminError } from './types.ts';
import { equal } from './crypto.ts';

export function adminOrigin(env: Record<string, string | undefined> = process.env) {
  const value = env.PLATFORM_ADMIN_ORIGIN || env.APP_URL;
  if (!value) throw new AdminError(503, 'Administrator origin is not configured.');
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password || url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    throw new AdminError(503, 'Administrator origin is invalid.');
  return value;
}
export function checkAdminMutation(request: Request, cookie: string | undefined, env: Record<string, string | undefined> = process.env) {
  if (request.headers.get('origin') !== adminOrigin(env) || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new AdminError(403, 'Request origin denied.');
  const csrf = request.headers.get('x-admin-csrf');
  if (!csrf || !cookie || !/^[A-Za-z0-9_-]{43}$/.test(csrf) || !equal(cookie, csrf)) throw new AdminError(403, 'Refresh the page before submitting this request.');
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AdminError(415, 'JSON required.');
}
export async function boundedBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new AdminError(400, 'A request body is required.');
  let bytes = 0; const chunks: Uint8Array[] = [];
  while (true) { const { value, done } = await reader.read(); if (done) break;
    bytes += value.length; if (bytes > 16384) { await reader.cancel(); throw new AdminError(413, 'Request too large.'); } chunks.push(value); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AdminError(400, 'Invalid request.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError(400, 'Invalid request.');
  return body as Record<string, unknown>;
}
