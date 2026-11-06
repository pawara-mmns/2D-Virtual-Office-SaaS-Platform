import {unusedDecorationActions} from './unused-decoration-fixture.mjs';
// Actual React HUD + Phaser + Colyseus HTTP/WebSockets, synthetic authorization.
// Test-owned Chromium profile only. No Supabase, hosted tenants, or microphone capture.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createRealtimeServer} from '../apps/realtime/src/server.ts';
import {AccessDenied} from '../apps/realtime/src/auth/authorize.ts';
import {composeEnvironment} from '../packages/shared/src/environment/compose.ts';
import {defaultEnvironment} from '../packages/shared/src/environment/catalog.ts';
import {interactionRegistry,seatApproach,closestInteraction} from '../packages/shared/src/interactions.ts';
import {isChairAsset,embeddedWorkstationAssets} from '../packages/shared/src/environment/seating-metadata.ts';
import {canStand} from '../packages/shared/src/movement.ts';
const root=resolve(import.meta.dirname,'..'),web=resolve(root,'apps/web'),rtRequire=createRequire(resolve(root,'apps/realtime/package.json'));
const {build}=createRequire(rtRequire.resolve('tsx'))('esbuild');
const {matchMaker}=await import(pathToFileURL(rtRequire.resolve('colyseus')).href);
const browser=process.env.OFFICE_TEST_BROWSER||['C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function until(check,label){for(let n=0;n<200;n++){if(await check())return;await delay(80);}throw Error('Browser timed out: '+label);}
async function cdp(url){const ws=new WebSocket(url);await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});let serial=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||'Browser exception');if(m.method==='Runtime.consoleAPICalled'&&m.params.args?.some(a=>/Maximum update depth|Cannot update a component/.test(a.value??'')))errors.push('React warning');const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.fail(Error(m.error.message)):p.ok(m.result)}};const send=(method,params={})=>new Promise((ok,fail)=>{const n=++serial,timer=setTimeout(()=>fail(Error('CDP timeout '+method)),10000);pending.set(n,{ok,fail,timer});ws.send(JSON.stringify({id:n,method,params}))});return{send,errors,close:()=>ws.close(),async evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Evaluation failed');return r.result.value;}};}

test('Brave: four-direction chairs, workstation anchors/layering, occupied UI and synchronized seating', {timeout:120000,skip:!browser},async()=>{
  const geometry=composeEnvironment(defaultEnvironment),officeId=id(990),config=JSON.stringify(defaultEnvironment);
  let fixtureJs;
  const css=readdirSync(resolve(web,'.next/static'),{recursive:true}).filter(f=>f.endsWith('.css')).map(f=>readFileSync(resolve(web,'.next/static',f),'utf8')).join('\n');
  const http=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureJs);}
    else if(path==='/office/avatar.png'||path==='/office/environments/warm-wood.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync(resolve(web,'public',path.slice(1))));}
    else if(path==='/favicon.ico'){res.writeHead(204);res.end();}
    else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}body{background:#f7f8f3}.relative{position:relative}.office-page{height:100dvh}#fixture-label{position:fixed;left:16px;bottom:12px;z-index:6;font:11px Arial;color:#426051;pointer-events:none}</style><div id="root"></div><span id="fixture-label">Phase 01 · synthetic two-client browser fixture</span><script type="module" src="/fixture.js"></script></html>`);}
  });
  await new Promise(ok=>http.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${http.address().port}`;
  const authorize=async(token,requested)=>{const n=Number(String(token).replace('movement-fixture-',''));if(![1,2].includes(n)||requested!==officeId)throw new AccessDenied();return{userId:id(n),organizationId:id(991),officeId,token:String(token),checkedAt:Date.now(),expiresAt:Date.now()+300000,displayName:n===1?'Taylor':'Morgan',avatarKey:n===1?'fern':'plum'};};
  const realtime=createRealtimeServer({authorize,map:geometry,origins:[base],proximity:{dwellMs:100,graceMs:100}});
  let chrome;const tools=[];
  try{
    await realtime.listen(0,'127.0.0.1');const rt=`http://127.0.0.1:${realtime.transport.server.address().port}`;
    const bundle=await build({bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',jsx:'automatic',logLevel:'silent',tsconfig:resolve(web,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_REALTIME_URL':JSON.stringify(rt)},stdin:{resolveDir:web,loader:'tsx',contents:`
      import React from 'react';import{createRoot}from'react-dom/client';import OfficeCanvas from'./src/features/office/components/office-canvas';
      const person=Number(new URL(location.href).searchParams.get('person'))||1;
      window.movementFixture={person};createRoot(document.getElementById('root')).render(<main className="office-page"><OfficeCanvas environment={${config}} appearance={{avatarKey:person===1?'fern':'plum',displayName:person===1?'Taylor':'Morgan'}} officeId='${officeId}' userId={'00000000-0000-4000-8000-'+String(person).padStart(12,'0')} context={{workspaceName:'Local multiplayer verification',officeName:'Oak & Fern Studio',workspaceHref:'#'}}/></main>);
    `},plugins:[{name:'isolate-services-and-observe-engine',setup(plugin){unusedDecorationActions(plugin);
      plugin.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
      plugin.onResolve({filter:/lib\/supabase\/client$/},()=>({path:'auth',namespace:'fixture'}));
      plugin.onResolve({filter:/engine\/create-game$/},()=>({path:'engine',namespace:'fixture'}));
      plugin.onResolve({filter:/^\.\/actions$/},args=>({path:args.importer.endsWith('chat-panel.tsx')?'chat':'avatar',namespace:'fixture'}));
      plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:web,loader:'js',contents:args.path==='link'?`import React from'react';export default function Link(p){return React.createElement('a',p,p.children)}`:args.path==='auth'?`export const createClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'movement-fixture-'+window.movementFixture.person}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})`:
      args.path==='engine'?`import{createOfficeGame as create}from'./src/features/office/engine/create-game.ts';export function createOfficeGame(...args){const c=args[1];args[1]={...c,onReady(v){window.movementFixture.ready=true;c.onReady(v)}};const engine=create(...args);window.movementFixture.engine=engine;const attach=engine.setNetwork;engine.setNetwork=n=>{window.movementFixture.network=n;attach(n)};return engine}`:
      args.path==='chat'?`export async function loadOfficeChat(){return{ok:true,page:{messages:[],olderCursor:null}}}`:`export async function saveAvatarAction(){return{status:'error',message:'Fixture profile is read-only'}}`}));
    }}]});fixtureJs=bundle.outputFiles[0].contents;
    const cache=resolve(root,'.cache');mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,'movement-browser-'));
    chrome=spawn(browser,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{windowsHide:true,stdio:'ignore'});
    let port;await until(()=>{try{port=readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0];return !!port}catch{return false}},'browser launch');
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();const first=await cdp(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);tools.push(first);
    await first.send('Target.createTarget',{url:'about:blank'});const list=await(await fetch(`http://127.0.0.1:${port}/json`)).json();const second=await cdp(list.find(t=>t.type==='page'&&t.webSocketDebuggerUrl!==tabs.find(t=>t.type==='page').webSocketDebuggerUrl).webSocketDebuggerUrl);tools.push(second);
    for(const [index,t]of tools.entries()){await t.send('Runtime.enable');await t.send('Page.enable');await t.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await t.send('Page.navigate',{url:base+'/?person='+(index+1)});await until(()=>t.evaluate('!!window.movementFixture?.network?.snapshot()?.players?.size&&window.movementFixture.ready'),'client '+index);}
    const a=tools[0],b=tools[1],session=await a.evaluate('movementFixture.network.sessionId()'),sessionB=await b.evaluate('movementFixture.network.sessionId()');
    const queried=await matchMaker.query({name:'office'}),live=queried.map(r=>matchMaker.getLocalRoomById(r.roomId)).find(r=>r.state.officeId===officeId),state=live.state;
    const own=state.players.get(session),other=state.players.get(sessionB),objects=interactionRegistry(geometry);
    const scene='movementFixture.engine.game.scene.getScene("Office")',self=`${scene}.player`;
    const shots=resolve(root,'docs/assets/workstation-seating');mkdirSync(shots,{recursive:true});
    const shot=async(name)=>{await a.send('Page.bringToFront');await delay(160);writeFileSync(resolve(shots,name),Buffer.from((await a.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));};
    const key=async(code,down=true,modifiers=0)=>a.send('Input.dispatchKeyEvent',{type:down?'keyDown':'keyUp',code,key:code==='KeyE'?'e':code==='ShiftLeft'?'Shift':code,modifiers});
    const choose=(predicate)=>{
      for(const object of objects.filter(predicate))for(const slot of object.slots)for(const entry of slot.approaches){
        if(seatApproach(geometry,object,slot,entry)&&closestInteraction(geometry,objects,entry,state.seats)?.slotId===slot.id)return{object,slot,entry};
      }
      throw Error('No closest reachable fixture seat matched');
    };
    const sit=async(choice)=>{
      Object.assign(own,choice.entry);await a.send('Page.bringToFront');await a.evaluate('document.querySelector(".office-stage").focus()');
      await until(()=>a.evaluate(`${scene}.primary?.slotId===${JSON.stringify(choice.slot.id)}&&${scene}.primary.available!==false`),'correct nearest seat prompt');
      await key('KeyE');await key('KeyE',false);await until(()=>own.seatId===choice.slot.id,'authoritative seat');
      await until(()=>b.evaluate(`movementFixture.network.snapshot().players.get(${JSON.stringify(session)}).direction===${JSON.stringify(choice.slot.anchor.direction)}&&movementFixture.network.snapshot().players.get(${JSON.stringify(session)}).seatId===${JSON.stringify(choice.slot.id)}`),'remote direction and seat');
      const frame=72+['down','left','right','up'].indexOf(choice.slot.anchor.direction)*3;
      await until(()=>a.evaluate(`Number(${self}.frame.name)===${frame}`),'native cardinal sitting frame');
      assert.equal(await a.evaluate(`${self}.rotation`),0);assert.equal(await a.evaluate(`${self}.flipX`),false);
      assert.equal(own.x,choice.slot.anchor.x);assert.equal(own.y,choice.slot.anchor.y);
    };
    const stand=async()=>{await delay(280);await a.evaluate('document.querySelector(".office-stage").focus()');await key('KeyE');await key('KeyE',false);await until(()=>!own.seatId,'stand');assert.ok(canStand(geometry,own.x,own.y));await delay(280);};
    for(const [direction,file]of [['up','01-sitting-up.png'],['down','02-sitting-down.png'],['left','03-sitting-left.png'],['right','04-sitting-right.png']]){
      const choice=choose(o=>isChairAsset(o.assetId)&&o.slots[0].anchor.direction===direction);
      await sit(choice);await shot(file);await stand();
    }
    const desk=choose(o=>embeddedWorkstationAssets.includes(o.assetId));await sit(desk);
    assert.equal(own.direction,'up');assert.ok(desk.object.foreground.length>0);
    const originalZoom=await a.evaluate(`${scene}.cameras.main.zoom`);
    for(const zoom of [1,1.5,2,2.5]){
      await a.evaluate(`${scene}.setZoom(${zoom})`);await delay(80);
      assert.ok(await a.evaluate(`${scene}.children.list.some(o=>o.getData?.('seatingForeground')===true&&o.depth>${self}.depth)`),'Desk foreground remains above the avatar across camera zooms');
      assert.equal(own.seatId,desk.slot.id);
    }
    await a.evaluate(`${scene}.setZoom(${originalZoom})`);
    await shot('05-computer-workstation.png');
    Object.assign(other,desk.entry);await b.send('Page.bringToFront');await until(()=>b.evaluate('document.querySelector(".office-interaction-prompt")?.textContent.includes("occupied")'),'occupied feedback');
    assert.equal(await b.evaluate('document.querySelector(".office-interaction-prompt").disabled'),true);
    await b.evaluate('document.querySelector(".office-stage").focus()');await b.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyE',key:'e'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyE',key:'e'});await delay(200);assert.equal(other.seatId,'');assert.equal(state.seats.get(desk.slot.id),session);
    await a.send('Page.bringToFront');await stand();
    const sofa=choose(o=>o.objectType==='sofa');await sit(sofa);await shot('06-sofa.png');await stand();
    // Existing Shift intent still selects only the server's bounded running speed.
    let runway;for(let y=32;y<geometry.height*32-32&&!runway;y+=32)for(let x=48;x<geometry.width*32-140;x+=32)if(Array.from({length:120},(_,n)=>canStand(geometry,x+n,y)).every(Boolean)){runway={x,y};break;}
    assert.ok(runway);Object.assign(own,runway);await delay(200);await a.evaluate('document.querySelector(".office-stage").focus()');await key('ArrowRight');await key('ShiftLeft',true,8);await until(()=>b.evaluate(`movementFixture.network.snapshot().players.get(${JSON.stringify(session)}).isRunning===true`),'run regression');await key('ArrowRight',false);await key('ShiftLeft',false);
    for(const t of tools)assert.deepEqual(t.errors,[]);
    console.info('Brave actual two-client cardinal seated frames, workstation alignment/layering, occupied UI, sofa, safe stand and Shift regression passed; synthetic identities only.');

  }finally{
    for(const t of tools)try{await t.evaluate('movementFixture.network?.close()')}catch{}
    if(tools[0])try{await tools[0].send('Browser.close')}catch{}
    for(const t of tools)t.close();
    if(chrome&&chrome.exitCode===null){await Promise.race([new Promise(ok=>chrome.once('exit',ok)),delay(1500)]);if(chrome.exitCode===null)chrome.kill();}
    await realtime.gracefullyShutdown(false);await new Promise(ok=>http.close(ok));
  }
});
