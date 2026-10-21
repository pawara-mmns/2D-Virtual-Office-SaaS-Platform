// Actual React chat component + Phaser, with a local history/commit fixture.
// No production debug route, Auth bypass, remote DB or real user session.
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
const requireTSX = createRequire(requireRealtime.resolve("tsx"));
const { build } = requireTSX("esbuild");
const browser = process.env.OFFICE_TEST_BROWSER || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const file = (name) => resolve(web, "src", name).replaceAll("\\", "/");
async function bundleFixture() {
  const built = await build({ bundle: true, write: false, platform: "browser", format: "esm", target: "es2022", jsx: "automatic", logLevel: "silent",
    define: { "process.env.NODE_ENV": '"development"' },
    stdin: { resolveDir: web, loader: "tsx", contents: `
      import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';
      import{ChatPanel}from${JSON.stringify(file("features/chat/chat-panel.tsx"))};
      import{Participants}from${JSON.stringify(file("features/chat/participants.tsx"))};
      import{createChatEvents}from${JSON.stringify(file("features/chat/events.ts"))};
      import{createOfficeGame}from${JSON.stringify(file("features/office/engine/create-game.ts"))};
      const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
      const events=createChatEvents();events.emit({type:'connection',online:true});
      const fixture=window.chatFixture={events,requests:0,sent:[],failHistory:false,messages:Array.from({length:65},(_,i)=>({id:String(i+1),channelId:uuid(100),senderId:uuid(2),senderName:'Morgan',body:i===64?'<img src=x onerror="window.injected=true">':'Earlier message '+(i+1),clientMessageId:uuid(500+i),createdAt:'2026-10-22T08:30:00.123456Z'}))};
      fixture.commit=(request,sender=uuid(1))=>{const old=fixture.messages.find(m=>m.senderId===sender&&m.clientMessageId===request.id);const message=old||{id:String(Number(fixture.messages.at(-1).id)+1),channelId:uuid(100),senderId:sender,senderName:sender===uuid(1)?'Taylor':'Morgan',body:request.body,clientMessageId:request.id,createdAt:new Date().toISOString()};if(!old)fixture.messages.push(message);events.emit({type:'message',message})};
      function App(){const[open,setOpen]=useState(false),[office,setOffice]=useState(uuid(100)),[people,setPeople]=useState([{sessionId:'self',userId:uuid(1),displayName:'Taylor',avatarKey:'fern',connected:true,availability:'AVAILABLE'}]);
        useEffect(()=>{fixture.setPeople=setPeople;fixture.setOffice=setOffice;fixture.game=createOfficeGame(document.getElementById('world'),{onReady(){fixture.engineReady=true},onError(){fixture.engineError=true}});return()=>{void fixture.game.destroy()}},[]);
        return <main style={{maxWidth:1400,margin:'auto',padding:16}}><p style={{fontSize:12,marginBottom:12}}>Isolated component validation · synthetic history and identity</p><button id="toggle-chat" className="office-control" aria-controls="office-chat" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Office Chat</button><section className={'office-work-area mt-3 border border-line'+(open?' chat-open':'')}><div className="office-world"><div id="world" className="office-stage" tabIndex={0}/></div><ChatPanel key={office} officeId={office} open={open} onClose={()=>{setOpen(false);document.getElementById('toggle-chat').focus()}} events={events} userId={uuid(1)} send={(body,id)=>{fixture.sent.push({body,id});return true}}/></section><Participants participants={people}/></main>}
      const mounted=createRoot(document.getElementById('root'));fixture.unmount=()=>mounted.unmount();mounted.render(<App/>);
    ` },
    plugins: [{ name: "isolated-history-action", setup(plugin) {
      plugin.onResolve({ filter: /^\.\/actions$/ }, (args) => args.importer.endsWith("chat-panel.tsx") ? { path: "chat-history-fixture", namespace: "fixture" } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents: `
        export async function loadOfficeChat(officeId,before){const f=window.chatFixture;f.requests++;await new Promise(r=>setTimeout(r,25));if(f.failHistory)return{ok:false,error:'Chat history could not load. Try again.'};const rows=f.messages.filter(m=>m.channelId===officeId&&(!before||BigInt(m.id)<BigInt(before))).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,31);const page=rows.slice(0,30).reverse();return{ok:true,page:{messages:page,olderCursor:rows.length>30?page[0].id:null}}}
      ` }));
    } }],
  });
  return built.outputFiles[0].contents;
}
async function devtools(endpoint) {
  const socket = new WebSocket(endpoint); await new Promise((done) => socket.addEventListener("open", done, { once: true }));
  let serial = 0; const pending = new Map(), errors = [];
  socket.addEventListener("message", (event) => {
    const response = JSON.parse(String(event.data));
    if (response.method === "Runtime.exceptionThrown") errors.push(response.params.exceptionDetails.exception?.description || "Browser exception");
    const entry = pending.get(response.id); if (entry) { pending.delete(response.id); clearTimeout(entry.timer); response.error ? entry.reject(new Error(response.error.message)) : entry.resolve(response.result); }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; const timer = setTimeout(() => reject(new Error(`Browser timeout: ${method}`)), 10_000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  return { command, errors, close: () => socket.close(), async evaluate(expression) { const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || "Browser evaluation failed"); return result.result.value; } };
}
async function until(check) { for (let i = 0; i < 100; i++) { if (await check()) return; await delay(80); } throw new Error("Timed out waiting for component state"); }
test("actual Chromium chat component: history, plain text, retries, drafts, scroll, mobile and Phaser focus", { timeout: 60_000, skip: !browser }, async () => {
  const js = await bundleFixture();
  const staticDir = resolve(web, ".next/static");
  const css = readdirSync(staticDir, { recursive: true }).filter((name) => name.endsWith(".css")).map((name) => readFileSync(resolve(staticDir, name), "utf8")).join("\n");
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/fixture.js") { res.setHeader("Content-Type", "text/javascript"); res.end(js); }
    else if (path.startsWith("/office/") && ["studio.json", "avatar.png", "office-tiles.png"].includes(path.slice(8))) { res.setHeader("Content-Type", path.endsWith("png") ? "image/png" : "application/json"); res.end(readFileSync(resolve(web, "public", path.slice(1)))); }
    else { res.setHeader("Content-Type", "text/html"); res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated chat component test</title><style>${css}</style><div id="root"></div><script type="module" src="/fixture.js"></script></html>`); }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const cache = resolve(root, ".cache"); mkdirSync(cache, { recursive: true }); const profile = mkdtempSync(resolve(cache, "chat-browser-"));
  const child = spawn(browser, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--window-size=1280,1024", "about:blank"], { stdio: "ignore", windowsHide: true });
  let browserTools;
  try {
    await until(() => existsSync(resolve(profile, "DevToolsActivePort")));
    const port = readFileSync(resolve(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); browserTools = await devtools(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
    const { command, evaluate } = browserTools;
    await command("Page.enable"); await command("Runtime.enable"); await command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}` });
    await until(() => evaluate("window.chatFixture?.engineReady || window.chatFixture?.engineError")); assert.equal(await evaluate("chatFixture.engineError===true"), false);
    const measureFrames = () => evaluate(`(async()=>{const game=chatFixture.game.game;let frames=0;const tick=()=>frames++;game.events.on('poststep',tick);const began=performance.now();await new Promise(r=>setTimeout(r,1200));const seconds=(performance.now()-began)/1000;game.events.off('poststep',tick);return{frames,seconds,fps:Math.round(frames/seconds*10)/10}})()`);
    const closedPanelFrames = await measureFrames();
    await evaluate("document.getElementById('toggle-chat').click()");
    await until(() => evaluate("document.querySelectorAll('#office-chat li').length===30"));
    assert.equal(await evaluate("document.querySelector('#office-chat ol img')===null && window.injected!==true"), true, "HTML-like messages remain text");
    assert.equal(await evaluate("document.activeElement.id"), "office-chat-draft");
    const counts = () => evaluate("document.querySelectorAll('#office-chat li').length");
    await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop=20;document.querySelector('[aria-label=\"Chat messages\"]').dispatchEvent(new Event('scroll'))");
    const scrollBefore = await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop");
    await evaluate("chatFixture.commit({id:'00000000-0000-4000-8000-000000000800',body:'New remote message'},'00000000-0000-4000-8000-000000000002')"); await delay(100);
    assert.equal(await counts(), 30); assert.equal(await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop"), scrollBefore, "Reading older messages is not interrupted");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Show latest messages').click()");
    await until(() => evaluate("document.querySelector('#office-chat ol').textContent.includes('New remote message')"));
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Load older messages').click()");
    await until(async () => await counts() === 60);
    assert.equal(await evaluate("(()=>{const ids=[...document.querySelectorAll('#office-chat li')].map(n=>BigInt(n.dataset.messageId));return ids.every((id,i)=>!i||id>ids[i-1])})()"), true);
    const input = async (text) => { await evaluate("document.getElementById('office-chat-draft').focus();document.getElementById('office-chat-draft').select()"); await command("Input.insertText", { text }); };
    await evaluate("document.querySelector('[aria-label=\"Chat messages\"]').scrollTop=999999;document.querySelector('[aria-label=\"Chat messages\"]').dispatchEvent(new Event('scroll'))");
    const enter = async () => { await command("Input.dispatchKeyEvent", { type: "keyDown", code: "Enter", key: "Enter" }); await command("Input.dispatchKeyEvent", { type: "keyUp", code: "Enter", key: "Enter" }); };
    const playerX = await evaluate("chatFixture.game.game.scene.getScene('Office').player.x");
    await input("Line one"); await command("Input.dispatchKeyEvent", { type: "keyDown", code: "Enter", key: "Enter", modifiers: 8, text: "\r" }); await command("Input.dispatchKeyEvent", { type: "keyUp", code: "Enter", key: "Enter" });
    assert.equal(await evaluate("document.getElementById('office-chat-draft').value.includes('\\n') && chatFixture.sent.length===0"), true, "Shift+Enter inserts a line break without sending");
    await command("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyD", key: "d", text: "d" }); await delay(180); await command("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyD", key: "d" });
    await input("A draft kept across reconnect"); await enter(); await until(() => evaluate("chatFixture.sent.length===1"));
    assert.equal(await evaluate("document.getElementById('office-chat-draft').value"), "A draft kept across reconnect");
    assert.equal(await evaluate("document.querySelector('#office-chat ol').textContent.includes('A draft kept across reconnect')"), false, "Unconfirmed sends are not displayed as committed");
    await evaluate("chatFixture.events.emit({type:'connection',online:false})"); await delay(80);
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Send message').disabled"), true);
    await evaluate("chatFixture.events.emit({type:'connection',online:true})"); await delay(120); await input("A draft kept across reconnect"); await enter();
    await until(() => evaluate("chatFixture.sent.length===2")); assert.equal(await evaluate("chatFixture.sent[0].id===chatFixture.sent[1].id"), true, "Uncertain retries retain idempotency key");
    const renderStart = Date.now(); await evaluate("chatFixture.commit(chatFixture.sent[0])");
    await until(() => evaluate("document.getElementById('office-chat-draft').value===''") ); const fixtureChatRenderMs = Date.now()-renderStart;
    await evaluate("chatFixture.commit(chatFixture.sent[0])"); await delay(80);
    assert.equal(await evaluate("[...document.querySelectorAll('#office-chat li p')].filter(n=>n.textContent==='A draft kept across reconnect').length"), 1, "History/live/retry duplicates reconcile");
    assert.equal(await evaluate("chatFixture.game.game.scene.getScene('Office').player.x"), playerX, "Typing in chat never moves the Phaser avatar");
    const requests = await evaluate("chatFixture.requests");
    await evaluate("chatFixture.setPeople([{sessionId:'self',displayName:'Taylor',avatarKey:'fern',connected:true,availability:'DO_NOT_DISTURB'}])"); await delay(100);
    assert.equal(await evaluate("chatFixture.requests"), requests, "Presence changes do not reload history");
    assert.equal(await evaluate("document.querySelectorAll('canvas').length"), 1);
    const openPanelFrames = await measureFrames();
    const desktop = await command("Page.captureScreenshot", { format: "png" }); writeFileSync(resolve(cache, "chat-preview-desktop.png"), Buffer.from(desktop.data, "base64"));
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(150);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.office-world')).display"), "none");
    assert.equal(await evaluate("document.documentElement.scrollWidth<=390 && document.getElementById('office-chat').getBoundingClientRect().width<=390"), true, "Dedicated mobile chat has no horizontal overflow");
    await input("Draft while panel is closed"); await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Close chat').click()");
    assert.equal(await evaluate("document.activeElement.id"), "toggle-chat"); await evaluate("document.getElementById('toggle-chat').click()"); await delay(100);
    assert.equal(await evaluate("document.getElementById('office-chat-draft').value"), "Draft while panel is closed");
    const mobile = await command("Page.captureScreenshot", { format: "png" }); writeFileSync(resolve(cache, "chat-preview-mobile.png"), Buffer.from(mobile.data, "base64"));
    await evaluate("chatFixture.setOffice('00000000-0000-4000-8000-000000000200')");
    await until(() => evaluate("document.querySelectorAll('#office-chat li').length===0 && document.getElementById('office-chat-draft').value===''") );
    assert.equal(await evaluate("document.querySelector('#office-chat').textContent.includes('A draft kept across reconnect')"), false, "Switching offices clears the previous tenant's chat window and draft");
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Close chat').click()");
    await until(() => evaluate("getComputedStyle(document.querySelector('.office-world')).display!=='none'"));
    await evaluate("document.getElementById('world').focus()"); await delay(120);
    const beforeMove = await evaluate("chatFixture.game.game.scene.getScene('Office').player.y");
    await command("Input.dispatchKeyEvent", { type: "keyDown", code: "KeyW", key: "w" }); await delay(220); await command("Input.dispatchKeyEvent", { type: "keyUp", code: "KeyW", key: "w" });
    assert.ok(await evaluate("chatFixture.game.game.scene.getScene('Office').player.y") < beforeMove, "Office movement remains responsive after chat closes");
    assert.deepEqual(browserTools.errors, []);
    console.info(JSON.stringify({ scope: "isolated actual React/Phaser component, synthetic chat history and commits; no live Auth", fixtureChatRenderMs, closedPanelFrames, openPanelFrames, renderer: "SwiftShader software WebGL", messagesInitially: 30, paginationPassed: true, mobileWidth: 390, screenshots: [".cache/chat-preview-desktop.png", ".cache/chat-preview-mobile.png"] }));
    await evaluate("chatFixture.unmount()");
  } finally {
    const exited = child.exitCode !== null ? Promise.resolve() : new Promise((done) => child.once("exit", done));
    if (browserTools) try { await Promise.race([browserTools.command("Browser.close"), delay(1500)]); } catch { /* own isolated browser may already have exited */ }
    browserTools?.close(); if (child.exitCode === null) child.kill(); await Promise.race([exited, delay(2000)]); server.close(); await delay(400);
    if (resolve(profile).startsWith(cache+sep+"chat-browser-")) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
