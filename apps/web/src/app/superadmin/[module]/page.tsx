import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/features/platform-admin/server';
import { AdminConsole, AdminSecurity, AdminShell } from '@/features/platform-admin/admin-ui';
import { modules } from '@/features/platform-admin/admin-service';
export default async function Page({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (module !== 'security' && !modules.includes(module as typeof modules[number])) notFound();
  const ctx = await requireAdminPage(module === 'security');
  return <AdminShell username={ctx.session.username} pending={!ctx.session.mfa} active={module}>
    <Suspense fallback={<p>Loading console…</p>}>{module === 'security' ? <AdminSecurity /> : <AdminConsole module={module} />}</Suspense>
  </AdminShell>;
}
