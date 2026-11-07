import { randomUUID } from 'node:crypto';
import { parseEnvironment } from '../../../../../packages/shared/src/environment/catalog.ts';
import { composeEnvironment } from '../../../../../packages/shared/src/environment/compose.ts';
import { AdminError, audit, id, input, requireRecentAdminMfa, text, type AdminDatabase, type Connection, type RequestContext, type Row } from './types.ts';

export const modules = ['organizations', 'users', 'offices', 'system', 'audit-logs'] as const;
export type Module = typeof modules[number];
export async function assertLiveSession(db: Connection, ctx: RequestContext, mutation = false) {
  const { rows } = await db.query(`select s.mfa_verified_at from platform_private.platform_admin_sessions s
    join platform_private.platform_admins a on a.id=s.admin_id where s.token_hash=$1 and a.id=$2 and a.is_active
    and a.mfa_enrolled_at is not null and s.mfa_verified_at is not null and s.revoked_at is null
    and s.expires_at>now() and s.last_seen_at>now()-interval '30 minutes' and a.credential_version=s.credential_version
    for share of a`, [ctx.session.sessionHash, ctx.session.adminId]);
  if (!rows[0]) throw new AdminError(401, 'Administrator authentication required.');
  if (mutation) requireRecentAdminMfa({ ...ctx.session, mfa: true, mfaAt: new Date(String(rows[0].mfa_verified_at)).getTime() });
}
export async function adminMutation<T>(db: AdminDatabase, ctx: RequestContext, action: string, targetType: string,
  targetId: string | null, work: (tx: Connection) => Promise<{ value: T; changes?: Row }>) {
  try {
    return await db.transaction(async tx => {
      await assertLiveSession(tx, ctx, true);
      const result = await work(tx);
      await audit(tx, ctx.session.adminId, action, targetType, targetId, 'success', ctx.requestId, result.changes);
      return result.value;
    });
  } catch (error) {
    await audit(db, ctx.session.adminId, action, targetType, targetId, error instanceof AdminError && error.status < 500 ? 'denied' : 'failed', ctx.requestId);
    throw error;
  }
}
function confirm(value: unknown, expected: string) { input(value === expected, `Type ${expected} exactly to confirm.`); }
export function pagination(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 1);
  input(Number.isSafeInteger(page) && page >= 1 && page <= 10000, 'Choose a valid page.');
  return { page, offset: (page - 1) * 25, search: (params.get('q') ?? '').trim().slice(0, 100) };
}
export async function adminDirectory(db: AdminDatabase, ctx: RequestContext, module: Module, params: URLSearchParams) {
  await assertLiveSession(db, ctx);
  const { page, offset, search } = pagination(params), pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  let rows: Row[];
  if (module === 'organizations') {
    const status = params.get('status') ?? ''; input(['', 'ACTIVE', 'SUSPENDED'].includes(status));
    rows = (await db.query(`select o.id,o.name,o.slug,o.status,o.created_at,
      (select count(*)::int from public.organization_members m where m.organization_id=o.id and m.status='ACTIVE') as members
      from public.organizations o where (o.name ilike $1 or o.slug ilike $1) and ($2='' or o.status=$2)
      order by o.created_at desc,o.id limit 26 offset $3`, [pattern, status, offset])).rows;
  } else if (module === 'users') {
    rows = (await db.query(`select u.id,u.email,p.display_name,u.created_at,u.last_sign_in_at,
      case when u.banned_until>now() or exists(select 1 from platform_private.user_restrictions r where r.user_id=u.id and r.suspended)
        then 'SUSPENDED' when u.email_confirmed_at is null then 'UNVERIFIED' else 'ACTIVE' end as status,
      (select count(*)::int from public.organization_members m where m.user_id=u.id and m.status='ACTIVE') as memberships
      from platform_private.user_directory u left join public.profiles p on p.id=u.id where u.deleted_at is null and (u.email ilike $1 or p.display_name ilike $1 or u.id::text=$2)
      order by u.created_at desc,u.id limit 26 offset $3`, [pattern, search, offset])).rows;
  } else if (module === 'offices') {
    const org = params.get('organization') || null; if (org) id(org);
    rows = (await db.query(`select o.id,o.name,o.organization_id,g.name as organization,o.is_available,e.revision,e.config,e.updated_at
      from public.offices o join public.organizations g on g.id=o.organization_id
      left join public.office_environment_settings e on e.office_id=o.id
      where (o.name ilike $1 or g.name ilike $1) and ($2::uuid is null or o.organization_id=$2)
      order by o.created_at desc,o.id limit 26 offset $3`, [pattern, org, offset])).rows;
  } else if (module === 'audit-logs') {
    const result = params.get('result') ?? ''; input(['', 'success', 'denied', 'failed', 'pending'].includes(result));
    rows = (await db.query(`select l.id::text,l.admin_id,a.username,l.action,l.target_type,l.target_id,l.result,l.request_id,l.changes,l.created_at
      from platform_private.platform_admin_audit_logs l left join platform_private.platform_admins a on a.id=l.admin_id
      where (l.action ilike $1 or l.target_id ilike $1) and ($2='' or l.result=$2)
      order by l.created_at desc,l.id desc limit 26 offset $3`, [pattern, result, offset])).rows;
  } else rows = (await db.query('select version,maintenance,registration_enabled,onboarding_enabled,voice_enabled,max_organizations_per_user,updated_at from platform_private.platform_settings')).rows;
  return { rows: rows.slice(0, 25), hasNext: rows.length > 25, page };
}
export async function adminDetail(db: AdminDatabase, ctx: RequestContext, module: string, target: string, params: URLSearchParams) {
  await assertLiveSession(db, ctx); id(target);
  const { offset, page } = pagination(params);
  if (module === 'organizations') {
    const org = await db.query(`select o.id,o.name,o.slug,o.status,o.created_at,coalesce(f.voice_enabled,true) as voice_enabled
      from public.organizations o left join platform_private.organization_features f on f.organization_id=o.id where o.id=$1`, [target]);
    if (!org.rows[0]) throw new AdminError(404, 'Organization not found.');
    const [members, offices, invites] = await Promise.all([
      db.query(`select m.id,m.user_id,m.role,m.status,u.email,p.display_name from public.organization_members m
        join platform_private.user_directory u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
        where m.organization_id=$1 order by m.joined_at,m.id limit 26 offset $2`, [target, offset]),
      db.query(`select o.id,o.name,o.is_available,e.config,e.revision,e.updated_at from public.offices o
        left join public.office_environment_settings e on e.office_id=o.id where o.organization_id=$1`, [target]),
      db.query(`select id,email,invited_role,delivery_status,expires_at from public.organization_invitations
        where organization_id=$1 and accepted_at is null and revoked_at is null order by created_at desc,id limit 26 offset $2`, [target, offset]),
    ]);
    return { ...org.rows[0], members: members.rows.slice(0, 25), offices: offices.rows, invitations: invites.rows.slice(0, 25), page,
      hasNext: members.rows.length > 25 || invites.rows.length > 25 };
  }
  if (module === 'users') {
    const user = await db.query(`select u.id,u.email,p.display_name,u.email_confirmed_at,u.created_at,u.last_sign_in_at,
      case when u.banned_until>now() or exists(select 1 from platform_private.user_restrictions r where r.user_id=u.id and r.suspended)
        then 'SUSPENDED' else 'ACTIVE' end as status from platform_private.user_directory u
      left join public.profiles p on p.id=u.id where u.id=$1 and u.deleted_at is null`, [target]);
    if (!user.rows[0]) throw new AdminError(404, 'User not found.');
    const members = await db.query(`select m.id,m.organization_id,o.name as organization,m.role,m.status from public.organization_members m
      join public.organizations o on o.id=m.organization_id where m.user_id=$1 order by m.joined_at,m.id limit 26 offset $2`, [target, offset]);
    return { ...user.rows[0], memberships: members.rows.slice(0, 25), hasNext: members.rows.length > 25, page };
  }
  if (module === 'offices') {
    const office = await db.query(`select o.id,o.name,o.organization_id,o.is_available,e.config,e.revision,e.updated_at from public.offices o
      left join public.office_environment_settings e on e.office_id=o.id where o.id=$1`, [target]);
    if (!office.rows[0]) throw new AdminError(404, 'Office not found.'); return office.rows[0];
  }
  throw new AdminError(404, 'Unknown directory.');
}
export async function adminDashboard(db: AdminDatabase, ctx: RequestContext) {
  await assertLiveSession(db, ctx);
  const counts = await db.query(`select
    (select count(*)::int from public.organizations) as organizations,
    (select count(*)::int from public.organizations where status='ACTIVE') as active_organizations,
    (select count(*)::int from public.organizations where status='SUSPENDED') as suspended_organizations,
    (select count(*)::int from platform_private.user_directory where deleted_at is null) as registered_users,
    (select count(*)::int from public.organization_members where status='ACTIVE') as active_memberships,
    (select count(*)::int from public.offices) as offices`);
  const recent = await adminDirectory(db, ctx, 'audit-logs', new URLSearchParams());
  const events = await db.query(`select event_type,organization_id,created_at from private.organization_team_events order by created_at desc,id limit 10`);
  return { counts: counts.rows[0]!, recent: recent.rows.slice(0, 8), events: events.rows };
}
export async function adminOrganizationsService(db: AdminDatabase, ctx: RequestContext, action: string, body: Row) {
  const target = action === 'create' ? null : id(body.id);
  return adminMutation(db, ctx, `organization.${action}`, 'organization', target, async tx => {
    if (action === 'create') {
      const owner = id(body.ownerId), name = text(body.name), request = id(body.requestId);
      // Reuse the atomic verified-caller org/OWNER/office provisioning function.
      // Only transaction-local claims for the explicitly selected existing owner.
      await tx.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
      const { rows } = await tx.query('select public.create_organization($1,$2) as id', [name, request]);
      return { value: rows[0], changes: { created_id: rows[0]!.id, owner_id: owner, name } };
    }
    const { rows } = await tx.query('select id,name,status from public.organizations where id=$1 for update', [target]);
    const org = rows[0]; if (!org) throw new AdminError(404, 'Organization not found.');
    if (action === 'update') {
      const name = text(body.name); await tx.query('update public.organizations set name=$2 where id=$1', [target, name]);
      return { value: { id: target }, changes: { before: { name: org.name }, after: { name } } };
    }
    if (action === 'status') {
      input(['ACTIVE', 'SUSPENDED'].includes(String(body.status))); confirm(body.confirmation, String(org.name));
      await tx.query('update public.organizations set status=$2 where id=$1', [target, body.status]);
      return { value: { id: target }, changes: { before: { status: org.status }, after: { status: body.status } } };
    }
    if (action === 'features') {
      input(typeof body.voiceEnabled === 'boolean'); confirm(body.confirmation, String(org.name));
      const before = await tx.query('select voice_enabled from platform_private.organization_features where organization_id=$1', [target]);
      await tx.query(`insert into platform_private.organization_features(organization_id,voice_enabled) values($1,$2)
        on conflict(organization_id) do update set voice_enabled=excluded.voice_enabled`, [target, body.voiceEnabled]);
      return { value: { id: target }, changes: { before: { voice_enabled: before.rows[0]?.voice_enabled ?? true }, after: { voice_enabled: body.voiceEnabled } } };
    }
    if (action === 'transfer') {
      confirm(body.confirmation, String(org.name)); const member = id(body.memberId);
      const recipient = await tx.query(`select m.id,m.user_id from public.organization_members m join platform_private.user_directory u on u.id=m.user_id
        where m.id=$1 and m.organization_id=$2 and m.status='ACTIVE' and m.role<>'OWNER' and u.email_confirmed_at is not null
        and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()) for update of m`, [member, target]);
      input(recipient.rows[0], 'Choose an active, verified non-owner member.');
      const owners = await tx.query(`select id from public.organization_members where organization_id=$1 and role='OWNER' and status='ACTIVE'`, [target]);
      await tx.query(`update public.organization_members set role='OWNER' where id=$1`, [member]);
      await tx.query(`update public.organization_members set role='ADMIN' where organization_id=$1 and id<>$2 and role='OWNER' and status='ACTIVE'`, [target, member]);
      return { value: { id: target }, changes: { previous_owner_memberships: owners.rows.map(x => x.id), next_owner_membership: member } };
    }
    throw new AdminError(400, 'Unknown organization action.');
  });
}
export async function adminMembershipService(db: AdminDatabase, ctx: RequestContext, body: Row) {
  const org = id(body.organizationId), user = id(body.userId);
  input(body.role === 'ADMIN' || body.role === 'MEMBER'); input(body.status === 'ACTIVE' || body.status === 'INACTIVE');
  return adminMutation(db, ctx, 'membership.update', 'organization', org, async tx => {
    const organization = await tx.query('select name from public.organizations where id=$1 for update', [org]);
    input(organization.rows[0], 'Organization not found.'); confirm(body.confirmation, String(organization.rows[0]!.name));
    const existing = await tx.query('select id,role,status from public.organization_members where organization_id=$1 and user_id=$2 for update', [org, user]);
    input(existing.rows[0]?.role !== 'OWNER', 'Transfer ownership before editing an owner membership.');
    if (body.status === 'ACTIVE') {
      const verified = await tx.query(`select id from platform_private.user_directory where id=$1 and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<=now())`, [user]);
      input(verified.rows[0], 'Choose an active, verified user.');
      const seats = await tx.query(`select private.team_seats($1) as count`, [org]);
      input(existing.rows[0]?.status === 'ACTIVE' || Number(seats.rows[0]!.count) < 10, 'The organization has no available seats.');
    }
    await tx.query(`insert into public.organization_members(organization_id,user_id,role,status) values($1,$2,$3,$4)
      on conflict(organization_id,user_id) do update set role=excluded.role,status=excluded.status`, [org, user, body.role, body.status]);
    return { value: { id: org }, changes: { user_id: user, before: existing.rows[0] ?? null, after: { role: body.role, status: body.status } } };
  });
}
export async function adminProfileService(db: AdminDatabase, ctx: RequestContext, body: Row) {
  const user = id(body.id), displayName = text(body.displayName, 100);
  return adminMutation(db, ctx, 'user.profile_updated', 'user', user, async tx => {
    const exists = await tx.query('select id from platform_private.user_directory where id=$1 and deleted_at is null', [user]); input(exists.rows[0], 'User not found.');
    const before = await tx.query('select display_name from public.profiles where id=$1', [user]);
    await tx.query(`insert into public.profiles(id,display_name) values($1,$2) on conflict(id) do update set display_name=excluded.display_name`, [user, displayName]);
    return { value: { id: user }, changes: { before: before.rows[0] ?? null, after: { display_name: displayName } } };
  });
}
export async function adminOfficesService(db: AdminDatabase, ctx: RequestContext, body: Row) {
  const office = id(body.id);
  return adminMutation(db, ctx, 'office.updated', 'office', office, async tx => {
    const { rows } = await tx.query('select id,name,is_available from public.offices where id=$1 for update', [office]);
    input(rows[0], 'Office not found.'); confirm(body.confirmation, String(rows[0]!.name));
    const name = text(body.name); input(typeof body.isAvailable === 'boolean');
    const previous = await tx.query('select config,revision from public.office_environment_settings where office_id=$1', [office]);
    const revision = Number(previous.rows[0]?.revision ?? 0);
    input(Number.isSafeInteger(body.revision) && body.revision === revision, 'Environment changed. Refresh before saving.');
    let config; try { config = parseEnvironment(body.config); composeEnvironment(config); } catch { throw new AdminError(400, 'Choose a valid versioned office environment.'); }
    const nextRevision = revision + 1;
    await tx.query('update public.offices set name=$2,is_available=$3 where id=$1', [office, name, body.isAvailable]);
    await tx.query(`insert into public.office_environment_settings(office_id,config,revision) values($1,$2::jsonb,$3)
      on conflict(office_id) do update set config=excluded.config,revision=excluded.revision,updated_at=now(),updated_by=null`, [office, JSON.stringify(config), nextRevision]);
    // Existing environment polling retires the old room with ENVIRONMENT_CHANGED;
    // no geometry mutation or client coordinates are sent from administration.
    return { value: { id: office, revision: nextRevision }, changes: { before: { ...rows[0], ...previous.rows[0] }, after: { name, is_available: body.isAvailable, revision: nextRevision, config } } };
  });
}
export function settingsInput(body: Row) {
  const keys = ['version','maintenance','registration_enabled','onboarding_enabled','voice_enabled','max_organizations_per_user','confirmation'];
  input(Object.keys(body).every(k => keys.includes(k)), 'Unknown setting.');
  for (const key of keys.slice(1, 5)) input(typeof body[key] === 'boolean');
  input(Number.isSafeInteger(body.version) && Number(body.version) >= 1);
  input(Number.isSafeInteger(body.max_organizations_per_user) && Number(body.max_organizations_per_user) >= 1 && Number(body.max_organizations_per_user) <= 100);
  confirm(body.confirmation, 'APPLY PLATFORM SETTINGS');
  return body;
}
export async function adminSettingsService(db: AdminDatabase, ctx: RequestContext, payload: Row) {
  const body = settingsInput(payload);
  return adminMutation(db, ctx, 'settings.updated', 'platform', null, async tx => {
    const before = await tx.query('select version,maintenance,registration_enabled,onboarding_enabled,voice_enabled,max_organizations_per_user from platform_private.platform_settings for update');
    input(before.rows[0]!.version === body.version, 'Settings changed. Refresh before saving.');
    const after = await tx.query(`update platform_private.platform_settings set version=version+1,maintenance=$1,registration_enabled=$2,
      onboarding_enabled=$3,voice_enabled=$4,max_organizations_per_user=$5,updated_at=now()
      returning version,maintenance,registration_enabled,onboarding_enabled,voice_enabled,max_organizations_per_user`,
    [body.maintenance, body.registration_enabled, body.onboarding_enabled, body.voice_enabled, body.max_organizations_per_user]);
    return { value: after.rows[0], changes: { before: before.rows[0], after: after.rows[0] } };
  });
}
export const newRequestId = () => randomUUID();
