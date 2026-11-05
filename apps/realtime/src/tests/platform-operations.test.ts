import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createRealtimeServer } from '../server.ts';
import { validateOfficeMap } from '../../../../packages/shared/src/map.ts';
import { mapVersion, ENVIRONMENT_CHANGED_CODE } from '../../../../packages/shared/src/protocol.ts';
import { createVoiceService } from '../voice/service.ts';
import type { Authorization } from '../auth/authorize.ts';
const native = globalThis.WebSocket; globalThis.WebSocket = undefined as unknown as typeof WebSocket;
const { Client } = await import('@colyseus/sdk'); globalThis.WebSocket = native;
const id = '00000000-0000-4000-8000-000000000001', origin = 'http://localhost:3000';
const map = validateOfficeMap(JSON.parse(readFileSync(new URL('../../../web/public/office/studio.json',import.meta.url),'utf8')));
const auth = (): Authorization => ({ userId:id,organizationId:id,officeId:id,token:'synthetic',expiresAt:Date.now()+60000,checkedAt:Date.now(),avatarKey:'fern',displayName:'Fixture' });
test('operations require a separate key; counters are aggregates and room retirement uses existing rejoin semantics', async () => {
  const previous = process.env.PLATFORM_OPERATIONS_KEY, key = randomBytes(32).toString('base64url'); process.env.PLATFORM_OPERATIONS_KEY = key;
  const server = createRealtimeServer({ authorize:async()=>auth(),map,origins:[origin] });
  await server.listen(0,'127.0.0.1'); const address = server.transport.server!.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  let room: Awaited<ReturnType<InstanceType<typeof Client>['consumeSeatReservation']>> | undefined;
  try {
    for (const token of ['', 'Bearer owner-token', 'Bearer '+key+'forged']) assert.equal((await fetch(base+'/platform/metrics',{headers:{Authorization:token}})).status,403);
    const headers = { Authorization:'Bearer '+key };
    const metrics = () => fetch(base+'/platform/metrics',{headers}).then(r=>r.json());
    assert.deepEqual(await metrics(),{connectedUsers:0,realtimeRooms:0,voiceSessions:null,readiness:'not_ready'});
    const response = await fetch(base+'/office/join',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer synthetic'},body:JSON.stringify({officeId:id,mapVersion:mapVersion(map)})});assert.equal(response.status,200);
    room = await new Client(base,{headers:{Origin:origin}}).consumeSeatReservation(await response.json());
    room.onMessage('voice.state',()=>{}); room.onMessage('proximity.state',()=>{});
    let snapshot; for(let i=0;i<100;i++){snapshot=await metrics();if(snapshot.connectedUsers===1)break;await delay(10);}
    assert.equal(snapshot.connectedUsers,1);assert.equal(snapshot.realtimeRooms,1);assert.equal(snapshot.voiceSessions,null);assert.equal('users' in snapshot,false);
    assert.equal((await fetch(base+'/platform/office-retire',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({officeId:id})})).status,403);
    let leaveCode=0;room.onLeave(code=>{leaveCode=code;});
    const retired=await fetch(base+'/platform/office-retire',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({officeId:id})});assert.equal(retired.status,200);assert.equal((await retired.json()).retired,true);
    for(let i=0;i<100&&leaveCode===0;i++)await delay(10);assert.equal(leaveCode,ENVIRONMENT_CHANGED_CODE);
    assert.equal((await metrics()).connectedUsers,0);
  } finally { if(room){room.reconnection.enabled=false;if(room.connection.isOpen)await room.leave();room.removeAllListeners();}await server.gracefullyShutdown(false); if(previous===undefined)delete process.env.PLATFORM_OPERATIONS_KEY;else process.env.PLATFORM_OPERATIONS_KEY=previous; }
});
test('voice feature disable rejects admission and unobservable voice metrics remain null', async () => {
  const service = createVoiceService(async()=>({...auth(),voiceAllowed:false}),null,Date.now,()=>{});
  try { assert.equal(service.metrics().observedSessions,null); await assert.rejects(service.join({...auth(),voiceAllowed:false},'session'),/disabled/); }
  finally { await service.close(); }
});
