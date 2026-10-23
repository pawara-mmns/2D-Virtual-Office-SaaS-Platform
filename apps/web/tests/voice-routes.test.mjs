// Production-route checks, no real account, microphone, media or provider writes.
import assert from "node:assert/strict";
import { before,after,test } from "node:test";
import { readFileSync,readdirSync } from "node:fs";
import { resolve } from "node:path";
import { startProductionApp } from "./helpers/production-app.mjs";
let app;
const previousOrigin=process.env.APP_URL;
before(async()=>{process.env.APP_URL="http://localhost:3000";app=await startProductionApp();},{timeout:15000});
after(()=>{app?.stop();if(previousOrigin===undefined)delete process.env.APP_URL;else process.env.APP_URL=previousOrigin;});
const body={officeId:"00000000-0000-4000-8000-000000000001",sessionId:"session_fixture"};
const request=(origin,payload=JSON.stringify(body),type="application/json")=>fetch(`${app.base}/api/v1/voice/token`,{method:"POST",headers:{...(origin?{Origin:origin}:{}),"Content-Type":type},body:payload,redirect:"manual"});
test("voice API rejects cross-origin and missing-origin requests without redirects or cached credentials",async()=>{
  for(const origin of [undefined,"https://untrusted.example"]){const response=await request(origin);assert.equal(response.status,403);assert.match(response.headers.get("cache-control"),/no-store/);assert.equal(response.headers.get("referrer-policy"),"no-referrer");const result=await response.json();assert.equal("token" in result,false);}
});
test("voice API rejects unsigned sessions, forged zone claims, malformed and oversized input",async()=>{
  // Fixed trusted origin is set only in this isolated child test process.
  const origin="http://localhost:3000";
  assert.equal((await request(origin)).status,401);
  assert.equal((await request(origin,JSON.stringify({...body,eligible:true,zone:"Meeting Room",x:928,y:320}))).status,400);
  assert.equal((await request(origin,"{")).status,400);
  assert.equal((await request(origin,"x".repeat(1025))).status,413);
  assert.equal((await request(origin,JSON.stringify(body),"text/plain")).status,415);
});
test("browser bundles exclude server LiveKit credentials and public initial scripts defer media SDK",async()=>{
  const directory=resolve(".next/static");
  const scripts=readdirSync(directory,{recursive:true}).filter((name)=>name.endsWith(".js"));
  assert.ok(scripts.length>0);
  for(const name of scripts){const source=readFileSync(resolve(directory,name),"utf8");assert.equal(source.includes("LIVEKIT_API_SECRET"),false,"Server secret environment reference reached browser bundle");assert.equal(source.includes("LIVEKIT_API_KEY"),false,"Server API key environment reference reached browser bundle");assert.equal(source.includes("revokeTokenTs"),false,"Server administrative SDK reached browser bundle");}
  for(const path of ["/","/login"]){const html=await(await fetch(app.base+path)).text();for(const match of html.matchAll(/<script[^>]+src="([^"]+\.js[^\"]*)"/g)){const source=await(await fetch(new URL(match[1],app.base))).text();assert.equal(source.includes("livekit-client")||source.includes("livekit-server-sdk"),false,"Initial public scripts should defer voice SDK");}}
});
