import Link from "next/link";
import { authSetupMessage, getSupabaseConfig } from "@/lib/supabase/config";

export function AuthShell({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-6 sm:px-10">
      <header className="flex min-h-24 items-center border-b border-line">
        <Link href="/" className="text-base font-semibold tracking-tight">Virtual Office</Link>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-sm flex-1 py-12 sm:py-20">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 mb-8 text-sm leading-6 text-muted">{description}</p>
        {!getSupabaseConfig() && <p role="status" className="mb-6 border-l-2 border-amber-700 bg-amber-50 p-3 text-sm leading-6 text-amber-950">{authSetupMessage}</p>}
        {children}
      </main>
      <footer className="border-t border-line py-6 text-xs text-muted">A shared place for your workday.</footer>
    </div>
  );
}
