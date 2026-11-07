import 'server-only';
import { adminDatabase } from './database';
import { adminMutation } from './admin-service';
import { AdminError, audit, id, input, type RequestContext, type Row } from './types';
import { readPlatformTelemetry } from './telemetry';

export async function adminOperationalMetrics() {
  return readPlatformTelemetry(process.env);
}
export async function adminRetireOffice(ctx: RequestContext, body: Row) {
  const db = adminDatabase(), officeId = id(body.id);
  const url = process.env.REALTIME_INTERNAL_URL || process.env.NEXT_PUBLIC_REALTIME_URL, key = process.env.PLATFORM_OPERATIONS_KEY;
  if (!url || !key || key.length < 43) throw new AdminError(503, 'Realtime operations are not configured.');
  const origin = new URL(url);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))) throw new AdminError(503, 'Realtime operation origin is invalid.');
  await adminMutation(db, ctx, 'office.retirement_requested', 'office', officeId, async tx => {
    const office = await tx.query('select name from public.offices where id=$1', [officeId]);
    input(office.rows[0] && body.confirmation === office.rows[0].name, 'Type the current office name to confirm.');
    return { value: null };
  });
  try {
    const response = await fetch(`${origin.origin}/platform/office-retire`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ officeId }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error();
    const result = await response.json(); if (typeof result.retired !== 'boolean') throw new Error();
    await audit(db, ctx.session.adminId, 'office.retired', 'office', officeId, 'success', ctx.requestId, { retired: result.retired });
    return { id: officeId, retired: result.retired };
  } catch {
    await audit(db, ctx.session.adminId, 'office.retired', 'office', officeId, 'failed', ctx.requestId);
    throw new AdminError(503, 'Room retirement could not be confirmed. Check room status before retrying.');
  }
}
