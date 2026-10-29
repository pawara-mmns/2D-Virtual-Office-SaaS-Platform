"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { attachHudReflections } from "./hud-reflections";

type GlassChoice = "auto" | "glass" | "solid";
const preferenceKey = "virtual-office:hud-material";
const GlassPreference = createContext<{ choice: GlassChoice; reduced: boolean; locked: boolean; change(value: GlassChoice): void } | null>(null);
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
  if (!supported || transparency || contrast || slow) return "solid";
  const interaction = motion || !pointer ? "static" : "reactive";
  return lowPower ? `limited-${interaction}` : interaction;
}
function readMaterialPreference(): GlassChoice {
  if (typeof window === "undefined") return "auto";
  try {
    const value = localStorage.getItem(preferenceKey);
    if (value === "auto" || value === "glass" || value === "solid") return value;
    return localStorage.getItem("virtual-office:hud-solid") === "true" ? "solid" : "auto";
  } catch { return "auto"; }
}

export function HudGlassControl() {
  const preference = useContext(GlassPreference);
  if (!preference) return null;
  return <div>
    <label htmlFor="office-hud-material" className="hud-glass-preference">HUD appearance
      <select id="office-hud-material" className="office-control" value={preference.choice} onChange={(event) => { const value = event.target.value; if (value === "auto" || value === "glass" || value === "solid") preference.change(value); }}>
        <option value="auto">Automatic</option><option value="glass">Liquid Glass</option><option value="solid">Solid</option>
      </select>
    </label>
    <p className="mt-2 text-xs leading-5 text-muted">{preference.locked ? "Solid surfaces are active to respect your system or browser settings." : preference.reduced ? "Automatic is using Solid on this device. Liquid Glass prioritizes appearance; Solid prioritizes clarity and performance." : "Automatic balances appearance and performance. System accessibility preferences always apply."}</p>
  </div>;
}

export function HudGlass({ children, reducedEffects = false }: { children: ReactNode; reducedEffects?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [choice, setChoice] = useState(readMaterialPreference);
  const environment = useSyncExternalStore(subscribeEnvironment, readEnvironment, () => "solid");
  const automaticReduced = reducedEffects || environment.startsWith("limited-");
  const solid = choice === "solid" || environment === "solid" || (choice === "auto" && automaticReduced);
  const reactive = !solid && environment.endsWith("reactive");
  useEffect(() => {
    if (!root.current || !reactive) return;
    return attachHudReflections(root.current);
  }, [reactive]);
  const change = (value: GlassChoice) => {
    setChoice(value);
    try { localStorage.setItem(preferenceKey, String(value)); } catch { /* The in-session preference still applies. */ }
  };
  return <GlassPreference.Provider value={{ choice, change, reduced: choice === "auto" && automaticReduced, locked: environment === "solid" }}>
    <div ref={root} className="office-hud" data-glass={solid ? "solid" : "enhanced"} data-glass-choice={choice}>{children}</div>
  </GlassPreference.Provider>;
}
