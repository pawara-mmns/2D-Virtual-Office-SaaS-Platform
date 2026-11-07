import type { Row } from './types.ts';
export const dataFixtureId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
// Separate synthetic tenant source. Never imported by production routes.
export function seededDataApi(key = 'synthetic-server-key') {
  const who = dataFixtureId, created = '2026-10-01T00:00:00.000Z';
  const users: Row[] = Array.from({ length: 4 }, (_,i) => ({ id: who(i+1), email: `person${i+1}@fixture.invalid`, created_at: created,
    email_confirmed_at: i === 2 ? null : created, banned_until: i === 1 ? '2099-01-01T00:00:00Z' : null,
    deleted_at: i === 3 ? created : null, user_metadata: { private: 'must-not-reach-browser' }, factors: [{ secret: 'must-not-reach-browser' }] }));
  const organizations = [{ id:who(11),name:'Cedar Studio',slug:'cedar',status:'ACTIVE',created_at:created },
    { id:who(12),name:'Orbit Team',slug:'orbit',status:'SUSPENDED',created_at:created }];
  const members = [{ id:who(21),organization_id:who(11),user_id:who(1),role:'OWNER',status:'ACTIVE',joined_at:created },
    { id:who(22),organization_id:who(11),user_id:who(2),role:'MEMBER',status:'ACTIVE',joined_at:created },
    { id:who(23),organization_id:who(12),user_id:who(3),role:'OWNER',status:'ACTIVE',joined_at:created },
    { id:who(24),organization_id:who(12),user_id:who(2),role:'MEMBER',status:'INACTIVE',joined_at:created },
    { id:who(25),organization_id:who(12),user_id:who(4),role:'MEMBER',status:'INACTIVE',joined_at:created }];
  const tables: Record<string, Row[]> = { organizations, organization_members:members,
    profiles: [1,2,3].map(n=>({id:who(n),display_name:`Profile ${n}`,avatar_key:'fern',created_at:created,updated_at:created})),
    offices:[{id:who(31),organization_id:who(11),name:'Cedar office',created_at:created},{id:who(32),organization_id:who(12),name:'Orbit office',created_at:created}],
    office_environment_settings:[],organization_invitations:[] };
  const fixture = { calls: [] as { method: string; path: string; authorization: string | null; cookie: string | null }[],
    failTable:'', failStatus:503, failCode:'', tables, users, fetcher: undefined as unknown as typeof fetch };
  fixture.fetcher = async (target, options) => {
    const url = new URL(String(target)), headers = new Headers(options?.headers), method = options?.method ?? 'GET';
    fixture.calls.push({method,path:url.pathname,authorization:headers.get('authorization'),cookie:headers.get('cookie')});
    if (headers.get('apikey') !== key || headers.get('authorization') !== `Bearer ${key}`) return Response.json({code:'42501'},{status:403});
    if (!['GET','HEAD'].includes(method)) return Response.json({error:'read-only'},{status:403});
    if (url.pathname.startsWith('/auth/v1/admin/users')) {
      const targetId = url.pathname.split('/')[5];
      if(targetId) { const user=users.find(row=>row.id===targetId);return user?Response.json(user):Response.json({error:'missing'},{status:404}); }
      const q=url.searchParams.get('filter')?.toLowerCase(), filtered=q?users.filter(row=>String(row.email).includes(q)):users;
      const page=Number(url.searchParams.get('page')??1),limit=Number(url.searchParams.get('per_page')??25);
      return Response.json({users:filtered.slice((page-1)*limit,page*limit)},{headers:{'x-total-count':String(filtered.length)}});
    }
    const table=url.pathname.split('/')[3]!;
    if(table===fixture.failTable)return Response.json({code:fixture.failCode},{status:fixture.failStatus});
    if(!tables[table])return Response.json({code:'PGRST205'},{status:404});
    let rows=tables[table]!.filter(row=>[...url.searchParams].every(([name,condition])=>{
      if(['select','order','offset','limit','or'].includes(name))return true;
      if(condition.startsWith('eq.'))return String(row[name])===condition.slice(3);
      if(condition==='is.null')return row[name]===null||row[name]===undefined;
      if(condition.startsWith('in.('))return condition.slice(4,-1).split(',').includes(String(row[name]));
      if(condition.startsWith('ilike.'))return String(row[name]).toLowerCase().includes(condition.slice(6).replaceAll('%','').toLowerCase());
      return false;
    }));
    const or=url.searchParams.get('or');if(or){const match=or.match(/ilike\."%(.+?)%"/);if(match)rows=rows.filter(row=>[row.name,row.slug].some(v=>String(v).toLowerCase().includes(match[1]!.toLowerCase())));}
    const total=rows.length, offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??25);
    rows=rows.slice(offset,offset+limit).map(row=>({ ...row,
      ...(url.searchParams.get('select')?.includes('organization:')?{organization:{name:organizations.find(org=>org.id===row.organization_id)?.name}}:{}) }));
    return new Response(method==='HEAD'?null:JSON.stringify(rows),{headers:{'content-type':'application/json','content-range':`*/${total}`}});
  };
  return fixture;
}
