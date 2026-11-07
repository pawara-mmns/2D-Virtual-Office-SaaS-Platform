// Real Phaser + two Colyseus clients through an ordered, delayed WebSocket proxy.
// Synthetic identities/local map only. Never contacts Supabase or LiveKit.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {composeEnvironment} from '../packages/shared/src/environment/compose.ts';
import {defaultEnvironment} from '../packages/shared/src/environment/catalog.ts';
import {mapVersion} from '../packages/shared/src/protocol.ts';
import {canStand} from '../packages/shared/src/movement.ts';
const root=resolve(import.meta.dirname,'..'),web=resolve(root,'apps/web'),require=createRequire(resolve(root,'apps/realtime/package.json'));
const {build}=createRequire(require.resolve('tsx'))('esbuild'),{WebSocket:Socket,WebSocketServer}=createRequire(require.resolve('@colyseus/sdk'))('ws');
const {createRealtimeServer}=await import('../apps/realtime/src/server.ts'),{matchMaker}=await import('file:///'+require.resolve('colyseus').replaceAll('\\','/'));
const browser=process.env.OFFICE_TEST_BROWSER||'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',cache=resolve(root,'.cache'),phase=process.env.MOVEMENT_MEASURE_PHASE||'after';mkdirSync(cache,{recursive:true});
async function until(fn,label){for(let i=0;i<220;i++){if(await fn())return;await delay(40);}throw Error('Latency fixture timed out: '+label);}
async function cdp(url){const socket=new WebSocket(url);await new Promise(r=>socket.addEventListener('open',r,{once:true}));let n=0;const pending=new Map(),errors=[];socket.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??'Runtime error');const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++n,timer=setTimeout(()=>reject(Error('CDP timeout '+method)),12000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});return{send,errors,close:()=>socket.close(),async evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??'Evaluation failed');return r.result.value;}};}
const map=composeEnvironment(defaultEnvironment),office='00000000-0000-4000-8000-000000000901';let bundle,backend,rt,latency=0,jitter=0,seed=41,pauseDownstreamUntil=0;
const sockets=new Set(),timers=new Set();
const http=createServer(async(req,res)=>{const path=new URL(req.url,'http://fixture').pathname;
 if(path==='/office/join'){const chunks=[];for await(const c of req)chunks.push(c);const r=await fetch(backend+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Authorization:req.headers.authorization??''},body:Buffer.concat(chunks)});res.writeHead(r.status,{'Content-Type':'application/json'});res.end(await r.text());}
 else if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);}
 else if(path==='/office/avatar.png'||path==='/office/environments/warm-wood.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync(resolve(web,'public',path.slice(1))));}
 else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><meta charset="utf-8"><style>body{margin:0;background:#1b3036}#world{width:1100px;height:740px}canvas{image-rendering:pixelated}#note{font:13px Arial;color:#e5e7d8;padding:8px}</style><div id="world" tabindex="0"></div><div id="note">Local latency simulation · synthetic identity · actual Phaser / Colyseus</div><script type="module" src="/fixture.js"></script></html>');}
});await new Promise(r=>http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+http.address().port;
const proxy=new WebSocketServer({server:http});proxy.on('connection',(front,req)=>{
 const back=new Socket(backend.replace('http','ws')+req.url,req.headers['sec-websocket-protocol']?.split(',').map(s=>s.trim()),{headers:{Origin:base}}),queued=[];sockets.add(front);sockets.add(back);
 const ordered=target=>{let due=0,timer;const queue=[];
  const pump=()=>{if(timer){timers.delete(timer);timer=undefined;}while(queue.length&&queue[0].due<=performance.now()){const frame=queue.shift();if(target.readyState===1)target.send(frame.data,{binary:frame.binary});}if(queue.length){timer=setTimeout(pump,Math.max(1,queue[0].due-performance.now()));timers.add(timer);}};
  return(data,binary)=>{seed=(seed*16807)%2147483647;const wait=Math.max(0,latency/2+(seed/2147483647*2-1)*jitter/2);due=Math.max(due,performance.now()+wait,target===front?pauseDownstreamUntil:0);queue.push({data,binary,due});if(!timer)pump();};};
 const upstream=ordered(back),downstream=ordered(front);back.on('open',()=>{for(const [d,b]of queued)upstream(d,b);queued.length=0;});front.on('message',(d,b)=>back.readyState===0?queued.push([d,b]):upstream(d,b));back.on('message',downstream);front.on('close',()=>{sockets.delete(front);back.close();});back.on('close',()=>{sockets.delete(back);front.close();});front.on('error',()=>{});back.on('error',()=>front.close());
});
const profile=mkdtempSync(resolve(cache,'prediction-browser-')),tools=[];let child;
try{
 rt=createRealtimeServer({map,origins:[base],authorize:async(token,requested)=>{const n=Number(String(token).replace('fixture-',''));if(![1,2].includes(n)||requested!==office)throw Error('Denied');return{userId:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),organizationId:office,officeId:office,token:String(token),checkedAt:Date.now(),expiresAt:Date.now()+600000,avatarKey:n===1?'fern':'plum',displayName:'Local test '+n};}});await rt.listen(0,'127.0.0.1');backend='http://127.0.0.1:'+rt.transport.server.address().port;
 const built=await build({bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',tsconfig:resolve(web,'tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},stdin:{resolveDir:web,loader:'ts',contents:`
 import{createOfficeGame}from'./src/features/office/engine/create-game.ts';import{connectOffice}from'./src/features/office/network/connection.ts';
 const person=Number(new URL(location.href).searchParams.get('person'))||1,f=window.latencyFixture={person,ready:false,status:'connecting'};
 const host=document.getElementById('world');f.engine=createOfficeGame(host,{onReady(){f.ready=true},onError(){f.failed=true}}, {avatarKey:person===1?'fern':'plum',displayName:'Local test '+person},true,${JSON.stringify(office)},${JSON.stringify(defaultEnvironment)});
 f.network=connectOffice({url:${JSON.stringify(base)},officeId:${JSON.stringify(office)},mapVersion:${JSON.stringify(mapVersion(map))},getToken:async()=> 'fixture-'+person,onPresence:p=>f.status=p.status});f.engine.setNetwork(f.network);
 f.arm=()=>{const s=f.engine.game.scene.getScene('Office'),p=s.player,own=f.network.snapshot().players.get(f.network.sessionId());f.result=null;f.start=null;const x=p.x,y=p.y,rawX=own.x,rawY=own.y;const key=e=>{if(e.code==='ArrowRight'){f.start=performance.now();window.removeEventListener('keydown',key);}};window.addEventListener('keydown',key);const tick=()=>{if(f.start!==null){const elapsed=performance.now()-f.start;if(Math.hypot(own.x-rawX,own.y-rawY)>.25&&f.raw===null)f.raw=elapsed;if(Math.hypot(p.x-x,p.y-y)>.25&&f.result===null)f.result={visibleMs:elapsed};if(f.result&&f.raw!==null){f.result.authoritativeMs=f.raw;return;}if(elapsed>2500){f.result={timeout:true};return;}}requestAnimationFrame(tick);};f.raw=null;requestAnimationFrame(tick);};
 `}});bundle=built.outputFiles[0].contents;
 child=spawn(browser,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--window-size=1200,850','about:blank'],{windowsHide:true,stdio:'ignore'});
 let port;await until(()=>{try{port=readFileSync(resolve(profile,'DevToolsActivePort'),'utf8').split('\n')[0];return!!port;}catch{return false;}},'browser');let pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();const a=await cdp(pages.find(p=>p.type==='page').webSocketDebuggerUrl);tools.push(a);const second=await a.send('Target.createTarget',{url:'about:blank'});pages=await(await fetch('http://127.0.0.1:'+port+'/json')).json();tools.push(await cdp(pages.find(p=>p.id===second.targetId).webSocketDebuggerUrl));
 // Resolve the second target explicitly; page inventory ordering is not stable.
 for(const [i,t]of tools.entries()){await t.send('Runtime.enable');await t.send('Page.enable');await t.send('Page.navigate',{url:base+'/?person='+(i+1)});await until(()=>t.evaluate('window.latencyFixture?.ready&&latencyFixture.status==="online"&&latencyFixture.network.snapshot()?.players.size>0'),'client '+i);}
 const queried=await matchMaker.query({name:'office'}),live=matchMaker.getLocalRoomById(queried.find(r=>r.clients===2)?.roomId??queried[0].roomId),session=await a.evaluate('latencyFixture.network.sessionId()'),own=live.state.players.get(session);assert.ok(own);
 let runway;for(let y=32;y<map.height*32-64&&!runway;y+=32)for(let x=64;x<map.width*32-320&&!runway;x+=32)if(Array.from({length:250},(_,n)=>canStand(map,x+n,y)).every(Boolean))runway={x,y};assert.ok(runway);
 const observations=[];for(const p of [{rtt:0,jitter:0},{rtt:80,jitter:10},{rtt:180,jitter:35},{rtt:300,jitter:60}]){latency=p.rtt;jitter=p.jitter;const samples=[];
  for(let n=0;n<4;n++){Object.assign(own,runway);if('movementEpoch'in own)own.movementEpoch++;await delay(450+p.rtt);await a.send('Page.bringToFront');await a.evaluate('document.getElementById("world").focus();latencyFixture.arm()');await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowRight',key:'ArrowRight'});await until(()=>a.evaluate('latencyFixture.result?.authoritativeMs!==undefined||latencyFixture.result?.timeout'),'response');const sample=await a.evaluate('latencyFixture.result');assert.ok(!sample.timeout);samples.push(sample);await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowRight',key:'ArrowRight'});await delay(150+p.rtt);}
  observations.push({...p,samples,visibleMeanMs:samples.reduce((s,x)=>s+x.visibleMs,0)/samples.length,authoritativeMeanMs:samples.reduce((s,x)=>s+x.authoritativeMs,0)/samples.length});
 }
 let recovery=null,remoteInterpolation=null,acknowledgementGap=null;
 if(phase!=='before'){
  for(const p of observations){assert.ok(p.visibleMeanMs<70,'predicted response remains independent of simulated RTT');assert.ok(p.samples.every(s=>s.visibleMs<100));}
  // A controlled server pose stream isolates the passive remote presentation
  // path from the already-measured local keyboard/prediction path above.
  latency=80;jitter=10;Object.assign(own,runway);own.movementEpoch++;await delay(500);
  const b=tools[1];await b.send('Page.bringToFront');
  await b.evaluate(`latencyFixture.peerSamples=[];latencyFixture.probePeer=true;(()=>{const tick=()=>{const s=latencyFixture.engine.game.scene.getScene('Office'),id=${JSON.stringify(session)},raw=latencyFixture.network.snapshot()?.players.get(id),avatar=s.remotes.get(id);if(raw&&avatar)latencyFixture.peerSamples.push({raw:raw.x,visual:avatar.sprite.x});if(latencyFixture.probePeer)requestAnimationFrame(tick)};requestAnimationFrame(tick)})()`);
  for(let i=0;i<30;i++){own.x+=2;await delay(1000/60);}await delay(450);
  const peers=await b.evaluate('latencyFixture.probePeer=false;latencyFixture.peerSamples');assert.ok(peers.length>15);
  const peerSteps=peers.slice(1).map((p,i)=>p.visual-peers[i].visual),lastPeer=peers.at(-1);
  assert.ok(Math.abs(lastPeer.visual-own.x)<1,'remote sprite converges to server authority');assert.ok(peerSteps.every(d=>d>=-.1&&d<24),'remote presentation stays monotonic without large jumps');
  remoteInterpolation={scope:'controlled server pose stream over the actual delayed WebSocket and Phaser remote path',samples:peers.length,maximumFrameStepPx:Math.max(...peerSteps),finalErrorPx:Math.abs(lastPeer.visual-own.x),bufferMs:50};
  await a.send('Page.bringToFront');await a.evaluate('document.getElementById("world").focus()');
  Object.assign(own,runway);own.movementEpoch++;await delay(500);
  pauseDownstreamUntil=performance.now()+1400;
  await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowRight',key:'ArrowRight'});await delay(1000);
  const frozen=await a.evaluate('latencyFixture.engine.game.scene.getScene("Office").player.x');await delay(150);
  const frozenAgain=await a.evaluate('latencyFixture.engine.game.scene.getScene("Office").player.x');assert.ok(Math.abs(frozen-frozenAgain)<.1,'acknowledgement gap stops speculative movement');
  assert.ok((await a.evaluate('latencyFixture.network.movementDiagnostics().pendingInputs'))<=90,'unacknowledged history is bounded');
  await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowRight',key:'ArrowRight'});await delay(850);
  const recovered=await a.evaluate('latencyFixture.engine.game.scene.getScene("Office").player.x');if(Math.abs(recovered-own.x)>=1)console.info(JSON.stringify({ackGapFailure:{expected:own.x,actual:recovered,server:{id:own.sessionId,connected:own.connected,epoch:own.movementEpoch,current:live.state.players.get(session)?.x},detail:await a.evaluate('({status:latencyFixture.status,session:latencyFixture.network.sessionId(),raw:latencyFixture.network.snapshot()?.players.get(latencyFixture.network.sessionId())?.x,epoch:latencyFixture.network.snapshot()?.players.get(latencyFixture.network.sessionId())?.movementEpoch,diagnostics:latencyFixture.network.movementDiagnostics()})')}}));assert.ok(Math.abs(recovered-own.x)<1,'late acknowledgements converge to authority');
  acknowledgementGap={delayedDownstreamMs:1400,predictionStopped:true,boundedPendingInputs:true,finalErrorPx:Math.abs(recovered-own.x)};
  latency=80;jitter=10;await delay(500);const oldEpoch=own.movementEpoch;
  await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowRight',key:'ArrowRight'});await delay(100);for(const socket of [...sockets])socket.terminate();
  await until(()=>a.evaluate('latencyFixture.status!=="online"'),'drop observed');
  await until(()=>a.evaluate('latencyFixture.status==="online"&&latencyFixture.network.snapshot()?.players.get(latencyFixture.network.sessionId())?.connected'),'reconnect');
  await until(()=>own.connected&&own.movementEpoch>oldEpoch,'new authoritative movement generation');await delay(500);const resetX=own.x;await delay(300);assert.ok(Math.abs(own.x-resetX)<.01,'held pre-drop keyboard input is cleared and never replayed');
  await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowRight',key:'ArrowRight'});await a.send('Page.bringToFront');await a.evaluate('document.getElementById("world").focus()');await a.send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowRight',key:'ArrowRight'});await until(()=>own.x>resetX+1,'fresh input after reconnect');await a.send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowRight',key:'ArrowRight'});recovery={reconnected:true,epochAdvanced:true,staleHeldInputCleared:true,freshInputAccepted:true};
 }
 const frameTimes=await a.evaluate('new Promise(resolve=>{const frames=[];let last=performance.now();const tick=t=>{frames.push(t-last);last=t;if(frames.length<121)requestAnimationFrame(tick);else{frames.shift();frames.sort((a,b)=>a-b);resolve({medianMs:frames[60],p95Ms:frames[114],frames:120})}};requestAnimationFrame(tick)})');
 const result={phase,scope:'actual local two-client Phaser/Colyseus over ordered delayed WebSocket proxy; synthetic identities, no hosted service',profiles:observations,recovery,remoteInterpolation,acknowledgementGap,frameTimes,clientDiagnostics:await a.evaluate('latencyFixture.engine.movementDiagnostics?.()??null'),simulationTicks:live.simulationTicks,serverMeanWorkMs:live.simulationWorkMs/live.simulationTicks,runtimeErrors:tools.flatMap(t=>t.errors)};assert.deepEqual(result.runtimeErrors,[]);writeFileSync(resolve(cache,'movement-latency-'+phase+'.json'),JSON.stringify(result,null,2));console.info(JSON.stringify(result));
 await a.send('Page.bringToFront');writeFileSync(resolve(cache,'movement-latency-'+phase+'.png'),Buffer.from((await a.send('Page.captureScreenshot',{format:'png'})).data,'base64'));
}catch(error){process.exitCode=1;console.error(error);}finally{for(const t of tools)try{await t.evaluate('latencyFixture?.network.close()');}catch{}for(const t of tools)t.close();child?.kill();for(const timer of timers)clearTimeout(timer);for(const socket of sockets)socket.terminate();proxy.close();await rt?.gracefullyShutdown(false);await new Promise(r=>http.close(r));if(profile.startsWith(cache+sep))try{rmSync(profile,{recursive:true,force:true,maxRetries:3});}catch{}}
