"use client";

import { useActionState, useState, type ReactNode } from "react";
import { OfficeDisclosure, type OfficePanelControl } from "@/components/office-disclosure";
import { avatarPresets, type AvatarKey } from "./presets";
import { saveAvatarAction } from "./actions";
import type { AvatarSaveState } from "./service";

function Preview({ index, scale = 2 }: { index: number; scale?: 1 | 2 }) {
  return <span aria-hidden="true" className="block shrink-0 pixel-art" style={{ width: 32 * scale, height: 32 * scale, backgroundImage: "url('/office/avatar.png')", backgroundRepeat: "no-repeat", backgroundSize: `${96 * scale}px ${768 * scale}px`, backgroundPosition: `0 -${index * 128 * scale}px` }} />;
}
export function AvatarSettings({ currentKey, displayName, onSaved, panel, icon }: { currentKey: AvatarKey; displayName: string; onSaved(key: AvatarKey, name?: string): void; panel?: OfficePanelControl; icon?: ReactNode }) {
  const [draft, setDraft] = useState(currentKey);
  const [name, setName] = useState(displayName);
  const [state, action, pending] = useActionState(async (_previous: AvatarSaveState, form: FormData): Promise<AvatarSaveState> => {
    const result = await saveAvatarAction({ status: "idle" }, form);
    if (result.status === "success" && result.avatarKey) onSaved(result.avatarKey, result.displayName);
    return result;
  }, { status: "idle" });
  const preview = avatarPresets.find((preset) => preset.key === draft)!;
  return <OfficeDisclosure label="Avatar settings" panel={panel} icon={icon} material="elevated" onOpen={() => { setDraft(currentKey); setName(displayName); }}>
    <form action={action} className="space-y-4">
      <h3 className="text-sm font-semibold">Your appearance</h3>
      <div className="flex items-center gap-3"><Preview index={preview.index} /><div><p className="text-sm font-semibold">{preview.name}</p><p className="mt-1 text-xs text-muted">{preview.description}</p></div></div>
      <div><label htmlFor="office-display-name" className="text-xs font-medium">Display name</label><input id="office-display-name" name="displayName" autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} maxLength={36} disabled={pending} className="auth-input mt-1" aria-describedby="office-name-help" required /><p id="office-name-help" className="mt-1 text-xs leading-5 text-muted">1–18 characters, visible to teammates. Do not use an email address.</p></div>
      <fieldset disabled={pending}><legend className="mb-3 text-sm font-medium">Choose your avatar</legend>
        <div className="grid grid-cols-2 gap-2">{avatarPresets.map((preset) => <label key={preset.key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded border px-2 py-1 ${draft === preset.key ? "border-forest bg-surface" : "border-control"}`}>
          <input type="radio" name="avatarKey" value={preset.key} checked={draft === preset.key} onChange={() => setDraft(preset.key)} className="accent-forest" />
          <Preview index={preset.index} scale={1} /><span className="text-xs font-medium">{preset.name}</span>
        </label>)}</div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3"><button type="submit" className="auth-button" disabled={pending}>{pending ? "Saving…" : "Save appearance"}</button><p className="text-xs text-muted">Preview only until you save.</p></div>
      {state.message && (state.status !== "success" || state.avatarKey === draft && state.displayName === name) && <p role={state.status === "error" ? "alert" : "status"} className={`ui-notice ${state.status === "error" ? "ui-notice-error" : "ui-notice-success"}`}>{state.message}</p>}
    </form>
  </OfficeDisclosure>;
}
