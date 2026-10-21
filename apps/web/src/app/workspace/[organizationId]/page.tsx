import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/server";
import { getOrganizationById, getOrganizationMembership, getOrganizationOffice, getUserOrganizations } from "@/features/organizations/server";
import { OrganizationError } from "@/features/organizations/service";
import { isOrganizationId } from "@/features/organizations/validation";
import { WorkspaceShell } from "@/features/organizations/workspace-shell";
import { WorkspaceSwitcher } from "@/features/organizations/workspace-switcher";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace | Virtual Office", robots: { index: false, follow: false } };

export default async function WorkspacePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const user = await requireUser();
  const { organizationId } = await params;
  if (!isOrganizationId(organizationId)) notFound();
  let workspace;
  try {
    const [organization, membership] = await Promise.all([
      getOrganizationById(organizationId), getOrganizationMembership(organizationId),
    ]);
    if (organization && membership) {
      const [office, organizations] = await Promise.all([getOrganizationOffice(organizationId), getUserOrganizations()]);
      workspace = { organization, membership, office, organizations };
    }
  } catch (error) {
    return (
      <WorkspaceShell email={user.email}>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace unavailable</h1>
        <p role="alert" className="mt-4 max-w-lg text-sm leading-7 text-muted">{error instanceof OrganizationError ? error.message : "We couldn’t load this workspace. Please try again shortly."}</p>
        <Link href="/dashboard" className="auth-text-link mt-6 inline-block">Back to workspaces</Link>
      </WorkspaceShell>
    );
  }
  // Missing and inaccessible IDs share the same response; the URL is not an
  // authorization source. Supabase RLS and the explicit membership lookup agree.
  if (!workspace) notFound();
  const { organization, membership, office, organizations } = workspace;
  return (
    <WorkspaceShell email={user.email}>
      <Link href="/dashboard" className="auth-text-link">All workspaces</Link>
      <div className="mt-7 flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">Active workspace</p>
          <h1 className="mt-3 break-words text-3xl font-semibold tracking-tight">{organization.name}</h1>
          <p className="mt-3 text-sm text-muted">Your role: <span className="font-medium text-ink">{membership.role}</span></p>
        </div>
        <WorkspaceSwitcher organizations={organizations} currentId={organization.id} />
      </div>
      <dl className="mt-10 grid gap-6 border-y border-line py-6 text-sm sm:grid-cols-2">
        <div><dt className="text-muted">Workspace identifier</dt><dd className="mt-2 break-all font-mono text-xs">{organization.slug}</dd></div>
        <div><dt className="text-muted">Status</dt><dd className="mt-2">Active</dd></div>
      </dl>
      <section aria-labelledby="office-heading" className="mt-10 border border-line bg-white p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">Default office</p>
        <h2 id="office-heading" className="mt-3 text-xl font-semibold">{office?.name ?? "Office unavailable"}</h2>
        <p className="mt-3 max-w-lg text-sm leading-7 text-muted">{office ? "Your office has been provisioned. The interactive office experience will be available in a future update." : "The default office could not be found. Ask your administrator to check workspace setup."}</p>
      </section>
    </WorkspaceShell>
  );
}
