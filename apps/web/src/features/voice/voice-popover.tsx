"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { HudIcon } from '@/components/hud-icon';

// Disclosure only: opening settings never remounts the capture or Room owner.
export function VoicePopover({ label, children, className = '', icon = 'settings' }: {
  label: string; children: ReactNode; className?: string; icon?: 'settings' | 'audio';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('button, input, select')?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const element = panel.current;
      if (!element) return;
      element.style.setProperty('--voice-popover-shift', '0px');
      const bounds = element.getBoundingClientRect();
      const shift = Math.max(8 - bounds.left, 0) + Math.min(innerWidth - 8 - bounds.right, 0);
      element.style.setProperty('--voice-popover-shift', `${shift}px`);
    };
    position();
    window.addEventListener('resize', position);
    return () => window.removeEventListener('resize', position);
  }, [open]);
  return <div ref={root} className={`voice-popover ${className}`} data-open={open}
    onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <button ref={trigger} type="button" className="office-control voice-popover-trigger" aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><HudIcon name={icon}/></button>
    {open && <div ref={panel} id={id} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} className="voice-popover-panel" data-glass-surface="" data-glass-variant="elevated">
      <header className="voice-popover-header"><h2 id={`${id}-title`}>{label}</h2><button type="button" className="office-control" aria-label={`Close ${label}`} title={`Close ${label}`} onClick={close}><HudIcon name="close"/></button></header>
      <div className="voice-popover-body">{children}</div>
    </div>}
  </div>;
}
