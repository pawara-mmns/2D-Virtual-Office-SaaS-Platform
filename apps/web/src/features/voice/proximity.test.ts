import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { LocalAudioTrack } from 'livekit-client';
import { createAudioOwner } from './audio-owner.ts';
import { bubbleBoundary, bubbleTension,avatarEnvelope,smoothEnvelope,type BubbleAvatar } from '../office/engine/bubble-geometry.ts';
import { decodeProximity, proximityDefaults, proximitySettings, validBubbleRef } from '../../../../../packages/shared/src/proximity.ts';
import { validVoiceRequest } from '../../../../../packages/shared/src/voice.ts';
import { createBubbleSounds } from './bubble-sounds.ts';
import {authorizationFailure,captureFailure,voiceDiagnostic} from './diagnostics.ts';
function microphone() {
    const events = new EventEmitter();
    let stops = 0,muted=false;
    const track = Object.assign(events, { mediaStreamTrack: { enabled: true, readyState: 'live' }, async mute() { if(!muted){muted=true;track.mediaStreamTrack.enabled = false;}return track; }, async unmute() { if(muted){muted=false;track.mediaStreamTrack.enabled = true;}return track; }, stop() { stops++; track.mediaStreamTrack.enabled = false; track.mediaStreamTrack.readyState = 'ended'; } });
    Object.defineProperty(track,'isMuted',{get:()=>muted});
    return { track: track as unknown as LocalAudioTrack, stops: () => stops };
}
test('first unmuted publication initializes an SDK-idempotent track without a mute checkbox cycle',async()=>{
    const mic=microphone();let sdkMuted=false;
    mic.track.mute=async()=>{if(!sdkMuted){sdkMuted=true;mic.track.mediaStreamTrack.enabled=false;}return mic.track;};
    mic.track.unmute=async()=>{if(sdkMuted){sdkMuted=false;mic.track.mediaStreamTrack.enabled=true;}return mic.track;};
    const owner=createAudioOwner(async()=>mic.track,false);
    await owner.capture();await owner.publish();
    assert.equal(mic.track.mediaStreamTrack.enabled,true,'First publication must enable the actual raw track, not merely set desired mute=false');
    assert.equal(sdkMuted,false);owner.stop();
});
test('receive-only binding never captures, duplicate enable publishes once, and saved mute survives rotation',async()=>{
    let captures=0,publishes=0;const mic=microphone(),owner=createAudioOwner(async()=>{captures++;return mic.track;},true);
    const port={async publish(track:LocalAudioTrack){assert.equal(track.mediaStreamTrack.enabled,false,'Attach before enabling actual audio');publishes++;},async unpublish(){}};
    const first=owner.scope();await first.attach(port);assert.equal(captures,0);assert.equal(owner.snapshot().desired,'off');
    await Promise.all([owner.enable(),owner.enable()]);assert.equal(captures,1);assert.equal(publishes,1);assert.equal(owner.snapshot().phase,'muted');assert.equal(mic.track.isMuted,true);
    await owner.setMuted(false);assert.equal(owner.snapshot().phase,'active');assert.equal(mic.track.mediaStreamTrack.enabled,true);assert.equal(mic.track.isMuted,false);
    first.connected(false);assert.equal(owner.snapshot().phase,'paused');assert.equal(mic.track.mediaStreamTrack.enabled,false);first.connected(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(owner.snapshot().phase,'active');assert.equal(captures,1);assert.equal(publishes,1);
    await owner.setMuted(true);first.pause();const second=owner.scope();await second.attach(port);assert.equal(owner.snapshot().phase,'muted');assert.equal(captures,1);assert.equal(publishes,2);
    first.pause();await owner.setMuted(false);assert.equal(owner.snapshot().phase,'active');owner.stop();await new Promise(resolve=>setImmediate(resolve));assert.equal(owner.snapshot().phase,'off');
});
test('publication failure has a usable retry and a retired pending attachment cannot replace its successor',async()=>{
    const mic=microphone();let captures=0,attempts=0,fail=true;
    const owner=createAudioOwner(async()=>{captures++;return mic.track;});
    await owner.scope().attach({async publish(){attempts++;if(fail)throw Error('Synthetic private provider failure');},async unpublish(){}});
    await assert.rejects(owner.enable(),/publication failed/);assert.equal(owner.snapshot().phase,'failed');assert.equal(mic.track.mediaStreamTrack.enabled,false);
    fail=false;await owner.enable();assert.equal(captures,1);assert.equal(attempts,2);assert.equal(owner.snapshot().phase,'active');owner.stop();
    const late=microphone(),other=createAudioOwner(async()=>late.track);await other.capture();let release!:()=>void;let retired=0;
    const first=other.scope(),pending=first.attach({async publish(){await new Promise<void>(r=>release=r);},async unpublish(){retired++;}});
    await new Promise(resolve=>setImmediate(resolve));first.pause();const second=other.scope(),replacement=second.attach({async publish(){},async unpublish(){}});release();await pending;await replacement;assert.equal(retired,1);assert.equal(other.snapshot().phase,'active');first.pause();assert.equal(late.track.mediaStreamTrack.enabled,true);other.stop();
});
test('device failures are categorized and diagnostics omit unknown fields and provider text',()=>{
    for(const [name,category]of [['NotAllowedError','denied'],['NotFoundError','missing_device'],['NotReadableError','device_busy'],['UnknownSDKError','failed']]){const failure=captureFailure({name,message:'synthetic-private-secret'});assert.equal(failure.category,category);assert.doesNotMatch(failure.message,/private-secret/);}
    assert.match(authorizationFailure(409).message,/still closing/);assert.match(authorizationFailure(403).message,/authorization failed/);assert.match(authorizationFailure(503).message,/server unavailable/);
    const previous=process.env.NODE_ENV,info=console.info,logs:unknown[][]=[];
    try{Reflect.set(process.env,'NODE_ENV','development');console.info=(...args)=>logs.push(args);voiceDiagnostic('microphone','reconciled',{desired:'on',errorName:'synthetic-private-secret',token:'synthetic-private-secret'} as Parameters<typeof voiceDiagnostic>[2]);assert.doesNotMatch(JSON.stringify(logs),/private-secret|token/);Reflect.set(process.env,'NODE_ENV','production');voiceDiagnostic('capture','failed');assert.equal(logs.length,1);}finally{console.info=info;if(previous===undefined)Reflect.deleteProperty(process.env,'NODE_ENV');else Reflect.set(process.env,'NODE_ENV',previous);}
});
test('dynamic rounded envelopes contain sprite rectangles and feet during movement and membership changes',()=>{
    const member=(x:number,y:number):BubbleAvatar=>({x,y,left:x-16,right:x+16,top:y-16,bottom:y+16,footX:x,footY:y+11});
    let memory:{x:number;y:number}[]=[];
    for(const members of [[member(100,100),member(150,100)],[member(80,105),member(230,130)],[member(80,105),member(230,130),member(150,190)],[member(80,105),member(230,130)]]){
      const geometry=smoothEnvelope(memory,avatarEnvelope(members,7),16,false);memory=geometry.memory;
      for(const p of members)for(const point of [{x:p.left,y:p.top},{x:p.right,y:p.top},{x:p.right,y:p.bottom},{x:p.left,y:p.bottom},{x:p.footX,y:p.footY}])for(let i=0;i<geometry.boundary.length;i++){const a=geometry.boundary[i]!,b=geometry.boundary[(i+1)%geometry.boundary.length]!;assert.ok((b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x)>=-.001);}
      assert.ok(memory.length<=48);
    }
    assert.deepEqual(smoothEnvelope(memory,avatarEnvelope([member(80,105),member(230,130)]),16,true).boundary,avatarEnvelope([member(80,105),member(230,130)]));
});
test('one consent capture is coalesced, paused between generations and never silently unmuted', async () => {
    const mic = microphone();
    let captures = 0, changes = 0;
    const owner = createAudioOwner(async () => { captures++; return mic.track; }, true);
    const unsubscribe = owner.subscribe(() => changes++);
    assert.equal(captures, 0);
    const [a, b] = await Promise.all([owner.capture(), owner.capture()]);
    assert.equal(a, b);
    assert.equal(captures, 1);
    assert.equal(a.mediaStreamTrack.enabled, false);
    const scope=owner.scope();await scope.attach({async publish(){},async unpublish(){}});
    assert.equal(a.mediaStreamTrack.enabled, false);
    await owner.setMuted(false);
    assert.equal(a.mediaStreamTrack.enabled, true);
    owner.pause();
    assert.equal(a.mediaStreamTrack.enabled, false);
    await owner.setMuted(false);
    assert.equal(a.mediaStreamTrack.enabled, false, 'Waiting cannot publish');
    await owner.scope().attach({async publish(){},async unpublish(){}});
    assert.equal(captures, 1);
    assert.equal(a.mediaStreamTrack.enabled, true);
    await owner.setMuted(true);
    owner.pause();
    await owner.scope().attach({async publish(){},async unpublish(){}});
    assert.equal(a.mediaStreamTrack.enabled, false);
    assert.ok(changes>=3);
    unsubscribe();
    owner.stop();
    owner.stop();
    assert.equal(mic.stops(), 1);
});
test('late permission, permission revocation and a pending unmute cannot revive stopped audio', async () => {
    const mic = microphone();
    let allow!: (track: LocalAudioTrack) => void;
    const owner = createAudioOwner(() => new Promise(resolve => { allow = resolve; }));
    const pending = owner.capture();
    owner.stop();
    allow(mic.track);
    await assert.rejects(pending);
    assert.equal(mic.stops(), 1);
    assert.equal(owner.granted, false);
    assert.equal(owner.snapshot().permission,'unknown');
    const second = microphone();
    let ended = 0;
    const active = createAudioOwner(async () => second.track, false, () => ended++);
    await active.capture();
    await active.publish();
    (second.track as unknown as EventEmitter).emit('ended');
    assert.equal(ended, 1);
    assert.equal(second.stops(), 1);
    const third = microphone();
    let finish!: () => void;
    third.track.unmute = () => new Promise<LocalAudioTrack>(resolve => { finish = () => { third.track.mediaStreamTrack.enabled = true; resolve(third.track); }; });
    const racing = createAudioOwner(async () => third.track);
    await racing.capture();
    const publish = racing.publish();
    await Promise.resolve();
    racing.pause();
    finish();
    await assert.rejects(publish);
    assert.equal(third.track.mediaStreamTrack.enabled, false);
    racing.stop();
});
test('capture initialization failure releases the acquired track and can be retried',async()=>{
    const broken=microphone(),working=microphone();broken.track.mute=async()=>{throw Error('Synthetic initialization failure');};let attempts=0;
    const owner=createAudioOwner(async()=>++attempts===1?broken.track:working.track);
    await assert.rejects(owner.enable());assert.equal(broken.stops(),1);assert.equal(owner.snapshot().phase,'failed');assert.equal(owner.snapshot().permission,'unknown');await owner.enable();assert.equal(owner.snapshot().phase,'paused');owner.stop();assert.equal(working.stops(),1);
});
test('late cleanup of a retired media generation cannot pause its replacement', async () => {
    const mic = microphone(), owner = createAudioOwner(async () => mic.track);
    const old = owner.scope();
    await old.capture();
    await old.publish();
    old.pause();
    const next = owner.scope();
    await next.publish();
    old.pause();
    assert.equal(mic.track.mediaStreamTrack.enabled, true);
    await assert.rejects(old.publish());
    assert.equal(mic.track.mediaStreamTrack.enabled, true);
    owner.stop();
});
test('original sound cues require activation, deduplicate events and respect preferences and reduced motion', async () => {
    const original = { audio: globalThis.AudioContext, media: globalThis.matchMedia, storage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
    let notes = 0, contexts = 0, reduced = false;
    const storage = new Map<string, string>();
    const context = { state: 'running', currentTime: 0, destination: {}, async resume() { }, async close() { }, createOscillator() { return { type: 'sine', frequency: { value: 0 }, connect() { }, disconnect() { }, start() { notes++; }, stop() { }, onended: null }; }, createGain() { return { gain: { setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect() { }, disconnect() { } }; } };
    globalThis.AudioContext = class {
        constructor() { contexts++; return context; }
    } as unknown as typeof AudioContext;
    globalThis.matchMedia = (() => ({ matches: reduced })) as unknown as typeof matchMedia;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
    try {
        const sounds = createBubbleSounds();
        assert.equal(contexts, 0);
        sounds.play('connected', 'no-gesture');
        assert.equal(notes, 0);
        await sounds.unlock();
        sounds.play('connected', 'joined');
        sounds.play('connected', 'joined');
        assert.equal(notes, 2);
        sounds.configure({ muted: true, volume: .1 });
        sounds.play('locked', 'lock');
        assert.equal(notes, 2);
        assert.equal(createBubbleSounds().muted, true);
        sounds.configure({ muted: false, volume: .2 });
        reduced = true;
        sounds.play('unlocked', 'unlock');
        assert.equal(notes, 2);
        reduced = false;
        sounds.play('ended', 'left');
        assert.equal(notes, 4);
        sounds.close();
    }
    finally {
        globalThis.AudioContext = original.audio;
        globalThis.matchMedia = original.media;
        if (original.storage)
            Object.defineProperty(globalThis, 'localStorage', original.storage);
        else
            Reflect.deleteProperty(globalThis, 'localStorage');
    }
});
test('capsules and rounded group hulls enclose all avatars; stretch is bounded in world coordinates', () => {
    for (const members of [[{ x: 100, y: 100 }, { x: 170, y: 100 }], [{ x: 100, y: 100 }, { x: 170, y: 100 }, { x: 140, y: 160 }]]) {
        const hull = bubbleBoundary(members);
        assert.ok(hull.length >= 16 && hull.length <= members.length * 16);
        for (const p of members)
            for (let i = 0; i < hull.length; i++) {
                const a = hull[i]!, b = hull[(i + 1) % hull.length]!;
                assert.ok((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-7);
            }
    }
    assert.equal(bubbleTension([{ x: 0, y: 0 }, { x: 136, y: 0 }], 112, 160), .5);
    assert.equal(bubbleTension([{ x: 0, y: 0 }, { x: 500, y: 0 }], 112, 160), 1);
    assert.deepEqual(bubbleBoundary([{ x: NaN, y: 0 }]), []);
});
test('client and token decoders require tenant, session and the complete generation reference', () => {
    const officeId = '00000000-0000-4000-8000-000000000001', ref = { bubbleId: '00000000-0000-4000-8000-000000000002', generation: 1, revision: 1 };
    assert.equal(validVoiceRequest({ officeId, sessionId: 'fixture', ...ref }), true);
    for (const value of [{ ...ref, generation: 0 }, { ...ref, revision: 1.2 }, { ...ref, bubbleId: 'forged' }])
        assert.equal(validBubbleRef(value), false);
    assert.equal(validVoiceRequest({ officeId, sessionId: 'fixture', ...ref, locked: true }), false);
    const state = { officeId, sessionId: 'fixture', eligible: true, audioAllowed:false, configured: true, bubbles: [], settings: proximityDefaults };
    assert.ok(decodeProximity(state, officeId, 'fixture'));
    assert.equal(decodeProximity(state, officeId, 'other'), null);
    assert.throws(() => proximitySettings({ disconnectRadius: 90 }));
    assert.throws(() => proximitySettings({ maxMembers: 11 }));
});
