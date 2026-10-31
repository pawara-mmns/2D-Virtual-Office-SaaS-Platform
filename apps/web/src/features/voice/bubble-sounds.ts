export type BubbleSound = 'connected' | 'ended' | 'locked' | 'unlocked';
export function createBubbleSounds() {
    let context: AudioContext | undefined, volume = .12, muted = false;
    const played = new Set<string>();
    try {
        const saved = JSON.parse(localStorage.getItem('virtual-office:bubble-sounds') ?? 'null');
        if (saved && typeof saved.muted === 'boolean' && Number.isFinite(saved.volume)) {
            muted = saved.muted;
            volume = Math.max(0, Math.min(.4, saved.volume));
        }
    }
    catch { /* Safe defaults. */ }
    const persist = () => { try {
        localStorage.setItem('virtual-office:bubble-sounds', JSON.stringify({ volume, muted }));
    }
    catch { /* Optional. */ } };
    return {
        get volume() { return volume; }, get muted() { return muted; },
        configure(next: {
            volume: number;
            muted: boolean;
        }) { volume = Math.max(0, Math.min(.4, next.volume)); muted = next.muted; persist(); },
        async unlock() { try {
            context ??= new AudioContext();
            await context.resume();
        }
        catch { /* Playback remains optional. */ } },
        play(event: BubbleSound, key: string) {
            if (played.has(key))
                return;
            played.add(key);
            if (played.size > 128)
                played.delete(played.values().next().value!);
            if (muted || !volume || !context || context.state !== 'running' || matchMedia('(prefers-reduced-motion: reduce)').matches)
                return;
            const notes: Record<BubbleSound, number[]> = { connected: [440, 660], ended: [390, 260], locked: [520, 520], unlocked: [520, 700] };
            notes[event].forEach((frequency, index) => { const oscillator = context!.createOscillator(), gain = context!.createGain(), time = context!.currentTime + index * .065; oscillator.type = 'sine'; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume * .16, time + .008); gain.gain.exponentialRampToValueAtTime(.0001, time + .095); oscillator.connect(gain); gain.connect(context!.destination); oscillator.start(time); oscillator.stop(time + .1); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); }; });
        },
        close() { void context?.close().catch(() => { }); context = undefined; played.clear(); },
    };
}
