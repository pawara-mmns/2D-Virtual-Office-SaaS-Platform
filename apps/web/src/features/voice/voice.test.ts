import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { meetingZone, validVoiceRequest } from "../../../../../packages/shared/src/voice.ts";
import { validateOfficeMap } from "../../../../../packages/shared/src/map.ts";
import { issueVoiceToken } from "./token-service.ts";
import { createVoiceMount, startVoice, voiceError, type Capture, type VoiceStage } from "./lifecycle.ts";
const officeId = "00000000-0000-4000-8000-000000000001", userId = "00000000-0000-4000-8000-000000000002";
const input = { officeId, sessionId:"session_123" };

test("voice zone follows the canonical Tiled rectangle and whole collision footprint, not an area label", () => {
  const map = validateOfficeMap(JSON.parse(readFileSync(new URL("../../../public/office/studio.json",import.meta.url),"utf8")));
  assert.equal(meetingZone(map,928,320),"Meeting Room");
  for (const [x,y] of [[760,320],[775,370],[1114,320],[928,16],[592,774],[NaN,320]]) assert.equal(meetingZone(map,x!,y!),null);
  const withoutZones = { ...map,layers:map.layers.filter((layer) => layer.name!=="VoiceZones") };
  assert.equal(meetingZone(withoutZones,928,320),null);
  assert.equal(validVoiceRequest(input),true);
  for (const extra of [{ x:928 },{ zone:"Meeting Room" },{ eligible:true },{ userId }]) assert.equal(validVoiceRequest({ ...input,...extra }),false);
});
test("web token boundary independently verifies identity and forwards only office/session plus bearer to the trusted server", async () => {
  let calls = 0;
  const dependencies = {
    async user() { return { status:"authenticated",user:{ id:userId,email:"fixture@example.invalid" } } as const; },
    async session() { return { userId,token:"synthetic-session-proof" }; },
    async forward(token: string, body: typeof input) { calls++; assert.equal(token,"synthetic-session-proof"); assert.deepEqual(body,input); return { status:200,data:{ url:"wss://voice-fixture.livekit.cloud",token:"signed-fixture",secret:"must-not-forward" } }; },
  };
  assert.deepEqual(await issueVoiceToken(input,dependencies),{ status:200,data:{url:"wss://voice-fixture.livekit.cloud",token:"signed-fixture"} });
  assert.equal(calls,1);
  for (const status of ["anonymous","unverified","unavailable"] as const) {
    assert.notEqual((await issueVoiceToken(input,{ ...dependencies,user:async () => ({status}) })).status,200);
  }
  assert.equal((await issueVoiceToken(input,{ ...dependencies,session:async () => ({userId:officeId,token:"wrong"}) })).status,401);
  assert.equal((await issueVoiceToken({ ...input,eligible:true },dependencies)).status,400);
  assert.equal(calls,1);
  for (const status of [403,409,429,503]) assert.equal((await issueVoiceToken(input,{ ...dependencies,forward:async () => ({status,data:{error:"raw provider detail"}}) })).status,status);
  assert.equal((await issueVoiceToken(input,{ ...dependencies,forward:async () => ({status:200,data:{url:"https://untrusted.example",token:"fixture"}}) })).status,503);
});
test("an Auth outage reports temporary unavailability without suggesting a credential failure or forwarding a token", async () => {
  const result=await issueVoiceToken(input,{
    user:async()=>({status:"unavailable"}),session:async()=>assert.fail("No session lookup after unavailable Auth"),
    forward:async()=>assert.fail("No voice admission during an Auth outage"),
  });
  assert.equal(result.status,503);assert.match(result.data.error!,/Authentication is temporarily unavailable/);
  assert.equal("token" in result.data,false);
});
test("voice lifecycle captures microphone only after explicit start and releases it on normal leave", async () => {
  const events: string[] = [];
  const lifecycle = startVoice({
    async capture() { events.push("capture"); return {stop(){events.push("stop-track");}}; },
    async connect() { events.push("connect"); }, async publish() { events.push("publish"); },async disconnect() { events.push("disconnect"); },
  },() => events.push("ready"),() => assert.fail("Unexpected failure"));
  await lifecycle.operation;
  assert.deepEqual(events,["capture","connect","publish","ready"]);
  lifecycle.stop(); lifecycle.stop();
  assert.deepEqual(events.slice(4),["stop-track","disconnect"]);
});
test("late microphone permission, in-flight connection and publication cannot survive zone/office exit", async () => {
  for (const stage of ["capture","connect","publish"] as const) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {release=resolve;});
    let stopped = 0, disconnected = 0, published = 0, ready = 0;
    const track: Capture = {stop(){stopped++;}};
    const lifecycle = startVoice({
      async capture() { if (stage==="capture") await gate; return track; },
      async connect() { if (stage==="connect") await gate; },
      async publish() { published++; if (stage==="publish") await gate; },
      async disconnect() {disconnected++;},
    },() => ready++,() => assert.fail("Cancellation is not a failure"));
    await new Promise((resolve) => setImmediate(resolve)); lifecycle.stop(); release(); await lifecycle.operation;
    assert.equal(ready,0); assert.ok(stopped>=1); assert.ok(disconnected>=1);
    if (stage!=="publish") assert.equal(published,0);
  }
});
test("microphone denial, absent devices, provider failure and timeout report fixed errors and clean media", async () => {
  for (const name of ["NotAllowedError","NotFoundError","NotReadableError","ProviderError"]) {
    let message = "", disconnected = 0;
    const lifecycle = startVoice({ async capture(){throw {name,message:"sensitive provider content"};},async connect(){assert.fail();},async publish(){assert.fail();},async disconnect(){disconnected++;} },() => assert.fail(),(value) => {message=value;});
    await lifecycle.operation; assert.equal(disconnected,1); assert.equal(message,voiceError({name})); assert.equal(message.includes("sensitive"),false);
  }
});
test("permission time is not a network timeout and each network failure identifies its actual stage", async () => {
  let permit!: (track: Capture) => void, message="", stopped=false;
  const pending=startVoice({capture:()=>new Promise((resolve)=>{permit=resolve;}),async connect(){assert.fail();},async publish(){assert.fail();},async disconnect(){}},()=>assert.fail(),value=>{message=value;},5);
  await new Promise((resolve)=>setTimeout(resolve,15)); assert.equal(message,"");
  await pending.stop();permit({stop(){stopped=true;}});await pending.operation;assert.equal(stopped,true);
  for(const stage of ["signaling","media","publication"] as const){
    let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});const stages:VoiceStage[]=[];let failed="",released=false;
    const lifecycle=startVoice({async capture(){return{stop(){released=true;}};},async connect(signal){if(stage!=="signaling")signal();if(stage!=="publication")await gate;},async publish(){if(stage==="publication")await gate;},async disconnect(){}},()=>assert.fail(),value=>{failed=value;},{timeoutMs:5,onStage:next=>stages.push(next)});
    await new Promise((resolve)=>setTimeout(resolve,15));finish();await lifecycle.operation;
    assert.equal(released,true);assert.equal(stages.at(-1),stage);assert.match(failed,stage==="signaling"?/signaling timed out/:stage==="media"?/WebRTC media establishment timed out/:/publication timed out/);
  }
  assert.match(voiceError({name:"ConnectionError",reason:0,status:401},"signaling"),/rejected voice authorization/);
  assert.match(voiceError({name:"ConnectionError",reason:1},"signaling"),/signaling could not connect/);
});
test("Strict Mode effect replay cancels discarded capture and serializes Room disconnect before restarting", async () => {
  const mount=createVoiceMount();let captures=0,disconnects=0;let release!:()=>void;
  const start=()=>startVoice({async capture(){captures++;return{stop(){}};},async connect(){},async publish(){},disconnect(){disconnects++;return new Promise<void>(resolve=>{release=resolve;});}},()=>{},()=>assert.fail());
  const discarded=mount(start);const discardedClose=discarded.dispose();const active=mount(start);
  await discardedClose;await new Promise(resolve=>setImmediate(resolve));assert.equal(captures,1,"Strict Mode's discarded setup never captures");
  const closed=active.dispose();assert.equal(disconnects,1);
  const replacement=mount(()=>startVoice({async capture(){captures++;return{stop(){}};},async connect(){},async publish(){},async disconnect(){}},()=>{},()=>assert.fail()));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(captures,1,"Wait for real disconnect completion, not an arbitrary delay");
  release();await closed;await new Promise(resolve=>setImmediate(resolve));assert.equal(captures,2);await replacement.dispose();
});
