import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/features/auth/server';
import { getOrganizationById,getOrganizationMembership,getOrganizationOffice } from '@/features/organizations/server';
import { WorkspaceShell } from '@/features/organizations/workspace-shell';
import { isOrganizationId } from '@/features/organizations/validation';
import { EnvironmentStudio } from '@/features/environment/environment-studio';
import { loadEnvironment } from '@/features/environment/service';
import { createClient } from '@/lib/supabase/server';
import type { EnvironmentDatabase } from '../../../../../../../packages/shared/src/environment/database';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Office environment | Virtual Office',robots:{index:false,follow:false}};
export default async function OfficeEnvironmentPage({params}:{params:Promise<{organizationId:string}>}){
  const user=await requireUser(),{organizationId}=await params;if(!isOrganizationId(organizationId))notFound();
  let workspace;
  try {
    const [organization,membership]=await Promise.all([getOrganizationById(organizationId),getOrganizationMembership(organizationId)]);
    if(organization&&membership?.role==='OWNER') {
      const office=await getOrganizationOffice(organizationId);
      if(office) workspace={organization,office,initial:await loadEnvironment(await createClient<EnvironmentDatabase>(),office.id)};
    }
  } catch {
    return <WorkspaceShell email={user.email}><h1 className="text-2xl font-semibold">Office settings unavailable</h1><p role="alert" className="ui-notice ui-notice-error mt-4">We could not load the saved setup. Try again shortly; no changes were made.</p><Link href={"/workspace/"+organizationId} className="auth-text-link mt-5 inline-block">Back to workspace</Link></WorkspaceShell>;
  }
  if(!workspace)notFound();
  const {organization,office,initial}=workspace;
  return <WorkspaceShell email={user.email}><Link className="auth-text-link" href={"/workspace/"+organizationId}>Back to {organization.name}</Link><EnvironmentStudio initial={initial} officeId={office.id} organizationId={organizationId}/></WorkspaceShell>;
}
