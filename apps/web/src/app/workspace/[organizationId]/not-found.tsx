import Link from "next/link";

export default function WorkspaceNotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace not available</h1>
      <p className="mt-4 text-sm leading-7 text-muted">This workspace doesn’t exist or you don’t have access to it.</p>
      <Link href="/dashboard" className="auth-text-link mt-6 inline-block">Back to workspaces</Link>
    </main>
  );
}
