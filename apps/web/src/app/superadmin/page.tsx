import { Suspense } from 'react';
import { requireAdminPage } from '@/features/platform-admin/server';
import { AdminConsole, AdminShell } from '@/features/platform-admin/admin-ui';
export default async function Page() {
  const ctx = await requireAdminPage();
  return <AdminShell username={ctx.session.username} pending={false} active=""><Suspense fallback={<p>Loading console…</p>}><AdminConsole module="" /></Suspense></AdminShell>;
}
