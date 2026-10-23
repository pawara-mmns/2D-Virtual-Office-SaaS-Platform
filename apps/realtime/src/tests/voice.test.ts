import assert from "node:assert/strict";
import { test } from "node:test";
import { RoomServiceClient,TokenVerifier } from "livekit-server-sdk";
import { voiceConfig,livekitProvider,type VoiceProvider } from "../voice/provider.ts";
import { createVoiceService,VoiceError,type VoiceDiagnostic } from "../voice/service.ts";
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

test("one or two valid voice participants survive repeated independent lease renewals and inventory sweeps", async (context) => {
  context.mock.timers.enable({apis:["setInterval"]});
  for (const count of [1,2]) {
    const f=fixture(), events:VoiceDiagnostic[]=[]; let time=100_000;
    const service=createVoiceService(async(token)=>({...auth(time),userId:token==="second-fixture"?uuid(4):uuid(1),token:String(token)}),f.provider,()=>time,event=>events.push(event));
    try {
      await service.poll();
      for(let index=0;index<count;index++) {
        const who={...auth(time),userId:index?uuid(4):uuid(1),token:index?"second-fixture":"synthetic-supabase-proof"};
        service.observe(`session_${index}`,who,"Meeting Room",()=>{}); await service.join(who,`session_${index}`);
        f.members.add(f.issued.at(-1)!);
      }
      for(let cycle=0;cycle<8;cycle++) {
        time+=2000;context.mock.timers.tick(2000);await new Promise(resolve=>setImmediate(resolve));
        await service.poll();service.check();await new Promise(resolve=>setImmediate(resolve));
        assert.equal(f.removed.length,0); assert.equal(f.members.size,count);
      }
      assert.equal(events.filter(event=>event.event==="authorization_renewed").length,8*count);
      assert.equal(events.filter(event=>event.event==="admission_issued").length,count);
      assert.doesNotMatch(JSON.stringify(events),/synthetic-supabase-proof|second-fixture|Test member/);
    } finally {await service.close();}
  }
});

test("inventory lease expiry shares one removal with the lease timer, preserves its reason and releases admission", async () => {
  const f=fixture(),events:VoiceDiagnostic[]=[];let time=100_000,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),remove=f.provider.remove;
  f.provider.remove=async(...args)=>{await gate;await remove(...args);};
  const service=createVoiceService(async()=>auth(time),f.provider,()=>time,event=>events.push(event));
  try {
    await service.poll();service.observe("session_A",auth(time),"Meeting Room",()=>{});await service.join(auth(time),"session_A");f.members.add(f.issued[0]!);
    time+=VOICE_LEASE_MS+1;const polling=service.poll();await new Promise(resolve=>setImmediate(resolve));service.check();
    release();await polling;
    assert.equal(f.removed.length,1,"Inventory and timer must not issue concurrent duplicate Cloud removals");
    assert.equal(events.find(event=>event.event==="removal_requested")?.reason,"lease_expired");
    await service.join(auth(time),"session_A");assert.equal(f.issued.length,2,"Completed removal releases the old local admission");
  } finally {release();await service.close();}
});

test("a competing authority reproduces orphan removal and emits a distinct authority and opaque participant correlation", async () => {
  const f=fixture(),events:VoiceDiagnostic[]=[];
  const a=createVoiceService(async()=>auth(),f.provider,Date.now,event=>events.push(event));
  let b:ReturnType<typeof createVoiceService>|undefined;
  try {
    await a.poll();a.observe("session_A",auth(),"Meeting Room",()=>{});await a.join(auth(),"session_A");f.members.add(f.issued[0]!);
    b=createVoiceService(async()=>auth(),f.provider,Date.now,event=>events.push(event));await b.poll();
    assert.equal(f.members.size,0,"One participant is sufficient to reproduce conflicting inventory authorities");
    const admission=events.find(event=>event.event==="admission_issued")!,orphan=events.find(event=>event.event==="orphan_removal_completed")!;
    assert.equal(orphan.participantId,admission.participantId);assert.notEqual(orphan.authorityId,admission.authorityId);
    assert.equal(orphan.reason,"unknown_admission");
  } finally {await b?.close();await a.close();}
});
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

test("development and test authorities cannot sweep production rooms even with identical Cloud credentials", async (context) => {
  const env={LIVEKIT_URL:config.url,LIVEKIT_API_KEY:config.key,LIVEKIT_API_SECRET:config.secret};
  const production=livekitProvider(voiceConfig({...env,NODE_ENV:"production"})!);
  const development=livekitProvider(voiceConfig({...env,NODE_ENV:"development"})!);
  const testing=livekitProvider(voiceConfig({...env,NODE_ENV:"test"})!);
  const original=livekitProvider(config);
  assert.equal(production.prefix,original.prefix,"Existing production room names are stable");
  const rooms=[production.room(auth()),development.room(auth()),testing.room(auth())];
  assert.equal(new Set(rooms).size,3);
  context.mock.method(RoomServiceClient.prototype,"listRooms",async()=>rooms.map(name=>({name})) as Awaited<ReturnType<RoomServiceClient["listRooms"]>>);
  for(const [index,provider] of [production,development,testing].entries()) {
    assert.deepEqual(await provider.rooms(),[rooms[index]],"The provider's actual inventory excludes another environment's rooms");
    const claims=await new TokenVerifier(config.key,config.secret).verify(await provider.token(auth(),rooms[index]!,uuid(8)));
    assert.equal(claims.video?.room,rooms[index]);assert.equal(claims.video?.roomJoin,true);
    assert.equal(claims.video?.roomAdmin,false);assert.equal(claims.video?.canPublishData,false);
  }
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

test("voice readiness requires recent successful Cloud control observations and stops at shutdown", async () => {
  const f=fixture(); let time=100_000, fail=false;
  f.provider.rooms=async()=>{if(fail)throw new Error("private Cloud failure");return[];};
  const service=createVoiceService(async()=>auth(time),f.provider,()=>time);
  const absent=createVoiceService(async()=>auth(time),null,()=>time);
  try {
    assert.equal(service.available(),false,"Startup sweep must finish first"); assert.equal(absent.available(),false);
    await service.poll(); assert.equal(service.available(),true);
    time+=6001; assert.equal(service.available(),false,"A stalled old successful sweep is not readiness");
    await service.poll(); assert.equal(service.available(),true);
    fail=true; await service.poll(); assert.equal(service.available(),false);
    fail=false; await service.poll(); assert.equal(service.available(),true);
    await service.close(); assert.equal(service.available(),false);
  } finally {await service.close();await absent.close();}
});

test("a closed voice authority cannot resume an in-flight orphan sweep against a replacement authority", async () => {
  for (const stage of ["rooms", "participants"] as const) {
    const f=fixture(); let release!:()=>void, participantReads=0;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    f.provider.rooms=async()=>{if(stage==="rooms")await gate;return["replacement-room"];};
    f.provider.participants=async()=>{participantReads++;if(stage==="participants")await gate;return["replacement-participant"];};
    const service=createVoiceService(async()=>auth(),f.provider);
    const polling=service.poll();
    try {
      await new Promise(resolve=>setImmediate(resolve));
      await service.close(); release(); await polling;
      assert.equal(f.removed.length,0,"A late inventory response must not remove the next authority's media");
      assert.equal(participantReads,stage==="rooms"?0:1,"No new participant inventory after shutdown");
    } finally {release();await polling;await service.close();}
  }
});

test("a slow token signer cannot return an admission after its verified authorization lease expires", async () => {
  const f=fixture(); let time=100_000;
  f.provider.token=async()=>{time+=VOICE_LEASE_MS+1;return"late-synthetic-admission";};
  const service=createVoiceService(async()=>auth(time),f.provider,()=>time);
  try {
    await service.poll();service.observe("session_A",auth(time),"Meeting Room",()=>{});
    await assert.rejects(()=>service.join(auth(time),"session_A"),error=>error instanceof VoiceError&&error.status===403);
    assert.equal(f.removed.length,1);
  } finally {await service.close();}
});

test("overlapping shutdown requests both wait for the same in-flight media removal", async () => {
  const f=fixture();let release!:()=>void,removals=0,secondFinished=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  f.provider.remove=async()=>{removals++;await gate;};
  const service=createVoiceService(async()=>auth(),f.provider);
  try {
    await service.poll();service.observe("session_A",auth(),"Meeting Room",()=>{});await service.join(auth(),"session_A");
    const first=service.close(),second=service.close().then(()=>{secondFinished=true;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(secondFinished,false,"A second shutdown cannot complete while the first still removes media");
    release();await Promise.all([first,second]);assert.equal(removals,1);
  } finally {release();await service.close();}
});

test("shutdown also awaits a zone-exit removal that was already running", async () => {
  const f=fixture();let release!:()=>void,removals=0,finished=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  f.provider.remove=async()=>{removals++;await gate;};
  const service=createVoiceService(async()=>auth(),f.provider);
  try {
    await service.poll();service.observe("session_A",auth(),"Meeting Room",()=>{});await service.join(auth(),"session_A");
    service.observe("session_A",auth(),null,()=>{});await new Promise(resolve=>setImmediate(resolve));
    const closing=service.close().then(()=>{finished=true;});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(finished,false,"An existing revocation request belongs to shutdown cleanup too");
    release();await closing;assert.equal(removals,1);
  } finally {release();await service.close();}
});
