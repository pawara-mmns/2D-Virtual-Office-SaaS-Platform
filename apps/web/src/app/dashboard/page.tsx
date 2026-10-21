import type { Metadata } from "next";
import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/server";
import { SignOutButton } from "@/features/auth/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your workspace | Virtual Office", robots: { index: false, follow: false } };

export default async function DashboardPage() {
  // This page-level lookup is the authorization boundary, independent of Proxy.
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-10">
      <header className="flex min-h-24 items-center justify-between gap-4 border-b border-line">
        <Link href="/" className="font-semibold tracking-tight">Virtual Office</Link>
        <form action={signOutAction}><SignOutButton /></form>
      </header>
      <main id="main-content" className="py-12 sm:py-16">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">Your account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Welcome to Virtual Office</h1>
        <p className="mt-3 text-sm text-muted">Signed in as <span className="break-all font-medium text-ink">{user.email}</span></p>
        <section aria-labelledby="workspace-heading" className="mt-10 border border-line bg-white px-6 py-12 sm:px-10">
          <h2 id="workspace-heading" className="text-lg font-semibold">No workspace yet</h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-muted">Your account is ready. Workspace creation and team access will be available in a future update.</p>
        </section>
      </main>
    </div>
  );
}
