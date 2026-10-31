import { randomUUID } from 'node:crypto';
import { proximitySettings, sameBubbleRef, validBubbleRef, type BubbleRef, type ProximitySettings, type ProximityState, type VoiceBubble } from '../../../../packages/shared/src/proximity.ts';
import type { VoiceZoneState } from '../../../../packages/shared/src/voice.ts';
import type { Authorization } from '../auth/authorize.ts';
import type { VoiceService } from './service.ts';
export type ProximityPerson = {
    sessionId: string;
    auth: Authorization;
    x: number;
    y: number;
    meeting: boolean;
};
type Entry = ProximityPerson & {
    epoch: number;
    send(state: ProximityState): void;
    voice(state: VoiceZoneState): void;
    last?: string;
};
type Group = VoiceBubble & {
    retiring: string[];
    pending: boolean;
    separating: Map<string, number>;
    endedAt?: number;
};
export function createProximity(officeId: string, voice: VoiceService | undefined, options: Partial<ProximitySettings> = {}, now = Date.now, sharedSpace:(a:ProximityPerson,b:ProximityPerson)=>boolean=()=>true) {
    const settings = proximitySettings(options), entries = new Map<string, Entry>(), groups = new Map<string, Group>(), dwell = new Map<string, number>();
    let closed = false, epoch = 0;
    const ordered = () => [...entries.values()].sort((a, b) => a.sessionId.localeCompare(b.sessionId));
    const groupFor = (id: string) => [...groups.values()].find(g => g.lifecycleState !== 'DISSOLVED' && g.memberIds.includes(id));
    const distance = (a: string, b: string) => { const p = entries.get(a), q = entries.get(b); return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity; };
    const eligible = (p: Entry) => !p.meeting && now() < p.auth.expiresAt;
    const compatible=(a:string,b:string,radius:number)=>distance(a,b)<=radius&&!!entries.get(a)&&!!entries.get(b)&&sharedSpace(entries.get(a)!,entries.get(b)!);
    const snapshot = (g: Group): VoiceBubble => ({ bubbleId: g.bubbleId, officeId, memberIds: [...g.memberIds], creatorId: g.creatorId, controllerId: g.controllerId, locked: g.locked, lifecycleState: g.lifecycleState, generation: g.generation, revision: g.revision, createdAt: g.createdAt });
    const publish = () => {
        for (const p of entries.values()) {
            const group = groupFor(p.sessionId), ready = group && ['CONNECTING', 'ACTIVE', 'STRETCHING'].includes(group.lifecycleState);
            const ref = ready ? { bubbleId: group.bubbleId, generation: group.generation, revision: group.revision } : undefined;
            voice?.observe(p.sessionId, p.auth, p.meeting ? 'Meeting Room' : ref ? 'Proximity conversation' : null, p.voice, ref);
            const state: ProximityState = { officeId, sessionId: p.sessionId, eligible: eligible(p), audioAllowed:!!ref&&eligible(p)&&(voice?.available()??false), configured: voice?.available() ?? false, bubbles: [...groups.values()].map(snapshot), settings };
            const key = JSON.stringify(state);
            if (p.last !== key) {
                p.last = key;
                try {
                    p.send(state);
                }
                catch {
                    voice?.leave(p.sessionId);
                }
            }
        }
    };
    const retire = (g: Group) => {
        if (g.pending || closed)
            return;
        g.pending = true;
        void Promise.all(g.retiring.map(id => voice?.revoke(id))).then(() => {
            if (closed || voice&&!voice.settled(g.retiring))
                return;
            g.retiring = [];
            if (g.memberIds.length < 2) {
                g.lifecycleState = 'DISSOLVED';
                g.endedAt = now();
            }
            else {
                g.generation++;
                g.lifecycleState = 'CONNECTING';
            }
        }).catch(() => { /* Keep the old generation retired; retry on a later tick. */ }).finally(() => { g.pending = false; if (!closed)
            publish(); });
    };
    const transition = (g: Group, members: string[], locked = g.locked) => {
        g.retiring = [...new Set([...g.retiring, ...g.memberIds, ...members])];
        g.memberIds = [...members].sort();
        g.locked = locked;
        g.revision++;
        if (!g.memberIds.includes(g.controllerId))
            g.controllerId = g.memberIds[0] ?? '';
        g.lifecycleState = 'DISCONNECTING';
        g.separating.clear();
        // Logical authorization changes synchronously, before any provider await.
        publish();
        retire(g);
    };
    const remove = (id: string) => {
        const g = groupFor(id);
        if (g)
            transition(g, g.memberIds.filter(member => member !== id));
    };
    const stable = (key: string) => { const began = dwell.get(key); if (began === undefined) {
        dwell.set(key, now());
        return false;
    } return now() - began >= settings.dwellMs; };
    return {
        sync(people: ProximityPerson[], send: (id: string, state: ProximityState) => void, sendVoice: (id: string, state: VoiceZoneState) => void) {
            if (closed)
                return;
            people = people.filter(p => p.auth.officeId === officeId && Number.isFinite(p.x) && Number.isFinite(p.y));
            const live = new Set(people.map(p => p.sessionId));
            for (const id of entries.keys())
                if (!live.has(id)) {
                    remove(id);
                    voice?.leave(id);
                    entries.delete(id);
                }
            for (const person of people) {
                const old = entries.get(person.sessionId);
                entries.set(person.sessionId, { ...old, ...person, epoch:old&&old.meeting===person.meeting?old.epoch:++epoch, send: s => send(person.sessionId, s), voice: s => sendVoice(person.sessionId, s) });
                if (person.meeting && !old?.meeting)
                    remove(person.sessionId);
            }
            for (const g of groups.values()) {
                if (g.lifecycleState === 'DISSOLVED') {
                    if (now() - (g.endedAt ?? now()) > 500)
                        groups.delete(g.bubbleId);
                    continue;
                }
                const valid = g.memberIds.filter(id => { const p = entries.get(id); return p && eligible(p); });
                if (valid.length !== g.memberIds.length) {
                    transition(g, valid);
                    continue;
                }
                if (g.lifecycleState === 'DISCONNECTING') {
                    retire(g);
                    continue;
                }
                if (g.lifecycleState === 'FORMING') {
                    g.lifecycleState = 'CONNECTING';
                }
                const clusters = g.memberIds.map(seed => { const ids = [seed]; for (const id of g.memberIds)
                    if (id !== seed && ids.every(other => compatible(id, other, settings.disconnectRadius)))
                        ids.push(id); return ids.sort(); }).sort((a, b) => b.length - a.length || Number(b.includes(g.controllerId)) - Number(a.includes(g.controllerId)) || a.join().localeCompare(b.join()));
                const keep = clusters[0] ?? [], departing = g.memberIds.filter(id => !keep.includes(id));
                for (const id of [...g.separating.keys()])
                    if (!departing.includes(id))
                        g.separating.delete(id);
                for (const id of departing)
                    if (!g.separating.has(id))
                        g.separating.set(id, now());
                if (departing.some(id => now() - g.separating.get(id)! >= settings.graceMs)) {
                    transition(g, keep.length >= 2 ? keep : []);
                    continue;
                }
                const stretched = g.memberIds.some((id, i) => g.memberIds.slice(i + 1).some(other => distance(id, other) > settings.stretchDistance));
                g.lifecycleState = stretched ? 'STRETCHING' : 'ACTIVE';
            }
            const currentDwell = new Set<string>();
            for (const p of ordered()) {
                if (!eligible(p) || groupFor(p.sessionId) || voice&&!voice.settled([p.sessionId]))
                    continue;
                const candidates = [...groups.values()].filter(g => !g.locked && ['ACTIVE', 'CONNECTING', 'STRETCHING'].includes(g.lifecycleState) && g.memberIds.length < settings.maxMembers && g.memberIds.every(id => compatible(p.sessionId, id, settings.connectRadius))).sort((a, b) => Math.max(...a.memberIds.map(id => distance(p.sessionId, id))) - Math.max(...b.memberIds.map(id => distance(p.sessionId, id))) || a.createdAt - b.createdAt || a.bubbleId.localeCompare(b.bubbleId));
                const group = candidates[0];
                if (group) {
                    const key = p.sessionId + '/' + group.bubbleId;
                    currentDwell.add(key);
                    if (stable(key))
                        transition(group, [...group.memberIds, p.sessionId]);
                    continue;
                }
                const other = ordered().find(q => q.sessionId > p.sessionId && eligible(q) && !groupFor(q.sessionId) && (!voice||voice.settled([q.sessionId])) && compatible(p.sessionId,q.sessionId, settings.connectRadius));
                if (!other)
                    continue;
                const key = p.sessionId + '/' + other.sessionId;
                currentDwell.add(key);
                if (stable(key)) {
                    const g: Group = { bubbleId: randomUUID(), officeId, memberIds: [p.sessionId, other.sessionId], creatorId: p.sessionId, controllerId: p.sessionId, locked: false, lifecycleState: 'FORMING', generation: 1, revision: 1, createdAt: now(), retiring: [], pending: false, separating: new Map() };
                    groups.set(g.bubbleId, g);
                }
            }
            for (const key of dwell.keys())
                if (!currentDwell.has(key))
                    dwell.delete(key);
            publish();
        },
        checkpoint:(id:string)=>entries.get(id)?.epoch,
        action(id: string, value: unknown): boolean {
            const p = entries.get(id);
            if (!p || !value || typeof value !== 'object' || closed)
                return false;
            const a = value as Record<string, unknown>;
            if (Object.keys(a).length === 1 && typeof a.enabled === 'boolean') {
                // Legacy capture-toggle messages never control membership or
                // listener authorization. Capture consent is browser-local.
                return true;
            }
            if (Object.keys(a).sort().join(',') !== 'bubbleId,generation,locked,revision' || typeof a.locked !== 'boolean' || !validBubbleRef({ ...a }))
                return false;
            const g = groupFor(id);
            if (!g || g.controllerId !== id || !sameBubbleRef(g, a as BubbleRef) || !['ACTIVE', 'CONNECTING', 'STRETCHING'].includes(g.lifecycleState))
                return false;
            if (g.locked !== a.locked)
                transition(g, g.memberIds, a.locked);
            return true;
        },
        leave(id: string) { remove(id); voice?.leave(id); entries.delete(id); publish(); },
        states: () => [...groups.values()].map(snapshot),
        close() { closed = true; for (const id of entries.keys())
            voice?.leave(id); entries.clear(); groups.clear(); dwell.clear(); },
    };
}
