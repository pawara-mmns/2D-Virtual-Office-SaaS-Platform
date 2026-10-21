import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { getOrganizationById, getOrganizationMembership, getOrganizationOffice } from "@/features/organizations/server";
import { resolveOfficeAccess } from "@/features/office/access";
import { OfficeExperience } from "@/features/office/components/office-experience";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { loadAvatarProfile } from "@/features/avatars/service";
import { defaultAvatar, type AvatarAppearance } from "@/features/avatars/presets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Office | Virtual Office", robots: { index: false, follow: false } };
export default async function OfficePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const user = await requireUser();
  const { organizationId: id } = await params;
  let access;
  try { access = await resolveOfficeAccess(id, { organization: getOrganizationById, membership: getOrganizationMembership, office: getOrganizationOffice }); }
  catch { return <main className="mx-auto max-w-xl px-6 py-16"><h1 className="text-2xl font-semibold">Office unavailable</h1><p role="alert" className="mt-4 text-sm leading-7 text-muted">We could not verify office access. Try again shortly.</p><Link href="/dashboard" className="auth-text-link mt-6 inline-block">Back to workspaces</Link></main>; }
  if (access.status === "denied") notFound();
  if (access.status === "unavailable") return <main className="mx-auto max-w-xl px-6 py-16"><h1 className="text-2xl font-semibold">Office unavailable</h1><p role="alert" className="mt-4 text-sm leading-7 text-muted">This workspace has no available office record. Ask your administrator to check workspace setup.</p><Link href={`/workspace/${id}`} className="auth-text-link mt-6 inline-block">Back to workspace</Link></main>;
  let appearance: AvatarAppearance = { avatarKey: defaultAvatar, displayName: "You" };
  let profileWarning: string | undefined;
  try { appearance = await loadAvatarProfile(await createClient<Database>(), user.id); }
  catch { profileWarning = "Your saved avatar could not be loaded. A default is shown; try saving your preference again shortly."; }
  return <div className="mx-auto max-w-400 px-4 py-5 sm:px-8 sm:py-7">
    <a className="skip-link" href="#office-main">Skip to office</a>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0"><p className="truncate text-xs font-medium text-muted">{access.organization.name}</p><h1 className="mt-1 break-words text-xl font-semibold tracking-tight">{access.office.name}</h1></div>
      <Link href={`/workspace/${id}`} className="auth-text-link">Back to workspace</Link>
    </header>
    <main id="office-main"><p className="mt-5 text-sm leading-6 text-muted">A quiet place to get oriented. Explore your office with the keyboard.</p><OfficeExperience key={user.id} appearance={appearance} profileWarning={profileWarning} /></main>
  </div>;
}
