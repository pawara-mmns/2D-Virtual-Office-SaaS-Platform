import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlatformDataGateway, platformDataConfig, PlatformDataError, assertPlatformDataWritable, safeAuthUser, classifyPlatformDataFailure } from './data-access.ts';
import { createTenantReadService } from './tenant-reads.ts';
import { readPlatformTelemetry } from './telemetry.ts';
import { seededDataApi, dataFixtureId } from './data-fixture.test-helper.ts';
import type { AdminDatabase, RequestContext, Row } from './types.ts';

const ctx: RequestContext={requestId:'20000000-0000-4000-8000-000000000001',session:{adminId:'20000000-0000-4000-8000-000000000002',username:'admin',sessionHash:'verified',mfa:true,mfaAt:Date.now(),credentialVersion:1}};
const config={mode:'supabase' as const,url:'https://fixture.supabase.co',key:'synthetic-server-key',project:'fixture.supabase.co',readOnly:true as const};
function controlDb(): AdminDatabase {
  return { async query<T extends Row>(sql:string,values?:unknown[]) {
    if(sql.includes('platform_admin_sessions'))return {rows:(values?.[0]==='verified'?[{mfa_verified_at:new Date().toISOString()}]:[]) as unknown as T[]};
    if(sql.includes('platform_admin_audit_logs'))return {rows:[] as T[]};
    throw new Error('Tenant data must never be queried in the administrator identity database.');
  },transaction(work){return work(this);} };
}
test('target configuration binds a separate server credential to the application project and refuses silent local fallback',()=>{
  const key=`e30.${Buffer.from(JSON.stringify({role:'service_role',ref:'exampleprojectrefhere'})).toString('base64url')}.synthetic`;
  const env={NEXT_PUBLIC_SUPABASE_URL:'https://exampleprojectrefhere.supabase.co',PLATFORM_DATA_SUPABASE_URL:'https://exampleprojectrefhere.supabase.co',PLATFORM_DATA_SUPABASE_SECRET_KEY:key};
  assert.equal(platformDataConfig(env).mode,'supabase');assert.throws(()=>platformDataConfig({...env,PLATFORM_DATA_SUPABASE_URL:'http://localhost:54321'}),PlatformDataError);
  assert.throws(()=>platformDataConfig({NEXT_PUBLIC_SUPABASE_URL:env.NEXT_PUBLIC_SUPABASE_URL,PLATFORM_ADMIN_DATABASE_URL:'postgresql://localhost/control'}),PlatformDataError);
  assert.throws(()=>platformDataConfig({...env,PLATFORM_DATA_SUPABASE_SECRET_KEY:'publishable'}),PlatformDataError);
  assert.throws(()=>platformDataConfig({...env,PLATFORM_DATA_MODE:'database'}),PlatformDataError);
  assert.throws(()=>assertPlatformDataWritable(config),/read-only/);
});
test('separate seeded tenant source returns exact nonzero totals without profile joins or local-store fallback',async()=>{
  const f=seededDataApi(),service=createTenantReadService(controlDb(),config,createPlatformDataGateway(config,f.fetcher));
  const data=await service.dashboard(ctx);
  assert.deepEqual(data.counts,{organizations:2,active_organizations:1,suspended_organizations:1,registered_users:4,active_memberships:3,offices:2});
  assert.deepEqual(data.diagnostics,{profiles:3,organization_memberships:5});assert.equal(data.dataSource.readOnly,true);
  assert.equal(f.calls.every(call=>call.method==='HEAD'||call.method==='GET'),true);
  assert.equal(f.calls.every(call=>call.cookie===null&&call.authorization==='Bearer synthetic-server-key'),true);
});
test('database errors, permission denial, missing schemas and malformed totals never become zero',async()=>{
  for(const [status,code,category] of [[403,'42501','permission_denied'],[404,'PGRST205','missing_schema'],[400,'42703','missing_schema'],[503,'','database_unavailable'],[400,'bad','query_failed']] as const){
    const f=seededDataApi();f.failTable='offices';f.failStatus=status;f.failCode=code;
    await assert.rejects(createTenantReadService(controlDb(),config,createPlatformDataGateway(config,f.fetcher)).dashboard(ctx),(e:unknown)=>e instanceof PlatformDataError&&e.category===category);
  }
  const missingHeader=createPlatformDataGateway(config,async()=>Response.json({users:[]}));
  await assert.rejects(missingHeader.users(1,1),(e:unknown)=>e instanceof PlatformDataError&&e.category==='invalid_response');
  await assert.rejects(createPlatformDataGateway(config,async()=>{throw Error('sensitive connection text');}).table('offices',{select:'id'},true),/could not be reached/);
  for(const code of ['ECONNREFUSED','42501','42P01','42703','40001']){
    const classified=classifyPlatformDataFailure({code,query:'private query',password:'private password'});
    assert.ok(classified instanceof PlatformDataError);assert.equal(JSON.stringify(classified).includes('private'),false);
  }
});
test('genuinely empty tenant tables return successful zero totals with an explicit source',async()=>{
  const f=seededDataApi();for(const name of Object.keys(f.tables))f.tables[name]=[];f.users.length=0;
  const data=await createTenantReadService(controlDb(),config,createPlatformDataGateway(config,f.fetcher)).dashboard(ctx);
  assert.deepEqual(Object.values(data.counts),[0,0,0,0,0,0]);assert.equal(data.dataSource.project,config.project);
});
test('cross-tenant directories, profile/account searches, status filters, details and safe account projections',async()=>{
  const f=seededDataApi(),service=createTenantReadService(controlDb(),config,createPlatformDataGateway(config,f.fetcher));
  const orgs=await service.directory(ctx,'organizations',new URLSearchParams());assert.equal(orgs.rows.length,2);assert.equal(orgs.rows[0]!.members,2);
  assert.equal((await service.directory(ctx,'organizations',new URLSearchParams({status:'SUSPENDED'}))).rows.length,1);
  assert.equal((await service.directory(ctx,'organizations',new URLSearchParams({q:'Cedar'}))).rows.length,1);
  const users=await service.directory(ctx,'users',new URLSearchParams());assert.equal(users.rows.length,4);assert.equal(users.rows[3]!.status,'DELETED');
  assert.equal((await service.directory(ctx,'users',new URLSearchParams({q:'Profile 2',searchBy:'profile'}))).rows.length,1);
  assert.equal((await service.directory(ctx,'users',new URLSearchParams({q:'person2'}))).rows.length,1);
  assert.equal((await service.directory(ctx,'users',new URLSearchParams({q:dataFixtureId(3)}))).rows.length,1);
  const offices=await service.directory(ctx,'offices',new URLSearchParams());assert.equal(offices.rows.length,2);assert.equal(offices.rows[0]!.is_available,null);
  assert.equal((await service.directory(ctx,'offices',new URLSearchParams({organization:dataFixtureId(12)}))).rows.length,1);
  const org=await service.detail(ctx,'organizations',dataFixtureId(11),new URLSearchParams());assert.equal((org.members as Row[]).length,2);
  const user=await service.detail(ctx,'users',dataFixtureId(2),new URLSearchParams());assert.equal((user.memberships as Row[]).length,2);
  assert.equal((await service.detail(ctx,'offices',dataFixtureId(32),new URLSearchParams())).name,'Orbit office');
  assert.equal(JSON.stringify(users).includes('must-not-reach-browser'),false);assert.equal(JSON.stringify(safeAuthUser(f.users[0])).includes('factors'),false);
});
test('ordinary and unverified administrator contexts never contact the global data source',async()=>{
  const f=seededDataApi(),service=createTenantReadService(controlDb(),config,createPlatformDataGateway(config,f.fetcher));
  await assert.rejects(service.dashboard({...ctx,session:{...ctx.session,sessionHash:'ordinary-supabase-session',mfa:false}}),/authentication required/);
  await assert.rejects(service.directory({...ctx,session:{...ctx.session,sessionHash:'owner-role'}},'users',new URLSearchParams()),/authentication required/);
  assert.equal(f.calls.length,0);
});
test('directories use bounded server pagination across more than one page',async()=>{
  const f=seededDataApi();for(let n=50;n<80;n++)f.tables.organizations!.push({id:dataFixtureId(n),name:`Tenant ${n}`,status:'ACTIVE',slug:`tenant-${n}`,created_at:'2026-10-01'});
  const service=createTenantReadService(controlDb(),config,createPlatformDataGateway(config,f.fetcher));
  const first=await service.directory(ctx,'organizations',new URLSearchParams()),second=await service.directory(ctx,'organizations',new URLSearchParams({page:'2'}));
  assert.equal(first.rows.length,25);assert.equal(first.hasNext,true);assert.equal(second.rows.length,7);assert.equal(second.hasNext,false);
  assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,32);
});
test('telemetry distinguishes configuration, authorization, missing endpoint, outage and real observed zero',async()=>{
  const env={REALTIME_INTERNAL_URL:'http://localhost:2567',PLATFORM_OPERATIONS_KEY:'x'.repeat(43)};
  assert.equal((await readPlatformTelemetry({})).reason,'missing_configuration');
  assert.equal((await readPlatformTelemetry({...env,PLATFORM_OPERATIONS_KEY:'short'})).reason,'invalid_configuration');
  for(const [status,reason] of [[403,'authorization_rejected'],[404,'endpoint_missing'],[503,'service_unavailable']] as const)
    assert.equal((await readPlatformTelemetry(env,async()=>new Response(null,{status}))).reason,reason);
  assert.equal((await readPlatformTelemetry(env,async()=>{throw Error('private');})).reason,'unreachable');
  assert.equal((await readPlatformTelemetry(env,async()=>Response.json({connectedUsers:-1}))).reason,'invalid_response');
  const realZero=await readPlatformTelemetry(env,async()=>Response.json({connectedUsers:0,realtimeRooms:0,voiceSessions:null,readiness:'ready'}));
  assert.equal(realZero.available,true);assert.equal(realZero.connectedUsers,0);assert.equal(realZero.voiceSessions,null);
});
