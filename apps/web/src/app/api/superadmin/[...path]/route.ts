import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { adminDatabase } from '@/features/platform-admin/database';
import { adminCookieNames, cookieOptions, requirePlatformAdmin } from '@/features/platform-admin/server';
import { adminLogin, beginEnrollment, changeAdminPassword, completeAdminMfa, lookupAdminSession, revokeAdminSessions } from '@/features/platform-admin/auth-service';
import { randomToken } from '@/features/platform-admin/crypto';
import { boundedBody, checkAdminMutation } from '@/features/platform-admin/http-security';
import { AdminError, audit, requireRecentAdminMfa } from '@/features/platform-admin/types';
import { adminDirectory, adminMembershipService, adminOfficesService,
  adminOrganizationsService, adminProfileService, adminSettingsService, modules, type Module } from '@/features/platform-admin/admin-service';
import { adminInvite, adminUserAccount } from '@/features/platform-admin/integrations';
import { adminOperationalMetrics, adminRetireOffice } from '@/features/platform-admin/operations';
import { platformDataReader, requireWritablePlatformData, sanitizedDataFailure } from '@/features/platform-admin/data-server';
import { classifyPlatformDataFailure, PlatformDataError } from '@/features/platform-admin/data-access';
import { AdminAuthError, classifyAdminFailure, adminFailureDiagnostic } from '@/features/platform-admin/auth-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff' };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
type Route = { params: Promise<{ path: string[] }> };
async function fail(error: unknown, action: string, requestId: string) {
  error = action.startsWith('auth/') ? classifyAdminFailure(error) : classifyPlatformDataFailure(error);
  if (action.startsWith('auth/') || error instanceof AdminAuthError)
    console.warn('Administrator request failed.', adminFailureDiagnostic(error, requestId, action));
  sanitizedDataFailure(error, action.split('/')[0] ?? 'unknown', requestId);
  if (process.env.PLATFORM_ADMIN_DATABASE_URL && !(error instanceof AdminAuthError && error.status >= 500)) {
    try {
      const db = adminDatabase(), token = (await cookies()).get(adminCookieNames().session)?.value;
      const actor = token ? await lookupAdminSession(db, token, true) : null;
      const safeAction = ['auth','organizations','users','offices','memberships','invitations','system','dashboard','security','audit-logs'].includes(action.split('/')[0]!) ? action.split('/').slice(0, 1).join('/') : 'unknown';
      await audit(db, actor?.adminId ?? null, 'admin.request_rejected', 'route', safeAction, error instanceof AdminError && error.status < 500 ? 'denied' : 'failed', requestId);
    }
    catch { /* Database outage cannot grant access or leak connection details. */ }
  }
  // Credential denials deliberately share one public response to avoid account enumeration.
  return json({ error: error instanceof AdminError ? error.message : 'Administration is temporarily unavailable. Check the local setup and retry.',
    category: error instanceof AdminAuthError ? ['administrator_not_found','invalid_credentials'].includes(error.category) ? 'invalid_credentials' : error.category : error instanceof PlatformDataError ? error.category : undefined,
    requestId }, error instanceof AdminError ? error.status : 503);
}
export async function GET(request: NextRequest, route: Route) {
  const path = (await route.params).path, requestId = randomUUID();
  try {
    if (path.join('/') === 'auth/csrf') {
      const names = adminCookieNames(), store = await cookies();
      let csrf = store.get(names.csrf)?.value;
      if (!csrf || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) { csrf = randomToken(); store.set(names.csrf, csrf, cookieOptions(28800)); }
      return json({ csrf });
    }
    const ctx = await requirePlatformAdmin(path[0] === 'security');
    ctx.requestId = requestId;
    const db = adminDatabase();
    if (path.join('/') === 'security') {
      const admin = await db.query('select mfa_enrolled_at is not null as enrolled from platform_private.platform_admins where id=$1', [ctx.session.adminId]);
      const sessions = await db.query(`select created_at,last_seen_at,expires_at,mfa_verified_at,token_hash=$2 as current from platform_private.platform_admin_sessions
        where admin_id=$1 and revoked_at is null and expires_at>now() order by created_at desc limit 25`, [ctx.session.adminId, ctx.session.sessionHash]);
      return json({ username: ctx.session.username, mfa: ctx.session.mfa, enrolled: admin.rows[0]!.enrolled, sessions: sessions.rows });
    }
    if (path.join('/') === 'dashboard') return json({ ...await platformDataReader().dashboard(ctx), operations: await adminOperationalMetrics() });
    if (path.length === 1 && ['audit-logs','system'].includes(path[0]!)) return json({
      ...await adminDirectory(db, ctx, path[0] as Module, request.nextUrl.searchParams),
      dataSource: { project: 'Administrator identity and audit store', transport: 'restricted PostgreSQL', readOnly: process.env.PLATFORM_DATA_MODE !== 'database' },
    });
    if (modules.includes(path[0] as Module)) {
      if (path.length === 2) return json(await platformDataReader().detail(ctx, path[0]!, path[1]!, request.nextUrl.searchParams));
      if (path.length === 1) return json(await platformDataReader().directory(ctx, path[0] as Module, request.nextUrl.searchParams));
    }
    throw new AdminError(404, 'Administration endpoint not found.');
  } catch (error) { return fail(error, path.join('/'), requestId); }
}
export async function POST(request: NextRequest, route: Route) {
  const path = (await route.params).path, action = path.join('/'), requestId = randomUUID();
  try {
    const names = adminCookieNames(), store = await cookies();
    checkAdminMutation(request, store.get(names.csrf)?.value);
    const body = await boundedBody(request), db = adminDatabase();
    if (action === 'auth/login') {
      const token = await adminLogin(db, body.username, body.password, requestId);
      store.set(names.session, token, cookieOptions(600));
      return json({ next: '/superadmin/security' });
    }
    const ctx = await requirePlatformAdmin(action.startsWith('auth/'));
    ctx.requestId = requestId;
    if (action.startsWith('auth/')) {
      if (action === 'auth/logout' || action === 'auth/logout-all') {
        await revokeAdminSessions(db, ctx.session, action === 'auth/logout-all', ctx.requestId);
        store.set(names.session, '', cookieOptions(0)); return json({ next: '/superadmin/login' });
      }
      const key = process.env.PLATFORM_ADMIN_MFA_KEY ?? '';
      if (action === 'auth/enroll-start') return json(await beginEnrollment(db, ctx.session, key, ctx.requestId));
      if (action === 'auth/mfa' || action === 'auth/reauth') {
        if (ctx.session.mfa && action === 'auth/mfa') throw new AdminError(400, 'Use reauthentication to renew verification.');
        const token = await completeAdminMfa(db, ctx.session, body.code, body.password, key, ctx.requestId, action === 'auth/reauth');
        store.set(names.session, token, cookieOptions(28800)); return json({ next: '/superadmin' });
      }
      if (action === 'auth/password') {
        requireRecentAdminMfa(ctx.session);
        await changeAdminPassword(db, ctx.session, body.currentPassword, body.newPassword, ctx.requestId);
        store.set(names.session, '', cookieOptions(0)); return json({ next: '/superadmin/login' });
      }
      throw new AdminError(404, 'Authentication endpoint not found.');
    }
    requireWritablePlatformData();
    if (path[0] === 'organizations' && path.length === 2)
      return json(await adminOrganizationsService(db, ctx, path[1]!, body));
    if (action === 'memberships/update') return json(await adminMembershipService(db, ctx, body));
    if (action === 'users/profile') return json(await adminProfileService(db, ctx, body));
    if (path[0] === 'users' && path.length === 2) return json(await adminUserAccount(ctx, path[1]!, body));
    if (action === 'invitations/create') return json(await adminInvite(ctx, body));
    if (action === 'offices/update') return json(await adminOfficesService(db, ctx, body));
    if (action === 'offices/retire') return json(await adminRetireOffice(ctx, body));
    if (action === 'system/update') return json(await adminSettingsService(db, ctx, body));
    throw new AdminError(404, 'Administration endpoint not found.');
  } catch (error) { return fail(error, action, requestId); }
}
