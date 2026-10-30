// Isolated local engine harness: no Auth bypass, app route, DB or user session.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { cpus } from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = resolve(root, "apps/web");
const requireWeb = createRequire(resolve(web, "package.json"));
const ts = requireWeb("typescript");
const requireSDK = createRequire(requireWeb.resolve("@colyseus/sdk"));
const { WebSocketServer } = requireSDK("ws");
const browser = process.env.OFFICE_TEST_BROWSER || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Office engine validation</title>
<style>body{margin:24px;background:#f8f9f5;color:#202c27;font:14px Arial}header{width:1152px;max-width:100%;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}h1{font-size:20px;margin:4px 0}#world{width:1152px;height:650px;max-width:calc(100vw - 48px);overflow:hidden;border:1px solid #dce2d8}canvas{display:block;image-rendering:pixelated}button,input{padding:10px}small{color:#5c6961}#world:focus-visible{outline:3px solid #245743}</style>
<header><div><small>Virtual Office · isolated engine validation</small><h1>Oak & Fern Studio</h1></div><button id="outside">Outside canvas</button></header><div id="world" tabindex="0" aria-label="Office"></div><p><input id="text" aria-label="Input focus test" placeholder="Keyboard focus check"></p>
<script type="importmap">{"imports":{"phaser":"/phaser.js"}}</script>
<script type="module">
import {createOfficeGame} from '/modules/office/engine/create-game.ts';
import {mountOffice} from '/modules/office/engine/lifecycle.ts';
window.startOffice=()=>{window.ready=false;window.failure=false;window.slot=mountOffice(async()=>()=>{
  window.office=createOfficeGame(document.getElementById('world'),{onReady(){window.ready=true},onError(){window.failure=true},onNavigation(state){window.navigation=state;window.navigationEvents=(window.navigationEvents||0)+1}});return window.office;
},()=>{window.failure=true})};
window.remount=async()=>{await window.slot.dispose();window.startOffice()};
window.startOffice();
</script></html>`;
function serve(request, response) {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
    if (pathname === "/phaser.js") { response.setHeader("Content-Type", "text/javascript"); response.end(readFileSync(resolve(web, "node_modules/phaser/dist/phaser.esm.js"))); return; }
    if (["/packages/shared/src/avatars.ts", "/packages/shared/src/map.ts", "/packages/shared/src/protocol.ts", "/packages/shared/src/socket-transport.ts", "/packages/shared/src/environment/catalog.ts", "/packages/shared/src/environment/compose.ts", "/packages/shared/src/environment/visuals.ts", "/packages/shared/src/environment/plans.ts"].includes(pathname)) {
      const source = ts.transpileModule(readFileSync(resolve(root, pathname.slice(1)), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      response.setHeader("Content-Type", "text/javascript"); response.end(source.outputText); return;
    }
    if (pathname.startsWith("/office/")) {
      const name = pathname.slice(8);
      if (!["studio.json", "office-tiles.png", "avatar.png"].includes(name)) throw new Error("Unknown asset");
      response.setHeader("Content-Type", name.endsWith("png") ? "image/png" : "application/json"); response.end(readFileSync(resolve(web, "public/office", name))); return;
    }
    if (pathname.startsWith("/modules/")) {
      const base = resolve(web, "src/features"); const file = resolve(base, pathname.slice(9));
      const allowed = file.startsWith(resolve(base, "office") + sep) || [resolve(base, "avatars/presets.ts"), resolve(base, "avatars/animation.ts")].includes(file);
      if (!allowed || !file.endsWith(".ts")) throw new Error("Invalid module");
      const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
      response.setHeader("Content-Type", "text/javascript"); response.end(source.outputText); return;
    }
  } catch { /* Return no paths or source details. */ }
  response.writeHead(404); response.end();
}
async function connect(url) {
  const socket = new WebSocket(url); let serial = 0; const pending = new Map();
  const errors = [];
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)); const handler = pending.get(message.id);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || "Browser runtime error");
    if (handler) { pending.delete(message.id); clearTimeout(handler.timer); if (message.error) handler.reject(new Error(message.error.message)); else handler.resolve(message.result); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 8000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  return { command, errors, close: () => socket.close(), async evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "Browser evaluation failed");
    return result.result.value;
  } };
}
async function waitFor(predicate, description) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await delay(100); }
  throw new Error(`Timed out: ${description}`);
}

test("real Chromium validates Phaser rendering, input, collisions, camera, resize and destruction", { timeout: 55000, skip: !browser ? "Set OFFICE_TEST_BROWSER to a Chromium executable" : false }, async () => {
  const cache = resolve(root, ".cache"); mkdirSync(cache, { recursive: true });
  const profile = mkdtempSync(resolve(cache, "office-browser-"));
  const server = createServer(serve); await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const handshakeServer = new WebSocketServer({ server });
  handshakeServer.on("connection", (socket, request) => {
    socket.once("message", () => socket.send(JSON.stringify({
      urlCredential: /(?:reconnectionToken|_authToken)=/.test(request.url),
      headerProof: request.headers["sec-websocket-protocol"] === "office-resume.fixture-proof",
    })));
  });
  const child = spawn(browser, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1280,1024", "about:blank"], { windowsHide: true, stdio: "ignore" });
  let devtools;
  try {
    let port;await waitFor(()=>{try{port=readFileSync(resolve(profile,"DevToolsActivePort"),"utf8").split("\n")[0];return /^\d+$/.test(port)}catch{return false}},"browser launch");
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    devtools = await connect(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
    const { command, evaluate } = devtools;
    await command("Page.enable"); await command("Runtime.enable");
    await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
    await waitFor(() => evaluate("window.ready === true || window.failure === true"), "scene initialization");
    assert.equal(await evaluate("window.failure"), false, "Actual scene must load all assets without error");
    const snapshot = () => evaluate(`(()=>{const s=office.game.scene.getScene('Office'),p=s.player,c=s.cameras.main;return {x:p.x,y:p.y,left:p.body.left,top:p.body.top,zoom:c.zoom,scrollX:c.scrollX,scrollY:c.scrollY,viewLeft:c.worldView.left,viewTop:c.worldView.top,right:c.worldView.right,bottom:c.worldView.bottom,canvases:document.querySelectorAll('canvas').length,walking:p.anims.isPlaying,width:office.game.scale.width,height:office.game.scale.height}})()`);
    const press = async (code, key, milliseconds) => { await command("Input.dispatchKeyEvent", { type: "keyDown", code, key }); await delay(milliseconds); await command("Input.dispatchKeyEvent", { type: "keyUp", code, key }); await delay(80); };
    await evaluate("document.getElementById('world').focus()"); const initial = await snapshot();
    await command("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyW", key: "w" });
    let walkingFrame;
    await waitFor(async () => { walkingFrame = await snapshot(); return walkingFrame.walking && walkingFrame.y < initial.y - 10; }, "unobstructed walking animation and displacement");
    // Assert the moving sample, rather than a later frame that may already
    // have reached the counter on a busy/software-rendered test machine.
    assert.equal(walkingFrame.walking, true, "Unobstructed motion plays the walk animation");
    await command("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyW", key: "w" }); await delay(80);
    assert.ok((await snapshot()).y < initial.y - 10, "WASD moves the player");
    assert.equal((await snapshot()).walking, false, "Release enters idle");
    for (const [code, key, direction] of [["KeyW", "w", "up"], ["KeyA", "a", "left"], ["KeyS", "s", "down"], ["KeyD", "d", "right"]]) {
      await evaluate("office.game.scene.getScene('Office').player.body.reset(600,450)");
      await command("Input.dispatchKeyEvent", { type: "keyDown", code, key }); await delay(170);
      assert.equal(await evaluate("office.game.scene.getScene('Office').player.anims.currentAnim.key"), `avatar-fern-${direction}-walk`);
      await command("Input.dispatchKeyEvent", { type: "keyUp", code, key }); await delay(70);
      assert.equal((await snapshot()).walking, false);
    }
    await evaluate("office.game.scene.getScene('Office').player.body.reset(48,496)");
    await press("ArrowLeft", "ArrowLeft", 500); const wall = await snapshot();
    assert.ok(wall.left >= 32 && wall.x < 48, "Physical wall collision stops arrow-key movement");
    await evaluate("office.game.scene.getScene('Office').player.body.reset(512,272)");
    await command("Input.dispatchKeyEvent", { type:"keyDown",code:"KeyW",key:"w" });
    let desk;await waitFor(async()=>{desk=await snapshot();return desk.top>=192&&desk.top<196&&!desk.walking;},"furniture contact and idle animation");
    await command("Input.dispatchKeyEvent", { type:"keyUp",code:"KeyW",key:"w" });
    assert.ok(desk.top >= 192 && desk.top < 196, "Physical furniture collision stops movement");
    await command("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyW", key: "w" }); await delay(150);
    assert.equal((await snapshot()).walking, false, "Holding a key against furniture remains idle");
    await command("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyW", key: "w" });
    const presets = ["fern", "harbor", "clay", "plum", "ochre", "slate"];
    for (const [index, key] of presets.entries()) {
      const before = await snapshot();
      await evaluate(`office.setAppearance({avatarKey:${JSON.stringify(key)},displayName:'Alexandria Long Profile Name'})`); await delay(70);
      assert.equal(await evaluate("Math.floor(Number(office.game.scene.getScene('Office').player.frame.name)/12)"), index, "Preset selects its own frame range");
      const after = await snapshot(); assert.equal(after.x, before.x); assert.equal(after.y, before.y);
      assert.deepEqual(await evaluate("(()=>{const p=office.game.scene.getScene('Office').player;return [p.body.width,p.body.height]})()"), [14, 10]);
    }
    assert.equal(await evaluate("office.game.anims.anims.size"), 24, "Animation definitions are registered once per game");
    await evaluate("office.setAppearance({avatarKey:'fern',displayName:'private@example.invalid'})"); await delay(70);
    assert.equal(await evaluate("office.game.scene.getScene('Office').avatar.label.text"), "Member", "Account emails never appear as player labels");
    await evaluate("office.setAppearance({avatarKey:'slate',displayName:'Alexandria Long Profile Name'});office.game.scene.getScene('Office').player.body.reset(800,40)");
    await press("KeyW", "w", 300);
    assert.equal(await evaluate("(()=>{const s=office.game.scene.getScene('Office');return s.avatar.label.getBounds().top>=s.cameras.main.worldView.top})()"), true, "Name label stays inside the top camera boundary");
    assert.equal(await evaluate("(()=>{const s=office.game.scene.getScene('Office'),p=s.player.getBounds(),l=s.avatar.label.getBounds();return l.bottom<=p.top||l.top>=p.bottom})()"), true, "Boundary-safe name label does not overlap character artwork");
    await evaluate("document.getElementById('text').focus()"); const stationary = await snapshot();
    await press("KeyD", "d", 150); assert.equal((await snapshot()).x, stationary.x, "Typing outside the canvas cannot move the avatar");
    await evaluate("document.getElementById('world').focus()"); await press("Tab", "Tab", 20);
    assert.equal(await evaluate("document.activeElement.id"), "text", "Tab leaves the canvas");
    await evaluate("office.zoomBy(1)"); await delay(100); assert.ok((await snapshot()).zoom > initial.zoom);
    await evaluate("document.getElementById('world').style.width='360px';document.getElementById('world').style.height='420px'"); await delay(200);
    const resized = await snapshot(); assert.equal(resized.width, 360); assert.equal(resized.height, 420);
    assert.ok(resized.viewLeft >= 0 && resized.viewTop >= 0 && resized.right <= 1152 && resized.bottom <= 832, `Camera stays inside map after resize: ${JSON.stringify(resized)}`);
    assert.equal(await evaluate("(()=>{const s=office.game.scene.getScene('Office'),l=s.avatar.label.getBounds(),v=s.cameras.main.worldView;return l.left>=v.left&&l.right<=v.right&&l.top>=v.top&&l.bottom<=v.bottom})()"), true, "Long names remain readable inside the resized camera");
    await evaluate("document.getElementById('world').style.width='1152px';document.getElementById('world').style.height='832px';office.zoomBy(-10)"); await delay(250);
    const cameraPosition = await snapshot();
    assert.equal(await evaluate("office.navigate({type:'overview'})"),true);await delay(100);
    assert.equal(await evaluate("navigation.fit && !navigation.canZoomOut"),true,"Overview is the actual lower zoom limit");
    assert.ok(await evaluate("(()=>{const v=office.game.scene.getScene('Office').cameras.main.worldView;return v.left<=.1&&v.top<=.1&&v.right>=1151.9&&v.bottom>=831.9})()"),"All real map boundaries fit inside the overview");
    await evaluate("document.getElementById('world').style.width='360px';document.getElementById('world').style.height='420px'");await delay(180);
    assert.ok(await evaluate("navigation.fit && office.game.scene.getScene('Office').cameras.main.zoom<=360/1152"),"Overview refits on resize");
    assert.equal(await evaluate("office.navigate({type:'area',id:'MEETING ROOM'})"),true);assert.equal(await evaluate("navigation.areaId"),"MEETING ROOM");
    assert.equal(await evaluate("office.navigate({type:'area',id:'another-company-area'})"),false);
    assert.equal((await snapshot()).x,cameraPosition.x);assert.equal((await snapshot()).y,cameraPosition.y,"Camera commands never teleport the local body");
    await command("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-motion",value:"reduce"}]});await delay(80);
    await waitFor(()=>evaluate("office.game.scene.getScene('Office').reducedMotion===true"),"reduced-motion preference delivery");
    await evaluate("office.navigate({type:'self'})");assert.equal(await evaluate("office.game.scene.getScene('Office').cameras.main.lerp.x"),1,"Reduced motion removes camera glide");
    await evaluate("office.navigate({type:'area',id:'RECEPTION'});document.getElementById('world').focus()");
    await press("ArrowDown","ArrowDown",80);assert.equal(await evaluate("navigation.mode"),"self","Manual movement predictably returns camera ownership to self");
    await evaluate("document.getElementById('world').style.width='1152px';document.getElementById('world').style.height='832px'");await delay(150);
    await command("Emulation.setEmulatedMedia",{features:[]});
    const image = await command("Page.captureScreenshot", { format: "png" }); writeFileSync(resolve(cache, "office-preview-desktop.png"), Buffer.from(image.data, "base64"));
    console.log("Rendering, movement, collisions, focus, zoom and resize checks passed; measuring frame rate.");
    const performance = await evaluate(`(async()=>{const g=office.game;let frames=0;const count=()=>frames++;g.events.on('poststep',count);const start=performance.now();await new Promise(r=>setTimeout(r,1200));const seconds=(performance.now()-start)/1000;g.events.off('poststep',count);return {frames,seconds,fps:Math.round(frames/seconds*10)/10,renderer:g.renderer.type}})()`);
    console.log("Frame measurement complete; checking repeated renderer teardown/remount.");
    for (let i = 0; i < 2; i++) { await evaluate("remount()"); await waitFor(() => evaluate("window.ready === true"), "remount"); assert.equal((await snapshot()).canvases, 1, "Remount never duplicates canvas"); }
    // Rendering fixture only: network authentication/transport is tested separately.
    await evaluate(`(async()=>{
      await window.slot.dispose(); window.ready=false; window.networkClosed=0; window.networkInputs=0;window.nonzeroInputs=0;
      const common={displayName:'Taylor',avatarKey:'fern',x:600,y:450,direction:'down',isMoving:false,connected:true};
      window.networkState={officeId:'fixture-office',mapVersion:'fixture-map',players:new Map([
        ['local',{...common,sessionId:'local',userId:'a'}],
        ['remote',{...common,x:640,sessionId:'remote',userId:'b',avatarKey:'slate',displayName:'Morgan'}]
      ])};
      const {createOfficeGame}=await import('/modules/office/engine/create-game.ts');
      window.office=createOfficeGame(document.getElementById('world'),{onReady(){window.ready=true},onError(){window.failure=true},onNavigation(state){window.navigation=state;window.navigationEvents=(window.navigationEvents||0)+1}}, {avatarKey:'fern',displayName:'Taylor'},true,'fixture-office');
      let closed=false;
      office.setNetwork({snapshot:()=>window.networkState,sessionId:()=> 'local',input(x,y){window.networkInputs++;if(x||y)window.nonzeroInputs++},appearanceChanged(){},close(){if(!closed){closed=true;window.networkClosed++}}});
    })()`);
    await waitFor(() => evaluate("window.ready===true && office.game.scene.getScene('Office').remotes.size===1"), "network avatar rendering");
    assert.equal(await evaluate("office.game.scene.getScene('Office').player.body.enable"), false, "Multiplayer never delegates authoritative movement to local physics");
    await evaluate("window.remoteSprite=office.game.scene.getScene('Office').remotes.get('remote').sprite;networkState.players.get('remote').x=680;networkState.players.get('remote').isMoving=true;networkState.players.get('remote').direction='right'");
    await waitFor(() => evaluate("window.remoteSprite.x>675"), "remote authoritative sample interpolation");
    assert.equal(await evaluate("office.game.scene.getScene('Office').remotes.get('remote').sprite===window.remoteSprite"), true, "Network updates reuse the same sprite");
    assert.ok(await evaluate("window.remoteSprite.x>675"), "Remote authoritative samples interpolate smoothly");
    assert.equal(await evaluate("window.remoteSprite.anims.currentAnim.key"), "avatar-slate-right-walk");
    await evaluate("networkState.players.get('remote').isMoving=false"); await delay(100);
    assert.equal(await evaluate("window.remoteSprite.anims.isPlaying"), false, "Remote stops walking when server reports idle");
    await waitFor(()=>evaluate("navigation.findable.includes('remote')"),"authorized Find target");
    const positionsBefore=await evaluate("JSON.stringify([...networkState.players].map(([id,p])=>[id,p.x,p.y]))");
    assert.equal(await evaluate("office.navigate({type:'teammate',sessionId:'remote'})"),true);
    assert.equal(await evaluate("office.navigate({type:'teammate',sessionId:'foreign-session'})"),false);
    await evaluate("office.navigate({type:'teammate',sessionId:'remote'});networkState.players.get('remote').x=980;networkState.players.get('remote').y=220");
    await waitFor(()=>evaluate("navigation.hint.includes('Meeting Room') && office.game.scene.getScene('Office').highlight.x>970"),"moving teammate highlight and textual marker hint");
    await evaluate("networkState.players.get('remote').connected=false");await waitFor(()=>evaluate("navigation.mode==='self' && !navigation.findable.includes('remote')"),"disconnected target cleanup");
    await evaluate("networkState.players.get('remote').connected=true");await waitFor(()=>evaluate("navigation.findable.includes('remote')"),"reconnected target eligibility");
    assert.equal(await evaluate("navigation.mode"),"self","Reconnection never silently retargets the camera");
    await evaluate("office.navigate({type:'teammate',sessionId:'remote'});networkState.players.get('remote').x=NaN");await waitFor(()=>evaluate("navigation.mode==='self' && !navigation.findable.includes('remote')"),"unknown position cleanup");
    await evaluate("networkState.players.get('remote').x=680;networkState.players.get('remote').y=450");await waitFor(()=>evaluate("navigation.findable.includes('remote')"),"valid position recovery");
    await evaluate("office.navigate({type:'teammate',sessionId:'remote'});networkState.officeId='another-company'");await waitFor(()=>evaluate("navigation.findable.length===0 && navigation.mode==='self'"),"foreign room snapshot rejection");
    assert.equal(await evaluate("office.navigate({type:'teammate',sessionId:'remote'})"),false);
    await evaluate("networkState.officeId='fixture-office'");await waitFor(()=>evaluate("navigation.findable.includes('remote')"),"original bound snapshot recovery");
    await evaluate("office.navigate({type:'overview'});office.navigate({type:'area',id:'LOUNGE'});office.navigate({type:'self'})");
    assert.equal(await evaluate("JSON.stringify([...networkState.players].map(([id,p])=>[id,p.x,p.y]))"),positionsBefore,"Camera commands never mutate authoritative coordinates");
    assert.equal(await evaluate("window.nonzeroInputs"),0,"Camera navigation never creates nonzero movement input");
    await evaluate(`(()=>{const common=networkState.players.get('local'),presets=['fern','harbor','clay','plum','ochre','slate'];for(let i=0;i<8;i++)networkState.players.set('extra-'+i,{...common,sessionId:'extra-'+i,userId:'extra-'+i,displayName:'Colleague '+i,avatarKey:presets[i%6],x:500+i*24,y:500,isMoving:true,direction:'left'})})()`);
    await delay(100);
    assert.equal(await evaluate("office.game.scene.getScene('Office').remotes.size"), 9, "Ten players reuse ten avatar instances");
    const multiplayerPerformance = await evaluate(`(async()=>{const g=office.game;let frames=0;const count=()=>frames++;g.events.on('poststep',count);const start=performance.now();await new Promise(r=>setTimeout(r,1200));const seconds=(performance.now()-start)/1000;g.events.off('poststep',count);return {frames,seconds,fps:Math.round(frames/seconds*10)/10,players:10,scope:'render fixture, no live accounts or transport'}})()`);
    await evaluate("for(let i=0;i<8;i++)networkState.players.delete('extra-'+i)");
    await evaluate("networkState.players.delete('remote')"); await delay(80);
    assert.equal(await evaluate("office.game.scene.getScene('Office').remotes.size"), 0);
    assert.equal(await evaluate("window.remoteSprite.scene===undefined"), true, "Leave destroys the sprite");
    await evaluate("window.savedNetworkState=networkState;window.networkState=undefined"); await delay(70);
    assert.equal(await evaluate("office.game.scene.getScene('Office').player.visible"), false, "Disconnect does not show an offline player as online");
    await evaluate("window.networkState=savedNetworkState"); await delay(70);
    assert.equal(await evaluate("office.game.scene.getScene('Office').player.visible"), true);
    assert.ok(await evaluate("window.networkInputs>0"));
    await evaluate("office.destroy()");
    assert.equal(await evaluate("window.networkClosed"), 1, "Game destruction also closes the network outside React");
    await evaluate("window.slot.dispose()"); assert.equal(await evaluate("document.querySelectorAll('canvas').length"), 0, "Cleanup removes the renderer/canvas");
    assert.equal(await evaluate("office.game.loop.running"), false, "Cleanup stops the frame loop");
    const nativeHandshake = await evaluate(`(async()=>{
      const {protectReconnectUrl}=await import('/packages/shared/src/socket-transport.ts');
      let resolve;const done=new Promise(r=>resolve=r);
      const connection={transport:{isOpen:false,send(){},sendUnreliable(){},connect(){},close(){}},events:{onopen(){connection.transport.send(new Uint8Array([1]))},onmessage(event){resolve(JSON.parse(event.data))}}};
      const dispose=protectReconnectUrl(connection);
      connection.transport.connect('ws://'+location.host+'/handshake-fixture?sessionId=fixture&reconnectionToken=fixture-proof');
      const result=await done;dispose();
      try{connection.transport.connect('ws://'+location.host+'/?reconnectionToken=fixture-proof');result.closedRetryBlocked=false}catch{result.closedRetryBlocked=true}
      return result;
    })()`);
    assert.deepEqual(nativeHandshake, { urlCredential: false, headerProof: true, closedRetryBlocked: true }, "Native browser handshake keeps reconnection proof out of URLs and blocks stale retries after disposal");
    assert.deepEqual(devtools.errors, [], "Engine must not raise uncaught browser exceptions");
    const version = await command("Browser.getVersion");
    console.log(JSON.stringify({ browser: version.product, hardware: cpus()[0]?.model, renderer: "SwiftShader software WebGL", viewport: "1280x1024", measured: performance, multiplayerRendering: multiplayerPerformance, screenshot: ".cache/office-preview-desktop.png", scope: "isolated engine only; live authenticated app workflow not tested" }));
  } finally {
    const exited = child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once("exit", done));
    if (devtools) try { await Promise.race([devtools.command("Browser.close"), delay(1500)]); } catch { /* own isolated browser may already have exited */ }
    devtools?.close(); if (child.exitCode === null) child.kill(); await Promise.race([exited, delay(2000)]); handshakeServer.close(); server.close();
    await delay(500);
    // Only remove this run's newly created, resolved profile under the workspace cache.
    if (resolve(profile).startsWith(cache + sep + "office-browser-")) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
