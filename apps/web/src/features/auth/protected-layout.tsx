import { requireUser } from "./server";

// Authenticate before a child loading boundary can stream an HTTP 200 response.
// Pages and data functions still perform their own authorization checks.
export async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
