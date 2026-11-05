import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { adminDatabase } from './database';
import { lookupAdminSession } from './auth-service';
import { AdminError, audit, type RequestContext } from './types';
import { adminOrigin } from './http-security';

export function adminCookieNames() {
  const secure = adminOrigin().startsWith('https:');
  return { session: secure ? '__Host-vo-admin' : 'vo-admin', csrf: secure ? '__Host-vo-admin-csrf' : 'vo-admin-csrf', secure };
}
export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: adminCookieNames().secure, sameSite: 'strict' as const, path: '/', maxAge };
}
export async function requirePlatformAdmin(allowPending = false): Promise<RequestContext> {
  const requestId = randomUUID();
  const token = (await cookies()).get(adminCookieNames().session)?.value;
  // A regular Supabase session is deliberately never consulted here.
  if (!token) {
    if (process.env.PLATFORM_ADMIN_DATABASE_URL) await audit(adminDatabase(), null, 'admin.access_denied', 'route', null, 'denied', requestId);
    throw new AdminError(401, 'Administrator authentication required.');
  }
  const db = adminDatabase(), session = await lookupAdminSession(db, token, allowPending);
  if (!session) {
    await audit(db, null, 'admin.access_denied', 'route', null, 'denied', requestId);
    throw new AdminError(401, 'Administrator authentication required.');
  }
  return { requestId, session };
}
export async function requireAdminPage(allowPending = false) {
  let ctx: RequestContext | undefined;
  try { ctx = await requirePlatformAdmin(allowPending); } catch { /* Fail closed without leaking infrastructure errors. */ }
  if (!ctx) redirect('/superadmin/login'); return ctx;
}
