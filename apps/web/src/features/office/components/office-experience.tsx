"use client";

import dynamic from "next/dynamic";
import type { AvatarAppearance } from "@/features/avatars/presets";

const OfficeCanvas = dynamic(() => import("./office-canvas"), {
  ssr: false,
  loading: () => <div className="flex min-h-110 items-center justify-center border border-line bg-surface"><p role="status" className="text-sm text-muted">Loading office engine…</p></div>,
});
export function OfficeExperience({ appearance, profileWarning }: { appearance: AvatarAppearance; profileWarning?: string }) { return <OfficeCanvas appearance={appearance} profileWarning={profileWarning} />; }
