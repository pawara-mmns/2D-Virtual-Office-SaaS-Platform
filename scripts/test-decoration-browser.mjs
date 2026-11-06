// Actual React/Phaser/Colyseus and isolated PostgreSQL. Synthetic verified
// identities and action transport; no hosted Auth, tenant writes or microphones.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync,mkdirSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRealtimeServer} from '../apps/realtime/src/server.ts';
import {defaultEnvironment} from '../packages/shared/src/environment/catalog.ts';
import {composeOfficeEnvironment,emptyDecoration,parseDecoration,validateDecoration,upsertDecoration} from '../packages/shared/src/environment/decoration.ts';
import {mapVersion} from '../packages/shared/src/protocol.ts';
import {interactionRegistry,seatApproach} from '../packages/shared/src/interactions.ts';
const root=resolve(import.meta.dirname,'..'),web=resolve(root,'apps/web'),rtRequire=createRequire(resolve(root,'apps/realtime/package.json'));
const {build}=createRequire(rtRequire.resolve('tsx'))('esbuild'),{matchMaker}=await import(pathToFileURL(rtRequire.resolve('colyseus')).href);
const browser=process.env.OFFICE_TEST_BROWSER||['C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'].find(existsSync);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function until(check,label){for(let i=0;i<220;i++){if(await check())return;await delay(80);}throw Error('Editor browser timed out: '+label);}
async function cdp(url){const ws=new WebSocket(url);await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});let serial=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||'Browser exception');if(m.method==='Runtime.consoleAPICalled'&&m.params.args?.some(a=>/Maximum update depth|Cannot update a component/.test(a.value??'')))errors.push('React warning');const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.fail(Error(m.error.message)):p.ok(m.result)}};
 const send=(method,params={})=>new Promise((ok,fail)=>{const n=++serial,timer=setTimeout(()=>{pending.delete(n);fail(Error('CDP timeout '+method));},10000);pending.set(n,{ok,fail,timer});ws.send(JSON.stringify({id:n,method,params}))});
 return{send,errors,close:()=>ws.close(),async evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Evaluation failed');return r.result.value;}};
}
test('Brave office decoration: owner editing, drag/zoom, draft isolation, conflict, SQL publication, safe rejoin and mobile',{skip:!browser,timeout:180000},async()=>{
 const db=new PGlite(),tools=[];let child,realtime,server;
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
   grant usage on schema auth to anon,authenticated;
   insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'fixture'||i||'@editor.invalid',now(),null from generate_series(1,3)i;`);
  for(const name of ['20261021000100_organization_foundation.sql','20261029000100_office_environments.sql','20261105000100_office_decorations.sql'])await db.exec(readFileSync(resolve(root,'supabase/migrations',name),'utf8'));
  async function as(n,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),role})]);await db.exec('set role '+role);}
  await as(1);const org=(await db.query("select public.create_organization('Local decoration fixture',gen_random_uuid()) as id")).rows[0].id;await db.exec('reset role');const office=(await db.query('select id from public.offices')).rows[0].id;
  await db.query("insert into public.organization_members(organization_id,user_id,role) values($1,$2,'MEMBER'),($1,$3,'OWNER')",[org,id(2),id(3)]);
  let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  async function published(){return serial(async()=>{await db.exec('reset role');const r=(await db.query('select published,published_revision,base_revision from public.office_decoration_settings')).rows[0];return r?{document:r.published,revision:r.published_revision,baseRevision:r.base_revision}:undefined;});}
  const currentMap=async()=>composeOfficeEnvironment(defaultEnvironment,await published());
  async function action(body){return serial(async()=>{
   const n=body.person;if(![1,2,3].includes(n))throw Error('Synthetic identity denied');await as(n);
   const workspace=(await db.query('select public.load_office_decoration_draft($1) as value',[office])).rows[0].value;
   if(body.operation==='load')return{ok:true,workspace};
   const document=parseDecoration(body.operation==='rollback'?workspace.previous:body.document),valid=validateDecoration(defaultEnvironment,document);if(!valid.ok)return{ok:false,message:valid.message};
   await as(n,'service_role');try{const result=(await db.query('select public.write_office_decoration($1,$2,$3,0,$4,$5::jsonb) as value',[office,id(n),body.revision,body.operation,JSON.stringify(document)])).rows[0].value;return{ok:true,...result};}
   catch(error){return{ok:false,message:error.code==='40001'?'This office or draft changed. Reload the editor to review the latest revision before saving.':'Owner edit denied.'};}
  });}
  let fixtureJs;
  const css=readdirSync(resolve(web,'.next/static'),{recursive:true}).filter(f=>f.endsWith('.css')).map(f=>readFileSync(resolve(web,'.next/static',f),'utf8')).join('\n');
  server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureJs);}
   else if(path==='/initial'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await published()??null));}
   else if(path==='/editor'){let body='';for await(const chunk of req){body+=chunk;if(body.length>65000)throw Error('Budget');}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await action(JSON.parse(body))));}
   else if(path==='/office/avatar.png'||path==='/office/environments/warm-wood.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync(resolve(web,'public',path.slice(1))));}
   else if(path==='/favicon.ico'){res.writeHead(204);res.end();}
   else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}body{background:#f7f8f3}.relative{position:relative}.office-page{height:100dvh}#fixture-label{position:fixed;left:16px;bottom:8px;z-index:6;font:10px Arial;color:#426051;pointer-events:none}</style><div id="root"></div><span id="fixture-label">Phase 02 · synthetic identity / isolated PostgreSQL</span><script type="module" src="/fixture.js"></script></html>`);}
  }catch{res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,message:'Only an active organization owner may edit this office.'}));}});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const base='http://127.0.0.1:'+server.address().port;
  const authorize=async(token,requested)=>{const n=Number(String(token).replace('editor-fixture-',''));if(![1,2].includes(n)||requested!==office)throw Error('Denied');return{userId:id(n),organizationId:org,officeId:office,token:String(token),checkedAt:Date.now(),expiresAt:Date.now()+300000,displayName:n===1?'Taylor':'Morgan',avatarKey:n===1?'fern':'plum'};};
  realtime=createRealtimeServer({authorize,map:composeOfficeEnvironment(defaultEnvironment),loadMap:currentMap,origins:[base],proximity:{dwellMs:100,graceMs:100}});await realtime.listen(0,'127.0.0.1');const rt='http://127.0.0.1:'+realtime.transport.server.address().port;
  const bundle=await build({bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',jsx:'automatic',logLevel:'silent',tsconfig:resolve(web,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_REALTIME_URL':JSON.stringify(rt)},stdin:{resolveDir:web,loader:'tsx',contents:`
   import React from'react';import{createRoot}from'react-dom/client';import OfficeCanvas from'./src/features/office/components/office-canvas';
   const person=Number(new URL(location.href).searchParams.get('person'))||1;window.editorFixture={person,mounts:0};
   const decoration=await(await fetch('/initial')).json();createRoot(document.getElementById('root')).render(<main className="office-page"><OfficeCanvas isOwner={person===1} decoration={decoration??undefined} environment={${JSON.stringify(defaultEnvironment)}} appearance={{avatarKey:person===1?'fern':'plum',displayName:person===1?'Taylor':'Morgan'}} officeId='${office}' userId={'00000000-0000-4000-8000-'+String(person).padStart(12,'0')} context={{workspaceName:'Local decoration verification',officeName:'Oak & Fern Studio',workspaceHref:'#'}}/></main>);
  `},plugins:[{name:'synthetic-identity-and-action-transport',setup(plugin){
   plugin.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));plugin.onResolve({filter:/lib\/supabase\/client$/},()=>({path:'auth',namespace:'fixture'}));plugin.onResolve({filter:/engine\/create-game$/},()=>({path:'engine',namespace:'fixture'}));
   plugin.onResolve({filter:/^\.\/actions$/},args=>({path:args.importer.endsWith('decoration-editor.tsx')?'editor':args.importer.endsWith('chat-panel.tsx')?'chat':'avatar',namespace:'fixture'}));
   plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:web,loader:'js',contents:args.path==='link'?`import React from'react';export default function Link(p){return React.createElement('a',p,p.children)}`:args.path==='auth'?`export const createClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'editor-fixture-'+editorFixture.person}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})`:
   args.path==='engine'?`import{createOfficeGame as create}from'./src/features/office/engine/create-game.ts';export function createOfficeGame(...args){editorFixture.mounts++;const c=args[1];args[1]={...c,onReady(v){editorFixture.ready=true;c.onReady(v)}};const engine=create(...args);editorFixture.engine=engine;const attach=engine.setNetwork;engine.setNetwork=n=>{editorFixture.network=n;attach(n)};return engine}`:
   args.path==='editor'?`const call=async body=>(await fetch('/editor',{method:'POST',body:JSON.stringify({...body,person:editorFixture.person})})).json();export async function loadDecorationAction(officeId){return call({operation:'load',officeId})}export async function saveDecorationAction(input){return call(input)}`:
   args.path==='chat'?`export async function loadOfficeChat(){return{ok:true,page:{messages:[],olderCursor:null}}}`:`export async function saveAvatarAction(){return{status:'error',message:'Read-only fixture'}}`}));
  }}]});fixtureJs=bundle.outputFiles[0].contents;
  const cache=resolve(root,'.cache');mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,'decoration-browser-'));child=spawn(browser,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;await until(()=>{try{port=readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0];return!!port}catch{return false}},'browser launch');const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),tab=tabs.find(t=>t.type==='page');const a=await cdp(tab.webSocketDebuggerUrl);tools.push(a);await a.send('Target.createTarget',{url:'about:blank'});const otherTabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();const b=await cdp(otherTabs.find(t=>t.type==='page'&&t.id!==tab.id).webSocketDebuggerUrl);tools.push(b);
  for(const [i,t]of tools.entries()){await t.send('Runtime.enable');await t.send('Page.enable');await t.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await t.send('Page.navigate',{url:base+'/?person='+(i+1)});await until(()=>t.evaluate('!!editorFixture.network?.snapshot()?.players.size&&editorFixture.ready'),'join '+i);}
  const scene='editorFixture.engine.game.scene.getScene("Office")';
  const liveRoom=async()=>{const rooms=await matchMaker.query({name:'office'});return rooms.map(r=>matchMaker.getLocalRoomById(r.roomId)).find(r=>r.state.officeId===office);};
  let live=await liveRoom();const session=await a.evaluate('editorFixture.network.sessionId()'),own=live.state.players.get(session),before={x:own.x,y:own.y},initialVersion=live.state.mapVersion;
  assert.equal(await b.evaluate('!!document.querySelector("[aria-label=\"Edit office\"]")'),false);
  assert.equal((await fetch(base+'/editor',{method:'POST',body:JSON.stringify({person:2,operation:'load'})})).status,403,'normal member denied by actual owner SQL RPC');
  const click=async label=>{await a.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.closest('[hidden],[inert]')&&(b.getAttribute('aria-label')===${JSON.stringify(label)}||b.textContent.trim()===${JSON.stringify(label)}));if(!b||b.disabled)throw Error('Unavailable '+${JSON.stringify(label)});b.click()})()`);await delay(100);};
  const shots=resolve(root,'docs/assets/phase02-decoration');mkdirSync(shots,{recursive:true});const shot=async name=>{await a.send('Page.bringToFront');await delay(100);writeFileSync(resolve(shots,name),Buffer.from((await a.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));};
  await a.send('Page.bringToFront');await click('Edit office');await until(()=>a.evaluate('!!document.querySelector(".decoration-panel")'),'editor open');await shot('01-editor-open.png');
  assert.equal(await a.evaluate('editorFixture.mounts'),1);await a.evaluate('document.querySelector(".office-stage").focus()');await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyD',key:'d'});await delay(260);await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyD',key:'d'});assert.deepEqual({x:own.x,y:own.y},before,'editing stops avatar intent');assert.equal(live.state.players.size,2,'existing transport retained');
  const candidates=[];const baseMap=composeOfficeEnvironment(defaultEnvironment);for(let y=64;y<baseMap.height*32-64;y+=32)for(let x=352;x<baseMap.width*32-96;x+=32)candidates.push({x,y});candidates.sort((a,b)=>Math.hypot(a.x-800,a.y-700)-Math.hypot(b.x-800,b.y-700));
  const safe=[];for(const p of candidates){const o={id:'custom/'+id(70),assetId:'chairTask',...p,orientation:'down'};if(['down','left','up','right'].every(d=>validateDecoration(defaultEnvironment,upsertDecoration(emptyDecoration(),{...o,orientation:d})).ok)){safe.push(o);if(safe.length===5)break;}}
  assert.ok(safe.length>=2);const target=safe[0];
  const point=async(x,y)=>a.evaluate(`(()=>{const c=${scene}.cameras.main,r=document.querySelector('.office-stage').getBoundingClientRect(),p=c.getWorldPoint(0,0),q=c.getWorldPoint(c.width,c.height);return{x:r.left+(${x}-p.x)/(q.x-p.x)*r.width,y:r.top+(${y}-p.y)/(q.y-p.y)*r.height}})()`);
  await a.evaluate(`${scene}.cameras.main.setZoom(2).centerOn(${target.x+16},${target.y+16})`);await a.evaluate('document.querySelector("[data-asset=chairTask]").click()');await delay(100);await shot('02-asset-library.png');
  let p=await point(target.x+16,target.y+16);await a.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y});await shot('03-ghost-placement.png');await a.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await a.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
  await until(()=>a.evaluate(`${scene}.editor.objects.some(o=>o.id.startsWith('custom/'))`),'added chair');
  const customId=await a.evaluate(`${scene}.editor.objects.find(o=>o.id.startsWith('custom/')).id`);await a.evaluate('document.querySelector(".decoration-properties").scrollIntoView({block:"nearest"})');await shot('04-selected-controls.png');
  await click('Rotate');assert.equal(await a.evaluate(`${scene}.editor.objects.find(o=>o.id===${JSON.stringify(customId)}).orientation`),'left');
  // Pointer coordinates continue to map correctly at each camera scale.
  for(const [index,zoom]of [1,1.5,2].entries()){
   const current=await a.evaluate(`${scene}.editor.objects.find(o=>o.id===${JSON.stringify(customId)})`),next=safe[(index+1)%safe.length];
   await click('Select / pan');await a.evaluate(`${scene}.cameras.main.setZoom(${zoom}).centerOn(${(current.x+next.x)/2+16},${(current.y+next.y)/2+16})`);await delay(80);const from=await point(current.x+16,current.y+16),to=await point(next.x+16,next.y+16);
   await a.send('Input.dispatchMouseEvent',{type:'mousePressed',x:from.x,y:from.y,button:'left',clickCount:1});await a.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:to.x,y:to.y,button:'left',buttons:1});await a.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:to.x,y:to.y,button:'left',clickCount:1});
   await until(()=>a.evaluate(`${scene}.editor.objects.find(o=>o.id===${JSON.stringify(customId)}).x===${next.x}&&${scene}.editor.objects.find(o=>o.id===${JSON.stringify(customId)}).y===${next.y}`),'drag at zoom '+zoom);
  }
  await click('Duplicate');assert.equal(await a.evaluate(`${scene}.editor.objects.filter(o=>o.id.startsWith('custom/')).length`),2);await click('Remove');await click('Undo');assert.equal(await a.evaluate(`${scene}.editor.objects.filter(o=>o.id.startsWith('custom/')).length`),2);await click('Redo');assert.equal(await a.evaluate(`${scene}.editor.objects.filter(o=>o.id.startsWith('custom/')).length`),1);
  await click('Close editor');assert.equal(await a.evaluate('!!document.querySelector(".decoration-panel [role=alert]")'),true);await click('Keep editing');
  // A wall placement gives visible feedback without mutating either draft or live map.
  await a.evaluate('document.querySelector("[data-asset=chairTask]").click()');await a.evaluate(`${scene}.cameras.main.setZoom(1).centerOn(400,400)`);p=await point(16,16);await a.send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});await a.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});await until(()=>a.evaluate('document.querySelector(".decoration-feedback").textContent.includes("wall")'),'invalid feedback');await shot('05-invalid-placement.png');
  await click('Validate');await click('Save draft');await until(()=>a.evaluate('document.querySelector(".decoration-feedback").textContent.includes("Draft saved")'),'saved draft');assert.equal(live.state.mapVersion,initialVersion);assert.equal(mapVersion(await currentMap()),initialVersion,'private draft never enters live geometry');
  const saved=await action({person:1,operation:'load'});await action({person:3,operation:'draft',revision:saved.workspace.revision,document:saved.workspace.draft});await click('Publish');await until(()=>a.evaluate('document.querySelector(".decoration-feedback").textContent.includes("changed")'),'conflict feedback');await click('Reload editor');await click('Publish');await until(()=>a.evaluate('document.querySelector(".decoration-feedback").textContent.startsWith("Published.")'),'published');
  await until(()=>b.evaluate('document.querySelector(".office-connection").textContent.includes("Reload office")'),'peer retirement notice');assert.equal((await matchMaker.query({name:'office'})).length,0,'old authority retired before rejoin');
  for(const t of tools){await t.send('Page.reload');await until(()=>t.evaluate('!!editorFixture.network?.snapshot()?.players.size&&editorFixture.ready'),'published rejoin');}
  live=await liveRoom();const geometry=await currentMap();assert.equal(live.state.mapVersion,mapVersion(geometry));assert.equal(await a.evaluate(`${scene}.network.snapshot().mapVersion`),mapVersion(geometry));assert.equal((await matchMaker.query({name:'office'})).length,1);
  const chair=interactionRegistry(geometry).find(o=>o.instanceId===customId);assert.ok(chair);const slot=chair.slots[0],entry=slot.approaches.find(p=>seatApproach(geometry,chair,slot,p));const active=live.state.players.get(await a.evaluate('editorFixture.network.sessionId()'));Object.assign(active,entry);await a.send('Page.bringToFront');await a.evaluate('document.querySelector(".office-stage").focus()');await until(()=>a.evaluate(`${scene}.primary?.slotId===${JSON.stringify(slot.id)}`),'published chair interaction');await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyE',key:'e'});await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyE',key:'e'});await until(()=>active.seatId===slot.id,'published chair sit');await a.evaluate(`${scene}.cameras.main.setZoom(2).centerOn(${slot.anchor.x},${slot.anchor.y})`);await shot('06-published-office.png');
  await click('Edit office');await a.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);assert.equal(await a.evaluate('document.documentElement.scrollWidth<=390'),true);assert.ok(await a.evaluate('document.querySelector(".decoration-panel").getBoundingClientRect().height<innerHeight*.5'));assert.equal(await a.evaluate('getComputedStyle(document.querySelector(".office-world")).visibility'),'visible');await shot('07-mobile-editor.png');
  for(const t of tools)assert.deepEqual(t.errors,[]);
  console.info('Brave editor passed: actual isolated SQL draft/publish/conflict, two-client retirement/rejoin, native drag at three zooms, stable seated chair after reload, desktop/mobile UI; synthetic identity/action transport only.');
 }finally{
  for(const t of tools)try{await t.evaluate('editorFixture.network?.close()')}catch{}
  if(tools[0])try{await tools[0].send('Browser.close')}catch{}for(const t of tools)t.close();
  if(child?.exitCode===null){await Promise.race([new Promise(ok=>child.once('exit',ok)),delay(2000)]);if(child.exitCode===null)child.kill();}
  await realtime?.gracefullyShutdown(false);if(server)await new Promise(ok=>server.close(ok));await db.close();
 }
});
