import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoiceService } from '../voice/service.ts';
import { createProximity, type ProximityPerson } from '../voice/proximity.ts';
import type { Authorization } from '../auth/authorize.ts';
import type { VoiceProvider } from '../voice/provider.ts';
import type { ProximitySettings, ProximityState } from '../../../../packages/shared/src/proximity.ts';
import type { VoiceZoneState } from '../../../../packages/shared/src/voice.ts';
const uuid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
async function fixture(settings: Partial<ProximitySettings> = {}) {
    let time = 100000, failRemove = false;
    const rooms = new Map<string, Set<string>>(), issued: {
        room: string;
        identity: string;
    }[] = [], removed: string[] = [];
    const auth = (n: number): Authorization => ({ userId: uuid(n), organizationId: uuid(20), officeId: uuid(30), token: String(n), checkedAt: time, expiresAt: time + 60000, avatarKey: 'fern', displayName: 'Fixture' });
    const provider: VoiceProvider = { url: 'wss://fixture.livekit.cloud', prefix: 'fixture_', room: a => 'fixture_' + a.organizationId + '_' + a.officeId, async rooms() { return [...rooms.keys()]; }, async participants(room) { return [...rooms.get(room) ?? []]; }, async token(_a, room, identity) { issued.push({ room, identity }); const members = rooms.get(room) ?? new Set(); members.add(identity); rooms.set(room, members); return 'synthetic-token'; }, async remove(room, identity) { if (failRemove)
            throw Error('Synthetic outage'); removed.push(identity); rooms.get(room)?.delete(identity); } };
    const voice = createVoiceService(async (proof) => auth(Number(proof)), provider, () => time, () => { });
    await voice.poll();
    const proximity = createProximity(uuid(30), voice, { dwellMs: 100, graceMs: 200, ...settings }, () => time), states = new Map<string, ProximityState>(), targets = new Map<string, VoiceZoneState>();
    const people: ProximityPerson[] = [1, 2, 3, 4].map((n) => ({ sessionId: 'session_' + n, auth: auth(n), x: n <= 2 ? n * 30 : 600 + n * 30, y: 200, meeting: false }));
    const sync = () => proximity.sync(people, (id, s) => states.set(id, s), (id, s) => targets.set(id, s));
    sync();
    const enable = (n: number) => assert.equal(proximity.action('session_' + n, { enabled: true }), true);
    const advance = async (ms = 110) => { time += ms; sync(); await flush(); };
    const join = async (n: number) => { const s = targets.get('session_' + n)!; assert.ok(s.bubble); return voice.join(auth(n), s.sessionId, voice.checkpoint(s.sessionId), { officeId: uuid(30), sessionId: s.sessionId, ...s.bubble }); };
    return { voice, proximity, people, states, targets, issued, removed, rooms, auth, sync, enable, advance, join, setFail: (v: boolean) => { failRemove = v; }, close: async () => { proximity.close(); await voice.close(); } };
}
test('authenticated nearby sessions form a visual bubble before either microphone is enabled',async()=>{
    const f=await fixture();try{f.sync();await f.advance();f.sync();assert.equal(f.proximity.states().filter(g=>g.lifecycleState!=='DISSOLVED').length,2);}finally{await f.close();}
});
test('consent, stable dwell, hysteresis, stretch and grace control authoritative bubbles', async () => {
    const f = await fixture();
    try {
        f.people.splice(2);f.sync();
        assert.equal(f.proximity.states().length, 0);
        f.enable(1);
        f.enable(2);
        f.sync();
        await f.advance();
        f.sync();
        assert.equal(f.proximity.states().length, 1);
        await f.join(1);
        await f.join(2);
        await f.voice.poll();
        f.sync();
        assert.equal(f.proximity.states()[0]!.lifecycleState, 'ACTIVE');
        f.people[1]!.x = 160;
        f.sync();
        assert.equal(f.proximity.states()[0]!.lifecycleState, 'STRETCHING');
        await f.advance(300);
        assert.equal(f.proximity.states()[0]!.memberIds.length, 2, 'Beyond connect radius stays joined inside exit radius');
        f.people[1]!.x = 250;
        f.sync();
        await f.advance(100);
        assert.equal(f.proximity.states()[0]!.memberIds.length, 2);
        await f.advance(110);
        await f.voice.poll();
        f.sync();
        await flush();
        assert.equal(f.proximity.states()[0]!.lifecycleState, 'DISSOLVED');
        assert.equal(f.removed.length, 2);
        const previousBubble=f.proximity.states()[0]!.bubbleId;
        assert.equal(f.states.get('session_1')!.eligible,true,'Normal separation preserves visual eligibility');
        assert.equal(f.states.get('session_2')!.eligible,true);
        f.people[1]!.x=60;f.sync();await f.advance();f.sync();
        const renewed=f.proximity.states().find(group=>group.lifecycleState!=='DISSOLVED')!;
        assert.ok(renewed);assert.notEqual(renewed.bubbleId,previousBubble,'Approaching again creates a fresh authorized bubble automatically');
        await f.join(1);await f.join(2);await f.voice.poll();f.sync();
        assert.equal(f.proximity.states().find(group=>group.bubbleId===renewed.bubbleId)!.lifecycleState,'ACTIVE');
    }
    finally {
        await f.close();
    }
});
test('isolated groups, third member admission, lock rotation, stale tokens and controller departure', async () => {
    const f = await fixture();
    try {
        for (const n of [1, 2, 3, 4])
            f.enable(n);
        f.sync();
        await f.advance();
        f.sync();
        assert.equal(f.proximity.states().length, 2);
        for (const n of [1, 2, 3, 4])
            await f.join(n);
        assert.notEqual(f.issued[0]!.room, f.issued[2]!.room);
        await f.voice.poll();
        f.sync();
        const old = { ...f.targets.get('session_1')!.bubble! }, g = f.proximity.states().find(g => g.memberIds.includes('session_1'))!;
        assert.equal(f.proximity.action('session_2', { ...old, locked: true }), false, 'Only controller');
        assert.equal(f.proximity.action('session_1', { ...old, locked: true }), true);
        await flush();
        f.sync();
        const locked = f.proximity.states().find(b => b.bubbleId === g.bubbleId)!;
        assert.ok(locked.generation > old.generation);
        assert.ok(locked.locked);
        assert.equal(f.removed.length, 2, 'Other bubble stays connected');
        await assert.rejects(() => f.voice.join(f.auth(1), 'session_1', f.voice.checkpoint('session_1'), { officeId: uuid(30), sessionId: 'session_1', ...old }));
        const outsider = { ...f.auth(5), officeId: uuid(99) };
        await assert.rejects(() => f.voice.join(outsider, 'session_1', undefined, { sessionId: 'session_1', ...locked }));
        await f.join(1);
        await f.join(2);
        f.people.push({ sessionId: 'session_5', auth: f.auth(5), x: 75, y: 200, meeting: false });
        f.sync();
        f.enable(5);
        f.sync();
        await f.advance();
        assert.equal(locked.memberIds.length, 2);
        assert.equal(f.proximity.action('session_1', { bubbleId: locked.bubbleId, generation: locked.generation, revision: locked.revision, locked: false }), true);
        await flush();
        f.sync();
        await f.advance();
        f.sync();
        await flush();
        assert.equal(f.proximity.states().find(b => b.bubbleId === g.bubbleId)!.memberIds.length, 3);
        f.proximity.leave('session_1');
        f.people.splice(0, 1);
        await flush();
        f.sync();
        await flush();
        assert.equal(f.proximity.states().find(b => b.bubbleId === g.bubbleId)!.controllerId, 'session_2');
    }
    finally {
        await f.close();
    }
});
test('failed retirement blocks new media; meeting precedence, disconnect and re-entry require renewed opt-in', async () => {
    const f = await fixture();
    try {
        f.enable(1);
        f.enable(2);
        f.sync();
        await f.advance();
        f.sync();
        await f.join(1);
        await f.join(2);
        await f.voice.poll();
        f.sync();
        const g = f.proximity.states()[0]!;
        f.setFail(true);
        assert.equal(f.proximity.action(g.controllerId, { bubbleId: g.bubbleId, generation: g.generation, revision: g.revision, locked: true }), true);
        await flush();
        f.sync();
        assert.equal(f.proximity.states()[0]!.lifecycleState, 'DISCONNECTING');
        assert.equal(f.targets.get('session_1')!.bubble, undefined);
        await assert.rejects(() => f.join(1));
        f.setFail(false);
        await f.voice.poll();
        f.sync();
        await flush();
        f.people[0]!.meeting = true;
        f.sync();
        await flush();
        assert.equal(f.states.get('session_1')!.eligible, false);
        assert.equal(f.targets.get('session_1')!.zone, 'Meeting Room');
        f.people[0]!.meeting = false;
        f.sync();
        assert.equal(f.states.get('session_1')!.eligible, true);
        f.proximity.leave('session_1');
        f.sync();
        assert.equal(f.states.get('session_1')!.eligible, true);
    }
    finally {
        await f.close();
    }
});
test('ten-person grouping is bounded and unique; existing groups never merge when overlapping', async () => {
    const f = await fixture();
    try {
        for (const n of [1, 2, 3, 4])
            f.enable(n);
        f.sync();
        await f.advance();
        f.sync();
        const ids = f.proximity.states().map(g => g.bubbleId).sort();
        f.people[2]!.x = 65;
        f.people[3]!.x = 70;
        for (let i = 0; i < 5; i++)
            await f.advance();
        assert.deepEqual(f.proximity.states().map(g => g.bubbleId).sort(), ids);
        assert.ok(f.proximity.states().every(g => g.memberIds.length === 2));
    }
    finally {
        await f.close();
    }
    for (const cap of [3, 10]) {
        const f = await fixture({ maxMembers: cap });
        try {
            const people = Array.from({ length: 10 }, (_, i) => ({ sessionId: 'session_' + (i + 1), auth: f.auth(i + 1), x: 300 + i * 3, y: 200, meeting: false }));
            f.people.splice(0, f.people.length, ...people.slice(0,2));
            f.sync();
            f.enable(1); f.enable(2);
            f.sync();
            await f.advance(); f.sync();
            // New arrivals join an existing group; already formed groups are
            // intentionally never merged just to maximize their occupancy.
            for(let n=3;n<=10;n++) {
                f.people.push(people[n-1]!); f.sync(); f.enable(n); f.sync();
                await f.advance(); f.sync(); await flush();
            }
            const groups = f.proximity.states().filter(g => g.lifecycleState !== 'DISSOLVED'), roster = groups.flatMap(g => g.memberIds);
            assert.ok(groups.every(g => g.memberIds.length <= cap));
            assert.equal(new Set(roster).size, roster.length);
            if (cap === 10) {
                assert.equal(groups.length, 1);
                assert.equal(roster.length, 10);
            }
        }
        finally {
            await f.close();
        }
    }
});
