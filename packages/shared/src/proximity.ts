export type BubblePhase = 'FORMING' | 'CONNECTING' | 'ACTIVE' | 'STRETCHING' | 'DISCONNECTING' | 'DISSOLVED';
export type BubbleRef = {
    bubbleId: string;
    generation: number;
    revision: number;
};
export type VoiceBubble = BubbleRef & {
    officeId: string;
    memberIds: string[];
    creatorId: string;
    controllerId: string;
    locked: boolean;
    lifecycleState: BubblePhase;
    createdAt: number;
};
export type ProximityState = {
    officeId: string;
    sessionId: string;
    eligible: boolean;
    audioAllowed: boolean;
    configured: boolean;
    bubbles: VoiceBubble[];
    settings: ProximitySettings;
};
export type ProximitySettings = {
    connectRadius: number;
    disconnectRadius: number;
    dwellMs: number;
    graceMs: number;
    stretchDistance: number;
    maxMembers: number;
};
export const proximityDefaults: ProximitySettings = { connectRadius: 96, disconnectRadius: 160, dwellMs: 700, graceMs: 1000, stretchDistance: 112, maxMembers: 10 };
export function proximitySettings(value: Partial<ProximitySettings> = {}): ProximitySettings {
    const c = { ...proximityDefaults, ...value };
    if (!Object.values(c).every(Number.isFinite) || c.connectRadius < 32 || c.disconnectRadius <= c.connectRadius || c.stretchDistance < c.connectRadius || c.stretchDistance >= c.disconnectRadius || c.dwellMs < 100 || c.graceMs < 100 || !Number.isInteger(c.maxMembers) || c.maxMembers < 2 || c.maxMembers > 10)
        throw Error('Invalid proximity settings');
    return c;
}
export function validBubbleRef(value: unknown): value is BubbleRef {
    if (!value || typeof value !== 'object')
        return false;
    const r = value as BubbleRef;
    return typeof r.bubbleId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.bubbleId) && Number.isSafeInteger(r.generation) && r.generation > 0 && Number.isSafeInteger(r.revision) && r.revision > 0;
}
export const sameBubbleRef = (a: BubbleRef | undefined, b: BubbleRef | undefined) => a === b || !!a && !!b && a.bubbleId === b.bubbleId && a.generation === b.generation && a.revision === b.revision;
export function decodeProximity(value: unknown, officeId: string, sessionId: string): ProximityState | null {
    if (!value || typeof value !== 'object')
        return null;
    const s = value as ProximityState;
    if (s.officeId !== officeId || s.sessionId !== sessionId || typeof s.eligible !== 'boolean' || typeof s.audioAllowed !== 'boolean' || typeof s.configured !== 'boolean' || !Array.isArray(s.bubbles) || s.bubbles.length > 10)
        return null;
    if (!s.settings || typeof s.settings !== 'object' || Object.keys(s.settings).sort().join() !== Object.keys(proximityDefaults).sort().join())
        return null;
    try {
        proximitySettings(s.settings);
    }
    catch {
        return null;
    }
    for (const b of s.bubbles)
        if (!validBubbleRef(b) || b.officeId !== officeId || !Array.isArray(b.memberIds) || b.memberIds.length > 10 || !b.memberIds.every(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)) || typeof b.locked !== 'boolean' || typeof b.controllerId !== 'string' || typeof b.creatorId !== 'string' || !Number.isFinite(b.createdAt) || !['FORMING', 'CONNECTING', 'ACTIVE', 'STRETCHING', 'DISCONNECTING', 'DISSOLVED'].includes(b.lifecycleState))
            return null;
    return s;
}
