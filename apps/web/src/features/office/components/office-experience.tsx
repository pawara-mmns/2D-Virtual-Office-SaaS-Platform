"use client";

import type { EnvironmentConfig } from "../../../../../../packages/shared/src/environment/catalog.ts";
import dynamic from "next/dynamic";
import type { AvatarAppearance } from "@/features/avatars/presets";
import type { OfficeContext } from "./office-canvas";

const OfficeCanvas = dynamic(() => import("./office-canvas"), {
  ssr: false,
  loading: () => <div className="flex h-full min-h-64 items-center justify-center bg-surface"><p role="status" className="text-sm text-muted">Loading office engine…</p></div>,
});
export function OfficeExperience({ appearance, profileWarning, officeId, userId, context, environment }: { environment?: EnvironmentConfig; appearance: AvatarAppearance; profileWarning?: string; officeId: string; userId: string; context: OfficeContext }) { return <OfficeCanvas appearance={appearance} profileWarning={profileWarning} officeId={officeId} userId={userId} context={context} environment={environment} />; }
