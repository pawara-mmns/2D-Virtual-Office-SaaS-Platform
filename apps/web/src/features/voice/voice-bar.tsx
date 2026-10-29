"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceAdmission, VoiceZoneState } from "../../../../../packages/shared/src/voice.ts";
const VoiceSession = dynamic(() => import("./voice-session"),{ ssr: false, loading: () => <p role="status">Preparing voice controls…</p> });

export function VoiceBar({ officeId, state, leave }: { officeId: string; state: VoiceZoneState; leave(): void }) {
  const [ready, setReady] = useState(false);
  const [joining,setJoining] = useState(false), [admission,setAdmission] = useState<VoiceAdmission | null>(null), [error,setError] = useState("");
  const request = useRef<AbortController | null>(null), active = useRef(false), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    // Only the surviving setup publishes readiness on the next browser frame.
    // Strict Mode cancels the discarded setup before it can enable Join.
    const frame = requestAnimationFrame(() => { if (mounted.current) setReady(true); });
    return () => { cancelAnimationFrame(frame); mounted.current = false; request.current?.abort(); leave(); };
  },[leave]);
  const stop = useCallback((message = "") => { console.info("Voice lifecycle.",{event:"stop_requested",cause:message ? "failure" : "user_leave",at:new Date().toISOString()}); request.current?.abort(); active.current = false; leave(); setAdmission(null); setJoining(false); setError(message); },[leave]);
  const leaveSession = useCallback(() => stop(),[stop]);
  const join = async () => {
    if (!mounted.current || active.current) return;
    active.current = true; setJoining(true); setError("");
    console.info("Voice connection stage.",{stage:"token_request"});
    const controller = new AbortController(); request.current = controller;
    try {
      const response = await fetch("/api/v1/voice/token",{ method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeId,sessionId: state.sessionId }), signal: AbortSignal.any([controller.signal,AbortSignal.timeout(10_000)]) });
      const data = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok) { console.warn("Voice connection failed.",{stage:"token_authorization",status:response.status}); stop(typeof data.error === "string" ? data.error : "Voice could not start. Check your access and retry."); return; }
      if (typeof data.token !== "string" || typeof data.url !== "string") throw new Error();
      console.info("Voice connection stage.",{stage:"token_authorized"});
      setAdmission({ token: data.token,url: data.url });
    } catch { if (mounted.current && !controller.signal.aborted) { console.warn("Voice connection failed.",{stage:"token_request",category:"request"}); stop("Voice could not start. Check your network connection and try again."); } }
  };
  return <section aria-label="Meeting room voice" className="office-voice">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="voice-context"><p className="font-medium">Meeting Room</p><p className="text-xs leading-6 text-muted">{state.configured ? `${admission ? "" : "Voice available · "}${state.participants === null ? "Checking participants" : `${state.participants} voice participant${state.participants === 1 ? "" : "s"}`}` : "Voice is unavailable. Try again later or contact your workspace administrator."}</p></div>
      {!admission && <div className="flex gap-2"><button className="office-control" disabled={!ready || !state.configured || joining} onClick={() => void join()}>{joining ? "Authorizing voice…" : "Join Voice"}</button>{joining && <button className="office-control" onClick={() => stop()}>Cancel</button>}</div>}
    </div>
    {error && <p role="alert" className="ui-notice ui-notice-error mt-2">{error}</p>}
    {admission && <VoiceSession admission={admission} leave={leaveSession} failed={stop} />}
  </section>;
}
