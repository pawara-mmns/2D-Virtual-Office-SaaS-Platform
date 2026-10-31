// Actual office composition, React and Phaser; synthetic identity/transport and
// profile/history actions. No app debug route, live account, microphone or DB.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root = resolve(import.meta.dirname, ".."), web = resolve(root, "apps/web");
const requireRealtime = createRequire(resolve(root, "apps/realtime/package.json"));
const { build } = createRequire(requireRealtime.resolve("tsx"))("esbuild");
const browser = process.env.OFFICE_TEST_BROWSER || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const nativeRendering=process.env.OFFICE_TEST_RENDERER==="native";
async function until(check) { for (let i=0;i<120;i++) { if (await check()) return; await delay(80); } throw new Error("Communication fixture timed out"); }
async function devtools(endpoint) {
  const socket = new WebSocket(endpoint); await new Promise(done => socket.addEventListener("open",done,{once:true}));
  let serial=0; const pending=new Map(), errors=[];
  socket.addEventListener("message",event=>{ const item=JSON.parse(String(event.data));
    if(item.method==="Runtime.exceptionThrown") errors.push(item.params.exceptionDetails.exception?.description || "Runtime exception");
    if(item.method==="Runtime.consoleAPICalled" && ["error","warning"].includes(item.params.type) && item.params.args.some(arg=>/Maximum update depth|Cannot update a component|unmounted component/.test(arg.value??""))) errors.push("React warning");
    const entry=pending.get(item.id);if(entry){pending.delete(item.id);clearTimeout(entry.timer);item.error?entry.reject(new Error(item.error.message)):entry.resolve(item.result);}
  });
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(new Error(`Browser timeout: ${method}`)),10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  return {command,errors,close:()=>socket.close(),async evaluate(expression){const result=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||"Evaluation failed");return result.result.value;}};
}
// Software rendering includes many viewport screenshots and needs more time
// on a busy development machine; individual state/command deadlines stay bounded.
test("office communication composition: responsive panels, focus, drafts, engine and voice ownership",{timeout:nativeRendering?90000:180000,skip:!browser},async()=>{
  const built=await build({bundle:true,write:false,platform:"browser",format:"esm",target:"es2022",jsx:"automatic",logLevel:"silent",tsconfig:resolve(web,"tsconfig.json"),define:{"process.env.NODE_ENV":'"development"',"process.env.NEXT_PUBLIC_REALTIME_URL":'"http://fixture.invalid"'},
    stdin:{resolveDir:web,loader:"tsx",contents:`
      import React,{useState,useEffect,Profiler,StrictMode}from'react';import{createRoot}from'react-dom/client';
      import OfficeCanvas from ${JSON.stringify(resolve(web,"src/features/office/components/office-canvas.tsx").replaceAll("\\","/"))};
      const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
      const f=window.communicationFixture={id,commits:0,mounts:0,closes:0,history:0,saves:0,changes:0,nonzeroInputs:0,navigationEvents:0,voiceConnects:0,voiceDisconnects:0,captures:0,authorizations:0,publications:0,tracks:[],profile:{avatarKey:'fern',displayName:'Taylor'},people:[{sessionId:'self',userId:id(1),displayName:'Taylor',avatarKey:'fern',connected:true,availability:'AVAILABLE',isSelf:true},{sessionId:'other',userId:id(2),displayName:'Morgan',avatarKey:'slate',connected:true,availability:'BUSY'}]};
      f.listeners=new Map();for(const method of ['addEventListener','removeEventListener']){const native=EventTarget.prototype[method];EventTarget.prototype[method]=function(type,listener,...rest){if(this instanceof HTMLElement&&this.matches('.office-stage,.office-hud')&&['wheel','pointermove','pointerout','pointercancel','scroll'].includes(type)){let events=f.listeners.get(this);if(!events)f.listeners.set(this,events=new Map());let callbacks=events.get(type);if(!callbacks)events.set(type,callbacks=new Set());method==='addEventListener'?callbacks.add(listener):callbacks.delete(listener);}return native.call(this,type,listener,...rest);};}f.listenerCount=type=>[...f.listeners.values()].reduce((total,events)=>total+(events.get(type)?.size||0),0);
      navigator.mediaDevices.getUserMedia=async()=>{f.captures++;f.audio??=new AudioContext();const stream=f.audio.createMediaStreamDestination().stream;f.tracks.push(...stream.getTracks());return stream;};
      const nativeFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{if(url!=='/api/v1/voice/token')return nativeFetch(url,options);f.authorizations++;f.voiceSignal=options.signal;return new Response(JSON.stringify({url:'wss://voice-fixture.livekit.cloud',token:'synthetic-no-network-proof'}),{headers:{'Content-Type':'application/json'}})};
      f.snapshot={officeId:id(3),mapVersion:'fixture',players:new Map(f.people.map((p,i)=>[p.sessionId,{...p,x:560+i*30,y:735,direction:'down',isMoving:false}]))};
      f.refresh=()=>{Object.assign(f.people[0],f.profile);Object.assign(f.snapshot.players.get('self'),f.profile);f.options.onParticipants(f.people.map(p=>({...p})));};
      function App(){const[version,setVersion]=useState(0),[office,setOffice]=useState(id(3));useEffect(()=>{f.remount=()=>setVersion(v=>v+1);f.switchOffice=()=>{f.snapshot={...f.snapshot,officeId:id(4),players:new Map([['self',f.snapshot.players.get('self')]])};f.people=[f.people[0]];setOffice(id(4));}},[]);return <main className="office-page"><Profiler id="office" onRender={()=>f.commits++}><OfficeCanvas key={office+'/'+version} appearance={f.profile} officeId={office} userId={id(1)} context={{workspaceName:'Synthetic workspace · isolated verification',officeName:'Oak & Fern Studio',workspaceHref:'#workspace'}}/></Profiler></main>}
      const mounted=createRoot(document.getElementById('root'));f.unmount=()=>mounted.unmount();mounted.render(<StrictMode><App/></StrictMode>);
    `},plugins:[{name:"isolated-office-boundaries",setup(plugin){
      plugin.onResolve({filter:/network\/connection$/},()=>({path:"network",namespace:"fixture"}));
      plugin.onResolve({filter:/engine\/create-game$/},()=>({path:"engine",namespace:"fixture"}));
      plugin.onResolve({filter:/lib\/supabase\/client$/},()=>({path:"auth",namespace:"fixture"}));
      // This standalone bundle has no Next router/runtime. Navigation itself is
      // covered by production-route checks; keep its semantic anchor here.
      plugin.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));
      plugin.onResolve({filter:/^livekit-client$/},args=>args.importer.replaceAll('\\','/').endsWith('/voice-session.tsx')?{path:'voice-sdk',namespace:'fixture'}:undefined);
      plugin.onResolve({filter:/^\.\/actions$/},args=>args.importer.endsWith("avatar-settings.tsx")?{path:"profile",namespace:"fixture"}:args.importer.endsWith("chat-panel.tsx")?{path:"history",namespace:"fixture"}:undefined);
      plugin.onLoad({filter:/.*/,namespace:"fixture"},args=>({resolveDir:web,loader:"js",contents:args.path==="engine"?`import{createOfficeGame as create}from'./src/features/office/engine/create-game.ts';export function createOfficeGame(...args){const f=window.communicationFixture,callbacks=args[1];args[1]={...callbacks,onReducedEffects(reduced){f.detectedReducedEffects=reduced;f.applyRendererPolicy=callbacks.onReducedEffects;/* Force enhancement only inside this synthetic visual/performance fixture. */callbacks.onReducedEffects?.(false)},onNavigation(state){f.navigation=state;f.navigationEvents++;callbacks.onNavigation?.(state)}};f.engine=create(...args);return f.engine;}`:args.path==="link"?`import React from'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children)}`:args.path==="voice-sdk"?`
        import{Room as NativeRoom,Track}from'livekit-client';export*from'livekit-client';
        export class Room extends NativeRoom{constructor(...args){super(...args);const f=window.communicationFixture;this.connect=async()=>{f.voiceConnects++;f.room=this;await this.simulateParticipants({publish:{audio:true,video:false,useRealTracks:false},participants:{count:2,video:false,audio:false}});this.localParticipant.name='Alex Lee';};this.localParticipant.publishTrack=async()=>{f.publications++;return this.localParticipant.getTrackPublication(Track.Source.Microphone)};const disconnect=this.disconnect.bind(this);this.disconnect=async(...args)=>{f.voiceDisconnects++;return disconnect(...args);};}}
      `:args.path==="auth"?`export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){window.communicationFixture.authUnsubscribed=true}}}})}});`:
        args.path==="profile"?`export async function saveAvatarAction(_,form){const f=window.communicationFixture;f.saves++;await new Promise(r=>setTimeout(r,10));f.profile={avatarKey:form.get('avatarKey'),displayName:form.get('displayName')};return{status:'success',message:'Appearance saved. Your office profile is updated.',...f.profile}}`:
        args.path==="history"?`export async function loadOfficeChat(){const f=window.communicationFixture;f.history++;return{ok:true,page:{olderCursor:null,messages:[1,2].map(n=>({id:String(n),channelId:f.id(3),senderId:f.id(n),senderName:'Member',body:n===1?'Own message':'Hello team',clientMessageId:f.id(n+10),createdAt:'2026-10-22T08:30:00Z'}))}}}`:
        `export const realtimeUrl=()=> 'http://fixture.invalid';export function connectOffice(options){const f=window.communicationFixture;f.mounts++;f.options=options;f.refresh();options.onPresence({status:'online',count:f.people.filter(p=>p.connected).length,notice:'Connected.'});options.onChat({type:'connection',online:true});let closed=false;return{snapshot:()=>f.snapshot,sessionId:()=> 'self',input(x,y){if(x||y)f.nonzeroInputs++},close(){if(!closed){closed=true;f.closes++;options.onChat({type:'connection',online:false});options.onVoice(null)}},appearanceChanged(){f.changes++;f.refresh()},sendChat(){return true},setAvailability(status){f.people[0].availability=status;f.refresh();return true},leaveVoice(){f.voiceLeaves=(f.voiceLeaves||0)+1}}}` }));
    }}]});
  const css=readdirSync(resolve(web,".next/static"),{recursive:true}).filter(name=>name.endsWith(".css")).map(name=>readFileSync(resolve(web,".next/static",name),"utf8")).join("\n");
  const fixtureHtml=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Office communication validation</title><style>${css}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>`;
  // Ignored, synthetic artifacts let a connected browser review exactly the
  // same components without an application debug route or signed-in account.
  if(process.env.OFFICE_TEST_EXPORT_PREVIEW==="1"){
    const preview=resolve(root,".cache/navigation-preview");mkdirSync(preview,{recursive:true});writeFileSync(resolve(preview,"index.html"),fixtureHtml);writeFileSync(resolve(preview,"fixture.js"),built.outputFiles[0].contents);
  }
  const server=createServer((req,res)=>{const path=new URL(req.url,"http://localhost").pathname;if(path==="/fixture.js"){res.setHeader("Content-Type","text/javascript");res.end(built.outputFiles[0].contents);}else if(path.startsWith("/office/")&&["studio.json","avatar.png","office-tiles.png"].includes(path.slice(8))){res.setHeader("Content-Type",path.endsWith("png")?"image/png":"application/json");res.end(readFileSync(resolve(web,"public",path.slice(1))));}else{res.setHeader("Content-Type","text/html");res.end(fixtureHtml);}});
  await new Promise(done=>server.listen(0,"127.0.0.1",done));const cache=resolve(root,".cache");mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,"communication-browser-"));
  const child=spawn(browser,["--headless=new","--remote-debugging-port=0",`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check",...(nativeRendering?[]:["--enable-unsafe-swiftshader","--use-angle=swiftshader"]),"--window-size=1440,900","about:blank"],{stdio:"ignore",windowsHide:true});let tools;
  try{
    let port;await until(()=>{try{port=readFileSync(resolve(profile,"DevToolsActivePort"),"utf8").split("\n")[0];return /^\d+$/.test(port)}catch{return false}});
    // Brave can expose its debugging port before the initial page exists.
    let page;await until(async()=>{const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();page=tabs.find(tab=>tab.type==="page"&&tab.webSocketDebuggerUrl);return !!page;});tools=await devtools(page.webSocketDebuggerUrl);
    const {command,evaluate}=tools;const media=(features=[])=>command("Emulation.setEmulatedMedia",{features:[...(features.some(f=>f.name==="prefers-color-scheme")?[]:[{name:"prefers-color-scheme",value:"light"}]),...features]});await command("Runtime.enable");await command("Page.enable");await command("Page.navigate",{url:`http://127.0.0.1:${server.address().port}`});await until(()=>evaluate("window.communicationFixture?.mounts===1 && !!document.querySelector('canvas')"));
    const revealProfileAction=async text=>{if(['Settings','Avatar settings'].includes(text)&&await evaluate("document.querySelector('.office-profile-menu').hidden")){await evaluate("document.querySelector('.office-profile-trigger').click()");}};
    const button=async text=>{await revealProfileAction(text);return evaluate(`(()=>{const node=[...document.querySelectorAll('button,summary')].find(n=>(n.textContent===${JSON.stringify(text)}||n.getAttribute('aria-label')===${JSON.stringify(text)})&&n.getClientRects().length&&!n.closest('[hidden],[inert]'));if(!node)throw new Error('Visible control missing');node.focus();node.click()})()`);};
    const layout=()=>evaluate("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,canvasHeight:document.querySelector('.office-stage').getBoundingClientRect().height,canvasWidth:document.querySelector('.office-stage').getBoundingClientRect().width})");
    const snapshot=async name=>{await until(()=>evaluate("[...document.querySelectorAll('.office-panel,.office-chat')].every(n=>n.hidden?getComputedStyle(n).visibility==='hidden':getComputedStyle(n).opacity==='1')"));writeFileSync(resolve(cache,nativeRendering?"native-"+name:name),Buffer.from((await command("Page.captureScreenshot",{format:"png"})).data,"base64"));};
    const clearContrast=dark=>evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.office-toolbar')),c=v=>v.match(/[\\d.]+/g).map(Number),mix=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1))),lum=a=>a.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),resolved=key=>{const n=document.createElement('span');n.style.color=s.getPropertyValue(key);n.hidden=true;document.querySelector('.office-toolbar').append(n);const value=c(getComputedStyle(n).color);n.remove();return value},ink=lum(c(s.color)),base=mix(c(s.backgroundColor),[${dark?255:0},${dark?255:0},${dark?255:0}]);return [base,mix(resolved('--glass-control-hover'),base),mix(resolved('--glass-control-pressed'),base)].map(bg=>{const l=lum(${dark} ? mix([255,255,255,.15],bg):bg);return(Math.max(ink,l)+.05)/(Math.min(ink,l)+.05)})})()`);
    await media();await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});await delay(120);
    assert.equal(await evaluate("document.querySelectorAll('.office-disclosure[data-open=true]').length"),0);
    const renderer=await evaluate(`(()=>{const r=communicationFixture.engine.game.renderer,gl=r.gl,e=gl?.getExtension('WEBGL_debug_renderer_info');return{requestedNative:${nativeRendering},type:r.type,description:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable',reducedEffects:communicationFixture.detectedReducedEffects}})()`);
    const desktop=await layout();assert.ok(desktop.canvasHeight>desktop.height*.65);assert.ok(desktop.scrollHeight<=desktop.height);assert.ok(desktop.scrollWidth<=desktop.width);await snapshot("communication-office-desktop.png");
    const compactHud=await evaluate("(()=>{const n=document.querySelector('.office-toolbar').getBoundingClientRect(),p=document.querySelector('.office-identity').getBoundingClientRect(),c=document.querySelector('.office-map-hud').getBoundingClientRect();return{dockWidth:n.width,dockHeight:n.height,profileWidth:p.width,profileHeight:p.height,cameraWidth:c.width,cameraLeft:c.left,permanentActions:[...document.querySelectorAll('.office-profile-actions button,.office-back')].filter(n=>!n.closest('[hidden],[inert]')).length}})()");
    assert.ok(compactHud.dockWidth<=106&&compactHud.dockHeight<=54&&compactHud.profileHeight<=54&&compactHud.cameraWidth<=190&&compactHud.cameraLeft>1000,'Compact docks leave the office dominant');assert.equal(compactHud.permanentActions,0);
    await button('Profile and workspace');await snapshot('immersive-profile-menu.png');await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});assert.equal(await evaluate("document.querySelector('.office-profile-menu').hidden&&document.activeElement.classList.contains('office-profile-trigger')"),true);
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown'});await until(()=>evaluate("document.activeElement.getAttribute('aria-label')==='Avatar settings'"));await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    await button('View office area');assert.equal(await evaluate("document.querySelector('.office-area-picker').open"),true);await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});assert.equal(await evaluate("document.querySelector('.office-area-picker').open"),false);
    await button('Office Chat');await button('Profile and workspace');assert.equal(await evaluate("document.getElementById('office-chat').hidden"),true,'Profile closes unrelated panels');await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    assert.equal(desktop.canvasHeight,900,"Renderer owns the full viewport height");
    assert.equal(await evaluate("document.querySelector('.office-work-area').contains(document.querySelector('.office-hud'))"),false,"HUD and renderer have independent DOM ownership");
    const scene="communicationFixture.engine.game.scene.getScene('Office')";
    const zoom=()=>evaluate(`${scene}.cameras.main.zoom`);
    const settled=()=>until(()=>evaluate(`${scene}.wheelZoomTarget===null`));
    const wheelAt=async(selector,deltaY,modifiers=0)=>{
      const point=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await command("Input.dispatchMouseEvent",{type:"mouseWheel",...point,deltaX:0,deltaY,modifiers});
    };
    console.info(JSON.stringify({scope:"initial browser media and resource hints",hints:await evaluate("({cores:navigator.hardwareConcurrency,memory:navigator.deviceMemory,forced:matchMedia('(forced-colors: active)').matches,transparency:matchMedia('(prefers-reduced-transparency: reduce)').matches,slow:matchMedia('(update: slow)').matches,glass:document.querySelector('.office-hud').dataset.glass})")}));
    // Optical checks exercise the explicit user preference. Auto may correctly
    // choose Solid on Brave's resource hints; do not spoof device capabilities.
    const selectMaterial=async(value,close='Office Chat')=>{await button('Settings');await evaluate(`(()=>{const s=document.getElementById('office-hud-material');s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await button(close);};
    await selectMaterial('glass','Close Settings');
    await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='enhanced'"));
    assert.equal(await evaluate("communicationFixture.listenerCount('wheel')"),1,"One native wheel owner after Strict Mode replay");
    assert.equal(await evaluate("communicationFixture.listenerCount('pointermove')"),1,"One delegated reflection owner");
    assert.equal(await evaluate("!!document.elementFromPoint(innerWidth/2,innerHeight/2).closest('.office-world')"),true,"Empty HUD space passes through to the map");
    const glass=await evaluate(`(()=>{
      const s=getComputedStyle(document.querySelector('.office-identity')),world=getComputedStyle(document.querySelector('canvas'));
      const rgb=value=>value.match(/[\\d.]+/g).map(Number),luminance=c=>c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),ratio=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
      const bg=rgb(s.backgroundColor),dark=bg.slice(0,3).map(n=>n*(bg[3]??1)),muted=rgb(getComputedStyle(document.querySelector('.office-context > p')).color),ink=rgb(s.color);
      return{backdrop:s.backdropFilter,alpha:bg[3]??1,minimumInkContrast:ratio(ink,dark),minimumMutedContrast:ratio(muted,dark),worldFilter:world.filter,pixelArt:world.imageRendering};
    })()`);
    assert.notEqual(glass.backdrop,"none");assert.ok(glass.alpha<1 && glass.minimumInkContrast>=4.5 && glass.minimumMutedContrast>=4.5);
    assert.equal(glass.worldFilter,"none");assert.equal(glass.pixelArt,"pixelated");
    assert.ok(Math.min(...await clearContrast(false))>=4.5,"Clear light dock remains readable in base, hover and selected states over black");
    const materials=await evaluate(`(()=>{const style=s=>getComputedStyle(document.querySelector(s)),alpha=s=>Number(style(s).backgroundColor.match(/[\\d.]+/g)[3]??1);return{clear:alpha('.office-toolbar'),regular:alpha('.office-identity'),elevated:alpha('.office-disclosure-panel[data-glass-variant="elevated"]'),dockSurfaces:document.querySelectorAll('.office-toolbar [data-glass-surface]').length,leafFilters:[...document.querySelectorAll('.office-toolbar button,.office-hud-actions .office-control')].map(n=>getComputedStyle(n).backdropFilter)}})()`);
    assert.ok(materials.clear<materials.regular && materials.regular<materials.elevated && materials.elevated<1,"Three distinct translucent material strengths");
    assert.equal(materials.dockSurfaces,0,"Navigation shares a single optical boundary");
    assert.ok(materials.leafFilters.every(value=>value==="none"),"Leaf controls never stack backdrop filters");
    await evaluate("(()=>{const p=document.getElementById('office-chat');communicationFixture.panelTransitions={entry:0,exit:0};p.addEventListener('transitionrun',e=>{if(e.target===p&&!e.pseudoElement&&e.propertyName==='opacity')communicationFixture.panelTransitions[p.hidden?'exit':'entry']++})})()");
    const pointerCommits=await evaluate("communicationFixture.commits");
    await evaluate("(()=>{const n=document.querySelector('.office-identity'),read=n.getBoundingClientRect.bind(n);communicationFixture.geometryReads=0;n.getBoundingClientRect=()=>{communicationFixture.geometryReads++;return read()};const r=read();for(let i=0;i<30;i++)n.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',clientX:r.left+r.width*.8,clientY:r.top+r.height*.7}))})()");
    await until(()=>evaluate("parseFloat(document.querySelector('.office-identity').style.getPropertyValue('--glass-x'))>70"));
    assert.equal(await evaluate("communicationFixture.commits"),pointerCommits,"Pointer reflections never publish React state");
    assert.ok(await evaluate("communicationFixture.geometryReads<=3"),"Pointer lighting does not read geometry for every move/frame");
    assert.ok(await evaluate("parseFloat(document.querySelector('.office-identity').style.getPropertyValue('--glass-x'))>70"));
    await snapshot("glass-pointer-desktop.png");
    await evaluate("document.querySelector('.office-identity').dispatchEvent(new PointerEvent('pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.querySelector('canvas')}))");
    assert.equal(await evaluate("document.querySelector('.office-identity').hasAttribute('data-glass-hover')"),false);
    const initialZoom=await zoom(), positions=await evaluate("JSON.stringify([...communicationFixture.snapshot.players].map(([id,p])=>[id,p.x,p.y]))");
    await wheelAt(".office-stage",-100);await settled();assert.ok(await zoom()>initialZoom,"Wheel up zooms in");
    const inZoom=await zoom();await wheelAt(".office-stage",100);await settled();assert.ok(await zoom()<inZoom,"Wheel down zooms out");
    const unmodified=await zoom();
    for(const modifiers of [2,4,1,8])await wheelAt(".office-stage",-100,modifiers);
    assert.equal(await zoom(),unmodified,"Ctrl/Cmd/Alt/Shift wheel passes through without camera zoom");
    await evaluate("(()=>{const h=document.querySelector('.office-stage');for(let i=0;i<50;i++)h.dispatchEvent(new WheelEvent('wheel',{deltaY:-10000,bubbles:true,cancelable:true}))})()");
    await settled();assert.equal(await zoom(),4);assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom in\"]').disabled"),true);
    await evaluate("(()=>{const h=document.querySelector('.office-stage');for(let i=0;i<50;i++)h.dispatchEvent(new WheelEvent('wheel',{deltaY:10000,bubbles:true,cancelable:true}))})()");
    await settled();assert.ok(await zoom()>0);assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true);
    await wheelAt(".office-stage",-60);await settled();await button("+");assert.equal(await zoom(),2,"Buttons select the next original level after fractional wheel zoom");
    await button("Fit Office");assert.equal(await evaluate("communicationFixture.navigation.fit"),true);await button("Return to my avatar");
    await evaluate("document.getElementById('office-area').value='LOUNGE';document.getElementById('office-area').dispatchEvent(new Event('change',{bubbles:true}))");
    await wheelAt(".office-stage",-80);await settled();assert.equal(await evaluate("communicationFixture.navigation.areaId"),"LOUNGE","Wheel retains area focus");
    await button("Return to my avatar");
    assert.equal(await evaluate("JSON.stringify([...communicationFixture.snapshot.players].map(([id,p])=>[id,p.x,p.y]))"),positions,"Wheel never moves avatars");
    for(const preference of ["prefers-reduced-motion","prefers-reduced-transparency"]){
      await media([{name:preference,value:"reduce"}]);
      await until(()=>evaluate("communicationFixture.listenerCount('pointermove')===0"));
      if(preference==="prefers-reduced-motion"){
        const reduced=await evaluate(`(()=>{const h=document.querySelector('.office-stage');h.dispatchEvent(new WheelEvent('wheel',{deltaY:20,bubbles:true,cancelable:true}));return{pending:${scene}.wheelZoomTarget,transition:getComputedStyle(document.querySelector('.office-control')).transitionDuration}})()`);
        assert.equal(reduced.pending,null);assert.equal(reduced.transition,"0s");
      }else assert.equal(await evaluate("getComputedStyle(document.querySelector('.office-identity')).backdropFilter"),"none");
    }
    await snapshot("glass-reduced-transparency.png");
    await media();
    await command("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});
    await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='enhanced' && communicationFixture.listenerCount('pointermove')===0"));
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.office-identity')).backdropFilter"),"none","Touch retains static glass without pointer tracking");
    await command("Emulation.setTouchEmulationEnabled",{enabled:false});
    await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='enhanced' && communicationFixture.listenerCount('pointermove')===1"));
    const tap=async text=>{
      if(["Settings","Avatar settings"].includes(text)&&await evaluate("document.querySelector('.office-profile-menu').hidden"))await tap("Profile and workspace");
      const point=await evaluate(`(()=>{const n=[...document.querySelectorAll('button')].find(n=>(n.textContent===${JSON.stringify(text)}||n.getAttribute('aria-label')===${JSON.stringify(text)})&&n.getClientRects().length&&!n.closest('[hidden],[inert]'));if(!n)throw new Error('HUD target missing');const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,hit:n.contains(document.elementFromPoint(x,y)),height:r.height}})()`);
      assert.ok(point.hit && point.height>=44,'HUD control has an unobscured 44px target: '+text);
      await command("Input.dispatchMouseEvent",{type:"mousePressed",x:point.x,y:point.y,button:"left",clickCount:1});
      await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:point.x,y:point.y,button:"left",clickCount:1});
    };
    await tap("Settings");await until(()=>evaluate("document.activeElement.getAttribute('aria-label')==='Close Settings'"));
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab"});
    assert.equal(await evaluate("document.activeElement.id"),"office-availability");
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),"Profile and workspace");
    await button("Avatar settings");await until(()=>evaluate("!!document.querySelector('.office-disclosure-panel:not([hidden]) input')"));assert.equal(await evaluate("document.querySelectorAll('input[name=avatarKey]').length"),6);
    const foundation=await evaluate(`(()=>{
      const control=document.querySelector('.office-control'),input=document.getElementById('office-display-name');
      const style=getComputedStyle(input),color=value=>value.match(/[\\d.]+/g).map(Number);
      const luminance=c=>c.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
      const blend=(a,b)=>a.slice(0,3).map((n,i)=>n*(a[3]??1)+b[i]*(1-(a[3]??1))),surface=color(getComputedStyle(input.closest('[data-glass-surface]')).backgroundColor);
      const border=luminance(color(style.borderTopColor)),ratios=[0,255].map(backdrop=>{const bg=luminance(blend(color(style.backgroundColor),blend(surface,[backdrop,backdrop,backdrop])));return(Math.max(border,bg)+.05)/(Math.min(border,bg)+.05)});
      return{controlHeight:control.getBoundingClientRect().height,inputHeight:input.getBoundingClientRect().height,inputFont:parseFloat(style.fontSize),borderContrast:Math.min(...ratios)};
    })()`);
    assert.ok(foundation.controlHeight>=44 && foundation.inputHeight>=48,"Controls meet the foundation touch-height budgets");
    assert.ok(foundation.borderContrast>=3,"Necessary input boundaries have at least 3:1 contrast");
    assert.ok(foundation.inputFont>=16,"Editable text avoids a small mobile input font");
    await evaluate("document.getElementById('office-display-name').focus();document.getElementById('office-display-name').select()");await command("Input.insertText",{text:"Alex Lee"});await evaluate("document.querySelector('input[value=plum]').click()");await button("Save appearance");await until(()=>evaluate("communicationFixture.saves===1 && communicationFixture.changes===1"));
    assert.equal(await evaluate("communicationFixture.mounts"),1,"Saving appearance must not reload the engine/transport");
    await evaluate("document.querySelector('[aria-label=\"Close Avatar settings\"]').click()");assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),"Profile and workspace");
    await until(()=>evaluate("communicationFixture.navigation?.findable.includes('other')"));
    const cameraPositions=await evaluate("JSON.stringify([...communicationFixture.snapshot.players].map(([id,p])=>[id,p.x,p.y]))");
    await button("Fit Office");await until(()=>evaluate("communicationFixture.navigation.fit"));
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true);
    await until(()=>evaluate("(()=>{const v=communicationFixture.engine.game.scene.getScene('Office').cameras.main.worldView;return v.left<=.1&&v.top<=.1&&v.right>=1151.9&&v.bottom>=831.9})()"));
    await snapshot("navigation-overview-1440.png");await button("Return to my avatar");
    for(let i=0;i<8&&!await evaluate("document.querySelector('[aria-label=\"Zoom in\"]').disabled");i++)await button("+");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom in\"]').disabled"),true);
    for(let i=0;i<8&&!await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled");i++)await button("−");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true);
    await button("Fit Office");await button("Return to my avatar");
    await button("Participants (2)");await button("Find");await until(()=>evaluate("communicationFixture.navigation.mode==='teammate' && document.activeElement.classList.contains('office-stage')"));
    assert.match(await evaluate("document.getElementById('office-camera-hint').textContent"),/Morgan.*Reception/);
    const navigationEvents=await evaluate("communicationFixture.navigationEvents");
    await evaluate("(async()=>{for(let i=0;i<10;i++){communicationFixture.snapshot.players.get('other').x++;await new Promise(requestAnimationFrame)}})()");
    assert.equal(await evaluate("communicationFixture.navigationEvents"),navigationEvents,"Movement within one marker area does not stream positions into React");
    await evaluate("communicationFixture.snapshot.players.get('other').x=590");
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});await until(()=>evaluate("communicationFixture.navigation.mode==='self'"));
    await evaluate("document.getElementById('office-area').value='MEETING ROOM';document.getElementById('office-area').dispatchEvent(new Event('change',{bubbles:true}))");
    await until(()=>evaluate("communicationFixture.navigation.areaId==='MEETING ROOM'"));
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Meeting room voice\"]')"),false,"Looking at Meeting Room never grants voice eligibility");
    await button("Return to my avatar");
    assert.equal(await evaluate("JSON.stringify([...communicationFixture.snapshot.players].map(([id,p])=>[id,p.x,p.y]))"),cameraPositions);
    assert.equal(await evaluate("communicationFixture.nonzeroInputs"),0,"Camera actions never produce movement input");
    await button("Participants (2)");await button("Find");
    await evaluate("communicationFixture.people[1].connected=false;communicationFixture.snapshot.players.get('other').connected=false;communicationFixture.refresh()");
    await until(()=>evaluate("communicationFixture.navigation.mode==='self' && !communicationFixture.navigation.findable.includes('other')"));
    await button("Participants (1)");assert.equal(await evaluate("document.querySelector('[aria-label=\"Find Morgan in the office\"]').disabled"),true);
    await evaluate("communicationFixture.people[1].connected=true;communicationFixture.snapshot.players.get('other').connected=true;communicationFixture.refresh()");await until(()=>evaluate("!document.querySelector('[aria-label=\"Find Morgan in the office\"]').disabled"));
    assert.equal(await evaluate("communicationFixture.navigation.mode"),"self");await button("Find");
    await evaluate("communicationFixture.snapshot.players.get('other').x=NaN");await until(()=>evaluate("communicationFixture.navigation.mode==='self' && !communicationFixture.navigation.findable.includes('other')"));
    await evaluate("communicationFixture.snapshot.players.get('other').x=590");await until(()=>evaluate("communicationFixture.navigation.findable.includes('other')"));
    await button("Office Chat");await until(()=>evaluate("document.querySelectorAll('#office-chat li').length===2"));assert.equal(await evaluate("document.querySelector('#office-chat .chat-own').textContent.includes('Alex Lee (you)')"),true);assert.equal(await evaluate("document.querySelector('#office-chat ol').textContent.includes('Morgan')"),true,"Roster profiles replace legacy generic snapshots without queries");
    await until(()=>evaluate("getComputedStyle(document.getElementById('office-chat')).opacity==='1'"));
    await evaluate("document.getElementById('office-chat-draft').focus()");await command("Input.insertText",{text:"Unsent draft"});const history=await evaluate("communicationFixture.history");await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});assert.equal(await evaluate("document.getElementById('office-chat').inert"),true,"Closing window becomes inert immediately");await until(()=>evaluate("getComputedStyle(document.getElementById('office-chat')).visibility==='hidden'"));await button("Office Chat");assert.equal(await evaluate("document.getElementById('office-chat-draft').value"),"Unsent draft");assert.equal(await evaluate("communicationFixture.history"),history,"Toggling must not reload history");
    await until(()=>evaluate("communicationFixture.panelTransitions.entry>0 && communicationFixture.panelTransitions.exit>0"));
    await snapshot("communication-chat-desktop.png");
    await until(()=>evaluate("(()=>{const a=document.querySelector('.office-dock-selection').getBoundingClientRect(),b=[...document.querySelectorAll('.office-panel-controls button')].find(n=>n.textContent==='Office Chat').getBoundingClientRect();return Math.abs(a.top-b.top)<1&&Math.abs(a.left-b.left)<1})()"));
    await media([{name:"prefers-color-scheme",value:"dark"}]);await delay(100);await snapshot("apple-chat-dark.png");
    const darkContrast=await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.office-identity')),c=v=>v.match(/[\\d.]+/g).map(Number),lum=a=>a.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0),bg=c(s.backgroundColor),back=bg.slice(0,3).map(v=>(v*bg[3]+255*(1-bg[3]))*.85+255*.15),ratio=a=>(Math.max(lum(a),lum(back))+.05)/(Math.min(lum(a),lum(back))+.05);return{ink:ratio(c(s.color)),muted:ratio(c(getComputedStyle(document.querySelector('.office-context > p')).color))}})()`);
    assert.ok(darkContrast.ink>=4.5 && darkContrast.muted>=4.5,"Dark material stays readable over a white backdrop plus a conservative reflection allowance");
    assert.ok(Math.min(...await clearContrast(true))>=4.5,"Clear dark dock remains readable in base, hover and selected states over white plus reflections");
    await button("Avatar settings");await until(()=>evaluate("getComputedStyle(document.querySelector('.office-disclosure-panel:not([hidden])')).opacity==='1'"));await snapshot("apple-avatar-dark.png");
    assert.ok(await evaluate("parseFloat(getComputedStyle(document.querySelector('label:has(input[name=avatarKey]:checked)')).backgroundColor.match(/[\\d.]+/g)[3]??1)<1"),"Dark avatar options use the material palette");
    await button("Office Chat");await media();await until(()=>evaluate("getComputedStyle(document.getElementById('office-chat')).opacity==='1'"));
    assert.equal(await evaluate("document.getElementById('office-chat-draft').value"),"Unsent draft","Theme and panel changes preserve the composer");
    assert.equal(await evaluate("document.querySelector('.office-stage').getBoundingClientRect().width"),1440,"HUD panels retain the full renderer width");
    await evaluate("(()=>{const f=communicationFixture;for(let n=3;n<45;n++)f.options.onChat({type:'message',message:{id:String(n),channelId:f.id(3),senderId:f.id(2),senderName:'Morgan',body:'Synthetic history row '+n+' — '+('context '.repeat(12)),clientMessageId:f.id(n+100),createdAt:'2026-10-22T08:30:00Z'}})})()");
    await until(()=>evaluate("document.querySelectorAll('#office-chat li').length===44"));
    await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop=120");await delay(80);
    const readingTop=await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop");
    const chatZoom=await zoom();await wheelAt('[aria-label="Chat messages"]',180);await delay(100);
    assert.equal(await zoom(),chatZoom,"Native chat scrolling never reaches the map wheel owner");
    await until(()=>evaluate(`document.querySelector('[aria-label="Chat messages"]').scrollTop>${readingTop}`));
    await wheelAt("#office-chat-draft",50);assert.equal(await zoom(),chatZoom,"Textarea wheel does not zoom");
    const menuWheel=await evaluate("(()=>{const e=new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true});document.getElementById('office-area').dispatchEvent(e);return e.defaultPrevented})()");
    assert.equal(menuWheel,false,"Select wheel retains native behavior");
    await evaluate(`document.querySelector('[aria-label="Chat messages"]').scrollTop=${readingTop}`);await delay(80);
    await button("Participants (2)");await until(()=>evaluate("document.querySelector('#office-chat').hidden"));
    assert.equal(await evaluate("document.querySelectorAll('.office-panel:not([hidden])').length"),1);
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),"Close Participants (2)");
    await button("Avatar settings");assert.equal(await evaluate("document.querySelectorAll('.office-panel:not([hidden])').length"),1);
    await button("Office Chat");await delay(80);
    assert.equal(await evaluate("document.getElementById('office-chat-draft').value"),"Unsent draft");
    assert.ok(Math.abs(await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop")-readingTop)<=1,"Switching panels preserves the reading position");
    assert.equal(await evaluate("communicationFixture.history"),history);
    assert.equal(await evaluate("communicationFixture.mounts"),1,"Panel changes retain the Phaser/transport owner");
    await evaluate("document.getElementById('office-display-name').focus()");assert.notEqual(await evaluate("document.activeElement.id"),"office-display-name","Closed editor controls cannot take keyboard focus");
    const before=await evaluate("communicationFixture.commits");await evaluate("(()=>{const f=communicationFixture;for(let i=0;i<1000;i++)f.options.onVoice({sessionId:'self',zone:null,configured:true,participants:0})})()");await delay(100);const voiceCommits=await evaluate("communicationFixture.commits")-before;assert.ok(voiceCommits<=2,"Equivalent voice snapshots must bail out");
    await command("Emulation.setDeviceMetricsOverride",{width:1024,height:900,deviceScaleFactor:1,mobile:false});await delay(120);const boundary=await layout();assert.equal(boundary.canvasWidth,1024,"1024 uses a drawer, not a compressed canvas");await snapshot("communication-boundary.png");
    await command("Emulation.setDeviceMetricsOverride",{width:820,height:1180,deviceScaleFactor:1,mobile:false});await delay(120);const tablet=await layout();assert.equal(tablet.canvasWidth,820,"Tablet keeps the full canvas behind a drawer");assert.equal(await evaluate("getComputedStyle(document.querySelector('#office-chat')).position"),"absolute");assert.ok(tablet.scrollWidth<=820);await snapshot("communication-tablet.png");
    await button("Participants (2)");await evaluate("document.querySelector('.office-stage').focus()");
    await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await until(()=>evaluate("document.activeElement.getAttribute('aria-label')==='Close Participants (2)'"));
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});assert.equal(await evaluate("document.activeElement.textContent"),"Participants (2)");await button("Office Chat");
    await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(120);const mobile=await layout();assert.ok(mobile.scrollWidth<=390);assert.ok(mobile.scrollHeight<=844);assert.equal(await evaluate("getComputedStyle(document.querySelector('.office-world')).visibility"),"visible");assert.equal(await evaluate("document.querySelector('.office-world').inert && document.querySelector('.office-camera-controls').hidden"),true);assert.ok(await evaluate("document.getElementById('office-chat-draft').getBoundingClientRect().bottom<=innerHeight"));await snapshot("communication-chat-mobile.png");
    await evaluate("document.querySelector('.office-stage').focus();document.querySelector('[aria-label=\"Zoom out\"]').focus()");assert.equal(await evaluate("document.activeElement.closest('.office-world,.office-zoom')!==null"),false,"Hidden map/zoom controls cannot take focus");
    await button("Close chat");assert.equal(await evaluate("document.activeElement.textContent"),"Office Chat");await button("Avatar settings");await snapshot("communication-settings-mobile.png");assert.ok(await evaluate("(()=>{const r=document.querySelector('.office-disclosure-panel:not([hidden])').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));const drawerZoom=await zoom();await command("Emulation.setDeviceMetricsOverride",{width:390,height:640,deviceScaleFactor:1,mobile:true});await delay(100);await wheelAt(".office-disclosure-panel:not([hidden]) .office-panel-body",180);await delay(80);
    assert.equal(await zoom(),drawerZoom,"Drawer scrolling does not zoom the hidden map");
    await until(()=>evaluate("document.querySelector('.office-disclosure-panel:not([hidden]) .office-panel-body').scrollTop>0"));
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});assert.equal(await evaluate("document.querySelectorAll('.office-disclosure[data-open=true]').length"),0);
    await command("Emulation.setDeviceMetricsOverride",{width:320,height:740,deviceScaleFactor:1,mobile:true});await delay(80);await button("Avatar settings");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=320 && document.querySelector('.office-panel:not([hidden])').scrollWidth<=document.querySelector('.office-panel:not([hidden])').clientWidth"),true,"Small mobile settings have no horizontal overflow");
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),"Close Avatar settings","Opening focuses the nonmodal panel's close control");
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Tab",code:"Tab"});assert.equal(await evaluate("document.activeElement.id"),"office-display-name");
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});
    await button("Office Chat");
    assert.ok(await evaluate("parseFloat(getComputedStyle(document.getElementById('office-chat-draft')).fontSize)>=16"));
    await evaluate("document.documentElement.style.fontSize='200%'");await delay(120);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth && document.getElementById('office-chat-draft').getBoundingClientRect().width<=innerWidth"),true,"Chat controls reflow at 320px with 200% root text size");
    await evaluate("document.documentElement.style.fontSize=''");await button("Close chat");
    assert.equal(await evaluate("communicationFixture.captures"),0,"Panel interaction never starts media capture");
    await evaluate("communicationFixture.options.onVoice({sessionId:'self',zone:'Meeting Room',configured:true,participants:2})");
    await until(()=>evaluate("!![...document.querySelectorAll('button')].find(b=>b.textContent==='Join Voice'&&!b.matches(':disabled'))"));
    await button("Join Voice");await until(()=>evaluate("document.body.textContent.includes('Voice connected')"));
    assert.equal(await evaluate("document.querySelector('.voice-context').textContent.includes('Voice connecting')"),false,"Connected HUD never retains the connecting label");
    assert.equal(await evaluate("communicationFixture.room.remoteParticipants.size"),1,"The SDK fixture contains a second voice participant, not a second local media session");
    await evaluate("communicationFixture.initialRoom=communicationFixture.room;undefined");
    await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});await delay(100);
    await button("Office Chat");
    const measure=label=>evaluate(`(async()=>{const g=communicationFixture.engine.game,times=[];let previous=performance.now();const count=()=>{const now=performance.now();times.push(now-previous);previous=now};g.events.on('poststep',count);const start=performance.now();await new Promise(r=>setTimeout(r,1200));g.events.off('poststep',count);const seconds=(performance.now()-start)/1000;return{label:${JSON.stringify(label)},frames:times.length,seconds,fps:Math.round(times.length/seconds*10)/10,p95FrameMs:times.toSorted((a,b)=>a-b)[Math.floor(times.length*.95)]}})()`);
    const glassPerformance=await measure(nativeRendering?"glass with browser-selected renderer + chat + simulated voice":"forced glass on SwiftShader + chat + simulated voice");assert.ok(glassPerformance.frames>0);
    await selectMaterial('solid');await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='solid'"));
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.office-chat')).backdropFilter"),"none");
    assert.equal(await evaluate("communicationFixture.listenerCount('pointermove')"),0);
    await snapshot("glass-solid-desktop.png");const solidPerformance=await measure("solid HUD + chat + simulated voice");
    await selectMaterial('glass');await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='enhanced'"));
    if(!nativeRendering)assert.equal(await evaluate("communicationFixture.detectedReducedEffects"),true,"Actual SwiftShader renderer requests reduced effects");
    await selectMaterial('auto');await evaluate(`communicationFixture.applyRendererPolicy(${nativeRendering?"true":"communicationFixture.detectedReducedEffects"})`);
    await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='solid' && communicationFixture.listenerCount('pointermove')===0"));
    await snapshot("glass-auto-software-desktop.png");
    const automaticFallbackPerformance=await measure(nativeRendering?"reduced-effects policy + chat + simulated voice":"automatic software-renderer fallback + chat + simulated voice");
    assert.equal(await evaluate("communicationFixture.mounts===1 && communicationFixture.room===communicationFixture.initialRoom && communicationFixture.voiceConnects===1 && communicationFixture.captures===1 && communicationFixture.publications===1"),true,"Renderer policy changes retain game, transport and active voice");
    await button("Settings");await evaluate("(()=>{const s=document.getElementById('office-hud-material');s.value='glass';s.dispatchEvent(new Event('change',{bubbles:true}))})()");
    await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='enhanced'"));await snapshot("apple-appearance-settings.png");
    await button("Office Chat");assert.equal(await evaluate("communicationFixture.room===communicationFixture.initialRoom && communicationFixture.mounts===1"),true,"Explicit Liquid Glass preference changes presentation only");
    await media([{name:"prefers-reduced-transparency",value:"reduce"}]);await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='solid'"));
    await media();await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='enhanced'"));
    await button("Settings");await evaluate("(()=>{const s=document.getElementById('office-hud-material');s.value='auto';s.dispatchEvent(new Event('change',{bubbles:true}))})()");await button("Office Chat");
    await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==='solid'"));
    const resourceLimited=await evaluate("(navigator.hardwareConcurrency>0&&navigator.hardwareConcurrency<=4)||(typeof navigator.deviceMemory==='number'&&navigator.deviceMemory<=4)");
    await evaluate("communicationFixture.applyRendererPolicy(false)");await until(()=>evaluate("document.querySelector('.office-hud').dataset.glass==="+JSON.stringify(resourceLimited?'solid':'enhanced')));
    await evaluate(`${scene}.navigate({type:'overview'});${scene}.zoomBy(1)`);await delay(80);
    const cameraSmoothness=await evaluate(`(async()=>{const s=${scene},g=communicationFixture.engine.game,samples=[],before={x:s.cameras.main.midPoint.x,y:s.cameras.main.midPoint.y};const sample=()=>samples.push(s.cameras.main.zoom);g.events.on('poststep',sample);const events=communicationFixture.navigationEvents;document.querySelector('.office-stage').dispatchEvent(new WheelEvent('wheel',{deltaY:-100,bubbles:true,cancelable:true}));const began=performance.now();for(let i=0;i<60&&s.wheelZoomTarget!==null;i++)await new Promise(r=>setTimeout(r,50));g.events.off('poststep',sample);return{samples,durationMs:performance.now()-began,before,after:{x:s.cameras.main.midPoint.x,y:s.cameras.main.midPoint.y},navigationEvents:communicationFixture.navigationEvents-events}})()`);
    assert.ok(new Set(cameraSmoothness.samples).size>3,"Normal wheel zoom interpolates over multiple frames");
    assert.ok(cameraSmoothness.samples.every((v,i,a)=>Number.isFinite(v)&&v>0&&(i===0||v>=a[i-1])),"Camera interpolation is finite and monotonic");
    assert.ok(cameraSmoothness.navigationEvents<=3,"Wheel interpolation never streams every zoom frame into React");
    assert.ok(Math.hypot(cameraSmoothness.after.x-cameraSmoothness.before.x,cameraSmoothness.after.y-cameraSmoothness.before.y)<3,"Centered zoom retains the follow target without a jump");
    await settled();await evaluate(`${scene}.navigate({type:'self'})`);await snapshot("glass-live-desktop.png");
    const voiceLayouts=[];
    for(const [width,height] of [[1440,900],[1024,900],[820,1180],[390,844],[320,740]]){
      await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<640});await delay(100);
      await command("Emulation.setTouchEmulationEnabled",{enabled:width<640,maxTouchPoints:1});
      if(width===1440||width===390){await button('Voice participants and audio devices');assert.equal(await evaluate("!!document.querySelector('.voice-details [role=dialog]')"),true);await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});assert.equal(await evaluate("!!document.querySelector('.voice-details [role=dialog]')"),false);}
      await tap("Settings");await until(()=>evaluate("document.activeElement.getAttribute('aria-label')==='Close Settings'"));
      await tap("Office Chat");await until(()=>evaluate("document.activeElement.id==='office-chat-draft'"));
      await tap("Participants (2)");if(width===320){await delay(80);await snapshot("communication-people-320.png");}await button("Avatar settings");await button("Office Chat");await delay(80);
      const observed=await evaluate("(()=>{const voice=document.querySelector('.office-voice').getBoundingClientRect(),composer=document.querySelector('#office-chat form').getBoundingClientRect(),chat=document.querySelector('#office-chat').getBoundingClientRect(),area=document.querySelector('.office-work-area').getBoundingClientRect(),list=document.querySelector('[aria-label=\"Chat messages\"]').getBoundingClientRect();return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,voiceBottom:voice.bottom,voiceTop:voice.top,composerBottom:composer.bottom,composerHeight:composer.height,chatBottom:chat.bottom,chatHeight:chat.height,areaHeight:area.height,listHeight:list.height,height:innerHeight}})()");
      assert.ok(observed.scrollWidth<=width,"Voice/panels have no horizontal overflow");
      assert.ok(observed.voiceBottom<=observed.chatBottom-observed.chatHeight+1,"Top voice group does not cover the active panel: "+JSON.stringify(observed));
      assert.ok(observed.voiceBottom<=height+1,"Voice controls remain in the viewport");
      assert.equal(await evaluate("communicationFixture.room===communicationFixture.initialRoom && communicationFixture.voiceConnects===1 && communicationFixture.captures===1 && communicationFixture.publications===1 && communicationFixture.authorizations===1"),true,"Panel and viewport changes retain the original media session");
      assert.equal(await evaluate("communicationFixture.mounts"),1);
      assert.equal(await evaluate("document.getElementById('office-chat-draft').value"),"Unsent draft");
      if(width===1440||width===390){
        await button("Close chat");await command("Input.dispatchMouseEvent",{type:"mouseMoved",x:width/2,y:height/2});await snapshot(`immersive-idle-${width}.png`);await button("Fit Office");await button("Return to my avatar");await button("Participants (2)");await button("Find");await button("Return to my avatar");await button("Office Chat");
        if(width===1440){await button("Close chat");await button("Participants (2)");await button("Find");await wheelAt(".office-stage",30);await settled();assert.equal(await evaluate("communicationFixture.navigation.mode"),"teammate","Wheel preserves Find focus");await button("Return to my avatar");await button("Office Chat");}
        assert.equal(await evaluate("communicationFixture.room===communicationFixture.initialRoom && communicationFixture.voiceConnects===1 && communicationFixture.authorizations===1 && communicationFixture.captures===1"),true,"Camera commands preserve an already active voice session");
        assert.equal(await evaluate("communicationFixture.nonzeroInputs"),0);
      }
      voiceLayouts.push(observed);await snapshot(`communication-voice-${width}.png`);
    }
    assert.equal(await evaluate("communicationFixture.room.listeners('disconnected').filter(fn=>fn.name==='onDisconnect').length"),1,"One application disconnect subscription survives HUD switching");
    await evaluate("communicationFixture.room.state='reconnecting';communicationFixture.room.emit('connectionStateChanged','reconnecting')");
    await until(()=>evaluate("document.body.textContent.includes('Voice reconnecting')"));
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Mute microphone').matches(':disabled')"),true);
    await button("Participants (2)");await button("Office Chat");assert.equal(await evaluate("communicationFixture.voiceConnects"),1);
    await evaluate("communicationFixture.room.state='connected';communicationFixture.room.emit('connectionStateChanged','connected')");
    await button("Leave Voice");await until(()=>evaluate("document.body.textContent.includes('Voice disconnected') && communicationFixture.tracks.every(track=>track.readyState==='ended')"));
    assert.equal(await evaluate("communicationFixture.captures"),1,"Leaving voice never automatically captures again");
    await snapshot("hud-voice-disconnected.png");
    await evaluate("window.fetch=async()=>new Response(JSON.stringify({error:'Denied'}),{status:403});communicationFixture.options.onVoice({sessionId:'self',zone:'Meeting Room',configured:false,participants:0})");
    await until(()=>evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Join Voice').disabled"));
    await evaluate("communicationFixture.options.onVoice({sessionId:'self',zone:'Meeting Room',configured:true,participants:0})");
    await button("Join Voice");await until(()=>evaluate("document.body.textContent.includes('Voice authorization denied')"));
    assert.equal(await evaluate("communicationFixture.captures"),1,"Rejected admission never captures media");
    await snapshot("hud-voice-denied.png");
    await evaluate("communicationFixture.options.onVoice(null)");
    await until(()=>evaluate("communicationFixture.room.state==='disconnected' && communicationFixture.tracks.every(track=>track.readyState==='ended')"));
    assert.equal(await evaluate("communicationFixture.room.listeners('disconnected').some(fn=>fn.name==='onDisconnect')"),false,"Zone exit removes the application's disconnect listener");
    await button("Close chat");
    await evaluate("communicationFixture.options.onPresence({status:'reconnecting',count:0,notice:'Connection lost. Reconnecting…'})");
    assert.equal(await evaluate("document.querySelector('.office-connection').textContent.includes('Reconnecting') && document.getElementById('office-availability').disabled"),true);
    assert.equal(await evaluate("document.getElementById('office-availability').value"),"AVAILABLE","Connection loss does not rewrite personal availability");
    await evaluate("communicationFixture.options.onPresence({status:'online',count:2,notice:'Connected.'})");
    const cameraLayouts=[];
    for(const [width,height] of [[1440,900],[1024,900],[820,1180],[390,844],[320,740]]){
      await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<640});await delay(100);
      await command("Emulation.setTouchEmulationEnabled",{enabled:width<640,maxTouchPoints:1});
      await button("Fit Office");await until(()=>evaluate("communicationFixture.navigation.fit"));
      await until(()=>evaluate("(()=>{const v=communicationFixture.engine.game.scene.getScene('Office').cameras.main.worldView;return v.left<=.1&&v.top<=.1&&v.right>=1151.9&&v.bottom>=831.9})()"));
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Zoom out\"]').disabled"),true);
      const observed=await evaluate("(()=>{const v=communicationFixture.engine.game.scene.getScene('Office').cameras.main.worldView;return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,zoom:communicationFixture.navigation.zoom,mapFits:v.left<=.1&&v.top<=.1&&v.right>=1151.9&&v.bottom>=831.9}})()");
      assert.ok(observed.mapFits && observed.scrollWidth<=width);cameraLayouts.push(observed);await snapshot(`navigation-overview-${width}.png`);
      await button("Return to my avatar");await button("Participants (2)");await button("Find");
      await until(()=>evaluate("document.activeElement.classList.contains('office-stage') && communicationFixture.navigation.mode==='teammate'"));
      assert.equal(await evaluate("document.querySelectorAll('.office-panel:not([hidden])').length"),0);
      assert.equal(await evaluate("document.querySelector('.office-camera-controls').hidden"),false);
      assert.match(await evaluate("document.getElementById('office-camera-hint').textContent"),/Morgan.*Reception/);
      await snapshot(`navigation-find-${width}.png`);await button("Return to my avatar");
      assert.equal(await evaluate("communicationFixture.mounts"),1);
    }
    await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});await command("Emulation.setTouchEmulationEnabled",{enabled:false});
    await evaluate("communicationFixture.nativeSupports=CSS.supports;CSS.supports=()=>false;communicationFixture.remount()");await until(()=>evaluate("communicationFixture.mounts===2"));
    assert.equal(await evaluate("document.querySelector('.office-hud').dataset.glass"),"solid","Unsupported backdrop uses opaque surfaces");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.office-identity')).backdropFilter"),"none");
    assert.equal(await evaluate("communicationFixture.listenerCount('wheel')"),1,"Remount removes the old wheel owner");
    await evaluate("CSS.supports=communicationFixture.nativeSupports");
    await button("Avatar settings");assert.equal(await evaluate("document.getElementById('office-display-name').value"),"Alex Lee");assert.equal(await evaluate("document.querySelector('input[name=avatarKey]:checked').value"),"plum","Saved preset persists when remounted from the profile");
    await button("Office Chat");await evaluate("document.getElementById('office-chat-draft').focus()");await command("Input.insertText",{text:"Old office draft"});await button("Participants (2)");await until(()=>evaluate("!document.querySelector('[aria-label=\"Find Morgan in the office\"]').disabled"));await button("Find");await until(()=>evaluate("communicationFixture.navigation.mode==='teammate'"));
    await evaluate("Object.defineProperty(navigator,'hardwareConcurrency',{value:2,configurable:true});communicationFixture.switchOffice()");await until(()=>evaluate("communicationFixture.mounts===3 && communicationFixture.navigation?.findable.length===0"));
    assert.equal(await evaluate("document.querySelector('.office-hud').dataset.glass"),"solid","Conservative low-resource hints choose the solid fallback");
    assert.equal(await evaluate("communicationFixture.navigation.mode"),"self","Workspace replacement clears a selected camera target");
    assert.equal(await evaluate("communicationFixture.engine.navigate({type:'teammate',sessionId:'other'})"),false);
    await button("Office Chat");assert.equal(await evaluate("document.getElementById('office-chat-draft').value"),"","Workspace replacement never carries another office's draft");
    await evaluate("communicationFixture.options.onPresence({status:'denied',count:0,notice:'Membership ended.'})");assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Retry connection')"),false);assert.equal(await evaluate("document.querySelector('.office-connection').textContent.includes('Access denied')"),true);
    assert.match(await evaluate("document.querySelector('[aria-label=\"Office voice\"]').textContent"),/Voice authorization ended/);
    await evaluate("communicationFixture.unmount()");await until(()=>evaluate("document.querySelectorAll('canvas').length===0 && communicationFixture.authUnsubscribed"));assert.equal(await evaluate("communicationFixture.closes"),3);assert.deepEqual(tools.errors,[]);
    assert.equal(await evaluate("['wheel','pointermove','pointerout','pointercancel','scroll'].every(type=>communicationFixture.listenerCount(type)===0)"),true,"HUD and wheel listeners all detach on exit");
    await evaluate("communicationFixture.audio?.close()");
    console.info(JSON.stringify({scope:"Actual office composition, actual reported renderer and SDK-simulated voice; synthetic transport/history/media, no hosted service or audio verification",renderer,desktop,boundary,tablet,mobile,foundation,glass,materials,darkContrast,glassPerformance,solidPerformance,automaticFallbackPerformance,softwareRendererDetected:renderer.reducedEffects,panelTransitions:true,cameraSmoothness:{durationMs:cameraSmoothness.durationMs,samples:cameraSmoothness.samples.length,distinctZooms:new Set(cameraSmoothness.samples).size,navigationEvents:cameraSmoothness.navigationEvents},wheelAndFallbackChecks:true,pointerReactCommits:0,textResize320:true,readingPositionPreserved:true,voiceLayouts,cameraLayouts,cameraOnlyMovement:true,workspaceReplacement:true,oneMediaSession:true,equivalentVoiceSnapshotCommits:voiceCommits,settingsPersistence:true,engineMounts:3,engineCloses:3,runtimeErrors:tools.errors.length}));
  }catch(error){
    if(tools)try{console.info(JSON.stringify({fixtureFailure:true,runtimeErrors:tools.errors,state:await tools.evaluate("({mounts:window.communicationFixture?.mounts,captures:window.communicationFixture?.captures,authorizations:window.communicationFixture?.authorizations,voiceConnects:window.communicationFixture?.voiceConnects,requestAborted:window.communicationFixture?.voiceSignal?.aborted,body:document.body.innerText.slice(0,2000)})")}));writeFileSync(resolve(cache,"communication-failure.png"),Buffer.from((await tools.command("Page.captureScreenshot",{format:"png"})).data,"base64"));}catch{}
    throw error;
  }finally{
    const exited=child.exitCode!==null?Promise.resolve():new Promise(done=>child.once("exit",done));if(tools)try{await Promise.race([tools.command("Browser.close"),delay(1500)]);}catch{}tools?.close();await Promise.race([exited,delay(5000)]);if(child.exitCode===null)child.kill();await Promise.race([exited,delay(2000)]);server.close();await delay(400);if(resolve(profile).startsWith(cache+sep+"communication-browser-"))try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{console.warn("Isolated browser profile retained in ignored .cache because Windows still holds a file lock.");}
  }
});
