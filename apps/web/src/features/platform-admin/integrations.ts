import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { randomToken, digest } from './crypto';
import { adminDatabase } from './database';
import { adminMutation, assertLiveSession } from './admin-service';
import { AdminError, audit, id, input, requireRecentAdminMfa, text, type RequestContext, type Row } from './types';
import { deliverInvitationEmail, requireInvitationEmailConfig, type InvitationEmail } from '../invitations/email';

function supabaseAdmin() {
  const url = process.env.SUPABASE_ADMIN_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new AdminError(503, 'The server-side Auth administration client is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) }) } });
}
export async function adminUserAccount(ctx: RequestContext, action: string, body: Row) {
  const db = adminDatabase(), user = id(body.id); requireRecentAdminMfa(ctx.session);
  input(['suspend', 'reactivate', 'recovery'].includes(action)); input(body.confirmation === user, 'Type the user ID exactly to confirm.');
  const client = supabaseAdmin();
  // Write-ahead intent survives ambiguous Auth provider responses.
  await assertLiveSession(db, ctx, true);
  await audit(db, ctx.session.adminId, `user.${action}`, 'user', user, 'pending', ctx.requestId);
  try {
    if (action === 'suspend') {
      await adminMutation(db, ctx, 'user.access_suspended', 'user', user, async tx => {
        const exists = await tx.query('select platform_private.lock_identity($1) as present', [user]); input(exists.rows[0]?.present, 'User not found.');
        const owners = await tx.query(`select id from public.organization_members where user_id=$1 and role='OWNER' and status='ACTIVE' limit 1`, [user]);
        input(!owners.rows.length, 'Transfer all active ownerships before suspending this account.');
        await tx.query(`insert into platform_private.user_restrictions(user_id,suspended) values($1,true)
          on conflict(user_id) do update set suspended=true`, [user]);
        return { value: null, changes: { after: { suspended: true } } };
      });
      const { error } = await client.auth.admin.updateUserById(user, { ban_duration: '876000h' });
      if (error) throw new AdminError(503, 'Local platform access is suspended. Auth provider synchronization failed; retry suspension to synchronize.');
    } else if (action === 'reactivate') {
      const { error } = await client.auth.admin.updateUserById(user, { ban_duration: 'none' });
      if (error) throw new AdminError(503, 'Account reactivation could not be confirmed.');
      await adminMutation(db, ctx, 'user.access_reactivated', 'user', user, async tx => {
        await tx.query(`insert into platform_private.user_restrictions(user_id,suspended) values($1,false)
          on conflict(user_id) do update set suspended=false`, [user]);
        return { value: null, changes: { after: { suspended: false } } };
      });
    } else {
      const { data, error } = await client.auth.admin.getUserById(user);
      if (error || !data.user?.email) throw new AdminError(404, 'User not found.');
      const recovery = await client.auth.resetPasswordForEmail(data.user.email);
      if (recovery.error) throw new AdminError(503, 'Recovery email could not be confirmed.');
    }
    await audit(db, ctx.session.adminId, `user.${action}`, 'user', user, 'success', ctx.requestId);
    return { id: user };
  } catch (error) {
    await audit(db, ctx.session.adminId, `user.${action}`, 'user', user, 'failed', ctx.requestId); throw error;
  }
}
export async function adminInvite(ctx: RequestContext, body: Row) {
  const db = adminDatabase(), org = id(body.organizationId), email = text(body.email, 254).toLowerCase();
  input(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)); input(body.role === 'ADMIN' || body.role === 'MEMBER');
  const config = requireInvitationEmailConfig(), token = randomToken();
  const invite = await adminMutation(db, ctx, 'invitation.created', 'organization', org, async tx => {
    const owner = await tx.query(`select m.user_id from public.organization_members m join platform_private.user_directory u on u.id=m.user_id
      where m.organization_id=$1 and m.role='OWNER' and m.status='ACTIVE' and u.deleted_at is null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now()) order by m.id limit 1`, [org]);
    input(owner.rows[0], 'An active verified organization owner is required.');
    await tx.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: owner.rows[0]!.user_id, role: 'authenticated' })]);
    const { rows } = await tx.query('select public.create_organization_invitation($1,$2,$3,$4) as invitation', [org, email, body.role, digest(token)]);
    const result = rows[0]!.invitation as InvitationEmail;
    return { value: result, changes: { invitation_id: result.id, role: body.role } };
  });
  let provider: string;
  try { provider = await deliverInvitationEmail(config, { ...invite, inviter_name: 'Platform administration' }, token); }
  catch {
    await adminMutation(db, ctx, 'invitation.delivery_failed', 'invitation', invite.id, async tx => {
      await tx.query(`update public.organization_invitations set delivery_status='failed' where id=$1 and delivery_version=$2`, [invite.id, invite.version]);
      return { value: null };
    });
    throw new AdminError(503, 'Invitation saved, but delivery could not be confirmed. Its seat remains reserved; the owner can resend or revoke it.');
  }
  await adminMutation(db, ctx, 'invitation.delivered', 'invitation', invite.id, async tx => {
    await tx.query(`update public.organization_invitations set delivery_status='sent',provider_message_id=$3 where id=$1 and delivery_version=$2`, [invite.id, invite.version, provider]);
    return { value: null };
  });
  return { id: invite.id };
}
