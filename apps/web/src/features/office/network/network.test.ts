import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { Client } from "@colyseus/sdk";
import type { VoiceZoneState } from "../../../../../../packages/shared/src/voice.ts";
import { proximityDefaults, type ProximityState } from '../../../../../../packages/shared/src/proximity.ts';
import { connectOffice, realtimeUrl } from "./connection.ts";
import type { Presence, OfficeSnapshot, Participant } from "../../../../../../packages/shared/src/protocol.ts";
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
    assert.equal(states.at(-1)?.status, "denied"); assert.equal(states.at(-1)?.count, 0);
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

test("expired sessions and denied admission never start an automatic join retry", async () => {
  const original = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("{}", { status: 401 }); };
  try {
    for (const token of [null, "invalid-proof"]) {
      const states: Presence[] = [];
      const network = connectOffice({ url: "http://localhost:2567", officeId: "office-fixture", mapVersion: "map-fixture", getToken: async () => token, onPresence: value => states.push(value) });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(states.at(-1)?.status, "denied");
      assert.equal(network.snapshot(), undefined);
      assert.equal(network.sendChat?.("Denied", "00000000-0000-4000-8000-000000000001"), false);
      network.close();
    }
    assert.equal(requests, 1, "Missing credentials never call admission; an explicit denial makes one request");
  } finally { globalThis.fetch = original; }
});

test("repeated voice snapshots, reconnection and stale handlers do not duplicate subscriptions or React deliveries", async () => {
  const original=globalThis.fetch;
  const messages=new Map<string,((value:unknown)=>void)[]>(), events=new Map<string,()=>void>();
  const values:(VoiceZoneState|null)[]=[];
  const commands:{type:string;value:unknown}[]=[],proximityStates:(ProximityState|null)[]=[];
  const roster: Participant[][] = [];
  let stateChanged!: (state: OfficeSnapshot) => void;
  const fake={sessionId:"session_fixture",connection:{transport:{isOpen:true,send(){},sendUnreliable(){},connect(){},close(){}},events:{}},reconnection:{},
    onStateChange(callback: (state: OfficeSnapshot) => void){stateChanged = callback;},onMessage(type:string,callback:(value:unknown)=>void){messages.set(type,[...(messages.get(type)??[]),callback]);},
    onDrop(callback:()=>void){events.set("drop",callback);},onReconnect(callback:()=>void){events.set("reconnect",callback);},onLeave(callback:()=>void){events.set("leave",callback);},onError(callback:()=>void){events.set("error",callback);},
    send(type:string,value:unknown){commands.push({type,value});},async leave(){events.get("leave")?.();},removeAllListeners(){messages.clear();events.clear();},
  };
  const consume=mock.method(Client.prototype,"consumeSeatReservation",async()=>fake as unknown as Awaited<ReturnType<Client["consumeSeatReservation"]>>);
  globalThis.fetch=async()=>new Response("{}",{status:200});
  const network=connectOffice({url:"http://localhost:2567",officeId:"office-fixture",mapVersion:"map-fixture",getToken:async()=>"synthetic-proof",onPresence(){},onParticipants: value => roster.push(value),onVoice:value=>values.push(value),onProximity:value=>proximityStates.push(value)});
  try {
    await new Promise(resolve=>setImmediate(resolve));
    const receive=messages.get("voice.state")?.[0];assert.ok(receive);assert.equal(messages.get("voice.state")!.length,1);
    const snapshot: OfficeSnapshot = { officeId: "office-fixture", mapVersion: "map-fixture", players: new Map([[fake.sessionId, { sessionId: fake.sessionId, userId: "self", displayName: "Taylor", avatarKey: "fern", x: 100, y: 100, direction: "down", connected: true, isMoving: false }]]) };
    for (let n=0;n<1000;n++) { snapshot.players.get(fake.sessionId)!.x=n; stateChanged(snapshot); }
    assert.equal(roster.length, 1, "Movement patches must not update React participant state");
    snapshot.players.get(fake.sessionId)!.displayName="Alex Lee"; stateChanged(snapshot);
    assert.equal(roster.length, 2); assert.equal(roster[1]![0]!.displayName, "Alex Lee");
    const state:VoiceZoneState={sessionId:fake.sessionId,zone:"Meeting Room",configured:true,participants:1};
    const bubble={bubbleId:'00000000-0000-4000-8000-000000000010',generation:2,revision:3};
    assert.equal(network.lockBubble?.({...bubble,officeId:'ignored-extra'} as typeof bubble,true),true);
    assert.deepEqual(commands.at(-1),{type:'proximity.lock',value:{...bubble,locked:true}},'Full presentation objects must serialize only the authoritative command keys');
    assert.equal(network.enableProximity?.(true),true);assert.deepEqual(commands.at(-1),{type:'proximity.set',value:{enabled:true}});
    const proximity={officeId:'office-fixture',sessionId:fake.sessionId,eligible:true,audioAllowed:false,configured:true,bubbles:[],settings:proximityDefaults};
    messages.get('proximity.state')![0]!(proximity);assert.equal(network.proximity?.()?.eligible,true);
    messages.get('proximity.state')![0]!({...proximity,officeId:'other-tenant'});assert.equal(proximityStates.length,1);
    for(let n=0;n<1000;n++)receive({...state});assert.equal(values.length,1);
    state.participants=2;receive(state);state.participants=3;assert.equal(values[1]!.participants,2,"Transport values are copied, not retained as mutable state");
    receive({...state,sessionId:"another_session"});receive({...state,participants:-1});assert.equal(values.length,2);
    events.get("drop")!();receive(state);assert.equal(values.at(-1),null);assert.equal(values.length,3);
    assert.equal(network.proximity?.(),null);assert.equal(proximityStates.at(-1),null);assert.equal(network.enableProximity?.(true),false);
    for(let n=0;n<10;n++)events.get("reconnect")!();assert.equal(messages.get("voice.state")!.length,1);
    receive(state);receive({...state});assert.equal(values.length,4);
    network.close();const before=values.length;receive({...state});assert.equal(values.length,before);assert.equal(messages.size,0);
  } finally {network.close();consume.mock.restore();globalThis.fetch=original;}
});

test("late state patches cannot restore presence after a drop or final leave", async () => {
  const original=globalThis.fetch;
  const events=new Map<string,(code?:number)=>void>(), states:Presence[]=[], roster:Participant[][]=[];
  let changed!:(state:OfficeSnapshot)=>void;
  const fake={sessionId:"self",connection:{transport:{isOpen:true,send(){},sendUnreliable(){},connect(){},close(){}},events:{}},reconnection:{},
    onStateChange(callback:typeof changed){changed=callback;},onMessage(){},onDrop(callback:()=>void){events.set("drop",callback);},onReconnect(callback:()=>void){events.set("reconnect",callback);},onLeave(callback:(code:number)=>void){events.set("leave",callback as (code?:number)=>void);},onError(callback:(code:number)=>void){events.set("error",callback as (code?:number)=>void);},send(){},async leave(){},removeAllListeners(){},
  };
  const consume=mock.method(Client.prototype,"consumeSeatReservation",async()=>fake as unknown as Awaited<ReturnType<Client["consumeSeatReservation"]>>);
  globalThis.fetch=async()=>new Response("{}",{status:200});
  const network=connectOffice({url:"http://localhost:2567",officeId:"office",mapVersion:"map",getToken:async()=>"synthetic-proof",onPresence:value=>states.push(value),onParticipants:value=>roster.push(value)});
  try {
    await new Promise(resolve=>setImmediate(resolve));
    const player={sessionId:"self",userId:"user",displayName:"Taylor",avatarKey:"fern" as const,x:100,y:100,direction:"down" as const,connected:true,isMoving:false};
    const snapshot:OfficeSnapshot={officeId:"office",mapVersion:"map",players:new Map([["self",player]])};
    changed(snapshot);events.get("drop")!();const before=roster.length;
    snapshot.players.set("other",{...player,sessionId:"other"});changed(snapshot);
    assert.equal(states.at(-1)?.status,"reconnecting");assert.equal(roster.length,before,"Dropped transport cannot repopulate the roster");
    events.get("reconnect")!();changed(snapshot);assert.equal(states.at(-1)?.status,"online");
    events.get("leave")!(1000);snapshot.players.delete("other");changed(snapshot);
    assert.equal(states.at(-1)?.status,"offline");assert.deepEqual(roster.at(-1),[]);assert.equal(network.snapshot(),undefined);
  } finally {network.close();consume.mock.restore();globalThis.fetch=original;}
});

test("changed environment admission requests a reload and never retries stale geometry", async()=>{
  const original=globalThis.fetch,states:Presence[]=[];let requests=0;
  globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({code:'MAP_CHANGED'}),{status:409});};
  const network=connectOffice({url:'http://localhost:2567',officeId:'office-fixture',mapVersion:'old',getToken:async()=> 'synthetic-proof',onPresence:state=>states.push(state)});
  try{await new Promise(r=>setTimeout(r,20));assert.equal(states.at(-1)?.reload,true);assert.equal(states.at(-1)?.status,'offline');assert.equal(requests,1);assert.equal(network.snapshot(),undefined);assert.equal(network.setAvailability?.('BUSY'),false);}finally{network.close();globalThis.fetch=original;}
});
test("environment retirement clears media/presence and stale reconnect callbacks cannot revive the old map",async()=>{
  const original=globalThis.fetch,events=new Map<string,(code?:number)=>void>(),states:Presence[]=[],voice:(VoiceZoneState|null)[]=[];let changed!: (s:OfficeSnapshot)=>void,receive!: (v:VoiceZoneState)=>void;
  const fake={sessionId:'fixture',connection:{transport:{isOpen:true,send(){},sendUnreliable(){},connect(){},close(){}},events:{}},reconnection:{enabled:true},onStateChange(callback:(s:OfficeSnapshot)=>void){changed=callback;},onMessage(type:string,callback:(v:VoiceZoneState)=>void){if(type==='voice.state')receive=callback;},onDrop(callback:()=>void){events.set('drop',callback);},onReconnect(callback:()=>void){events.set('reconnect',callback);},onLeave(callback:(code:number)=>void){events.set('leave',callback as (code?:number)=>void);},onError(){},send(){},async leave(){},removeAllListeners(){}};
  const consume=mock.method(Client.prototype,'consumeSeatReservation',async()=>fake as unknown as Awaited<ReturnType<Client['consumeSeatReservation']>>);globalThis.fetch=async()=>new Response('{}');
  const network=connectOffice({url:'http://localhost:2567',officeId:'office',mapVersion:'old',getToken:async()=> 'synthetic-proof',onPresence:s=>states.push(s),onVoice:v=>voice.push(v)});
  try{await new Promise(r=>setImmediate(r));const snapshot:OfficeSnapshot={officeId:'office',mapVersion:'old',players:new Map()};changed(snapshot);receive({sessionId:'fixture',zone:'Meeting Room',configured:true,participants:1});events.get('leave')!(4052);const before=states.length;events.get('reconnect')!();changed(snapshot);assert.equal(states.length,before);assert.equal(states.at(-1)?.reload,true);assert.equal(voice.at(-1),null);assert.equal(fake.reconnection.enabled,false);assert.equal(network.snapshot(),undefined);}finally{network.close();consume.mock.restore();globalThis.fetch=original;}
});
