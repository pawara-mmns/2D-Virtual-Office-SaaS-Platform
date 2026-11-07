// Real production Next.js + isolated native PostgreSQL. Supabase Auth management
// is a local HTTP stub; no hosted accounts, tenants, emails or deployments.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createServer as httpServer } from 'node:http';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { fixtureId as uid, fixtureSql } from './platform-admin-fixture.mjs';
import { bootstrapAdmin } from '../apps/web/src/features/platform-admin/auth-service.ts';
import { randomToken, totp } from '../apps/web/src/features/platform-admin/crypto.ts';
import { seededDataApi, dataFixtureId } from '../apps/web/src/features/platform-admin/data-fixture.test-helper.ts';
import { createAdminDatabase } from '../apps/web/src/features/platform-admin/database-runtime.ts';
import { AdminAuthError } from '../apps/web/src/features/platform-admin/auth-errors.ts';
const root = resolve(import.meta.dirname, '..'), web = resolve(root, 'apps/web');
const require = createRequire(resolve(web, 'package.json')), { Pool } = require('pg');
const pgBin = process.env.ADMIN_TEST_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const browser = process.env.OFFICE_TEST_BROWSER || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const port = () => new Promise((done, fail) => { const s = createServer(); s.on('error', fail); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); }); });
async function until(check, description, attempts=150) { for (let n=0;n<attempts;n++) { if (await check()) return; await delay(100); } throw new Error(`Timed out: ${description}`); }
function command(exe, args) { const result = spawnSync(resolve(pgBin, exe + (process.platform === 'win32' ? '.exe' : '')), args, { windowsHide: true, encoding: 'utf8', stdio: exe === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 30000 }); if (result.status !== 0) throw new Error(`Local PostgreSQL ${exe} failed. Inspect the disposable cluster log.`); }
async function cdp(url) {
  const ws = new WebSocket(url); await new Promise((done, fail) => { ws.onopen=done; ws.onerror=fail; });
  let serial=0; const pending=new Map(), errors=[];
  ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description || 'Browser exception');const p=pending.get(msg.id);if(p){clearTimeout(p.timer);pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  return {send,errors,close:()=>ws.close(),async evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || 'Browser evaluation failed');return r.result.value;}};
}

test('production admin HTTP and responsive browser acceptance with synthetic local identities', { skip: !existsSync(resolve(pgBin,'initdb'+(process.platform==='win32'?'.exe':''))), timeout: 180000 }, async t => {
  const cache=resolve(root,'.cache');mkdirSync(cache,{recursive:true});
  const work=mkdtempSync(resolve(cache,'admin-acceptance-')), dataDir=resolve(work,'pgdata'), pgPort=await port(), appPort=await port(), base=`http://127.0.0.1:${appPort}`;
  const password=randomToken(), key=randomBytes(32).toString('hex'), requestId=()=>randomUUID();
  let app, pool, stub, chrome, tools; let cluster=false; const jar=new Map();
  const cookies=()=>[...jar].map(([k,v])=>`${k}=${v}`).join(';');
  function capture(response){for(const cookie of response.headers.getSetCookie()){const part=cookie.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}}
  async function get(path, suppliedCookie=cookies()){const response=await fetch(base+path,{redirect:'manual',headers:{Cookie:suppliedCookie}});capture(response);return response;}
  let csrf;
  async function post(path, body, overrides={}){const response=await fetch(`${base}/api/superadmin/${path}`,{method:'POST',redirect:'manual',headers:{Origin:base,'Content-Type':'application/json','X-Admin-Csrf':csrf,Cookie:cookies(),...overrides},body:JSON.stringify(body)});capture(response);return response;}
  try {
    command('initdb',['-D',dataDir,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8']);
    command('pg_ctl',['-D',dataDir,'-l',resolve(work,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort} -F`,'-w','start']);cluster=true;
    pool=new Pool({connectionString:`postgresql://postgres@127.0.0.1:${pgPort}/postgres`,max:3});
    pool.on('error',()=>{}); // The isolated outage/recovery test deliberately stops its own cluster.
    await pool.query(fixtureSql);
    for(const file of readdirSync(resolve(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) await pool.query(readFileSync(resolve(root,'supabase/migrations',file),'utf8'));
    await pool.query('create role platform_fixture_login login inherit; grant platform_admin_runtime to platform_fixture_login');
    await t.test('real PostgreSQL distinguishes connectivity, role, credential and missing-table failures',async()=>{
      const candidate=new Pool({connectionString:`postgresql://platform_fixture_login@127.0.0.1:${pgPort}/postgres`,connectionTimeoutMillis:1000,max:1});
      try {
        const runtime=createAdminDatabase(candidate);
        assert.equal((await runtime.query('select count(*)::int as count from platform_private.platform_admins')).rows[0].count,0);
        await assert.rejects(runtime.query('select * from platform_private.missing_auth_fixture'),e=>e instanceof AdminAuthError&&e.category==='missing_admin_schema');
      } finally {await candidate.end();}
      await assert.rejects(createAdminDatabase(pool).query('select 1'),e=>e instanceof AdminAuthError&&e.category==='database_permission_denied');
      for(const [target,category] of [[`postgresql://nonexistent_fixture_login@127.0.0.1:${pgPort}/postgres`,'database_credentials_invalid'],[`postgresql://fixture@127.0.0.1:${await port()}/postgres`,'database_unavailable']]){
        const denied=new Pool({connectionString:target,max:1,connectionTimeoutMillis:1000});
        try{await assert.rejects(createAdminDatabase(denied).query('select 1'),e=>e instanceof AdminAuthError&&e.category===category);}finally{await denied.end();}
      }
    });
    const client=await pool.connect();
    const db={query:(s,v)=>client.query(s,v),async transaction(work){await client.query('begin');try{const r=await work(this);await client.query('commit');return r;}catch(e){await client.query('rollback');throw e;}}};
    await bootstrapAdmin(db,'fixture.root',password,requestId());client.release();
    // This local Auth API stub mutates only the disposable auth fixture table.
    let providerCalls=0;
    stub=httpServer(async(req,res)=>{providerCalls++;let body='';for await(const chunk of req)body+=chunk;const input=body?JSON.parse(body):{};const id=req.url.split('/').at(-1);res.setHeader('Content-Type','application/json');
      if(req.method==='PUT'&&req.url.startsWith('/auth/v1/admin/users/')){await pool.query(`update auth.users set banned_until=case when $2='none' then null else now()+interval '100 years' end where id=$1`,[id,input.ban_duration]);res.end(JSON.stringify({id,email:'member@fixture.invalid',aud:'authenticated',created_at:new Date().toISOString()}));}
      else if(req.method==='GET'&&req.url.startsWith('/auth/v1/admin/users/'))res.end(JSON.stringify({id,email:'member@fixture.invalid',aud:'authenticated',created_at:new Date().toISOString()}));
      else if(req.url==='/auth/v1/recover')res.end('{}');else{res.statusCode=404;res.end('{}');}});
    await new Promise(done=>stub.listen(0,'127.0.0.1',done));
    app=spawn(process.execPath,[resolve(web,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(appPort)],{cwd:web,windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'production',APP_URL:base,PLATFORM_ADMIN_ORIGIN:base,PLATFORM_DATA_MODE:'database',NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${stub.address().port}`,PLATFORM_ADMIN_DATABASE_URL:`postgresql://platform_fixture_login@127.0.0.1:${pgPort}/postgres`,PLATFORM_ADMIN_MFA_KEY:key,SUPABASE_ADMIN_URL:`http://127.0.0.1:${stub.address().port}`,SUPABASE_SECRET_KEY:randomToken(),PLATFORM_OPERATIONS_KEY:'',REALTIME_INTERNAL_URL:''}});
    await until(async()=>{try{return(await fetch(base+'/api/health')).ok;}catch{return false;}},'production app');
    await t.test('every admin page and API denies ordinary and organization-owner-shaped sessions',async()=>{
      for(const suffix of ['','/organizations','/users','/offices','/system','/audit-logs','/security']){const r=await get('/superadmin'+suffix,'sb-ordinary-session=owner; role=OWNER');assert.equal(r.status,307,suffix||'overview');assert.equal(new URL(r.headers.get('location'),base).pathname,'/superadmin/login');assert.match(r.headers.get('cache-control'),/no-store/);}
      for(const path of ['dashboard','organizations','users','offices','system','audit-logs'])assert.equal((await get('/api/superadmin/'+path,'sb-ordinary-session=owner; role=OWNER')).status,401);
      assert.equal((await get('/dashboard','')).status,307);
    });
    csrf=(await(await get('/api/superadmin/auth/csrf')).json()).csrf;
    await t.test('login rejects bad credentials, CSRF, simple content types and wrong origins',async()=>{
      assert.equal((await post('auth/login',{username:'fixture.root',password}, {'X-Admin-Csrf':'forged'})).status,403);
      assert.equal((await post('auth/login',{username:'fixture.root',password},{Origin:'https://evil.invalid'})).status,403);
      assert.equal((await post('auth/login',{username:'fixture.root',password},{'Content-Type':'text/plain'})).status,415);
      const incorrect=await post('auth/login',{username:'fixture.root',password:randomToken()});assert.equal(incorrect.status,401);
      const incorrectBody=await incorrect.json();
      const absent=await post('auth/login',{username:'absent.fixture',password:randomToken()});assert.equal(absent.status,401);
      const absentBody=await absent.json();assert.equal(absentBody.error,incorrectBody.error);assert.equal(absentBody.category,'invalid_credentials');
      const response=await post('auth/login',{username:'fixture.root',password});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly.*SameSite=strict/i);
      assert.equal((await get('/api/superadmin/dashboard')).status,401);
      assert.equal((await get('/superadmin/security')).status,200);
    });
    const enrollment=await(await post('auth/enroll-start',{})).json();
    await t.test('mandatory MFA enrollment, invalid codes, rotation and secret-free projections',async()=>{
      assert.ok(enrollment.secret);const before=jar.get('vo-admin');
      const invalid=await post('auth/mfa',{code:'bad'});assert.equal(invalid.status,401);assert.equal((await invalid.json()).category,'mfa_verification_failed');
      const response=await post('auth/mfa',{code:totp(enrollment.secret,Math.floor(Date.now()/30000))});assert.equal(response.status,200);assert.notEqual(before,jar.get('vo-admin'));
      assert.equal((await get('/api/superadmin/dashboard',`vo-admin=${before}`)).status,401);
      const dashboard=await(await get('/api/superadmin/dashboard')).json();assert.equal(dashboard.operations.connectedUsers,null);
      assert.equal(JSON.stringify(dashboard).includes(enrollment.secret),false);
    });
    let org, member;
    await t.test('authenticated HTTP supports create/update/suspend, membership and safe office reload',async()=>{
      let r=await post('organizations/create',{name:'Acme Studio',ownerId:uid(1),requestId:requestId()});assert.equal(r.status,200,await r.clone().text());org=(await r.json()).id;
      assert.equal((await post('organizations/update',{id:org,name:'Acme Studio'})).status,200);
      assert.equal((await post('organizations/status',{id:org,status:'SUSPENDED',confirmation:'wrong'})).status,400);
      assert.equal((await post('organizations/status',{id:org,status:'SUSPENDED',confirmation:'Acme Studio'})).status,200);
      assert.equal((await post('organizations/status',{id:org,status:'ACTIVE',confirmation:'Acme Studio'})).status,200);
      assert.equal((await post('memberships/update',{organizationId:org,userId:uid(2),role:'MEMBER',status:'ACTIVE',confirmation:'Acme Studio'})).status,200);
      member=(await pool.query('select id from public.organization_members where user_id=$1 and organization_id=$2',[uid(2),org])).rows[0].id;
      assert.equal((await post('users/profile',{id:uid(2),displayName:'Taylor Morgan'})).status,200);
      const office=(await(await get(`/api/superadmin/organizations/${org}`)).json()).offices[0];
      const {defaultEnvironment}=await import('../packages/shared/src/environment/catalog.ts');
      assert.equal((await post('offices/update',{id:office.id,name:'Main office',isAvailable:true,revision:0,config:defaultEnvironment,confirmation:'Main office'})).status,200);
      assert.equal((await post('organizations/transfer',{id:org,memberId:member,confirmation:'Acme Studio'})).status,200);
    });
    await t.test('account suspend/reactivate/recovery use server Auth APIs and protect owners',async()=>{
      assert.equal((await post('users/suspend',{id:uid(2),confirmation:uid(2)})).status,400);
      assert.equal((await post('users/suspend',{id:uid(1),confirmation:uid(1)})).status,200);
      assert.equal((await(await get('/api/superadmin/users/'+uid(1))).json()).status,'SUSPENDED');
      assert.equal((await post('users/reactivate',{id:uid(1),confirmation:uid(1)})).status,200);
      assert.equal((await post('users/recovery',{id:uid(1),confirmation:uid(1)})).status,200);assert.ok(providerCalls>=4);
    });
    await t.test('concurrent ownership transfer and suspension cannot leave a suspended active owner',async()=>{
      assert.equal((await post('memberships/update',{organizationId:org,userId:uid(3),role:'MEMBER',status:'ACTIVE',confirmation:'Acme Studio'})).status,200);
      const recipient=(await pool.query('select id from public.organization_members where organization_id=$1 and user_id=$2',[org,uid(3)])).rows[0].id;
      const [transfer,suspend]=await Promise.all([
        post('organizations/transfer',{id:org,memberId:recipient,confirmation:'Acme Studio'}),
        post('users/suspend',{id:uid(3),confirmation:uid(3)}),
      ]);
      assert.ok(transfer.status===200||suspend.status===200);
      assert.ok(transfer.status!==200||suspend.status!==200,'Both conflicting operations must not succeed');
      const invalid=await pool.query(`select m.id from public.organization_members m join auth.users u on u.id=m.user_id
        left join platform_private.user_restrictions r on r.user_id=m.user_id
        where m.organization_id=$1 and m.role='OWNER' and m.status='ACTIVE' and (r.suspended or u.banned_until>now())`,[org]);assert.equal(invalid.rows.length,0);
      const count=await pool.query(`select count(*)::int as owners from public.organization_members where organization_id=$1 and role='OWNER' and status='ACTIVE'`,[org]);assert.equal(count.rows[0].owners,1);
    });
    await t.test('HTTP setting validation and audit records include successful and denied operations',async()=>{
      assert.equal((await post('system/update',{version:1,maintenance:'false'})).status,400);
      const settings={version:1,maintenance:false,registration_enabled:true,onboarding_enabled:true,voice_enabled:false,max_organizations_per_user:20,confirmation:'APPLY PLATFORM SETTINGS'};
      assert.equal((await post('system/update',settings)).status,200);
      const logs=await(await get('/api/superadmin/audit-logs')).json();assert.ok(logs.rows.some(r=>r.result==='success'));assert.ok(logs.rows.some(r=>r.result==='denied'));
      assert.equal(JSON.stringify(logs).includes(password),false);assert.equal(JSON.stringify(logs).includes(enrollment.secret),false);
    });
    await t.test('actual responsive console browser, forms, navigation, error and empty states', {skip:!browser},async()=>{
      const debug=await port();chrome=spawn(browser,[`--remote-debugging-port=${debug}`,`--user-data-dir=${resolve(work,'browser')}`,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
      let tabs;await until(async()=>{try{tabs=await(await fetch(`http://127.0.0.1:${debug}/json`)).json();return tabs.some(t=>t.type==='page');}catch{return false;}},'browser');
      tools=await cdp(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await tools.send('Runtime.enable');await tools.send('Page.enable');await tools.send('Network.enable');
      await tools.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      const screenshots=resolve(root,'docs/assets/platform-admin');mkdirSync(screenshots,{recursive:true});
      async function shot(name){const result=await tools.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(screenshots,name),Buffer.from(result.data,'base64'));}
      async function navigate(path,needle){await tools.send('Page.navigate',{url:base+path});await until(()=>tools.evaluate(`document.body?.innerText.includes(${JSON.stringify(needle)})`),path);await delay(200);}
      await navigate('/superadmin/login','Administrator sign in');await shot('01-login-desktop.png');
      // Actual UI login, not a fixture bypass. Password and code remain in memory.
      const fill=async(name,v)=>tools.evaluate(`(()=>{const e=document.querySelector('input[name=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await fill('username','fixture.root');await fill('password',password);await tools.evaluate('document.querySelector(".pa-login-form form").requestSubmit()');
      await until(()=>tools.evaluate('location.pathname.endsWith("/security")&&document.body?.innerText.includes("Six-digit")'),'browser MFA');
      // Wait for a fresh unused step; test clock/secret are isolated synthetic data.
      const used=Number((await pool.query('select last_totp_step from platform_private.platform_admins')).rows[0].last_totp_step);
      const current=Math.floor(Date.now()/30000);const code=totp(enrollment.secret,Math.max(current,used+1));
      await fill('code',code);await tools.evaluate('document.querySelector(".pa-content form").requestSubmit()');
      await until(()=>tools.evaluate('location.pathname==="/superadmin"&&document.body?.innerText.includes("Database count")'),'dashboard');await shot('02-dashboard-desktop.png');
      await navigate('/superadmin/organizations','Acme Studio');await shot('03-organizations-desktop.png');
      await tools.evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.textContent.includes("Manage")).click()');await until(()=>tools.evaluate('document.body?.innerText.includes("Transfer ownership")'),'organization detail');await shot('04-organization-details.png');
      await navigate('/superadmin/users','Taylor Morgan');await shot('05-users-desktop.png');
      await navigate('/superadmin/offices','open-office');await shot('06-offices-desktop.png');
      await navigate('/superadmin/system','Operational controls');await shot('07-settings-desktop.png');
      await navigate('/superadmin/audit-logs','settings.updated');await shot('08-audit-desktop.png');
      await navigate('/superadmin/security','Reauthenticate');await shot('09-security-desktop.png');
      await tools.send('Emulation.setDeviceMetricsOverride',{width:768,height:1024,deviceScaleFactor:1,mobile:false});await navigate('/superadmin','Database count');assert.equal(await tools.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot('10-dashboard-tablet.png');
      await tools.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await navigate('/superadmin','Database count');assert.equal(await tools.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot('11-dashboard-mobile.png');
      await navigate('/superadmin/organizations','Acme Studio');assert.equal(await tools.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot('12-organizations-mobile.png');
      await navigate('/superadmin/users?q=no-matching-person','No matching records');await shot('13-empty-state-mobile.png');
      await navigate('/superadmin/organizations','Acme Studio');
      await tools.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
      // Existing page remains accessible; clicking a management control offline
      // must give actionable feedback, never a successful mutation.
      await tools.evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.textContent.includes("Manage")).click()');
      await until(()=>tools.evaluate('document.body?.innerText.includes("Check your connection")'),'offline feedback');
      assert.equal(await tools.evaluate('!!document.querySelector(".pa-detail")'),false);await shot('14-error-state-mobile.png');
      await tools.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      assert.deepEqual(tools.errors,[]);
    });
    await t.test('separate tenant API integration: real admin guard, cross-tenant data, failures and read-only mutation rejection',async()=>{
      const dataKey='sb_secret_'+randomToken(),fixture=seededDataApi(dataKey),dataPort=await port(),readPort=await port(),readBase=`http://127.0.0.1:${readPort}`,dataBase=`http://127.0.0.1:${dataPort}`;
      const source=httpServer(async(req,res)=>{const result=await fixture.fetcher(dataBase+req.url,{method:req.method,headers:req.headers});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(req.method==='HEAD'?undefined:await result.text());});
      await new Promise(done=>source.listen(dataPort,'127.0.0.1',done));
      const readApp=spawn(process.execPath,[resolve(web,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(readPort)],{cwd:web,windowsHide:true,stdio:'ignore',env:{...process.env,NODE_ENV:'production',APP_URL:readBase,PLATFORM_ADMIN_ORIGIN:readBase,
        PLATFORM_ADMIN_DATABASE_URL:`postgresql://platform_fixture_login@127.0.0.1:${pgPort}/postgres`,PLATFORM_ADMIN_MFA_KEY:key,
        PLATFORM_DATA_MODE:'supabase',NEXT_PUBLIC_SUPABASE_URL:dataBase,PLATFORM_DATA_SUPABASE_URL:dataBase,PLATFORM_DATA_SUPABASE_SECRET_KEY:dataKey,PLATFORM_DATA_PROJECT_REF:'',PLATFORM_OPERATIONS_KEY:'',REALTIME_INTERNAL_URL:''}});
      const read=path=>fetch(readBase+'/api/superadmin/'+path,{headers:{Cookie:cookies()}});
      try{
        await until(async()=>{try{return(await fetch(readBase+'/api/health')).ok;}catch{return false;}},'separate-store app');
        const before=fixture.calls.length;
        assert.equal((await fetch(readBase+'/api/superadmin/dashboard',{headers:{Cookie:'role=OWNER; sb-user=fake'}})).status,401);assert.equal(fixture.calls.length,before);
        const dashboard=await(await read('dashboard')).json();assert.deepEqual(dashboard.counts,{organizations:2,active_organizations:1,suspended_organizations:1,registered_users:4,active_memberships:3,offices:2});
        assert.equal(dashboard.dataSource.readOnly,true);assert.equal(dashboard.operations.connectedUsers,null);
        const orgs=await(await read('organizations')).json();assert.equal(orgs.rows.length,2);
        assert.equal((await(await read('organizations?status=SUSPENDED')).json()).rows.length,1);
        const users=await(await read('users')).json();assert.equal(users.rows.length,4);assert.equal(JSON.stringify(users).includes('must-not-reach-browser'),false);
        assert.equal((await(await read('users?q=Profile%202&searchBy=profile')).json()).rows.length,1);
        assert.equal((await(await read('offices')).json()).rows.length,2);
        assert.equal((await(await read('offices?organization='+dataFixtureId(12))).json()).rows.length,1);
        assert.equal((await(await read('organizations/'+dataFixtureId(11))).json()).members.length,2);
        assert.equal((await(await read('users/'+dataFixtureId(2))).json()).memberships.length,2);
        assert.equal((await(await read('offices/'+dataFixtureId(31))).json()).name,'Cedar office');
        for(const action of ['organizations/create','organizations/status','users/profile','users/suspend','memberships/update','offices/update','offices/retire','invitations/create','system/update']){
          const response=await fetch(readBase+'/api/superadmin/'+action,{method:'POST',headers:{Cookie:cookies(),Origin:readBase,'Content-Type':'application/json','X-Admin-Csrf':csrf},body:JSON.stringify({id:dataFixtureId(11)})});assert.equal(response.status,403,action);
        }
        fixture.failTable='offices';const denied=await read('dashboard');assert.equal(denied.status,503);const failure=await denied.json();assert.equal('counts' in failure,false);assert.match(failure.error,/could not be reached/);fixture.failTable='';
        assert.ok(fixture.calls.every(call=>['GET','HEAD'].includes(call.method)&&call.cookie===null&&call.authorization==='Bearer '+dataKey));
        if(tools){
          const shots=resolve(root,'docs/assets/platform-admin-data');mkdirSync(shots,{recursive:true});
          async function navigate(path,needle){await tools.send('Page.navigate',{url:readBase+path});await until(()=>tools.evaluate(`document.body?.innerText.includes(${JSON.stringify(needle)})`),path);await delay(150);}
          async function shot(name){const result=await tools.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(shots,name),Buffer.from(result.data,'base64'));}
          await tools.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
          await navigate('/superadmin','Database count');assert.deepEqual(await tools.evaluate('Array.from(document.querySelectorAll(".pa-metrics:not(.pa-live) strong")).map(e=>e.textContent)'),['2','1','1','4','3','2']);await shot('01-separate-store-overview-fixture.png');
          await navigate('/superadmin/organizations','Cedar Studio');await shot('02-organizations-fixture.png');
          await navigate('/superadmin/users','person1@fixture.invalid');await shot('03-people-fixture.png');
          await navigate('/superadmin/offices','Cedar office');await shot('04-offices-fixture.png');
          fixture.failTable='offices';await navigate('/superadmin','Could not load administration');assert.equal(await tools.evaluate('document.querySelectorAll(".pa-metric").length'),0);await shot('05-query-error-fixture.png');
          fixture.failTable='';await tools.evaluate('Array.from(document.querySelectorAll("button")).find(e=>e.textContent.includes("Try again")).click()');await until(()=>tools.evaluate('document.querySelectorAll(".pa-metric").length===9'),'retry recovered counts');
          await tools.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await tools.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);await shot('06-mobile-overview-fixture.png');assert.deepEqual(tools.errors,[]);
        }
      }finally{readApp.kill();await delay(200);await new Promise(done=>source.close(done));}
    });
    await t.test('database outage reports the exact auth dependency and recovers without changing credentials or MFA',async()=>{
      const original=jar.get('vo-admin');
      const before=(await pool.query('select password_hash,mfa_secret_encrypted,mfa_enrolled_at from platform_private.platform_admins')).rows[0];
      command('pg_ctl',['-D',dataDir,'-m','fast','-w','stop']);cluster=false;
      const outage=await post('auth/login',{username:'fixture.root',password});assert.equal(outage.status,503);
      const failure=await outage.json();assert.equal(failure.category,'database_unavailable');assert.match(failure.error,/administrator database is unavailable/);
      assert.equal(JSON.stringify(failure).includes('postgresql://'),false);assert.equal(failure.error.includes('Auth service'),false);
      if(tools){
        await tools.send('Page.navigate',{url:base+'/superadmin/login'});
        await until(()=>tools.evaluate('!!document.querySelector(".pa-login-form input[name=username]")'),'outage login page');
        for(const [name,v] of [['username','fixture.root'],['password',password]])await tools.evaluate(`(()=>{const e=document.querySelector('input[name=${name}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(v)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await tools.evaluate('document.querySelector(".pa-login-form form").requestSubmit()');
        await until(()=>tools.evaluate('document.querySelector("[role=alert]")?.textContent.includes("administrator database is unavailable")'),'outage auth feedback');
      }
      command('pg_ctl',['-D',dataDir,'-l',resolve(work,'postgres.log'),'-o',`-h 127.0.0.1 -p ${pgPort} -F`,'-w','start']);cluster=true;
      const recovered=await post('auth/login',{username:'fixture.root',password});assert.equal(recovered.status,200);
      assert.equal((await recovered.json()).next,'/superadmin/security');assert.equal((await get('/api/superadmin/dashboard')).status,401);
      assert.equal((await(await get('/api/superadmin/security')).json()).enrolled,true);
      const after=(await pool.query('select password_hash,mfa_secret_encrypted,mfa_enrolled_at from platform_private.platform_admins')).rows[0];assert.deepEqual(after,before);
      jar.set('vo-admin',original);assert.equal((await get('/api/superadmin/dashboard')).status,200);
    });
    await t.test('logout-all revokes cookies and tokens; client bundles contain no authentication secrets',async()=>{
      const prior=cookies();assert.equal((await post('auth/logout-all',{})).status,200);assert.equal((await get('/api/superadmin/dashboard',prior)).status,401);
      for(const file of readdirSync(resolve(web,'.next/static/chunks'),{recursive:true}).filter(f=>String(f).endsWith('.js'))){const contents=readFileSync(resolve(web,'.next/static/chunks',file),'utf8');for(const secret of [password,key,enrollment.secret,'PLATFORM_ADMIN_DATABASE_URL','SUPABASE_SECRET_KEY','PLATFORM_DATA_SUPABASE_SECRET_KEY','mfa_secret_encrypted'])assert.equal(contents.includes(secret),false,`Secret exposure in ${file}`);}
    });
  } finally {
    tools?.close();chrome?.kill();app?.kill();if(app)await delay(300);if(stub)await new Promise(done=>stub.close(done));await pool?.end();
    if(cluster)command('pg_ctl',['-D',dataDir,'-m','immediate','-w','stop']);
  }
});
