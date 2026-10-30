import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import type { LocalAudioTrack } from 'livekit-client';
import { createAudioOwner } from './audio-owner.ts';
import { bubbleBoundary, bubbleTension } from '../office/engine/bubble-geometry.ts';
import { decodeProximity, proximityDefaults, proximitySettings, validBubbleRef } from '../../../../../packages/shared/src/proximity.ts';
import { validVoiceRequest } from '../../../../../packages/shared/src/voice.ts';
import { createBubbleSounds } from './bubble-sounds.ts';
function microphone() {
    const events = new EventEmitter();
    let stops = 0;
    const track = Object.assign(events, { mediaStreamTrack: { enabled: true, readyState: 'live' }, async mute() { track.mediaStreamTrack.enabled = false; }, async unmute() { track.mediaStreamTrack.enabled = true; }, stop() { stops++; track.mediaStreamTrack.enabled = false; track.mediaStreamTrack.readyState = 'ended'; } });
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
