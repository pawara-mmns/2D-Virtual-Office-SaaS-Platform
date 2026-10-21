import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/features/auth/server";
import { OrganizationForm } from "@/features/organizations/organization-form";
import { WorkspaceShell } from "@/features/organizations/workspace-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create workspace | Virtual Office", robots: { index: false, follow: false } };

export default async function NewOrganizationPage() {
  const user = await requireUser();
  return (
    <WorkspaceShell email={user.email}>
      <Link href="/dashboard" className="auth-text-link">Back to workspaces</Link>
      <div className="mt-8 max-w-lg">
        <h1 className="text-3xl font-semibold tracking-tight">Create a workspace</h1>
        <p className="mt-3 text-sm leading-7 text-muted">A private place for your team to work together.</p>
        <OrganizationForm requestId={randomUUID()} />
      </div>
    </WorkspaceShell>
  );
}
