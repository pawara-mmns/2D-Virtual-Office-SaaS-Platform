"use client";

import Link from "next/link";

export default function ApplicationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">We couldn’t complete that request</h1>
      <p role="alert" className="mt-4 text-sm leading-7 text-muted">Check your connection and try again. If you were resetting a password, request a fresh email link before retrying.</p>
      <div className="mt-6 flex flex-wrap items-center gap-6">
        <button type="button" onClick={reset} className="auth-button">Try again</button>
        <Link href="/login" className="auth-text-link">Back to sign in</Link>
      </div>
    </main>
  );
}
