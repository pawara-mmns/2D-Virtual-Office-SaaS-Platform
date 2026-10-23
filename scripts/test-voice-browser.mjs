// Actual React voice UI and LiveKit microphone-denial path, isolated HTTP/media
// fixtures only. Never signs in, opens a real microphone or contacts LiveKit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve,sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root=resolve(import.meta.dirname,".."),web=resolve(root,"apps/web");
const requireRealtime=createRequire(resolve(root,"apps/realtime/package.json"));
const requireTSX=createRequire(requireRealtime.resolve("tsx"));
const {build}=requireTSX("esbuild");
const browser=process.env.OFFICE_TEST_BROWSER || ["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
async function until(check) {for(let n=0;n<120;n++){if(await check())return;await delay(70);}throw new Error("Voice fixture state timed out");}
async function devtools(endpoint) {
  const socket=new WebSocket(endpoint);await new Promise((done)=>socket.addEventListener("open",done,{once:true}));
  let serial=0;const pending=new Map(),errors=[];
  socket.addEventListener("message",(event)=>{const item=JSON.parse(String(event.data));if(item.method==="Runtime.exceptionThrown")errors.push("Browser exception");if(item.method==="Runtime.consoleAPICalled"&&["error","warning"].includes(item.params.type)&&item.params.args.some(arg=>/Maximum update depth|Cannot update a component|unmounted component/.test(arg.value??"")))errors.push("React runtime warning");const entry=pending.get(item.id);if(entry){pending.delete(item.id);clearTimeout(entry.timer);item.error?entry.reject(new Error("Browser command failed")):entry.resolve(item.result);}});
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(new Error("Browser command timeout")),10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  return {command,errors,close:()=>socket.close(),async evaluate(expression){const result=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error("Voice browser assertion evaluation failed");return result.result.value;}};
}
test("actual voice UI: no auto capture, explicit join, cancellation, real SDK denial feedback, responsive layout and zone cleanup",{timeout:60000,skip:!browser},async()=>{
  const bundle=await build({bundle:true,write:false,platform:"browser",format:"esm",target:"es2022",jsx:"automatic",logLevel:"silent",define:{"process.env.NODE_ENV":'"development"'},plugins:[{name:"isolated-sdk-room",setup(plugin){
    plugin.onResolve({filter:/^livekit-client$/},args=>args.importer.replaceAll('\\','/').endsWith('/voice-session.tsx')?{path:'sdk-room-fixture',namespace:'fixture'}:undefined);
    plugin.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:web,loader:'js',contents:`
      import{Room as NativeRoom,ConnectionError,Track}from'livekit-client';export*from'livekit-client';
      export class Room extends NativeRoom{constructor(...args){super(...args);const connect=this.connect;this.connect=async(...params)=>{const f=window.voiceFixture;f.connects++;f.activeRoom=this;if(f.mode==='connected'){await this.simulateParticipants({publish:{audio:true,video:false,useRealTracks:false},participants:{count:2,video:false,audio:false}});this.localParticipant.name='Taylor';let index=0;for(const person of this.remoteParticipants.values())person.name=++index===1?'Morgan':'private@example.invalid';return;}if(f.mode==='invalid-token')throw ConnectionError.notAllowed('Synthetic rejected token',401);return connect(...params)};const publish=this.localParticipant.publishTrack.bind(this.localParticipant);this.localParticipant.publishTrack=async(...params)=>window.voiceFixture.mode==='connected'?this.localParticipant.getTrackPublication(Track.Source.Microphone):publish(...params)}}
    `}));
  }}],stdin:{resolveDir:web,loader:"tsx",contents:`
    import React,{useState,useEffect,useCallback,StrictMode}from'react';import{createRoot}from'react-dom/client';
    import{VoiceBar}from${JSON.stringify(resolve(web,"src/features/voice/voice-bar.tsx").replaceAll("\\","/"))};
    import{Controls}from${JSON.stringify(resolve(web,"src/features/voice/voice-session.tsx").replaceAll("\\","/"))};
    import{Room,RoomEvent}from'livekit-client';import{RoomContext}from'@livekit/components-react';
    const f=window.voiceFixture={requests:0,captures:0,sockets:0,leaves:0,connects:0,enumerations:0,deviceLookups:0,tracks:[],mode:'pending'};
    navigator.mediaDevices.enumerateDevices=async()=>{f.enumerations++;return[{kind:'audioinput',deviceId:'default',groupId:'fixture',label:'Fixture microphone'},{kind:'audiooutput',deviceId:'default',groupId:'fixture',label:'Fixture speaker'}]};
    // Target the hook's public device API. Global navigator failure also affects
    // SDK simulation's unrelated automatic device-switch listeners.
    const getLocalDevices=Room.getLocalDevices;Room.getLocalDevices=async(kind,permissions)=>{if(kind){f.deviceLookups++;if(f.failEnumeration)throw new Error('Synthetic device lookup failure');}return getLocalDevices(kind,permissions)};
    const nativeFetch=window.fetch.bind(window);window.fetch=async(url,options)=>{if(url!=='/api/v1/voice/token')return nativeFetch(url,options);f.requests++;f.body=JSON.parse(options.body);if(f.mode==='pending')return new Promise((resolve,reject)=>{f.finish=resolve;options.signal.addEventListener('abort',()=>reject(new DOMException('Fixture cancellation','AbortError')),{once:true})});const authorized=['denial','connected','invalid-token'].includes(f.mode);return new Response(JSON.stringify(authorized?{url:'wss://voice-fixture.livekit.cloud',token:'synthetic-no-network-proof'}:{error:'Voice is unavailable. Check configuration and retry.'}),{status:authorized?200:503,headers:{'Content-Type':'application/json'}})};
    navigator.mediaDevices.getUserMedia=async()=>{f.captures++;if(['connected','invalid-token'].includes(f.mode)){f.context??=new AudioContext();const stream=f.context.createMediaStreamDestination().stream;f.tracks.push(...stream.getTracks());return stream;}throw new DOMException('Synthetic permission denial','NotAllowedError')};
    const NativeSocket=window.WebSocket;window.WebSocket=class extends NativeSocket{constructor(...args){f.sockets++;super(...args)}};
    function App(){const[state,setState]=useState({sessionId:'session_fixture',zone:'Meeting Room',configured:false,participants:null}),[room,setRoom]=useState(null),[notice,setNotice]=useState(''),[render,setRender]=useState(0);useEffect(()=>{f.setState=setState;f.rerender=()=>setRender(v=>v+1);f.controls=async()=>{f.room=new Room();await f.room.simulateParticipants({publish:{audio:true,video:false,useRealTracks:false},participants:{count:2,video:false,audio:false}});f.baseDeviceListeners=f.room.listenerCount(RoomEvent.ActiveDeviceChanged);setRoom(f.room)}},[]);const leave=useCallback(()=>{f.leaves++},[]);return <main style={{maxWidth:960,margin:'48px auto',padding:16}}><p style={{marginBottom:16}}>Isolated voice component validation · synthetic authorization/media denial</p>{room?<RoomContext.Provider value={room}><Controls leave={leave} error={setNotice}/><p id="device-notice">{notice}</p></RoomContext.Provider>:state.zone&&<VoiceBar key={state.sessionId} officeId="00000000-0000-4000-8000-000000000001" state={state} leave={leave}/>}</main>}
    const mounted=createRoot(document.getElementById('root'));f.unmount=()=>mounted.unmount();mounted.render(<StrictMode><App/></StrictMode>);
  `}});
  const css=readdirSync(resolve(web,".next/static"),{recursive:true}).filter((name)=>name.endsWith(".css")).map((name)=>readFileSync(resolve(web,".next/static",name),"utf8")).join("\n");
  const server=createServer((req,res)=>{if(req.url==="/fixture.js"){res.setHeader("Content-Type","text/javascript");res.end(bundle.outputFiles[0].contents);}else{res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated voice verification</title><style>${css}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>`);}});
  await new Promise((done)=>server.listen(0,"127.0.0.1",done));
  const cache=resolve(root,".cache");mkdirSync(cache,{recursive:true});const profile=mkdtempSync(resolve(cache,"voice-browser-"));
  const child=spawn(browser,["--headless=new","--remote-debugging-port=0",`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check","--window-size=1280,900","about:blank"],{stdio:"ignore",windowsHide:true});
  let tools;
  try{
    await until(()=>existsSync(resolve(profile,"DevToolsActivePort")));const port=readFileSync(resolve(profile,"DevToolsActivePort"),"utf8").split("\n")[0];
    const tabs=await(await fetch(`http://127.0.0.1:${port}/json`)).json();tools=await devtools(tabs.find((tab)=>tab.type==="page").webSocketDebuggerUrl);
    await tools.command("Runtime.enable");await tools.command("Page.enable");await tools.command("Page.navigate",{url:`http://127.0.0.1:${server.address().port}`});
    const evaluate=tools.evaluate;await until(()=>evaluate("!!window.voiceFixture?.setState && !!document.querySelector('button')"));
    assert.equal(await evaluate("document.querySelector('button').disabled"),true);assert.equal(await evaluate("voiceFixture.requests+voiceFixture.captures+voiceFixture.sockets"),0);
    await evaluate("voiceFixture.setState(s=>({...s,configured:true,participants:2}))");await until(()=>evaluate("!document.querySelector('button').disabled"));
    assert.equal(await evaluate("document.body.textContent.includes('2 voice participants')"),true);
    await evaluate("document.querySelector('button').click();document.querySelector('button').click()");await until(()=>evaluate("document.body.textContent.includes('Authorizing voice')"));assert.equal(await evaluate("voiceFixture.requests"),1);assert.equal(await evaluate("voiceFixture.captures"),0);
    assert.deepEqual(await evaluate("Object.keys(voiceFixture.body).sort()"),["officeId","sessionId"]);
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Cancel').click()");await until(()=>evaluate("document.querySelector('button').textContent==='Join Voice'"));
    await evaluate("voiceFixture.mode='unavailable';document.querySelector('button').click()");await until(()=>evaluate("document.querySelector('[role=alert]')?.textContent.includes('unavailable')"));assert.equal(await evaluate("voiceFixture.captures"),0);
    await evaluate("voiceFixture.mode='denial';document.querySelector('button').click()");await until(()=>evaluate("document.querySelector('[role=alert]')?.textContent.includes('permission was denied')"));
    assert.ok(await evaluate("voiceFixture.captures")>=1);assert.equal(await evaluate("voiceFixture.sockets"),0,"Permission denial must happen before media signaling");
    await tools.command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate("document.documentElement.scrollWidth<=390"),true);
    writeFileSync(resolve(cache,"voice-preview-mobile.png"),Buffer.from((await tools.command("Page.captureScreenshot",{format:"png"})).data,"base64"));
    await evaluate("voiceFixture.mode='pending';document.querySelector('button').click()");await until(()=>evaluate("document.body.textContent.includes('Authorizing voice')"));
    const captures=await evaluate("voiceFixture.captures");await evaluate("voiceFixture.setState(s=>({...s,zone:null}))");await until(()=>evaluate("!document.querySelector('[aria-label=\"Meeting room voice\"]')"));assert.equal(await evaluate("voiceFixture.captures"),captures);
    await evaluate("voiceFixture.mode='connected';voiceFixture.setState(s=>({...s,zone:'Meeting Room'}))");await until(()=>evaluate("!!document.querySelector('button')"));
    const capturesBefore=await evaluate("voiceFixture.captures"),connectsBefore=await evaluate("voiceFixture.connects");
    await evaluate("document.querySelector('button').click()");await until(()=>evaluate("document.body.textContent.includes('Voice connected')"));
    assert.equal(await evaluate("voiceFixture.captures"),capturesBefore+1,"Strict Mode replay must not request capture twice");assert.equal(await evaluate("voiceFixture.connects"),connectsBefore+1);
    for(let n=0;n<20;n++)await evaluate("voiceFixture.setState(s=>({...s}));voiceFixture.rerender()");
    assert.equal(await evaluate("voiceFixture.connects"),connectsBefore+1,"Equivalent parent props must not reconnect the Room");
    await evaluate("document.querySelector('.voice-details').open=true");
    assert.equal(await evaluate("document.querySelector('.voice-details ul').textContent.includes('Taylor (you)') && document.querySelector('.voice-details ul').textContent.includes('Morgan')"),true,"Voice uses the authorized participant profile names");
    assert.equal(await evaluate("document.querySelector('.voice-details ul').textContent.includes('@')"),false,"Email-like participant names use a private fallback");
    await evaluate("voiceFixture.activeRoom.state='reconnecting';voiceFixture.activeRoom.emit('connectionStateChanged','reconnecting')");
    await until(()=>evaluate("document.body.textContent.includes('Voice reconnecting')"));
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Mute microphone').matches(':disabled')"),true);
    await evaluate("voiceFixture.activeRoom.state='connected';voiceFixture.activeRoom.emit('connectionStateChanged','connected')");
    await until(()=>evaluate("document.body.textContent.includes('Voice connected')"));
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Mute microphone').click()");await until(()=>evaluate("!![...document.querySelectorAll('button')].find(b=>b.textContent==='Unmute microphone')"));
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Unmute microphone').click()");await until(()=>evaluate("!![...document.querySelectorAll('button')].find(b=>b.textContent==='Mute microphone')"));
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Leave Voice').click()");await until(()=>evaluate("voiceFixture.activeRoom.state==='disconnected' && voiceFixture.tracks.every(track=>track.readyState==='ended')"));
    await evaluate("voiceFixture.mode='invalid-token';document.querySelector('button').click()");await until(()=>evaluate("document.querySelector('[role=alert]')?.textContent.includes('rejected voice authorization')"));
    await evaluate("voiceFixture.controls()");await until(()=>evaluate("!!document.querySelector('select[aria-label=\"Microphone input device\"]')"));
    const enumerations=await evaluate("voiceFixture.enumerations");
    for(let n=0;n<20;n++)await evaluate("voiceFixture.rerender()");
    assert.ok(await evaluate("voiceFixture.enumerations")<=enumerations+2,"Rerenders must not recreate device observers");
    const capturesWithoutSelection=await evaluate("voiceFixture.captures");
    await evaluate("navigator.mediaDevices.dispatchEvent(new Event('devicechange'))");await until(()=>evaluate("voiceFixture.enumerations>"+enumerations));
    assert.equal(await evaluate("voiceFixture.captures"),capturesWithoutSelection,"Device enumeration does not prompt for microphone access");
    await evaluate("document.querySelector('select[aria-label=\"Microphone input device\"]').dispatchEvent(new Event('change',{bubbles:true}))");
    assert.equal(await evaluate("!!document.querySelector('select[aria-label=\"Audio output device\"]') || document.body.textContent.includes('Output device selection is managed')"),true);
    await evaluate("voiceFixture.failEnumeration=true;navigator.mediaDevices.dispatchEvent(new Event('devicechange'))");await until(()=>evaluate("document.getElementById('device-notice').textContent.includes('Device selection failed')"));
    const failedEnumerations=await evaluate("voiceFixture.deviceLookups");
    for(let n=0;n<20;n++)await evaluate("voiceFixture.rerender()");
    assert.ok(await evaluate("voiceFixture.deviceLookups")<=failedEnumerations+2,"Enumeration error callbacks must not resubscribe or loop");
    assert.deepEqual(tools.errors,[]);
    await evaluate("voiceFixture.unmount()");await until(()=>evaluate("voiceFixture.room.listenerCount('activeDeviceChanged')===voiceFixture.baseDeviceListeners"));
    await evaluate("voiceFixture.room.disconnect(true);voiceFixture.context?.close()");
    console.info(JSON.stringify({scope:"Actual React/LiveKit UI with SDK-simulated participants/connection and synthetic microphone tracks; no LiveKit service/Auth/real audio",noAutomaticCapture:true,oneAuthorizationPerClick:true,cancellationAndZoneCleanup:true,microphoneDenial:true,invalidTokenFeedback:true,strictMode:true,oneActiveConnection:true,muteUnmute:true,deviceObserverStability:true,subscriptionCleanup:true,mobileWidth:390}));
  }finally{
    const exited=child.exitCode!==null?Promise.resolve():new Promise((done)=>child.once("exit",done));
    if(tools)try{await Promise.race([tools.command("Browser.close"),delay(1500)]);}catch{/* Own isolated browser may already be closed. */}
    tools?.close();if(child.exitCode===null)child.kill();await Promise.race([exited,delay(2000)]);server.close();await delay(400);
    if(resolve(profile).startsWith(cache+sep+"voice-browser-"))rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
