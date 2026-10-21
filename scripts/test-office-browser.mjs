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
const browser = process.env.OFFICE_TEST_BROWSER || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Office engine validation</title>
<style>body{margin:24px;background:#f8f9f5;color:#202c27;font:14px Arial}header{width:1152px;max-width:100%;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}h1{font-size:20px;margin:4px 0}#world{width:1152px;height:650px;max-width:calc(100vw - 48px);overflow:hidden;border:1px solid #dce2d8}canvas{display:block;image-rendering:pixelated}button,input{padding:10px}small{color:#5c6961}#world:focus-visible{outline:3px solid #245743}</style>
<header><div><small>Virtual Office · isolated engine validation</small><h1>Oak & Fern Studio</h1></div><button id="outside">Outside canvas</button></header><div id="world" tabindex="0" aria-label="Office"></div><p><input id="text" aria-label="Input focus test" placeholder="Keyboard focus check"></p>
<script type="importmap">{"imports":{"phaser":"/phaser.js"}}</script>
<script type="module">
import {createOfficeGame} from '/modules/engine/create-game.ts';
import {mountOffice} from '/modules/engine/lifecycle.ts';
window.startOffice=()=>{window.ready=false;window.failure=false;window.slot=mountOffice(async()=>()=>{
  window.office=createOfficeGame(document.getElementById('world'),{onReady(){window.ready=true},onError(){window.failure=true}});return window.office;
},()=>{window.failure=true})};
window.remount=async()=>{await window.slot.dispose();window.startOffice()};
window.startOffice();
</script></html>`;
function serve(request, response) {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/") { response.setHeader("Content-Type", "text/html"); response.end(html); return; }
    if (pathname === "/phaser.js") { response.setHeader("Content-Type", "text/javascript"); response.end(readFileSync(resolve(web, "node_modules/phaser/dist/phaser.esm.js"))); return; }
    if (pathname.startsWith("/office/")) {
      const name = pathname.slice(8);
      if (!["studio.json", "office-tiles.png", "avatar.png"].includes(name)) throw new Error("Unknown asset");
      response.setHeader("Content-Type", name.endsWith("png") ? "image/png" : "application/json"); response.end(readFileSync(resolve(web, "public/office", name))); return;
    }
    if (pathname.startsWith("/modules/")) {
      const base = resolve(web, "src/features/office"); const file = resolve(base, pathname.slice(9));
      if (!file.startsWith(base + sep) || !file.endsWith(".ts")) throw new Error("Invalid module");
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
  const child = spawn(browser, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1280,1024", "about:blank"], { windowsHide: true, stdio: "ignore" });
  let devtools;
  try {
    await waitFor(() => existsSync(resolve(profile, "DevToolsActivePort")), "browser launch");
    const port = readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
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
    await press("KeyW", "w", 250); assert.ok((await snapshot()).y < initial.y - 10, "WASD moves the player");
    assert.equal((await snapshot()).walking, false, "Release enters idle");
    await evaluate("office.game.scene.getScene('Office').player.body.reset(48,496)");
    await press("ArrowLeft", "ArrowLeft", 500); const wall = await snapshot();
    assert.ok(wall.left >= 32 && wall.x < 48, "Physical wall collision stops arrow-key movement");
    await evaluate("office.game.scene.getScene('Office').player.body.reset(512,272)");
    await press("KeyW", "w", 1100); const desk = await snapshot();
    assert.ok(desk.top >= 192 && desk.top < 196, "Physical furniture collision stops movement");
    await evaluate("document.getElementById('text').focus()"); const stationary = await snapshot();
    await press("KeyD", "d", 150); assert.equal((await snapshot()).x, stationary.x, "Typing outside the canvas cannot move the avatar");
    await evaluate("document.getElementById('world').focus()"); await press("Tab", "Tab", 20);
    assert.equal(await evaluate("document.activeElement.id"), "text", "Tab leaves the canvas");
    await evaluate("office.zoomBy(1)"); await delay(100); assert.ok((await snapshot()).zoom > initial.zoom);
    await evaluate("document.getElementById('world').style.width='360px';document.getElementById('world').style.height='420px'"); await delay(200);
    const resized = await snapshot(); assert.equal(resized.width, 360); assert.equal(resized.height, 420);
    assert.ok(resized.viewLeft >= 0 && resized.viewTop >= 0 && resized.right <= 1152 && resized.bottom <= 832, `Camera stays inside map after resize: ${JSON.stringify(resized)}`);
    await evaluate("document.getElementById('world').style.width='1152px';document.getElementById('world').style.height='832px';office.zoomBy(-10)"); await delay(250);
    const image = await command("Page.captureScreenshot", { format: "png" }); writeFileSync(resolve(cache, "office-preview-desktop.png"), Buffer.from(image.data, "base64"));
    console.log("Rendering, movement, collisions, focus, zoom and resize checks passed; measuring frame rate.");
    const performance = await evaluate(`(async()=>{const g=office.game;let frames=0;const count=()=>frames++;g.events.on('poststep',count);const start=performance.now();await new Promise(r=>setTimeout(r,1200));const seconds=(performance.now()-start)/1000;g.events.off('poststep',count);return {frames,seconds,fps:Math.round(frames/seconds*10)/10,renderer:g.renderer.type}})()`);
    console.log("Frame measurement complete; checking repeated renderer teardown/remount.");
    for (let i = 0; i < 2; i++) { await evaluate("remount()"); await waitFor(() => evaluate("window.ready === true"), "remount"); assert.equal((await snapshot()).canvases, 1, "Remount never duplicates canvas"); }
    await evaluate("window.slot.dispose()"); assert.equal(await evaluate("document.querySelectorAll('canvas').length"), 0, "Cleanup removes the renderer/canvas");
    assert.equal(await evaluate("office.game.loop.running"), false, "Cleanup stops the frame loop");
    assert.deepEqual(devtools.errors, [], "Engine must not raise uncaught browser exceptions");
    const version = await command("Browser.getVersion");
    console.log(JSON.stringify({ browser: version.product, hardware: cpus()[0]?.model, renderer: "SwiftShader software WebGL", viewport: "1280x1024", measured: performance, screenshot: ".cache/office-preview-desktop.png", scope: "isolated engine only; live authenticated app workflow not tested" }));
  } finally {
    devtools?.close(); child.kill(); server.close();
    await delay(500);
    // Only remove this run's newly created, resolved profile under the workspace cache.
    if (resolve(profile).startsWith(cache + sep + "office-browser-")) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
