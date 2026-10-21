"use client";

import { useActionState, useRef, useState } from "react";
import { avatarPresets, type AvatarKey } from "./presets";
import { saveAvatarAction } from "./actions";
import type { AvatarSaveState } from "./service";

function Preview({ index, large = false }: { index: number; large?: boolean }) {
  const scale = large ? 3 : 2;
  return <span aria-hidden="true" className="block shrink-0 pixel-art" style={{ width: 32 * scale, height: 32 * scale, backgroundImage: "url('/office/avatar.png')", backgroundRepeat: "no-repeat", backgroundSize: `${96 * scale}px ${768 * scale}px`, backgroundPosition: `0 -${index * 128 * scale}px` }} />;
}
export function AvatarSettings({ currentKey, onSaved, onReturn }: { currentKey: AvatarKey; onSaved(key: AvatarKey): void; onReturn(): void }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState(currentKey);
  const [state, action, pending] = useActionState(async (_previous: AvatarSaveState, form: FormData): Promise<AvatarSaveState> => {
    const result = await saveAvatarAction({ status: "idle" }, form);
    if (result.status === "success" && result.avatarKey) onSaved(result.avatarKey);
    return result;
  }, { status: "idle" });
  const preview = avatarPresets.find((preset) => preset.key === draft)!;
  return <details ref={details} className="mt-5 rounded-md border border-line bg-white p-4 sm:p-5" onToggle={(event) => { if (event.currentTarget.open) setDraft(currentKey); }}>
    <summary className="w-fit cursor-pointer text-sm font-semibold">Avatar settings</summary>
    <form action={action} className="mt-5 space-y-5">
      <div className="flex items-center gap-4"><Preview index={preview.index} large /><div><p className="font-semibold">{preview.name}</p><p className="mt-1 text-sm text-muted">{preview.description}</p><p className="mt-2 text-xs text-muted">Preview only until you save.</p></div></div>
      <fieldset disabled={pending}><legend className="mb-3 text-sm font-medium">Choose your avatar</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{avatarPresets.map((preset) => <label key={preset.key} className={`flex cursor-pointer items-center gap-3 rounded border px-3 py-2 ${draft === preset.key ? "border-forest bg-surface" : "border-line"}`}>
          <input type="radio" name="avatarKey" value={preset.key} checked={draft === preset.key} onChange={() => setDraft(preset.key)} className="accent-forest" />
          <Preview index={preset.index} /><span><span className="block text-sm font-semibold">{preset.name}</span><span className="mt-1 block text-xs leading-5 text-muted">{preset.description}</span></span>
        </label>)}</div>
      </fieldset>
      <div className="flex flex-wrap gap-4"><button type="submit" className="auth-button" disabled={pending}>{pending ? "Saving…" : "Save avatar"}</button><button type="button" className="auth-text-link" disabled={pending} onClick={() => { if (details.current) details.current.open = false; setDraft(currentKey); onReturn(); }}>Return to office</button></div>
      {state.message && (state.status !== "success" || state.avatarKey === draft) && <p role={state.status === "error" ? "alert" : "status"} className={`text-sm leading-6 ${state.status === "error" ? "text-red-800" : "text-forest"}`}>{state.message}</p>}
    </form>
  </details>;
}
