"use client";

import { useFormStatus } from "react-dom";

export function SignOutButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="auth-text-link disabled:cursor-wait disabled:opacity-60">{pending ? "Signing out…" : "Sign out"}</button>;
}
