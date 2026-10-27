import Link from "next/link";
import { signOutAction } from "@/features/auth/actions";
import { SignOutButton } from "@/features/auth/sign-out-button";

export function WorkspaceShell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-10">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="flex min-h-24 flex-wrap items-center justify-between gap-4 border-b border-line py-4">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center font-semibold tracking-tight">Virtual Office</Link>
        <div className="flex min-w-0 flex-wrap items-center gap-4 sm:gap-6">
          <span className="max-w-56 truncate text-xs text-muted" title={email}>{email}</span>
          <form action={signOutAction}><SignOutButton /></form>
        </div>
      </header>
      <main id="main-content" className="py-10 sm:py-14">{children}</main>
    </div>
  );
}
