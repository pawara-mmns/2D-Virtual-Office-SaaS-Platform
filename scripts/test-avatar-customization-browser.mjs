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
import {defaultCustomization,encodeCustomization,parseCustomization,randomCustomization} from '../packages/shared/src/avatar-customization.ts';
const root=resolve(import.meta.dirname,'..'),web=resolve(root,'apps/web'),rtRequire=createRequire(resolve(root,'apps/realtime/package.json'));
const {build}=createRequire(rtRequire.resolve('tsx'))('esbuild');
const {matchMaker}=await import(pathToFileURL(rtRequire.resolve('colyseus')).href);
const browser=process.env.OFFICE_TEST_BROWSER||['C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function until(check,label){for(let n=0;n<200;n++){if(await check())return;await delay(80);}throw Error('Browser timed out: '+label);}
const DebugSocket=createRequire(rtRequire.resolve('@colyseus/sdk'))('ws');
async function cdp(url){const ws=new DebugSocket(url);await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});let serial=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||'Browser exception');if(m.method==='Runtime.consoleAPICalled'&&m.params.args?.some(a=>/Maximum update depth|Cannot update a component/.test(a.value??'')))errors.push('React warning');const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.fail(Error(m.error.message)):p.ok(m.result)}};const send=(method,params={})=>new Promise((ok,fail)=>{const n=++serial,timer=setTimeout(()=>fail(Error('CDP timeout '+method)),10000);pending.set(n,{ok,fail,timer});ws.send(JSON.stringify({id:n,method,params}))});return{send,errors,close:()=>ws.close(),async evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||'Evaluation failed');return r.result.value;}};}

test('Chromium: modular creator, live appearance sync, cardinal poses, mobile and ten customized players', {timeout:120000,skip:!browser},async()=>{
  const geometry=composeEnvironment(defaultEnvironment),officeId=id(990),config=JSON.stringify(defaultEnvironment);
  let fixtureJs,rejectNextSave=false;
  const profiles=new Map(Array.from({length:10},(_,i)=>[i+1,{avatarKey:i===1?'plum':'fern',displayName:i===0?'Taylor':'Morgan '+(i+1),appearance:encodeCustomization(i===0?defaultCustomization:{...randomCustomization(),hair:i===1?'long':'curls'})}]));
  const css=readdirSync(resolve(web,'.next/static'),{recursive:true}).filter(f=>f.endsWith('.css')).map(f=>readFileSync(resolve(web,'.next/static',f),'utf8')).join('\n');
  const http=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/profile'){
      const person=Number(String(req.headers.authorization??'').replace('Bearer movement-fixture-',''));
      if(!profiles.has(person)){res.writeHead(403);res.end();return;}
      res.setHeader('Content-Type','application/json');
      if(req.method==='GET'){res.end(JSON.stringify(profiles.get(person)));return;}
      if(rejectNextSave){rejectNextSave=false;req.resume();res.writeHead(503);res.end(JSON.stringify({status:'error',message:'Save is temporarily unavailable. Your changes are still here.'}));return;}
      let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{try{const input=JSON.parse(body),config=input.appearance===null?undefined:encodeCustomization(parseCustomization(input.appearance));const profile={avatarKey:input.avatarKey,displayName:input.displayName,appearance:config};profiles.set(person,profile);res.end(JSON.stringify({status:'success',message:'Appearance saved. Your office profile is updated.',...profile}));}catch{res.writeHead(400);res.end(JSON.stringify({status:'error',message:'Invalid appearance'}));}});
    }
    else if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureJs);}
    else if(path==='/office/avatar-layers.png'||path==='/office/avatar.png'||path==='/office/environments/warm-wood.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync(resolve(web,'public',path.slice(1))));}
    else if(path==='/favicon.ico'){res.writeHead(204);res.end();}
    else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}body{background:#f7f8f3}.relative{position:relative}.office-page{height:100dvh}#fixture-label{position:fixed;left:16px;bottom:12px;z-index:6;font:11px Arial;color:#426051;pointer-events:none}</style><div id="root"></div><span id="fixture-label">Phase 04 · local synthetic avatar verification</span><script type="module" src="/fixture.js"></script></html>`);}
  });
  await new Promise(ok=>http.listen(0,'127.0.0.1',ok));const base=`http://127.0.0.1:${http.address().port}`;
  const authorize=async(token,requested)=>{const n=Number(String(token).replace('movement-fixture-',''));if(!profiles.has(n)||requested!==officeId)throw new AccessDenied();return{userId:id(n),organizationId:id(991),officeId,token:String(token),checkedAt:Date.now(),expiresAt:Date.now()+300000,...profiles.get(n)};};
  const realtime=createRealtimeServer({authorize,map:geometry,origins:[base],proximity:{dwellMs:100,graceMs:100}});
  let chrome;const tools=[];
  try{
    await realtime.listen(0,'127.0.0.1');const rt=`http://127.0.0.1:${realtime.transport.server.address().port}`;
    const bundle=await build({bundle:true,write:false,platform:'browser',format:'esm',target:'es2022',jsx:'automatic',logLevel:'silent',tsconfig:resolve(web,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"','process.env.NEXT_PUBLIC_REALTIME_URL':JSON.stringify(rt)},stdin:{resolveDir:web,loader:'tsx',contents:`
      import React from 'react';import{createRoot}from'react-dom/client';import OfficeCanvas from'./src/features/office/components/office-canvas';
      const person=Number(new URL(location.href).searchParams.get('person'))||1;
      import{connectOffice}from'./src/features/office/network/connection.ts';import{mapVersion}from'../../packages/shared/src/protocol.ts';import{composeEnvironment}from'../../packages/shared/src/environment/compose.ts';
      import{composeAvatar,loadAvatarAtlas}from'./src/features/avatars/composer.ts';import{randomCustomization,defaultCustomization}from'../../packages/shared/src/avatar-customization.ts';
      const initial=await(await fetch('/profile',{headers:{Authorization:'Bearer movement-fixture-'+person}})).json();
      window.movementFixture={person,loadedAt:performance.timeOrigin,extras:[],composeAvatar,loadAvatarAtlas,randomCustomization,defaultCustomization,async addPeople(){for(let i=3;i<=10;i++){this.extras.push(connectOffice({url:${JSON.stringify(rt)},officeId:'${officeId}',mapVersion:mapVersion(composeEnvironment(${config})),getToken:async()=>'movement-fixture-'+i,onPresence(){}}));}}};
      createRoot(document.getElementById('root')).render(<main className="office-page"><OfficeCanvas environment={${config}} appearance={initial} officeId='${officeId}' userId={'00000000-0000-4000-8000-'+String(person).padStart(12,'0')} context={{workspaceName:'Local avatar verification',officeName:'Oak & Fern Studio',workspaceHref:'#'}}/></main>);
    `},plugins:[{name:'isolate-services-and-observe-engine',setup(plugin){unusedDecorationActions(plugin);
      plugin.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
      plugin.onResolve({filter:/lib\/supabase\/client$/},()=>({path:'auth',namespace:'fixture'}));
      plugin.onResolve({filter:/engine\/create-game$/},()=>({path:'engine',namespace:'fixture'}));
      plugin.onResolve({filter:/^\.\/actions$/},args=>({path:args.importer.endsWith('chat-panel.tsx')?'chat':'avatar',namespace:'fixture'}));
      plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:web,loader:'js',contents:args.path==='link'?`import React from'react';export default function Link(p){return React.createElement('a',p,p.children)}`:args.path==='auth'?`export const createClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'movement-fixture-'+window.movementFixture.person}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})`:
      args.path==='engine'?`import{createOfficeGame as create}from'./src/features/office/engine/create-game.ts';export function createOfficeGame(...args){const c=args[1];args[1]={...c,onReady(v){window.movementFixture.ready=true;c.onReady(v)}};const engine=create(...args);window.movementFixture.engine=engine;const attach=engine.setNetwork;engine.setNetwork=n=>{window.movementFixture.network=n;attach(n)};return engine}`:
      args.path==='chat'?`export async function loadOfficeChat(){return{ok:true,page:{messages:[],olderCursor:null}}}`:`export async function saveAvatarAction(_,form){return(await fetch('/profile',{method:'POST',headers:{Authorization:'Bearer movement-fixture-'+window.movementFixture.person,'Content-Type':'application/json'},body:JSON.stringify({avatarKey:form.get('avatarKey'),displayName:form.get('displayName'),appearance:JSON.parse(form.get('appearance'))})})).json()}`}));
    }}]});fixtureJs=bundle.outputFiles[0].contents;
    const cache=resolve(root,'.cache');mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,'movement-browser-'));
    chrome=spawn(browser,['--headless=new','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-timer-throttling','--disable-renderer-backgrounding','about:blank'],{windowsHide:true,stdio:'ignore'});
    let port;await until(()=>{try{port=readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0];return !!port}catch{return false}},'browser launch');
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();const first=await cdp(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);tools.push(first);
    await first.send('Target.createTarget',{url:'about:blank'});const list=await(await fetch(`http://127.0.0.1:${port}/json`)).json();const second=await cdp(list.find(t=>t.type==='page'&&t.webSocketDebuggerUrl!==tabs.find(t=>t.type==='page').webSocketDebuggerUrl).webSocketDebuggerUrl);tools.push(second);
    for(const [index,t]of tools.entries()){await t.send('Runtime.enable');await t.send('Page.enable');await t.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await t.send('Page.navigate',{url:base+'/?person='+(index+1)});await until(()=>t.evaluate('!!window.movementFixture?.network?.snapshot()?.players?.size&&window.movementFixture.ready'),'client '+index);}
    const a=tools[0],b=tools[1],session=await a.evaluate('movementFixture.network.sessionId()'),sessionB=await b.evaluate('movementFixture.network.sessionId()');
    const queried=await matchMaker.query({name:'office'}),live=queried.map(r=>matchMaker.getLocalRoomById(r.roomId)).find(r=>r.state.officeId===officeId),state=live.state;
    const own=state.players.get(session),other=state.players.get(sessionB),objects=interactionRegistry(geometry);
    const scene='movementFixture.engine.game.scene.getScene("Office")',self=`${scene}.player`;
    const shots=resolve(root,'docs/assets/avatar-studio');mkdirSync(shots,{recursive:true});
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
      const frame=12+['down','left','right','up'].indexOf(choice.slot.anchor.direction)*3;
      await until(()=>a.evaluate(`Number(${self}.frame.name)===${frame}`),'native cardinal sitting frame');
      assert.equal(await a.evaluate(`${self}.rotation`),0);assert.equal(await a.evaluate(`${self}.flipX`),false);
      assert.equal(own.x,choice.slot.anchor.x);assert.equal(own.y,choice.slot.anchor.y);
    };
    const button=async text=>a.evaluate(`(()=>{const scope=document.querySelector('.avatar-studio[open]')??document;const target=Array.from(scope.querySelectorAll('button,input[type=radio]')).find(b=>[b.textContent.trim(),b.getAttribute('aria-label')].some(v=>v?.toLowerCase()===${JSON.stringify(text.toLowerCase())})&&!b.closest('[hidden],[inert]'));if(!target||target.disabled)throw Error('Missing or disabled control '+${JSON.stringify(text)});target.click()})()`);
    const openEditor=async()=>{await a.evaluate(`document.querySelector('button[aria-label="Profile and workspace"]').click()`);await a.evaluate(`document.querySelector('button[aria-label="Avatar settings"]').click()`);await until(()=>a.evaluate('!!document.querySelector(".avatar-studio[open] .avatar-creator")'),'avatar creator');};
    const layout=()=>a.evaluate(`(()=>{const d=document.querySelector('.avatar-studio'),f=d.querySelector('form'),p=d.querySelector('.studio-preview-pane').getBoundingClientRect(),o=d.querySelector('.studio-wardrobe').getBoundingClientRect(),footer=d.querySelector('footer').getBoundingClientRect(),r=d.getBoundingClientRect(),tabs=[...d.querySelectorAll('[role=tab]')].map(n=>n.getBoundingClientRect().top);return{width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewport:[innerWidth,innerHeight],twoColumns:p.right<=o.left+1,tabRows:new Set(tabs.map(Math.round)).size,formScroll:f.scrollHeight>f.clientHeight+1,footerVisible:footer.bottom<=innerHeight+1&&footer.top>=0,previewVisible:p.top>=r.top&&p.bottom<=footer.top+1}})()`);
    const previewHash=()=>a.evaluate(`(()=>{const c=document.querySelector('.studio-stage canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return Array.from(d).reduce((a,b)=>(Math.imul(a,31)+b)>>>0,0)})()`);
    const clickOption=async name=>{const point=await a.evaluate(`(()=>{const n=[...document.querySelectorAll('.studio-option-card')].find(n=>n.querySelector('input').getAttribute('aria-label')===${JSON.stringify(name)});if(!n)throw Error('Missing visual option');const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,hit:n.contains(document.elementFromPoint(x,y))}})()`);assert.ok(point.hit,'visual card is not hidden or covered');await a.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});await a.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});};
    await until(()=>a.evaluate(`${self}.texture.key.startsWith('custom-avatar-')`),'custom sheet loaded');
    await openEditor();await shot('studio-desktop.png');const desktop=await layout();assert.ok(desktop.twoColumns&&desktop.width>=800&&desktop.width<=900&&desktop.tabRows===1&&!desktop.formScroll&&desktop.footerVisible&&desktop.previewVisible);assert.ok(await a.evaluate('document.querySelector(".studio-save").disabled'),'unchanged save is disabled');
    await a.evaluate('document.querySelector(".office-stage").focus()');assert.ok(await a.evaluate('!!document.activeElement.closest(".avatar-studio")'),'modal prevents focus from entering gameplay');
    await a.evaluate('document.querySelector(".studio-categories [aria-selected=true]").focus()');await key('ArrowRight');await key('ArrowRight',false);assert.equal(await a.evaluate('document.querySelector(".studio-categories [aria-selected=true]").textContent'),'Hair');await key('Home');await key('Home',false);assert.equal(await a.evaluate('document.querySelector(".studio-categories [aria-selected=true]").textContent'),'Body');
    await key('Escape');await key('Escape',false);await until(()=>a.evaluate('!document.querySelector(".avatar-studio[open]")'),'clean Escape closes the studio');assert.equal(await a.evaluate('document.activeElement.getAttribute("aria-label")'),'Profile and workspace');await openEditor();
    for(const motion of ['Walk','Run','Sit','Idle']){await button(motion+' preview');assert.equal(await a.evaluate(`document.querySelector('button[aria-label="${motion} preview"]').getAttribute('aria-pressed')`),'true');}
    await button('Rotate left');await button('Rotate right');assert.ok(await a.evaluate('document.querySelector(".studio-save").disabled'),'preview controls are not appearance edits');
    await button('Hair');const priorPixels=await previewHash();await clickOption('Bob');await until(async()=>await previewHash()!==priorPixels,'immediate visual preview');await shot('studio-hair.png');await shot('01-avatar-creator.png');
    assert.ok(await a.evaluate(`getComputedStyle(document.querySelector('.avatar-studio')).colorScheme==='dark'`),'studio uses the dark neutral material palette');
    assert.equal(await a.evaluate('JSON.parse(document.querySelector("input[name=appearance]").value).hair'),'bob');
    const before=own.appearance;await key('Escape');await key('Escape',false);assert.ok(await a.evaluate('!!document.querySelector("[role=alertdialog]")'),'unsaved Escape requires an explicit choice');await button('Keep editing');assert.equal(await a.evaluate('JSON.parse(document.querySelector("input[name=appearance]").value).hair'),'bob');await button('Cancel');await button('Discard changes');assert.equal(own.appearance,before,'Cancel never publishes the draft');
    const spriteIdentity=await a.evaluate(`${self}.texture.key`);
    await openEditor();await button('Tops');await button('Dress');assert.equal(await a.evaluate('JSON.parse(document.querySelector("input[name=appearance]").value).bottom'),'none');
    await clickOption('Hoodie');await shot('studio-outfit.png');await button('Hair');await clickOption('Bob');await button('Hair color #bd995d');await shot('studio-color.png');
    await a.evaluate('document.querySelector("[name=displayName]").focus();document.querySelector("[name=displayName]").select()');await a.send('Input.insertText',{text:'private@example.invalid'});await button('Save Appearance');assert.equal(await a.evaluate('document.querySelector(".studio-feedback").dataset.status'),'error');assert.equal(own.appearance,before,'invalid names never save');await a.evaluate('document.querySelector("[name=displayName]").select()');await a.send('Input.insertText',{text:'Taylor'});assert.equal(await a.evaluate('document.querySelector(".studio-feedback").dataset.status'),'idle','editing clears validation errors');
    const failedDraft=await a.evaluate('document.querySelector("input[name=appearance]").value');rejectNextSave=true;await button('Save Appearance');await until(()=>a.evaluate('document.querySelector(".studio-feedback").dataset.status==="error"'),'failed save feedback');assert.equal(await a.evaluate('document.querySelector("input[name=appearance]").value'),failedDraft,'failed saves preserve the draft');assert.equal(own.appearance,before);await button('Save Appearance');
    await until(()=>profiles.get(1).appearance!==before,'profile HTTP committed');
    await until(()=>own.appearance!==before,'authoritative save');assert.equal(JSON.parse(own.appearance).hair,'bob');
    await until(()=>b.evaluate(`movementFixture.network.snapshot().players.get(${JSON.stringify(session)}).appearance===${JSON.stringify(own.appearance)}`),'remote metadata update');
    await until(()=>a.evaluate(`${self}.texture.key!==${JSON.stringify(spriteIdentity)}`),'local predicted renderer accepts appearance update');
    assert.ok(await a.evaluate('document.querySelector(".studio-save").disabled'),'save disables after success');
    await button('Cancel');await shot('02-customized-avatars.png');
    const stand=async()=>{await delay(280);await a.evaluate('document.querySelector(".office-stage").focus()');await key('KeyE');await key('KeyE',false);await until(()=>!own.seatId,'stand');assert.ok(canStand(geometry,own.x,own.y));await delay(280);};
    for(const [direction,file]of [['up','03-sitting-north.png'],['down','04-sitting-south.png'],['left','05-sitting-west.png'],['right','06-sitting-east.png']]){
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
    await shot('07-sitting-at-desk.png');
    const seated={x:own.x,y:own.y,seatId:own.seatId,direction:own.direction,epoch:own.movementEpoch};
    const appearanceBeforeSeat=own.appearance;
    await openEditor();await button('Accessories');await button('Square');await button('Save appearance');
    await until(()=>own.appearance!==appearanceBeforeSeat,'save while seated');await button('Cancel');
    assert.deepEqual({x:own.x,y:own.y,seatId:own.seatId,direction:own.direction,epoch:own.movementEpoch},seated,'Appearance update preserves seating and movement lifetime');
    await until(()=>b.evaluate(`movementFixture.network.snapshot().players.get(${JSON.stringify(session)}).appearance===${JSON.stringify(own.appearance)}`),'seated appearance remote sync');
    const synchronized=own.appearance;
    await b.send('Page.bringToFront');await delay(150);writeFileSync(resolve(shots,'08-multiplayer-synchronization.png'),Buffer.from((await b.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await a.send('Page.bringToFront');
    Object.assign(other,desk.entry);await b.send('Page.bringToFront');await until(()=>b.evaluate('document.querySelector(".office-interaction-prompt")?.textContent.includes("occupied")'),'occupied feedback');
    assert.equal(await b.evaluate('document.querySelector(".office-interaction-prompt").disabled'),true);
    await b.evaluate('document.querySelector(".office-stage").focus()');await b.send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyE',key:'e'});await b.send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyE',key:'e'});await delay(200);assert.equal(other.seatId,'');assert.equal(state.seats.get(desk.slot.id),session);
    await a.send('Page.bringToFront');await stand();
    const sofa=choose(o=>o.objectType==='sofa');await sit(sofa);await shot('09-sofa.png');await stand();
    // Existing Shift intent still selects only the server's bounded running speed.
    let runway;for(let y=32;y<geometry.height*32-32&&!runway;y+=32)for(let x=48;x<geometry.width*32-140;x+=32)if(Array.from({length:120},(_,n)=>canStand(geometry,x+n,y)).every(Boolean)){runway={x,y};break;}
    assert.ok(runway);Object.assign(own,runway);await delay(200);await a.evaluate('document.querySelector(".office-stage").focus()');await key('ArrowRight');
    await until(()=>b.evaluate(`movementFixture.network.snapshot().players.get(${JSON.stringify(session)}).motionState==='WALKING'`),'walking');await shot('10-walking.png');
    await key('ShiftLeft',true,8);await until(()=>b.evaluate(`movementFixture.network.snapshot().players.get(${JSON.stringify(session)}).isRunning===true`),'run regression');await shot('11-running.png');await key('ArrowRight',false);await key('ShiftLeft',false);
    await a.evaluate('movementFixture.addPeople()');await until(()=>state.players.size===10,'ten connected customized players');
    for(const [i,player]of [...state.players.values()].entries())Object.assign(player,{x:runway.x+i*24,y:runway.y});
    await until(()=>a.evaluate(`${scene}.remotes.size===9`),'ten rendered custom avatars');
    await shot('12-ten-customized-avatars.png');
    const performanceResult=await a.evaluate(`(async()=>{const samples=[],f=movementFixture,atlas=await f.loadAvatarAtlas(),start=performance.now();for(let i=0;i<10;i++)f.composeAvatar(f.randomCustomization(),atlas);const compositionMs=performance.now()-start;let last=performance.now();for(let i=0;i<60;i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push(now-last);last=now;}return{compositionMs,meanFrameMs:samples.reduce((a,b)=>a+b,0)/samples.length,diagnostics:${scene}.movementDiagnostics(),textures:${scene}.textures.getTextureKeys().filter(k=>k.startsWith('custom-avatar-')).length};})()`);
    writeFileSync(resolve(shots,'performance.json'),JSON.stringify(performanceResult,null,2));assert.ok(performanceResult.compositionMs<1500);assert.ok(performanceResult.meanFrameMs<100,'ten-player headless frame budget');
    await a.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await openEditor();await shot('13-avatar-creator-mobile.png');
    await shot('studio-mobile.png');const mobile=await layout();assert.ok(mobile.width===390&&mobile.height===844&&!mobile.formScroll&&mobile.footerVisible&&mobile.previewVisible&&mobile.tabRows===1,'fullscreen mobile with a persistent preview and footer');
    await button('Hair');await shot('studio-mobile-hair.png');
    const previewBeforeScroll=await a.evaluate('document.querySelector(".studio-stage").getBoundingClientRect().top');await a.evaluate('document.querySelector(".studio-options-scroll").scrollTop=200');assert.equal(await a.evaluate('document.querySelector(".studio-stage").getBoundingClientRect().top'),previewBeforeScroll,'only options scroll');
    for(const [width,height,name]of [[1280,600,'studio-short-laptop.png'],[844,390,'studio-landscape.png'],[320,640,'studio-small-mobile.png'],[640,450,'studio-zoom-200.png']]){
      await a.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900});await delay(80);const fit=await layout();assert.ok(fit.left>=0&&fit.right<=width+1&&fit.top>=0&&fit.bottom<=height+1&&fit.footerVisible&&!fit.formScroll&&fit.previewVisible,name+' fits without scrolling the dialog');await shot(name);
    }
    await a.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.ok(await a.evaluate('document.documentElement.scrollWidth<=innerWidth'),'no mobile horizontal overflow');
    await button('Cancel');await a.evaluate('movementFixture.extras.forEach(n=>n.close())');
    await a.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await a.evaluate(`(async()=>{const f=movementFixture,atlas=await f.loadAvatarAtlas(),gallery=document.createElement('section');gallery.id='avatar-gallery';gallery.style.cssText='position:fixed;inset:28px;z-index:100;background:#edf0f4;color:#1b2028;border-radius:24px;padding:24px;font:14px system-ui';gallery.innerHTML='<p style="font-size:10px;letter-spacing:.16em">PHASE 04 · ORIGINAL PIXEL ART</p><h1 style="font-size:24px;margin:8px 0">An office full of personalities.</h1><p>Shared silhouettes. Individual style. Every look supports four directions, walking, running and sitting.</p>';const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px';for(let i=0;i<12;i++){const body=['classic','slim','broad'][i%3],hair=['short','waves','curls','long','crop','bob','bun','bald'][i%8],top=['tshirt','shirt','hoodie','jacket','dress'][i%5],config={...f.defaultCustomization,body,hair,top,bottom:top==='dress'?'none':['pants','jeans','skirt'][i%3],hat:i===7?'beanie':i===8?'cap':'none',headphones:i===9?'overear':'none',glasses:i===10?'round':i===11?'square':'none',office:i===6?'badge':'none',skinColor:['#d9a47f','#a86f51','#875a43','#f4d4b7'][i%4],hairColor:['#4c3c36','#bd995d','#302f30','#8e9692'][i%4],topColor:['#426c6e','#426a87','#985b48','#705467','#9a7a3c'][i%5]},sheet=f.composeAvatar(config,atlas);if(f.composeAvatar(config,atlas)!==sheet)throw Error('Cache miss');const card=document.createElement('div');card.style.cssText='display:flex;align-items:center;flex-direction:column;padding:12px;background:#ffffff80;border:1px solid #ffffff;border-radius:16px';const canvas=document.createElement('canvas');canvas.width=canvas.height=32;canvas.style.cssText='width:128px;height:128px;image-rendering:pixelated';const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(sheet,0,0,32,32,0,0,32,32);card.append(canvas);const text=document.createElement('p');text.textContent=body+' / '+hair+' / '+top;text.style.cssText='font-size:12px;margin:4px 0';card.append(text);grid.append(card);}gallery.append(grid);document.body.append(gallery);})()`);
    await shot('14-customization-gallery.png');await a.evaluate('document.getElementById("avatar-gallery").remove()');
    const loadedAt=await a.evaluate('movementFixture.loadedAt');await a.send('Page.reload');await until(()=>a.evaluate(`window.movementFixture?.loadedAt!==${loadedAt}&&window.movementFixture?.ready&&window.movementFixture.network?.snapshot()?.players.has(window.movementFixture.network.sessionId())`),'new document reload and rejoin');
    await until(()=>a.evaluate(`movementFixture.network.snapshot().players.get(movementFixture.network.sessionId()).appearance===${JSON.stringify(synchronized)}`),'saved profile survives reload');
    console.info('Avatar performance',JSON.stringify(performanceResult));
    for(const t of tools)assert.deepEqual(t.errors,[]);
    console.info('Modular UI, save/reload, real two-client appearance sync, seated swaps, movement, ten-player rendering and mobile passed; synthetic identities only.');

  }catch(error){
    console.info('Avatar fixture failure',{saved:profiles.get(1),browserErrors:tools.flatMap(t=>t.errors)});
    for(const t of tools)try{console.info(await t.evaluate(`({notice:document.querySelector('.office-creator-notice')?.textContent,status:document.querySelector('[role="alert"]')?.textContent,players:window.movementFixture?.network?.snapshot()?.players.size,body:document.body.innerText.slice(-1000)})`));}catch{}
    throw error;
  }finally{
    for(const t of tools)try{await t.evaluate('movementFixture.extras?.forEach(n=>n.close());movementFixture.network?.close()')}catch{}
    if(tools[0])try{await tools[0].send('Browser.close')}catch{}
    for(const t of tools)t.close();
    if(chrome&&chrome.exitCode===null){await Promise.race([new Promise(ok=>chrome.once('exit',ok)),delay(1500)]);if(chrome.exitCode===null)chrome.kill();}
    await realtime.gracefullyShutdown(false);await new Promise(ok=>http.close(ok));
  }
});
