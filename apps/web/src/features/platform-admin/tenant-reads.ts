import { adminDirectory, adminDetail, pagination, assertLiveSession, type Module } from './admin-service.ts';
import { AdminError, id, input, type AdminDatabase, type RequestContext, type Row } from './types.ts';
import { dataSourceInfo, type PlatformDataConfig, type PlatformDataGateway, type SafeAuthUser } from './data-access.ts';

const inIds = (ids: unknown[]) => `in.(${ids.map(id).join(',')})`;
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, '\\$&')}%`;
const literal = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const selection = (select: string, offset = 0, limit = 25) => ({ select, order: 'created_at.desc,id.asc', offset: String(offset), limit: String(limit) });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const state = (user: SafeAuthUser) => user.deleted_at ? 'DELETED' : user.banned_until && new Date(user.banned_until).getTime() > Date.now() ? 'SUSPENDED' : !user.email_confirmed_at ? 'UNVERIFIED' : 'ACTIVE';
async function mapBounded<T, U>(values: T[], work: (value: T) => Promise<U>): Promise<U[]> {
  const output: U[] = new Array(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(5, values.length) }, async () => {
    while (next < values.length) { const i = next++; output[i] = await work(values[i]!); }
  })); return output;
}
export function createTenantReadService(db: AdminDatabase, config: PlatformDataConfig, gateway?: PlatformDataGateway) {
  const source = dataSourceInfo(config);
  const api = () => { if (!gateway) throw new Error('Tenant data gateway missing'); return gateway; };
  const count = async (table: string, filters: Record<string, string> = {}) => (await api().table(table, { select: 'id', ...filters }, true)).total;
  async function profiles(ids: unknown[]) {
    if (!ids.length) return new Map<string, Row>();
    const result = await api().table('profiles', { select: 'id,display_name,avatar_key,created_at,updated_at', id: inIds(ids), limit: String(ids.length) });
    return new Map(result.rows.map(row => [String(row.id), row]));
  }
  async function userRows(users: SafeAuthUser[]) {
    const names = await profiles(users.map(user => user.id));
    return mapBounded(users, async user => ({ ...user, display_name: names.get(user.id)?.display_name ?? null, status: state(user),
      memberships: await count('organization_members', { user_id: `eq.${user.id}`, status: 'eq.ACTIVE' }) }));
  }
  async function offices(filters: Record<string, string>, offset = 0) {
    const result = await api().table('offices', { ...selection('id,name,organization_id,created_at,updated_at,organization:organizations(name)', offset), ...filters });
    const ids = result.rows.map(row => row.id);
    const environments = ids.length ? await api().table('office_environment_settings', { select: 'office_id,config,revision,updated_at', office_id: inIds(ids), limit: String(ids.length) }) : { rows: [] };
    const settings = new Map(environments.rows.map(row => [String(row.office_id), row]));
    return { ...result, rows: result.rows.map(row => ({ id: row.id, name: row.name, organization_id: row.organization_id,
      organization: (row.organization as Row | null)?.name ?? null, created_at: row.created_at, is_available: null,
      availability_note: 'Not configured in the hosted schema', config: settings.get(String(row.id))?.config ?? null,
      revision: settings.get(String(row.id))?.revision ?? 0, updated_at: settings.get(String(row.id))?.updated_at ?? null })) };
  }
  return {
    async dashboard(ctx: RequestContext) {
      await assertLiveSession(db, ctx);
      if (config.mode === 'database') {
        // Preserve the existing restricted SQL implementation in explicitly
        // selected local combined-store installations only.
        const { adminDashboard } = await import('./admin-service.ts');
        return { ...await adminDashboard(db, ctx), dataSource: source };
      }
      const [organizations, active, suspended, auth, memberships, officeCount, profileCount, allMemberships, recent] = await Promise.all([
        count('organizations'), count('organizations', { status: 'eq.ACTIVE' }), count('organizations', { status: 'eq.SUSPENDED' }),
        api().users(1, 1), count('organization_members', { status: 'eq.ACTIVE' }), count('offices'), count('profiles'), count('organization_members'),
        adminDirectory(db, ctx, 'audit-logs', new URLSearchParams()),
      ]);
      return { counts: { organizations, active_organizations: active, suspended_organizations: suspended,
        registered_users: auth.total, active_memberships: memberships, offices: officeCount },
        diagnostics: { profiles: profileCount, organization_memberships: allMemberships }, dataSource: source,
        recent: recent.rows.slice(0, 8), events: [], eventsStatus: 'not_exposed_by_data_api' };
    },
    async directory(ctx: RequestContext, module: Module, params: URLSearchParams): Promise<{ rows: Row[]; page: number; hasNext: boolean; total?: number; dataSource: ReturnType<typeof dataSourceInfo> }> {
      await assertLiveSession(db, ctx);
      if (config.mode === 'database' || module === 'system' || module === 'audit-logs')
        return { ...await adminDirectory(db, ctx, module, params), dataSource: source };
      const { page, offset, search } = pagination(params);
      if (module === 'organizations') {
        const status = params.get('status') ?? ''; input(['', 'ACTIVE', 'SUSPENDED'].includes(status));
        const result = await api().table('organizations', { ...selection('id,name,slug,status,created_at', offset),
          ...(search ? { or: `(name.ilike.${literal(pattern(search))},slug.ilike.${literal(pattern(search))})` } : {}), ...(status ? { status: `eq.${status}` } : {}) });
        const rows = await mapBounded(result.rows, async row => ({ ...row, members: await count('organization_members', { organization_id: `eq.${id(row.id)}`, status: 'eq.ACTIVE' }) }));
        return { rows, page, hasNext: offset + rows.length < result.total, total: result.total, dataSource: source };
      }
      if (module === 'users') {
        const searchBy = params.get('searchBy') ?? 'account'; input(['account','profile'].includes(searchBy));
        if (uuid(search)) {
          const user = await api().user(search); return { rows: user && page === 1 ? await userRows([user]) : [], page, hasNext: false, dataSource: source };
        }
        if (search && searchBy === 'profile') {
          const matches = await api().table('profiles', { ...selection('id', offset), display_name: `ilike.${pattern(search)}` });
          const accounts = await mapBounded(matches.rows, row => api().user(id(row.id)));
          return { rows: await userRows(accounts.filter((user): user is SafeAuthUser => user !== null)), page, hasNext: offset + matches.rows.length < matches.total, total: matches.total, dataSource: source };
        }
        const users = await api().users(page, 25, search.toLowerCase());
        return { rows: await userRows(users.users), page, hasNext: offset + users.users.length < users.total, total: users.total, dataSource: source };
      }
      const org = params.get('organization') || null; if (org) id(org);
      const result = await offices({ ...(org ? { organization_id: `eq.${org}` } : {}), ...(search ? { name: `ilike.${pattern(search)}` } : {}) }, offset);
      return { rows: result.rows, page, hasNext: offset + result.rows.length < result.total, total: result.total, dataSource: source };
    },
    async detail(ctx: RequestContext, module: string, target: string, params: URLSearchParams): Promise<Row> {
      await assertLiveSession(db, ctx); id(target);
      if (config.mode === 'database') return { ...await adminDetail(db, ctx, module, target, params), dataSource: source };
      const { offset, page } = pagination(params);
      if (module === 'organizations') {
        const org = await api().table('organizations', { select: 'id,name,slug,status,created_at,updated_at', id: `eq.${target}`, limit: '1' });
        if (!org.rows[0]) throw new AdminError(404, 'Organization not found.');
        const [members, assigned, invitations] = await Promise.all([
          api().table('organization_members', { select: 'id,user_id,role,status,joined_at', organization_id: `eq.${target}`, order: 'joined_at.asc,id.asc', offset: String(offset), limit: '25' }),
          offices({ organization_id: `eq.${target}` }),
          api().table('organization_invitations', { ...selection('id,email,invited_role,delivery_status,expires_at', offset), organization_id: `eq.${target}`, accepted_at: 'is.null', revoked_at: 'is.null' }),
        ]);
        const names = await profiles(members.rows.map(row => row.user_id));
        const rows = await mapBounded(members.rows, async row => ({ ...row, email: (await api().user(id(row.user_id)))?.email ?? null, display_name: names.get(String(row.user_id))?.display_name ?? null }));
        return { ...org.rows[0], members: rows, offices: assigned.rows, invitations: invitations.rows, page,
          hasNext: offset + rows.length < members.total || offset + invitations.rows.length < invitations.total,
          voice_enabled: null, dataSource: source };
      }
      if (module === 'users') {
        const user = await api().user(target); if (!user) throw new AdminError(404, 'User not found.');
        const names = await profiles([target]);
        const memberships = await api().table('organization_members', { select: 'id,organization_id,role,status,joined_at,organization:organizations(name)',
          user_id: `eq.${target}`, order: 'joined_at.asc,id.asc', offset: String(offset), limit: '25' });
        return { ...user, display_name: names.get(target)?.display_name ?? null, status: state(user),
          memberships: memberships.rows.map(row => ({ id: row.id, organization_id: row.organization_id, role: row.role, status: row.status, organization: (row.organization as Row | null)?.name ?? null })),
          page, hasNext: offset + memberships.rows.length < memberships.total, dataSource: source };
      }
      if (module === 'offices') {
        const result = await offices({ id: `eq.${target}` });
        if (!result.rows[0]) throw new AdminError(404, 'Office not found.'); return { ...result.rows[0], dataSource: source };
      }
      throw new AdminError(404, 'Unknown directory.');
    },
  };
}
