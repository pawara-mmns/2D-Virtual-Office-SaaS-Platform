import assert from "node:assert/strict";
import { test } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";
import { voiceConfig,livekitProvider,type VoiceProvider } from "../voice/provider.ts";
import { createVoiceService,VoiceError } from "../voice/service.ts";
import { AccessDenied,type Authorization } from "../auth/authorize.ts";
import { VOICE_LEASE_MS,VOICE_TOKEN_SECONDS,type VoiceZoneState } from "../../../../packages/shared/src/voice.ts";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function auth(now=Date.now()): Authorization { return {userId:uuid(1),organizationId:uuid(2),officeId:uuid(3),token:"synthetic-supabase-proof",expiresAt:now+60_000,checkedAt:now,displayName:"Test member",avatarKey:"slate"}; }
const config = {url:"wss://voice-fixture.livekit.cloud",key:"fixture-api-key",secret:"synthetic-voice-secret-for-offline-signature-tests"};
function fixture() {
  const removed: {room:string;identity:string;cutoff:bigint}[] = [], issued: string[] = [], members = new Set<string>();
  const provider: VoiceProvider = {url:config.url,prefix:"fixture_",room:(who)=>`fixture_${who.officeId}`,
    async token(_auth,_room,identity){issued.push(identity);return "synthetic-join-token";},async rooms(){return [`fixture_${uuid(3)}`];},async participants(){return [...members];},
    async remove(room,identity,cutoff){removed.push({room,identity,cutoff});members.delete(identity);},
  };
  return {provider,removed,issued,members};
}
test("LiveKit configuration is optional, server-only and Cloud-only; malformed partial configuration fails closed", () => {
  assert.equal(voiceConfig({}),null);
  for (const env of [{LIVEKIT_URL:config.url},{LIVEKIT_API_KEY:"fixture"},{LIVEKIT_API_SECRET:"fixture"}]) assert.throws(()=>voiceConfig(env));
  for (const url of ["ws://localhost:7880","https://untrusted.example","wss://livekit.cloud.untrusted.example","wss://voice.livekit.cloud/path","wss://a:b@voice.livekit.cloud"]) assert.throws(()=>voiceConfig({LIVEKIT_URL:url,LIVEKIT_API_KEY:config.key,LIVEKIT_API_SECRET:config.secret}));
  assert.deepEqual(voiceConfig({LIVEKIT_URL:config.url,LIVEKIT_API_KEY:config.key,LIVEKIT_API_SECRET:config.secret}),config);
});
test("official SDK signs short room-scoped microphone-only grants with opaque tenant room/participant identity", async () => {
  const provider = livekitProvider(config), who=auth();
  const room=provider.room(who), identity=uuid(8);
  assert.equal(room.includes(who.userId),false); assert.equal(room.includes(who.organizationId),false); assert.equal(room.includes(who.officeId),false);
  assert.notEqual(provider.room({...who,organizationId:uuid(4)}),room); assert.notEqual(provider.room({...who,officeId:uuid(5)}),room);
  const claims = await new TokenVerifier(config.key,config.secret).verify(await provider.token(who,room,identity));
  assert.equal(claims.sub,identity); assert.equal(claims.video?.room,room); assert.equal(claims.video?.roomJoin,true);
  assert.equal(claims.video?.canSubscribe,true); assert.equal(claims.video?.canPublish,true);
  assert.deepEqual(claims.video?.canPublishSources,["microphone"]);
  for (const field of ["canPublishData","canUpdateOwnMetadata","roomAdmin","roomCreate","roomList","roomRecord"] as const) assert.equal(claims.video?.[field],false);
  const decoded=JSON.parse(Buffer.from((await provider.token(who,room,identity)).split(".")[1]!,"base64url").toString());
  assert.ok(decoded.exp-decoded.nbf <= VOICE_TOKEN_SECONDS); assert.equal(claims.name,"Test member");
  assert.deepEqual(JSON.parse(claims.metadata!),{avatarKey:"slate"}); assert.equal(JSON.stringify(claims).includes(config.secret),false);
});
test("admission requires the matching connected verified session in the authoritative zone and prevents duplicate/simultaneous rooms", async () => {
  const f=fixture(), who=auth();
  const service=createVoiceService(async()=>who,f.provider), notices:VoiceZoneState[]=[];
  try {
    await service.poll();
    await assert.rejects(()=>service.join(who,"session_A"),(error:unknown)=>error instanceof VoiceError && error.status===403);
    service.observe("session_A",who,null,(state)=>notices.push(state));
    await assert.rejects(()=>service.join(who,"session_A"),(error:unknown)=>error instanceof VoiceError && error.status===403);
    service.observe("session_A",who,"Meeting Room",(state)=>notices.push(state));
    for (const changed of [{userId:uuid(9)},{organizationId:uuid(9)},{officeId:uuid(9)},{expiresAt:Date.now()-1}]) await assert.rejects(()=>service.join({...who,...changed},"session_A"));
    const results=await Promise.allSettled([service.join(who,"session_A"),service.join(who,"session_A")]);
    assert.equal(results.filter((result)=>result.status==="fulfilled").length,1); assert.equal(f.issued.length,1);
    const before=notices.length; service.observe("session_A",who,"Meeting Room",(state)=>notices.push(state)); assert.equal(notices.length,before,"No React-facing event on movement-only ticks");
    await service.cancel({...who,userId:uuid(9)},"session_A"); assert.equal(f.removed.length,0,"Another user cannot cancel the authorized session");
    assert.equal(notices.at(-1)!.participants,0,"Office presence is not voice presence");
    f.members.add(f.issued[0]!); await service.poll(); assert.equal(notices.at(-1)!.participants,1);
    service.observe("session_other",{...who,officeId:uuid(7)},"Meeting Room",()=>{});
    await assert.rejects(()=>service.join({...who,officeId:uuid(7)},"session_other"),(error:unknown)=>error instanceof VoiceError && error.status===409);
  } finally {await service.close();}
});
test("a cancellation invalidates authorization already in flight and a late signer cannot restore a cancelled admission", async () => {
  const f=fixture(), who=auth();
  const service=createVoiceService(async()=>who,f.provider);
  try {
    await service.poll(); service.observe("session_A",who,"Meeting Room",()=>{});
    const version=service.checkpoint("session_A");
    await service.revoke("session_A");
    await assert.rejects(()=>service.join(who,"session_A",version)); assert.equal(f.issued.length,0);
    let finish!: (value:string)=>void;
    f.provider.token=()=>new Promise((resolve)=>{finish=resolve;});
    const pending=service.join(who,"session_A");
    const denied=assert.rejects(()=>pending);
    await service.revoke("session_A"); finish("late-synthetic-token"); await denied;
  } finally {await service.close();}
});
test("zone exit, explicit leave and multiplayer disconnect remove media with an explicit cutoff; rejoin gets a new identity", async () => {
  const f=fixture(); let time=100_000;
  const service=createVoiceService(async()=>auth(time),f.provider,()=>time);
  try {
    await service.poll();
    for (const action of ["zone","leave","drop"] as const) {
      service.observe("session_A",auth(time),"Meeting Room",()=>{}); await service.join(auth(time),"session_A");
      const identity=f.issued.at(-1)!;
      if (action==="zone") service.observe("session_A",auth(time),null,()=>{});
      else if (action==="leave") await service.revoke("session_A");
      else service.leave("session_A");
      await new Promise((resolve)=>setImmediate(resolve));
      assert.equal(f.removed.at(-1)!.identity,identity); assert.ok(f.removed.at(-1)!.cutoff>BigInt(time/1000));
      time+=3000;
    }
    assert.equal(new Set(f.issued).size,3,"No old identity is reused after revocation");
  } finally {await service.close();}
});
test("expired authorization lease revokes even if refresh is stalled; revoked users cannot listen indefinitely when provider responds", async () => {
  const f=fixture(); let time=100_000;
  const service=createVoiceService(async()=>new Promise<Authorization>(()=>{}),f.provider,()=>time);
  try {
    await service.poll(); service.observe("session_A",auth(time),"Meeting Room",()=>{}); await service.join(auth(time),"session_A");
    time+=VOICE_LEASE_MS+1; service.check(); await new Promise((resolve)=>setImmediate(resolve));
    assert.equal(f.removed.length,1); assert.ok(f.removed[0]!.cutoff>BigInt(Math.floor(time/1000)));
  } finally {await service.close();}
});
test("periodic independent membership authorization revokes removed users without a client leave", {timeout:5000}, async () => {
  const f=fixture(); let denied=false;
  const service=createVoiceService(async()=>{if(denied)throw new AccessDenied();return auth();},f.provider);
  try {
    await service.poll(); service.observe("session_A",auth(),"Meeting Room",()=>{}); await service.join(auth(),"session_A");
    denied=true; const start=Date.now();
    while(!f.removed.length && Date.now()-start<3500) await new Promise((resolve)=>setTimeout(resolve,20));
    assert.equal(f.removed.length,1); assert.ok(Date.now()-start<3500);
  } finally {await service.close();}
});
test("startup sweep removes orphaned media; provider failure pauses admissions and failed revocations retry", async () => {
  const f=fixture(); f.members.add("orphaned-admission");
  let fail=false;
  const remove=f.provider.remove;
  f.provider.remove=async(...args)=>{if(fail)throw new Error("suppressed provider detail");await remove(...args);};
  const service=createVoiceService(async()=>auth(),f.provider);
  try {
    await service.poll(); assert.equal(f.members.size,0); assert.equal(f.removed[0]!.identity,"orphaned-admission");
    service.observe("session_A",auth(),"Meeting Room",()=>{}); await service.join(auth(),"session_A");
    fail=true; await service.revoke("session_A");
    await assert.rejects(()=>service.join(auth(),"session_A"),(error:unknown)=>error instanceof VoiceError && error.status===503);
    fail=false; await service.revoke("session_A"); assert.equal(f.removed.length,2);
  } finally {await service.close();}
});
test("missing voice configuration is unavailable and does not mint any token", async () => {
  const service=createVoiceService(async()=>auth(),null);
  try {service.observe("session_A",auth(),"Meeting Room",()=>{});await assert.rejects(()=>service.join(auth(),"session_A"),(error:unknown)=>error instanceof VoiceError && error.status===503);}
  finally {await service.close();}
});
