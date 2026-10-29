"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { attachHudReflections } from "./hud-reflections";

const preferenceKey = "virtual-office:hud-solid";
const GlassPreference = createContext<{ solid: boolean; change(value: boolean): void } | null>(null);
const queries = ["(prefers-reduced-transparency: reduce)", "(prefers-reduced-motion: reduce)", "(hover: hover) and (pointer: fine)", "(forced-colors: active)", "(update: slow)"];
function subscribeEnvironment(change: () => void) {
  const media = queries.map((query) => matchMedia(query));
  media.forEach((query) => query.addEventListener("change", change));
  return () => media.forEach((query) => query.removeEventListener("change", change));
}
function readEnvironment() {
  if (typeof window === "undefined") return "solid";
  const [transparency, motion, pointer, contrast, slow] = queries.map((query) => matchMedia(query).matches);
  const supported = typeof CSS !== "undefined" && typeof CSS.supports === "function" && (CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)"));
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowPower = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) || (typeof memory === "number" && memory <= 4);
  return !supported || transparency || contrast || slow || lowPower || !pointer ? "solid" : motion ? "static" : "reactive";
}
function readSolidPreference() {
  try { return typeof window !== "undefined" && localStorage.getItem(preferenceKey) === "true"; }
  catch { return false; }
}

export function HudGlassControl() {
  const preference = useContext(GlassPreference);
  if (!preference) return null;
  return <div>
    <label className="hud-glass-preference"><input type="checkbox" checked={preference.solid} onChange={(event) => preference.change(event.target.checked)} />Always use solid HUD surfaces</label>
    <p className="mt-1 text-xs leading-5 text-muted">Reduce visual effects for clarity or better performance. System and device settings may also reduce effects.</p>
  </div>;
}

export function HudGlass({ children, reducedEffects = false }: { children: ReactNode; reducedEffects?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(readSolidPreference);
  const environment = useSyncExternalStore(subscribeEnvironment, readEnvironment, () => "solid");
  useEffect(() => {
    if (!root.current || solid || reducedEffects || environment !== "reactive") return;
    return attachHudReflections(root.current);
  }, [solid, reducedEffects, environment]);
  const change = (value: boolean) => {
    setSolid(value);
    try { localStorage.setItem(preferenceKey, String(value)); } catch { /* The in-session preference still applies. */ }
  };
  return <GlassPreference.Provider value={{ solid, change }}>
    <div ref={root} className="office-hud" data-glass={solid || reducedEffects || environment === "solid" ? "solid" : "enhanced"}>{children}</div>
  </GlassPreference.Provider>;
}
