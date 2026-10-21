"use client";

import { useId, useRef, useState } from "react";
import type { InvitationLink } from "@/features/invitations/validation";
import { copyInvitationLink } from "@/features/invitations/clipboard";

export function InvitationLinkResult({ link }: { link: InvitationLink }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  async function copy() {
    const copied = await copyInvitationLink(link.url, navigator.clipboard);
    setCopyState(copied ? "copied" : "manual");
    if (!copied) { input.current?.focus(); input.current?.select(); }
  }
  return <div className="space-y-3 rounded border border-line bg-white p-4">
    <label htmlFor={id} className="block text-sm font-medium">Private invitation link</label>
    <input ref={input} id={id} type="text" readOnly value={link.url} autoComplete="off" spellCheck={false}
      aria-describedby={`${id}-help`} className="auth-input w-full" onFocus={(event) => event.currentTarget.select()} />
    <p id={`${id}-help`} className="text-sm leading-6 text-muted">Copy this link now. It is shown only for this action and cannot be retrieved after leaving this page. Share it only with the invited person.</p>
    <p className="text-sm">Expires <time dateTime={link.expiresAt}>{new Date(link.expiresAt).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}</time>.</p>
    <button type="button" className="auth-button" onClick={copy}>Copy link</button>
    <p role="status" aria-live="polite" className="text-sm leading-6">{copyState === "copied" ? "Link copied." : copyState === "manual" ? "Clipboard access is unavailable. The link is selected; copy it manually." : ""}</p>
  </div>;
}
