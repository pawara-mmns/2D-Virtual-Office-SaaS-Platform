import {runDirectEditorScenario} from './direct-editor-browser-scenario.mjs';
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
import {UnconfirmedSave} from '../apps/realtime/src/environment/live.ts';
import {createVoiceService} from '../apps/realtime/src/voice/service.ts';
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
test('Brave live office editor: incremental objects, no reload, durable Save and voice continuity',{skip:!browser,timeout:180000},async()=>{
 const db=new PGlite(),tools=[];let child,realtime,server;
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function auth.uid() returns uuid language sql stable as $$select(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   create function auth.role() returns text language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role'$$;
   grant usage on schema auth to anon,authenticated;
   insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'fixture'||i||'@editor.invalid',now(),null from generate_series(1,3)i;`);
  for(const name of ['20261021000100_organization_foundation.sql','20261029000100_office_environments.sql','20261105000100_office_decorations.sql','20261106000100_live_office_decoration.sql'])await db.exec(readFileSync(resolve(root,'supabase/migrations',name),'utf8'));
  async function as(n,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id(n),role})]);await db.exec('set role '+role);}
  await as(1);const org=(await db.query("select public.create_organization('Local decoration fixture',gen_random_uuid()) as id")).rows[0].id;await db.exec('reset role');const office=(await db.query('select id from public.offices')).rows[0].id;
  await db.query("insert into public.organization_members(organization_id,user_id,role) values($1,$2,'MEMBER'),($1,$3,'OWNER')",[org,id(2),id(3)]);
  let queue=Promise.resolve();const serial=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
  async function published(){return serial(async()=>{await db.exec('reset role');const r=(await db.query('select published,published_revision,base_revision from public.office_decoration_settings')).rows[0];return r?{document:r.published,revision:r.published_revision,baseRevision:r.base_revision}:undefined;});}
  let structuralChange=false;
  // A structural switch represents the existing reset-then-setup workflow;
  // old base-ID overrides must not be composed into the replacement template.
  const currentMap=async()=>structuralChange?composeOfficeEnvironment({...defaultEnvironment,theme:'dark-tech'}):composeOfficeEnvironment(defaultEnvironment,await published());
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
  let saveFailure=false;
  const liveStore={
   async read(){const result=await action({person:1,operation:'load'});return{config:defaultEnvironment,workspace:result.workspace};},
   async owner(auth){return(await action({person:Number(auth.userId.slice(-12)),operation:'load'})).workspace;},
   async save(auth,request,document,baseRevision){if(saveFailure===true)throw new UnconfirmedSave('Save is unconfirmed. Retry Save to reconcile it.');return serial(async()=>{await as(Number(auth.userId.slice(-12)),'service_role');await db.query('select public.commit_live_office_decoration($1,$2,$3,$4,$5,$6::jsonb)',[office,auth.userId,request.operationId,request.savedRevision,baseRevision,JSON.stringify(document)]);await as(Number(auth.userId.slice(-12)));const saved=(await db.query('select public.load_office_decoration_draft($1) as value',[office])).rows[0].value;if(saveFailure==='after'){saveFailure=false;throw new UnconfirmedSave('Save is unconfirmed. Retry Save to reconcile it.');}return saved;});}
  };
  const voice=createVoiceService(authorize,{url:'wss://editor-fixture.livekit.cloud',prefix:'editor_',room:()=> 'editor_meeting',token:async()=> 'synthetic',rooms:async()=>[],participants:async()=>[],remove:async()=>{}},Date.now,()=>{});await voice.poll();
  realtime=createRealtimeServer({authorize,map:composeOfficeEnvironment(defaultEnvironment),loadMap:currentMap,liveStore,voice,origins:[base],proximity:{dwellMs:100,graceMs:100}});await realtime.listen(0,'127.0.0.1');const rt='http://127.0.0.1:'+realtime.transport.server.address().port;
  const bundle=await build({bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',jsx:'automatic',logLevel:'silent',tsconfig:resolve(web,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_REALTIME_URL':JSON.stringify(rt)},stdin:{resolveDir:web,loader:'tsx',contents:`
   import {objectsAt}from'./src/features/decoration/manipulation.ts';import React from'react';import{createRoot}from'react-dom/client';import OfficeCanvas from'./src/features/office/components/office-canvas';
   const person=Number(new URL(location.href).searchParams.get('person'))||1;window.editorFixture={person,mounts:0,commits:0,voiceConnects:0,voiceDisconnects:0};window.editorFixture.hit=(x,y)=>{const e=editorFixture.engine.game.scene.getScene('Office').editor;return objectsAt(e.objects,{x,y},e.opaque).map(o=>o.id);};
   const nativeFetch=window.fetch.bind(window);window.fetch=(url,options)=>url==='/api/v1/voice/token'?Promise.resolve(new Response(JSON.stringify({url:'wss://editor-fixture.livekit.cloud',token:'synthetic-sdk-test-only'}),{headers:{'Content-Type':'application/json'}})):nativeFetch(url,options);
   const decoration=await(await fetch('/initial')).json();createRoot(document.getElementById('root')).render(<React.Profiler id="editor" onRender={()=>editorFixture.commits++}><main className="office-page"><OfficeCanvas isOwner={person===1} decoration={decoration??undefined} environment={${JSON.stringify(defaultEnvironment)}} appearance={{avatarKey:person===1?'fern':'plum',displayName:person===1?'Taylor':'Morgan'}} officeId='${office}' userId={'00000000-0000-4000-8000-'+String(person).padStart(12,'0')} context={{workspaceName:'Local decoration verification',officeName:'Oak & Fern Studio',workspaceHref:'#'}}/></main></React.Profiler>);
  `},plugins:[{name:'synthetic-identity-and-action-transport',setup(plugin){
   plugin.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));plugin.onResolve({filter:/lib\/supabase\/client$/},()=>({path:'auth',namespace:'fixture'}));plugin.onResolve({filter:/engine\/create-game$/},()=>({path:'engine',namespace:'fixture'}));
   plugin.onResolve({filter:/^livekit-client$/},args=>args.importer.replaceAll('\\','/').endsWith('/voice-session.tsx')?{path:'voice-sdk',namespace:'fixture'}:undefined);
   plugin.onResolve({filter:/^\.\/actions$/},args=>({path:args.importer.endsWith('decoration-editor.tsx')?'editor':args.importer.endsWith('chat-panel.tsx')?'chat':'avatar',namespace:'fixture'}));
   plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:web,loader:'js',contents:args.path==='link'?`import React from'react';export default function Link(p){return React.createElement('a',p,p.children)}`:args.path==='auth'?`export const createClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'editor-fixture-'+editorFixture.person}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})`:
   args.path==='voice-sdk'?`import{Room as NativeRoom}from'livekit-client';export*from'livekit-client';export class Room extends NativeRoom{constructor(...args){super(...args);const f=window.editorFixture;this.connect=async()=>{f.voiceConnects++;f.voiceRoom=this;await this.simulateParticipants({publish:{audio:false,video:false,useRealTracks:false},participants:{count:2,video:false,audio:false}})};const disconnect=this.disconnect.bind(this);this.disconnect=async(...args)=>{f.voiceDisconnects++;return disconnect(...args)}}}`:
   args.path==='engine'?`import{createOfficeGame as create}from'./src/features/office/engine/create-game.ts';export function createOfficeGame(...args){editorFixture.mounts++;const c=args[1];args[1]={...c,onReady(...values){editorFixture.ready=true;c.onReady(...values)}};const engine=create(...args);editorFixture.engine=engine;const attach=engine.setNetwork;engine.setNetwork=n=>{editorFixture.network=n;attach(n)};return engine}`:
   args.path==='editor'?`const call=async body=>(await fetch('/editor',{method:'POST',body:JSON.stringify({...body,person:editorFixture.person})})).json();export async function loadDecorationAction(officeId){return call({operation:'load',officeId})}export async function saveDecorationAction(input){return call(input)}`:
   args.path==='chat'?`export async function loadOfficeChat(){return{ok:true,page:{messages:[],olderCursor:null}}}`:`export async function saveAvatarAction(){return{status:'error',message:'Read-only fixture'}}`}));
  }}]});fixtureJs=bundle.outputFiles[0].contents;
  const cache=resolve(root,'.cache');mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,'decoration-browser-'));child=spawn(browser,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{windowsHide:true,stdio:'ignore'});
  let port;await until(()=>{try{port=readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0];return!!port}catch{return false}},'browser launch');const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json(),tab=tabs.find(t=>t.type==='page');const a=await cdp(tab.webSocketDebuggerUrl);tools.push(a);await a.send('Target.createTarget',{url:'about:blank'});const otherTabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();const b=await cdp(otherTabs.find(t=>t.type==='page'&&t.id!==tab.id).webSocketDebuggerUrl);tools.push(b);
  for(const [i,t]of tools.entries()){await t.send('Runtime.enable');await t.send('Page.enable');await t.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await t.send('Page.navigate',{url:base+'/?person='+(i+1)});await until(()=>t.evaluate('!!window.editorFixture?.network?.snapshot()?.players.size&&window.editorFixture.ready'),'join '+i);}
  const scene='editorFixture.engine.game.scene.getScene("Office")';
  const liveRoom=async()=>{const rooms=await matchMaker.query({name:'office'});return rooms.map(r=>matchMaker.getLocalRoomById(r.roomId)).find(r=>r.state.officeId===office);};
  let live=await liveRoom();const session=await a.evaluate('editorFixture.network.sessionId()'),own=live.state.players.get(session),before={x:own.x,y:own.y},initialVersion=live.state.mapVersion;
  assert.equal(await b.evaluate(`!!document.querySelector('[aria-label="Edit office"]')`),false);
  assert.equal((await fetch(base+'/editor',{method:'POST',body:JSON.stringify({person:2,operation:'load'})})).status,403,'normal member denied by actual owner SQL RPC');
  await runDirectEditorScenario({a,b,tools,root,until,scene,liveRoom,live,own,before,initialVersion,action,currentMap,published,matchMaker,setSaveFailure:value=>{saveFailure=value;},setStructuralChange:()=>{structuralChange=true;}});
 }catch(error){if(tools[0])try{console.info(JSON.stringify({liveFailure:await tools[0].evaluate(`(()=>{const s=editorFixture.engine?.game.scene.getScene('Office');return{notice:document.querySelector('.editor-notice')?.textContent,selected:s?.editor?.state?.selectedId,busy:document.querySelector('.editor-bar')?.getAttribute('aria-busy'),revision:editorFixture.network?.environment()?.revision,objects:s?.editor?.objects.filter(o=>o.id.startsWith('custom/'))}})()`)}));}catch{}throw error;}finally{
  for(const t of tools)try{await t.evaluate('editorFixture.network?.close()')}catch{}
  if(tools[0])try{await tools[0].send('Browser.close')}catch{}for(const t of tools)t.close();
  if(child?.exitCode===null){await Promise.race([new Promise(ok=>child.once('exit',ok)),delay(2000)]);if(child.exitCode===null)child.kill();}
  await realtime?.gracefullyShutdown(false);if(server)await new Promise(ok=>server.close(ok));await db.close();
 }
});
