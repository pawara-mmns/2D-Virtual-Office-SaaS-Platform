// No SDK globals here: test races/cleanup without microphone or provider access.
export type Capture = { stop(): void };
export type VoiceStage = "microphone" | "signaling" | "media" | "publication" | "connected";
export type VoiceMedia = {
  capture(): Promise<Capture>;
  connect(signalConnected: () => void): Promise<void>;
  publish(track: Capture): Promise<void>;
  disconnect(): Promise<void>;
};
export function voiceError(error: unknown, stage: VoiceStage = "microphone"): string {
  const name = error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Microphone permission was denied. Allow access in your browser settings, then join again.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found. Connect a microphone and join again.";
  if (name === "NotReadableError" || name === "TrackStartError") return "The microphone is unavailable or in use. Check your device and other applications.";
  const details = error && typeof error === "object" ? error as { name?: unknown; reason?: unknown; status?: unknown } : {};
  if (details.name === "ConnectionError" && (details.reason === 0 || details.status === 401 || details.status === 403)) return "LiveKit rejected voice authorization. Leave voice and join again; if it persists, ask an administrator to check the LiveKit project and token configuration.";
  if (stage === "signaling") return "LiveKit signaling could not connect. Check the voice service URL, WebSocket connectivity and network restrictions, then join again.";
  if (stage === "media") return "Voice signaling connected, but WebRTC media could not establish. Check VPN/firewall and WebRTC network access, then join again.";
  if (stage === "publication") return "The microphone track could not publish. Check microphone permissions and voice-room access, then join again.";
  return "Voice connection failed. Check the microphone and network, then join again.";
}
export function startVoice(media: VoiceMedia, ready: () => void, failed: (message: string) => void, options: number | { timeoutMs?: number; onStage?(stage: VoiceStage): void } = {}) {
  const timeoutMs = typeof options === "number" ? options : options.timeoutMs ?? 12_000;
  const onStage = typeof options === "number" ? undefined : options.onStage;
  let closed = false, track: Capture | undefined;
  let stage: VoiceStage = "microphone", timer: ReturnType<typeof setTimeout> | undefined, closing: Promise<void> | undefined;
  const stop = () => {
    if (closing) return closing;
    closed = true; clearTimeout(timer); track?.stop();
    closing = media.disconnect().catch(() => {});
    return closing;
  };
  const fail = (error: unknown, timedOut = false) => {
    if (closed) return;
    // Fixed categories only: SDK errors may contain URLs, tokens and request data.
    const detail = error && typeof error === "object" ? error as {name?:unknown;reason?:unknown;status?:unknown} : {};
    const denied = detail.name === "ConnectionError" && (detail.reason === 0 || detail.status === 401 || detail.status === 403);
    console.warn("Voice connection failed.",{ stage,category: timedOut ? "timeout" : denied ? "authorization" : stage === "microphone" ? "device" : "connection" });
    void stop();
    const timeouts = { signaling:"LiveKit signaling timed out before the voice connection was authorized. Check WebSocket connectivity and try again.",media:"Voice signaling connected, but WebRTC media establishment timed out. Check VPN/firewall and WebRTC network access.",publication:"Microphone publication timed out. Check the microphone and voice-room access, then join again." };
    failed(timedOut && stage in timeouts ? timeouts[stage as keyof typeof timeouts] : voiceError(error,stage));
  };
  const advance = (next: VoiceStage) => {
    if (closed || next === stage) return;
    stage = next; clearTimeout(timer); onStage?.(stage);
    // User consent is not a network timeout. SDK signaling/ICE budgets remain
    // unchanged; this watchdog applies separately to the current network stage.
    if (stage !== "microphone" && stage !== "connected") timer = setTimeout(() => fail(undefined,true),timeoutMs);
  };
  const operation = (async () => {
    try {
      onStage?.("microphone");
      track = await media.capture();
      if (closed) { track.stop(); return; }
      advance("signaling");
      await media.connect(() => { if (stage === "signaling") advance("media"); });
      if (closed) { track.stop(); await media.disconnect(); return; }
      advance("publication");
      await media.publish(track);
      if (closed) { track.stop(); await media.disconnect(); return; }
      advance("connected"); ready();
    } catch (error) { fail(error); }
  })();
  return { stop, operation };
}

// Serialize effect replay/teardown without waiting for an unanswered permission
// prompt. A discarded Strict Mode setup never starts capture or connection.
export function createVoiceMount() {
  let cleanup = Promise.resolve();
  return (start: () => ReturnType<typeof startVoice>) => {
    let cancelled = false, lifecycle: ReturnType<typeof startVoice> | undefined;
    const ready = cleanup.then(() => { if (!cancelled) lifecycle = start(); });
    return { dispose() {
      cancelled = true; void lifecycle?.stop();
      cleanup = ready.then(() => lifecycle?.stop());
      return cleanup;
    } };
  };
}
