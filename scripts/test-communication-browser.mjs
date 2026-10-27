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
test("office communication composition: responsive panels, focus, drafts, engine and voice ownership",{timeout:90000,skip:!browser},async()=>{
  const built=await build({bundle:true,write:false,platform:"browser",format:"esm",target:"es2022",jsx:"automatic",logLevel:"silent",tsconfig:resolve(web,"tsconfig.json"),define:{"process.env.NODE_ENV":'"development"',"process.env.NEXT_PUBLIC_REALTIME_URL":'"http://fixture.invalid"'},
    stdin:{resolveDir:web,loader:"tsx",contents:`
      import React,{useState,useEffect,Profiler,StrictMode}from'react';import{createRoot}from'react-dom/client';
      import OfficeCanvas from ${JSON.stringify(resolve(web,"src/features/office/components/office-canvas.tsx").replaceAll("\\","/"))};
      const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
      const f=window.communicationFixture={id,commits:0,mounts:0,closes:0,history:0,saves:0,changes:0,voiceConnects:0,voiceDisconnects:0,captures:0,authorizations:0,tracks:[],profile:{avatarKey:'fern',displayName:'Taylor'},people:[{sessionId:'self',userId:id(1),displayName:'Taylor',avatarKey:'fern',connected:true,availability:'AVAILABLE',isSelf:true},{sessionId:'other',userId:id(2),displayName:'Morgan',avatarKey:'slate',connected:true,availability:'BUSY'}]};
      navigator.mediaDevices.getUserMedia=async()=>{f.captures++;f.audio??=new AudioContext();const stream=f.audio.createMediaStreamDestination().stream;f.tracks.push(...stream.getTracks());return stream;};
      const nativeFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{if(url!=='/api/v1/voice/token')return nativeFetch(url,options);f.authorizations++;f.voiceSignal=options.signal;return new Response(JSON.stringify({url:'wss://voice-fixture.livekit.cloud',token:'synthetic-no-network-proof'}),{headers:{'Content-Type':'application/json'}})};
      f.snapshot={officeId:id(3),mapVersion:'fixture',players:new Map(f.people.map((p,i)=>[p.sessionId,{...p,x:560+i*30,y:735,direction:'down',isMoving:false}]))};
      f.refresh=()=>{Object.assign(f.people[0],f.profile);Object.assign(f.snapshot.players.get('self'),f.profile);f.options.onParticipants(f.people.map(p=>({...p})));};
      function App(){const[version,setVersion]=useState(0);useEffect(()=>{f.remount=()=>setVersion(v=>v+1)},[]);return <main className="office-page"><Profiler id="office" onRender={()=>f.commits++}><OfficeCanvas key={version} appearance={f.profile} officeId={id(3)} userId={id(1)} context={{workspaceName:'Synthetic workspace · isolated verification',officeName:'Oak & Fern Studio',workspaceHref:'#workspace'}}/></Profiler></main>}
      const mounted=createRoot(document.getElementById('root'));f.unmount=()=>mounted.unmount();mounted.render(<StrictMode><App/></StrictMode>);
    `},plugins:[{name:"isolated-office-boundaries",setup(plugin){
      plugin.onResolve({filter:/network\/connection$/},()=>({path:"network",namespace:"fixture"}));
      plugin.onResolve({filter:/lib\/supabase\/client$/},()=>({path:"auth",namespace:"fixture"}));
      // This standalone bundle has no Next router/runtime. Navigation itself is
      // covered by production-route checks; keep its semantic anchor here.
      plugin.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));
      plugin.onResolve({filter:/^livekit-client$/},args=>args.importer.replaceAll('\\','/').endsWith('/voice-session.tsx')?{path:'voice-sdk',namespace:'fixture'}:undefined);
      plugin.onResolve({filter:/^\.\/actions$/},args=>args.importer.endsWith("avatar-settings.tsx")?{path:"profile",namespace:"fixture"}:args.importer.endsWith("chat-panel.tsx")?{path:"history",namespace:"fixture"}:undefined);
      plugin.onLoad({filter:/.*/,namespace:"fixture"},args=>({resolveDir:web,loader:"js",contents:args.path==="link"?`import React from'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children)}`:args.path==="voice-sdk"?`
        import{Room as NativeRoom,Track}from'livekit-client';export*from'livekit-client';
        export class Room extends NativeRoom{constructor(...args){super(...args);const f=window.communicationFixture;this.connect=async()=>{f.voiceConnects++;f.room=this;await this.simulateParticipants({publish:{audio:true,video:false,useRealTracks:false},participants:{count:2,video:false,audio:false}});this.localParticipant.name='Alex Lee';};this.localParticipant.publishTrack=async()=>this.localParticipant.getTrackPublication(Track.Source.Microphone);const disconnect=this.disconnect.bind(this);this.disconnect=async(...args)=>{f.voiceDisconnects++;return disconnect(...args);};}}
      `:args.path==="auth"?`export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){window.communicationFixture.authUnsubscribed=true}}}})}});`:
        args.path==="profile"?`export async function saveAvatarAction(_,form){const f=window.communicationFixture;f.saves++;await new Promise(r=>setTimeout(r,10));f.profile={avatarKey:form.get('avatarKey'),displayName:form.get('displayName')};return{status:'success',message:'Appearance saved. Your office profile is updated.',...f.profile}}`:
        args.path==="history"?`export async function loadOfficeChat(){const f=window.communicationFixture;f.history++;return{ok:true,page:{olderCursor:null,messages:[1,2].map(n=>({id:String(n),channelId:f.id(3),senderId:f.id(n),senderName:'Member',body:n===1?'Own message':'Hello team',clientMessageId:f.id(n+10),createdAt:'2026-10-22T08:30:00Z'}))}}}`:
        `export const realtimeUrl=()=> 'http://fixture.invalid';export function connectOffice(options){const f=window.communicationFixture;f.mounts++;f.options=options;f.refresh();options.onPresence({status:'online',count:2,notice:'Connected.'});options.onChat({type:'connection',online:true});let closed=false;return{snapshot:()=>f.snapshot,sessionId:()=> 'self',input(){},close(){if(!closed){closed=true;f.closes++;options.onChat({type:'connection',online:false});options.onVoice(null)}},appearanceChanged(){f.changes++;f.refresh()},sendChat(){return true},setAvailability(status){f.people[0].availability=status;f.refresh();return true},leaveVoice(){f.voiceLeaves=(f.voiceLeaves||0)+1}}}` }));
    }}]});
  const css=readdirSync(resolve(web,".next/static"),{recursive:true}).filter(name=>name.endsWith(".css")).map(name=>readFileSync(resolve(web,".next/static",name),"utf8")).join("\n");
  const server=createServer((req,res)=>{const path=new URL(req.url,"http://localhost").pathname;if(path==="/fixture.js"){res.setHeader("Content-Type","text/javascript");res.end(built.outputFiles[0].contents);}else if(path.startsWith("/office/")&&["studio.json","avatar.png","office-tiles.png"].includes(path.slice(8))){res.setHeader("Content-Type",path.endsWith("png")?"image/png":"application/json");res.end(readFileSync(resolve(web,"public",path.slice(1))));}else{res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Office communication validation</title><style>${css}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>`);}});
  await new Promise(done=>server.listen(0,"127.0.0.1",done));const cache=resolve(root,".cache");mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,"communication-browser-"));
  const child=spawn(browser,["--headless=new","--remote-debugging-port=0",`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check","--enable-unsafe-swiftshader","--use-angle=swiftshader","--window-size=1440,900","about:blank"],{stdio:"ignore",windowsHide:true});let tools;
  try{
    await until(()=>existsSync(resolve(profile,"DevToolsActivePort")));const port=readFileSync(resolve(profile,"DevToolsActivePort"),"utf8").split("\n")[0];const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();tools=await devtools(tabs.find(t=>t.type==="page").webSocketDebuggerUrl);
    const {command,evaluate}=tools;await command("Runtime.enable");await command("Page.enable");await command("Page.navigate",{url:`http://127.0.0.1:${server.address().port}`});await until(()=>evaluate("window.communicationFixture?.mounts===1 && !!document.querySelector('canvas')"));
    const button=text=>evaluate(`(()=>{const node=[...document.querySelectorAll('button,summary')].find(n=>n.textContent===${JSON.stringify(text)}&&n.getClientRects().length&&!n.closest('[hidden],[inert]'));if(!node)throw new Error('Visible control missing');node.focus();node.click()})()`);
    const layout=()=>evaluate("({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,canvasHeight:document.querySelector('.office-stage').getBoundingClientRect().height,canvasWidth:document.querySelector('.office-stage').getBoundingClientRect().width})");
    const snapshot=async name=>writeFileSync(resolve(cache,name),Buffer.from((await command("Page.captureScreenshot",{format:"png"})).data,"base64"));
    await command("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});await delay(120);
    assert.equal(await evaluate("document.querySelectorAll('.office-disclosure[data-open=true]').length"),0);
    const desktop=await layout();assert.ok(desktop.canvasHeight>desktop.height*.65);assert.ok(desktop.scrollHeight<=desktop.height);assert.ok(desktop.scrollWidth<=desktop.width);await snapshot("communication-office-desktop.png");
    await button("Avatar settings");await until(()=>evaluate("!!document.querySelector('.office-disclosure-panel:not([hidden]) input')"));assert.equal(await evaluate("document.querySelectorAll('input[name=avatarKey]').length"),6);
    const foundation=await evaluate(`(()=>{
      const control=document.querySelector('.office-control'),input=document.getElementById('office-display-name');
      const style=getComputedStyle(input),color=value=>value.match(/[\\d.]+/g).slice(0,3).map(Number);
      const luminance=value=>color(value).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
      const a=luminance(style.borderTopColor),b=luminance(style.backgroundColor);
      return{controlHeight:control.getBoundingClientRect().height,inputHeight:input.getBoundingClientRect().height,inputFont:parseFloat(style.fontSize),borderContrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    })()`);
    assert.ok(foundation.controlHeight>=44 && foundation.inputHeight>=48,"Controls meet the foundation touch-height budgets");
    assert.ok(foundation.borderContrast>=3,"Necessary input boundaries have at least 3:1 contrast");
    assert.ok(foundation.inputFont>=16,"Editable text avoids a small mobile input font");
    await evaluate("document.getElementById('office-display-name').focus();document.getElementById('office-display-name').select()");await command("Input.insertText",{text:"Alex Lee"});await evaluate("document.querySelector('input[value=plum]').click()");await button("Save appearance");await until(()=>evaluate("communicationFixture.saves===1 && communicationFixture.changes===1"));
    assert.equal(await evaluate("communicationFixture.mounts"),1,"Saving appearance must not reload the engine/transport");
    await evaluate("document.querySelector('[aria-label=\"Close Avatar settings\"]').click()");assert.equal(await evaluate("document.activeElement.textContent"),"Avatar settings");
    await button("Office Chat");await until(()=>evaluate("document.querySelectorAll('#office-chat li').length===2"));assert.equal(await evaluate("document.querySelector('#office-chat .chat-own').textContent.includes('Alex Lee (you)')"),true);assert.equal(await evaluate("document.querySelector('#office-chat ol').textContent.includes('Morgan')"),true,"Roster profiles replace legacy generic snapshots without queries");
    await evaluate("document.getElementById('office-chat-draft').focus()");await command("Input.insertText",{text:"Unsent draft"});const history=await evaluate("communicationFixture.history");await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});await button("Office Chat");assert.equal(await evaluate("document.getElementById('office-chat-draft').value"),"Unsent draft");assert.equal(await evaluate("communicationFixture.history"),history,"Toggling must not reload history");
    await snapshot("communication-chat-desktop.png");
    assert.equal(await evaluate("document.querySelector('.office-stage').getBoundingClientRect().width"),1100,"Wide desktop leaves 1100px for the canvas beside 340px chat");
    await evaluate("(()=>{const f=communicationFixture;for(let n=3;n<45;n++)f.options.onChat({type:'message',message:{id:String(n),channelId:f.id(3),senderId:f.id(2),senderName:'Morgan',body:'Synthetic history row '+n+' — '+('context '.repeat(12)),clientMessageId:f.id(n+100),createdAt:'2026-10-22T08:30:00Z'}})})()");
    await until(()=>evaluate("document.querySelectorAll('#office-chat li').length===44"));
    await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop=120");await delay(80);
    const readingTop=await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop");
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
    await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(120);const mobile=await layout();assert.ok(mobile.scrollWidth<=390);assert.ok(mobile.scrollHeight<=844);assert.equal(await evaluate("getComputedStyle(document.querySelector('.office-world')).visibility"),"hidden");assert.equal(await evaluate("document.querySelector('.office-world').inert && document.querySelector('.office-zoom').hidden"),true);assert.ok(await evaluate("document.getElementById('office-chat-draft').getBoundingClientRect().bottom<=innerHeight"));await snapshot("communication-chat-mobile.png");
    await evaluate("document.querySelector('.office-stage').focus();document.querySelector('[aria-label=\"Zoom out\"]').focus()");assert.equal(await evaluate("document.activeElement.closest('.office-world,.office-zoom')!==null"),false,"Hidden map/zoom controls cannot take focus");
    await button("Close chat");assert.equal(await evaluate("document.activeElement.textContent"),"Office Chat");await button("Avatar settings");await snapshot("communication-settings-mobile.png");assert.ok(await evaluate("(()=>{const r=document.querySelector('.office-disclosure-panel:not([hidden])').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()"));await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});assert.equal(await evaluate("document.querySelectorAll('.office-disclosure[data-open=true]').length"),0);
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
    assert.equal(await evaluate("communicationFixture.room.remoteParticipants.size"),1,"The SDK fixture contains a second voice participant, not a second local media session");
    await evaluate("communicationFixture.initialRoom=communicationFixture.room;undefined");
    const voiceLayouts=[];
    for(const [width,height] of [[1440,900],[1024,900],[820,1180],[390,844],[320,740]]){
      await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<640});await delay(100);
      await button("Participants (2)");if(width===320){await delay(80);await snapshot("communication-people-320.png");}await button("Avatar settings");await button("Office Chat");await delay(80);
      const observed=await evaluate("(()=>{const voice=document.querySelector('.office-voice').getBoundingClientRect(),composer=document.querySelector('#office-chat form').getBoundingClientRect(),chat=document.querySelector('#office-chat').getBoundingClientRect(),area=document.querySelector('.office-work-area').getBoundingClientRect(),list=document.querySelector('[aria-label=\"Chat messages\"]').getBoundingClientRect();return{width:innerWidth,scrollWidth:document.documentElement.scrollWidth,voiceBottom:voice.bottom,voiceTop:voice.top,composerBottom:composer.bottom,composerHeight:composer.height,chatBottom:chat.bottom,chatHeight:chat.height,areaHeight:area.height,listHeight:list.height,height:innerHeight}})()");
      assert.ok(observed.scrollWidth<=width,"Voice/panels have no horizontal overflow");
      assert.ok(observed.composerBottom<=observed.voiceTop+1,"Voice does not cover the active composer: "+JSON.stringify(observed));
      assert.ok(observed.voiceBottom<=height+1,"Voice controls remain in the viewport");
      assert.equal(await evaluate("communicationFixture.room===communicationFixture.initialRoom && communicationFixture.voiceConnects===1 && communicationFixture.captures===1 && communicationFixture.authorizations===1"),true,"Panel and viewport changes retain the original media session");
      assert.equal(await evaluate("communicationFixture.mounts"),1);
      assert.equal(await evaluate("document.getElementById('office-chat-draft').value"),"Unsent draft");
      voiceLayouts.push(observed);await snapshot(`communication-voice-${width}.png`);
    }
    await evaluate("communicationFixture.room.state='reconnecting';communicationFixture.room.emit('connectionStateChanged','reconnecting')");
    await until(()=>evaluate("document.body.textContent.includes('Voice reconnecting')"));
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Mute microphone').matches(':disabled')"),true);
    await button("Participants (2)");await button("Office Chat");assert.equal(await evaluate("communicationFixture.voiceConnects"),1);
    await evaluate("communicationFixture.room.state='connected';communicationFixture.room.emit('connectionStateChanged','connected');communicationFixture.options.onVoice(null)");
    await until(()=>evaluate("communicationFixture.room.state==='disconnected' && communicationFixture.tracks.every(track=>track.readyState==='ended')"));
    assert.equal(await evaluate("communicationFixture.room.listeners('disconnected').some(fn=>fn.name==='onDisconnect')"),false,"Zone exit removes the application's disconnect listener");
    await button("Close chat");
    await evaluate("communicationFixture.options.onPresence({status:'reconnecting',count:0,notice:'Connection lost. Reconnecting…'})");
    assert.equal(await evaluate("document.querySelector('.office-connection').textContent.includes('Reconnecting') && document.getElementById('office-availability').disabled"),true);
    assert.equal(await evaluate("document.getElementById('office-availability').value"),"AVAILABLE","Connection loss does not rewrite personal availability");
    await evaluate("communicationFixture.options.onPresence({status:'online',count:2,notice:'Connected.'})");
    await evaluate("communicationFixture.remount()");await until(()=>evaluate("communicationFixture.mounts===2"));await button("Avatar settings");assert.equal(await evaluate("document.getElementById('office-display-name').value"),"Alex Lee");assert.equal(await evaluate("document.querySelector('input[name=avatarKey]:checked').value"),"plum","Saved preset persists when remounted from the profile");
    await evaluate("communicationFixture.options.onPresence({status:'denied',count:0,notice:'Membership ended.'})");assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Retry connection')"),false);assert.equal(await evaluate("document.querySelector('.office-connection').textContent.includes('Access denied')"),true);
    await evaluate("communicationFixture.unmount()");await until(()=>evaluate("document.querySelectorAll('canvas').length===0 && communicationFixture.authUnsubscribed"));assert.equal(await evaluate("communicationFixture.closes"),2);assert.deepEqual(tools.errors,[]);
    await evaluate("communicationFixture.audio?.close()");
    console.info(JSON.stringify({scope:"Actual office composition, Phaser and SDK-simulated voice; synthetic profile/history/network/media, no authenticated service or Cloud/audio verification",desktop,boundary,tablet,mobile,foundation,textResize320:true,readingPositionPreserved:true,voiceLayouts,oneMediaSession:true,equivalentVoiceSnapshotCommits:voiceCommits,settingsPersistence:true,engineMounts:2,engineCloses:2,runtimeErrors:tools.errors.length}));
  }catch(error){
    if(tools)try{console.info(JSON.stringify({fixtureFailure:true,runtimeErrors:tools.errors,state:await tools.evaluate("({mounts:window.communicationFixture?.mounts,captures:window.communicationFixture?.captures,authorizations:window.communicationFixture?.authorizations,voiceConnects:window.communicationFixture?.voiceConnects,requestAborted:window.communicationFixture?.voiceSignal?.aborted,body:document.body.innerText.slice(0,2000)})")}));writeFileSync(resolve(cache,"communication-failure.png"),Buffer.from((await tools.command("Page.captureScreenshot",{format:"png"})).data,"base64"));}catch{}
    throw error;
  }finally{
    const exited=child.exitCode!==null?Promise.resolve():new Promise(done=>child.once("exit",done));if(tools)try{await Promise.race([tools.command("Browser.close"),delay(1500)]);}catch{}tools?.close();await Promise.race([exited,delay(5000)]);if(child.exitCode===null)child.kill();await Promise.race([exited,delay(2000)]);server.close();await delay(400);if(resolve(profile).startsWith(cache+sep+"communication-browser-"))try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}catch{console.warn("Isolated browser profile retained in ignored .cache because Windows still holds a file lock.");}
  }
});
