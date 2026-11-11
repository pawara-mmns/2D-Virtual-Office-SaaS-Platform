"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Armchair, Check, ChevronLeft, ChevronRight, Footprints, Glasses, PersonStanding, RotateCcw, Scissors, Shirt, Shuffle, Smile, UserRound, Wind, X } from 'lucide-react';
import type { OfficePanelControl } from '@/components/office-disclosure';
import { avatarPresets, type AvatarDirection, type AvatarKey } from './presets';
import { avatarCatalog, avatarSwatches, defaultCustomization, encodeCustomization, randomCustomization, type AvatarColorKey, type AvatarPart } from '../../../../../packages/shared/src/avatar-customization';
import { AvatarPreview } from './avatar-preview';
import { optionCrop, studioDraft, studioLabel, studioSignature, withAvatarOption, type StudioDraft } from './studio-model';
import { saveAvatarAction } from './actions';
import { validateDisplayName, type AvatarSaveState } from './service';

const categories = [
  { label: 'Body', icon: UserRound, parts: ['body'], color: 'skinColor' },
  { label: 'Hair', icon: Scissors, parts: ['hair'], color: 'hairColor' },
  { label: 'Face', icon: Smile, parts: ['eyes', 'eyebrows', 'expression'] },
  { label: 'Tops', icon: Shirt, parts: ['top'], color: 'topColor' },
  { label: 'Bottoms', icon: PantsIcon, parts: ['bottom'], color: 'bottomColor' },
  { label: 'Shoes', icon: Footprints, parts: ['shoes'], color: 'shoeColor' },
  { label: 'Accessories', icon: Glasses, parts: ['glasses', 'headphones', 'hat', 'office'], color: 'accessoryColor' },
] satisfies { label: string; icon: typeof UserRound | typeof PantsIcon; parts: AvatarPart[]; color?: AvatarColorKey }[];
const rotations: AvatarDirection[] = ['down', 'left', 'up', 'right'];
const directionLabels = { down: 'South', left: 'West', up: 'North', right: 'East' };
const motions = [{ value: 'idle', label: 'Idle', icon: PersonStanding }, { value: 'walking', label: 'Walk', icon: Footprints }, { value: 'running', label: 'Run', icon: Wind }, { value: 'sitting', label: 'Sit', icon: Armchair }] as const;
function PantsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12l2 18h-7l-1-11-1 11H4L6 3Zm0 4h12M12 3v4" /></svg>; }
type SettingsProps = { currentKey: AvatarKey; displayName: string; appearance?: string; onSaved(key: AvatarKey, name?: string, appearance?: string): void; panel?: OfficePanelControl; icon?: ReactNode };

export function AvatarSettings(props: SettingsProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = props.panel?.open ?? localOpen;
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const change = (value: boolean) => props.panel ? props.panel.onOpenChange(value) : setLocalOpen(value);
  const close = () => {
    change(false);
    queueMicrotask(() => props.panel?.returnFocus ? props.panel.returnFocus() : trigger.current?.focus({ preventScroll: true }));
  };
  return <div className="office-disclosure" data-open={open}>
    <button ref={trigger} type="button" className="office-control" aria-label="Avatar settings" title="Customize Avatar" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => change(true)}>{props.icon}<span className="hud-control-label">Avatar settings</span></button>
    {open && (props.panel?.container ?? (typeof document === 'undefined' ? null : document.body)) && createPortal(<AvatarStudio id={id} initial={studioDraft(props.currentKey, props.displayName, props.appearance)} onSaved={props.onSaved} onClose={close} />, props.panel?.container ?? document.body)}
  </div>;
}

function AvatarStudio({ id, initial, onSaved, onClose }: { id: string; initial: StudioDraft; onSaved: SettingsProps['onSaved']; onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const [draft, setDraft] = useState(initial);
  const [baseline, setBaseline] = useState(() => studioSignature(initial));
  const [category, setCategory] = useState(0);
  const [partIndex, setPartIndex] = useState(0);
  const [presets, setPresets] = useState(false);
  const [direction, setDirection] = useState<AvatarDirection>('down');
  const [motion, setMotion] = useState<typeof motions[number]['value']>('idle');
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [feedback, setFeedback] = useState<AvatarSaveState>({ status: 'idle' });
  const dirty = studioSignature(draft) !== baseline;
  const selected = categories[category]!;
  const part = selected.parts[partIndex] ?? selected.parts[0]!;
  const color = selected.color;
  const encoded = encodeCustomization(draft.config);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal(); closeButton.current?.focus({ preventScroll: true });
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { if (confirm) keepEditing.current?.focus({ preventScroll: true }); }, [confirm]);
  const requestClose = () => { if (!pending) { if (dirty) setConfirm(true); else onClose(); } };
  const clearFeedback = () => setFeedback({ status: 'idle' });
  const update = (key: AvatarPart | AvatarColorKey, value: string) => {
    if (draft.config[key] === value) return;
    setDraft(previous => ({ ...previous, custom: true, config: withAvatarOption(previous.config, key, value) })); clearFeedback();
  };
  const chooseCategory = (index: number) => { setCategory(index); setPartIndex(0); setPresets(false); };
  const rotate = (step: number) => setDirection(previous => rotations[(rotations.indexOf(previous) + step + 4) % 4]!);
  const resume = () => { setConfirm(false); requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true })); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dirty || saving.current) return;
    let name: string;
    try { name = validateDisplayName(draft.name); }
    catch (error) { setFeedback({ status: 'error', message: error instanceof Error ? error.message : 'Check your display name.' }); dialog.current?.querySelector<HTMLInputElement>('[name=displayName]')?.focus(); return; }
    const form = new FormData(event.currentTarget); form.set('displayName', name);
    saving.current = true; setPending(true); clearFeedback();
    try {
      const result = await saveAvatarAction({ status: 'idle' }, form);
      if (result.status === 'success' && result.avatarKey) {
        const saved = { ...draft, name: result.displayName ?? name };
        setDraft(saved); setBaseline(studioSignature(saved));
        onSaved(result.avatarKey, saved.name, result.appearance);
        setFeedback({ status: 'success', message: 'Appearance saved.' });
      } else setFeedback({ status: 'error', message: result.message ?? 'Could not save. Your changes are still here.' });
    } catch { setFeedback({ status: 'error', message: 'Could not save. Your changes are still here. Try again.' }); }
    finally { saving.current = false; setPending(false); }
  };
  const options = avatarCatalog[part].filter(value => part !== 'bottom' || (draft.config.top === 'dress' ? value === 'none' : value !== 'none'));
  return <dialog ref={dialog} id={id} className="avatar-studio" aria-labelledby={`${id}-title`} aria-describedby={`${id}-feedback`}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (confirm) resume(); else requestClose(); } }}
    onCancel={event => { event.preventDefault(); if (confirm) resume(); else requestClose(); }}
    onPointerDown={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) requestClose(); } }}>
    <form className="avatar-creator" onSubmit={submit}>
      <input type="hidden" name="avatarKey" value={draft.key} /><input type="hidden" name="appearance" value={draft.custom ? encoded : 'null'} />
      <header className="studio-header"><div className="studio-title"><UserRound aria-hidden="true" /><h2 id={`${id}-title`}>Customize Avatar</h2></div><button ref={closeButton} type="button" className="studio-icon-button" title="Close" aria-label="Close Customize Avatar" disabled={pending} onClick={requestClose}><X aria-hidden="true" /></button></header>
      <div className="studio-main" inert={confirm}>
        <section className="studio-preview-pane" aria-label="Character preview">
          <div className="studio-stage"><span className="studio-stage-orbit" aria-hidden="true" /><AvatarPreview appearance={draft.custom ? encoded : undefined} avatarKey={draft.key} direction={direction} motion={motion} size={256} /><span className="studio-stage-facing" aria-hidden="true">{directionLabels[direction]}</span></div>
          <div className="studio-profile">
            <label className="studio-name" htmlFor={`${id}-name`}><span>Name</span><input id={`${id}-name`} name="displayName" aria-label="Display name" autoComplete="nickname" value={draft.name} maxLength={36} disabled={pending} onChange={event => { setDraft(previous => ({ ...previous, name: event.target.value })); clearFeedback(); }} aria-invalid={feedback.status === 'error' && feedback.message?.includes('characters') || undefined} aria-describedby={`${id}-feedback`} required /></label>
            <div className="studio-rotation" aria-label="Character rotation"><button type="button" className="studio-icon-button" title="Rotate left" aria-label="Rotate left" onClick={() => rotate(-1)}><ChevronLeft aria-hidden="true" /></button><span aria-live="polite">{directionLabels[direction]}</span><button type="button" className="studio-icon-button" title="Rotate right" aria-label="Rotate right" onClick={() => rotate(1)}><ChevronRight aria-hidden="true" /></button></div>
            <div className="studio-motions" role="group" aria-label="Preview animation">{motions.map(({ value, label, icon: Icon }) => <button key={value} type="button" className="studio-icon-button" title={label} aria-label={`${label} preview`} aria-pressed={motion === value} onClick={() => setMotion(value)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>
          </div>
        </section>
        <section className="studio-wardrobe" aria-label="Appearance options">
          <div className="studio-categories" role="tablist" aria-label="Appearance categories" onKeyDown={event => {
            let next: number | undefined;
            if (event.key === 'ArrowRight') next = (category + 1) % categories.length;
            if (event.key === 'ArrowLeft') next = (category + categories.length - 1) % categories.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = categories.length - 1;
            if (next !== undefined) { event.preventDefault(); chooseCategory(next); const tab = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]; tab?.focus(); tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
          }}>{categories.map(({ label, icon: Icon }, index) => <button key={label} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={category === index} aria-controls={`${id}-options`} tabIndex={category === index ? 0 : -1} disabled={pending} title={label} onClick={() => chooseCategory(index)}><Icon aria-hidden="true" /><span>{label}</span></button>)}</div>
          <div className="studio-options-scroll" id={`${id}-options`} role="tabpanel" aria-labelledby={`${id}-tab-${category}`} tabIndex={0} key={category}>
            <fieldset disabled={pending}>
              <div className="studio-options-heading"><h3>{presets ? 'Original presets' : selected.label}</h3>{category === 0 ? <button type="button" className="studio-text-button" onClick={() => setPresets(value => !value)}>{presets ? 'Body styles' : 'Original presets'}</button> : <span>{options.length} options</span>}</div>
              {!presets && selected.parts.length > 1 && <div className="studio-parts" role="group" aria-label={`${selected.label} details`}>{selected.parts.map((value, index) => <button key={value} type="button" aria-pressed={partIndex === index} onClick={() => setPartIndex(index)}>{studioLabel(value)}</button>)}</div>}
              <div className="studio-option-grid" role="radiogroup" aria-label={presets ? 'Original presets' : `${studioLabel(part)} options`}>
                {presets ? avatarPresets.map(preset => <label key={preset.key} className="studio-option-card" title={preset.description}>
                  <input type="radio" name="studio-preset" aria-label={preset.name} checked={!draft.custom && draft.key === preset.key} onChange={() => { setDraft(previous => studioDraft(preset.key, previous.name)); clearFeedback(); }} />
                  <span className="studio-thumbnail"><AvatarPreview avatarKey={preset.key} size={64} decorative /></span><span className="studio-option-label">{preset.name}</span><Check className="studio-selected" aria-hidden="true" />
                </label>) : options.map(value => {
                  const candidate = withAvatarOption(draft.config, part, value);
                  return <label key={`${part}-${value}`} className="studio-option-card" title={studioLabel(value)}>
                    <input type="radio" name={`studio-${part}`} aria-label={studioLabel(value)} checked={draft.config[part] === value} onChange={() => update(part, value)} />
                    <span className="studio-thumbnail"><AvatarPreview appearance={encodeCustomization(candidate)} {...optionCrop(part)} decorative /></span><span className="studio-option-label">{value === 'none' && part === 'bottom' ? 'Dress silhouette' : studioLabel(value)}</span><Check className="studio-selected" aria-hidden="true" />
                  </label>;
                })}
              </div>
              {!presets && color && <div className="studio-colors"><div className="studio-color-heading"><h4>{studioLabel(color)}</h4><span aria-hidden="true">{draft.config[color].toUpperCase()}</span></div><div className="studio-swatches" role="group" aria-label={studioLabel(color)}>{avatarSwatches[color].map(value => <button key={value} type="button" aria-label={`${studioLabel(color)} ${value}`} title={value.toUpperCase()} aria-pressed={draft.config[color] === value} style={{ '--swatch': value } as React.CSSProperties} onClick={() => update(color, value)}><Check aria-hidden="true" /></button>)}<label className="studio-custom-color" title={`Custom ${studioLabel(color).toLowerCase()}`}><span aria-hidden="true">+</span><input type="color" aria-label={`Custom ${studioLabel(color).toLowerCase()}`} value={draft.config[color]} onChange={event => update(color, event.target.value)} /></label></div></div>}
              {part === 'bottom' && !presets && draft.config.top === 'dress' && <p className="studio-context-note">Your dress includes its matching skirt.</p>}
            </fieldset>
          </div>
        </section>
      </div>
      <footer className="studio-footer" inert={confirm}>
        <div className="studio-utilities"><button type="button" className="studio-icon-button" title="Randomize appearance" aria-label="Randomize appearance" disabled={pending} onClick={() => { setDraft(previous => ({ ...previous, custom: true, config: randomCustomization() })); clearFeedback(); }}><Shuffle aria-hidden="true" /></button><button type="button" className="studio-icon-button" title="Reset to default" aria-label="Reset to default" disabled={pending} onClick={() => { setDraft(previous => ({ ...previous, custom: true, config: { ...defaultCustomization } })); clearFeedback(); }}><RotateCcw aria-hidden="true" /></button></div>
        <p id={`${id}-feedback`} className="studio-feedback" data-status={feedback.status} role={feedback.status === 'error' ? 'alert' : 'status'} aria-live="polite">{pending ? 'Saving…' : feedback.message ?? (dirty ? 'Unsaved changes' : 'All changes saved')}</p>
        <div className="studio-actions"><button type="button" className="studio-cancel" disabled={pending} onClick={requestClose}>Cancel</button><button type="submit" className="studio-save" disabled={!dirty || pending}>{pending ? 'Saving…' : 'Save Appearance'}{!pending && <Check aria-hidden="true" />}</button></div>
      </footer>
    </form>
    {confirm && <div className="studio-discard" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-discard-title`} aria-describedby={`${id}-discard-description`} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus();
    }}><div><h3 id={`${id}-discard-title`}>Discard your changes?</h3><p id={`${id}-discard-description`}>Your saved avatar will stay as it is.</p><div><button ref={keepEditing} type="button" className="studio-save" onClick={resume}>Keep editing</button><button type="button" className="studio-cancel" onClick={onClose}>Discard changes</button></div></div></div>}
  </dialog>;
}
