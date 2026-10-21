import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/server";
import { getUserOrganizations } from "@/features/organizations/server";
import { OrganizationError, type UserOrganization } from "@/features/organizations/service";
import { workspacePath } from "@/features/organizations/validation";
import { WorkspaceShell } from "@/features/organizations/workspace-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your workspace | Virtual Office", robots: { index: false, follow: false } };

export default async function DashboardPage() {
  // This page-level lookup is the authorization boundary, independent of Proxy.
  const user = await requireUser();
  let organizations: UserOrganization[] = [];
  let errorMessage: string | undefined;
  try {
    organizations = await getUserOrganizations();
  } catch (error) {
    errorMessage = error instanceof OrganizationError ? error.message : "We couldn’t load your workspaces. Please try again shortly.";
  }
  return (
    <WorkspaceShell email={user.email}>
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-semibold tracking-widest text-muted uppercase">Your workspaces</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Welcome to Virtual Office</h1>
          <p className="mt-3 text-sm leading-7 text-muted">Choose a workspace to continue, or create a new place for your team.</p>
        </div>
        <Link href="/organizations/new" className="auth-button shrink-0">Create workspace</Link>
      </div>
      {errorMessage ? (
        <p role="alert" className="mt-10 border-l-2 border-amber-700 bg-amber-50 p-4 text-sm leading-7 text-amber-950">{errorMessage}</p>
      ) : organizations.length ? (
        <ul aria-label="Your workspaces" className="mt-10 divide-y divide-line border-y border-line">
          {organizations.map((organization) => (
            <li key={organization.id}>
              <Link href={workspacePath(organization.id)} className="flex min-h-24 items-center justify-between gap-6 px-3 py-5 hover:bg-surface sm:px-5">
                <span className="min-w-0"><span className="block break-words font-semibold">{organization.name}</span><span className="mt-2 block text-xs text-muted">{organization.role}</span></span>
                <span aria-hidden="true" className="text-forest">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section aria-labelledby="workspace-heading" className="mt-10 border border-line bg-white px-6 py-12 sm:px-10">
          <h2 id="workspace-heading" className="text-lg font-semibold">No workspace yet</h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-muted">Create your first workspace to get started. You’ll become its owner and receive one default office.</p>
          <Link href="/organizations/new" className="auth-text-link mt-5 inline-block">Create your first workspace</Link>
        </section>
      )}
    </WorkspaceShell>
  );
}
