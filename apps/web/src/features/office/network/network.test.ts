import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { Client } from "@colyseus/sdk";
import type { VoiceZoneState } from "../../../../../../packages/shared/src/voice.ts";
import { connectOffice, realtimeUrl } from "./connection.ts";
import type { Presence } from "../../../../../../packages/shared/src/protocol.ts";
test("realtime endpoint accepts exact HTTP origins, requiring HTTPS in production", () => {
  assert.equal(realtimeUrl("http://localhost:2567", false), "http://localhost:2567");
  assert.equal(realtimeUrl("https://realtime.example.test", true), "https://realtime.example.test");
  for (const url of [undefined, "ws://localhost:2567", "http://localhost:2567/path", "http://name:password@localhost:2567", "https://realtime.example.test?token=bad"]) assert.throws(() => realtimeUrl(url, false));
  assert.throws(() => realtimeUrl("http://localhost:2567", true));
});
test("admission sends bearer only in headers, surfaces denial, and releases lifecycle timers", async () => {
  const original = globalThis.fetch;
  const states: Presence[] = [];
  globalThis.fetch = async (address, init) => {
    assert.equal(String(address), "http://localhost:2567/office/join");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-secret");
    assert.deepEqual(JSON.parse(String(init?.body)), { officeId: "office-fixture", mapVersion: "map-fixture" });
    assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store");
    return new Response("{}", { status: 403 });
  };
  const network = connectOffice({ url: "http://localhost:2567", officeId: "office-fixture", mapVersion: "map-fixture", getToken: async () => "fixture-secret", onPresence: (state) => states.push(state) });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(states.at(-1)?.status, "offline"); assert.equal(states.at(-1)?.count, 0);
    assert.match(states.at(-1)!.notice, /access denied/);
    assert.equal(network.snapshot(), undefined);
    assert.equal(network.sendChat?.("offline", "00000000-0000-4000-8000-000000000001"), false);
    assert.equal(network.setAvailability?.("BUSY"), false);
  } finally { network.close(); network.close(); globalThis.fetch = original; }
});
test("cancelled asynchronous startup never requests or mounts a stale room", async () => {
  const original = globalThis.fetch;
  let finish!: (token: string | null) => void, requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("{}"); };
  const network = connectOffice({ url: "http://localhost:2567", officeId: "office-fixture", mapVersion: "map-fixture", getToken: () => new Promise((resolve) => { finish = resolve; }), onPresence() {} });
  try { network.close(); finish("fixture-secret"); await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(requests, 0); }
  finally { network.close(); globalThis.fetch = original; }
});

test("repeated voice snapshots, reconnection and stale handlers do not duplicate subscriptions or React deliveries", async () => {
  const original=globalThis.fetch;
  const messages=new Map<string,((value:unknown)=>void)[]>(), events=new Map<string,()=>void>();
  const values:(VoiceZoneState|null)[]=[];
  const fake={sessionId:"session_fixture",connection:{transport:{isOpen:true,send(){},sendUnreliable(){},connect(){},close(){}},events:{}},reconnection:{},
    onStateChange(){},onMessage(type:string,callback:(value:unknown)=>void){messages.set(type,[...(messages.get(type)??[]),callback]);},
    onDrop(callback:()=>void){events.set("drop",callback);},onReconnect(callback:()=>void){events.set("reconnect",callback);},onLeave(callback:()=>void){events.set("leave",callback);},onError(callback:()=>void){events.set("error",callback);},
    send(){},async leave(){events.get("leave")?.();},removeAllListeners(){messages.clear();events.clear();},
  };
  const consume=mock.method(Client.prototype,"consumeSeatReservation",async()=>fake as unknown as Awaited<ReturnType<Client["consumeSeatReservation"]>>);
  globalThis.fetch=async()=>new Response("{}",{status:200});
  const network=connectOffice({url:"http://localhost:2567",officeId:"office-fixture",mapVersion:"map-fixture",getToken:async()=>"synthetic-proof",onPresence(){},onVoice:value=>values.push(value)});
  try {
    await new Promise(resolve=>setImmediate(resolve));
    const receive=messages.get("voice.state")?.[0];assert.ok(receive);assert.equal(messages.get("voice.state")!.length,1);
    const state:VoiceZoneState={sessionId:fake.sessionId,zone:"Meeting Room",configured:true,participants:1};
    for(let n=0;n<1000;n++)receive({...state});assert.equal(values.length,1);
    state.participants=2;receive(state);state.participants=3;assert.equal(values[1]!.participants,2,"Transport values are copied, not retained as mutable state");
    receive({...state,sessionId:"another_session"});receive({...state,participants:-1});assert.equal(values.length,2);
    events.get("drop")!();receive(state);assert.equal(values.at(-1),null);assert.equal(values.length,3);
    for(let n=0;n<10;n++)events.get("reconnect")!();assert.equal(messages.get("voice.state")!.length,1);
    receive(state);receive({...state});assert.equal(values.length,4);
    network.close();const before=values.length;receive({...state});assert.equal(values.length,before);assert.equal(messages.size,0);
  } finally {network.close();consume.mock.restore();globalThis.fetch=original;}
});
