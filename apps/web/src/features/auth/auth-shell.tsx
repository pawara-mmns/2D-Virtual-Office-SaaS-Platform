import Link from "next/link";
import { authSetupMessage, getSupabaseConfig } from "@/lib/supabase/config";

export function AuthShell({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 sm:px-10">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="flex min-h-24 items-center border-b border-line">
        <Link href="/" className="inline-flex min-h-11 items-center text-base font-semibold tracking-tight">Virtual Office</Link>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-sm flex-1 py-12 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 mb-8 text-sm leading-6 text-muted">{description}</p>
        {!getSupabaseConfig() && <p role="status" className="ui-notice ui-notice-warning mb-6">{authSetupMessage}</p>}
        {children}
      </main>
      <footer className="border-t border-line py-6 text-xs text-muted">A shared place for your workday.</footer>
    </div>
  );
}
