import { requireUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import { listUserOrganizations, provisionOrganization, throwOrganizationDataError } from "./service";
import { isOrganizationId } from "./validation";

export async function getUserOrganizations() {
  const user = await requireUser();
  const client = await createClient();
  return listUserOrganizations(client, user.id);
}

export async function getOrganizationById(id: string) {
  await requireUser();
  if (!isOrganizationId(id)) return null;
  const client = await createClient();
  const { data, error } = await client.from("organizations").select("id,name,slug,status,created_at,updated_at")
    .eq("id", id).eq("status", "ACTIVE").maybeSingle();
  if (error) throwOrganizationDataError(error);
  return data;
}

export async function getOrganizationMembership(id: string) {
  const user = await requireUser();
  if (!isOrganizationId(id)) return null;
  const client = await createClient();
  const { data, error } = await client.from("organization_members").select("id,organization_id,role,status,joined_at")
    .eq("organization_id", id).eq("user_id", user.id).eq("status", "ACTIVE").maybeSingle();
  if (error) throwOrganizationDataError(error);
  return data;
}

export async function getOrganizationOffice(id: string) {
  await requireUser();
  if (!isOrganizationId(id)) return null;
  const client = await createClient();
  const { data, error } = await client.from("offices").select("id,organization_id,name,created_at")
    .eq("organization_id", id).maybeSingle();
  if (error) throwOrganizationDataError(error);
  return data;
}

export async function createOrganization(name: unknown, requestId: unknown) {
  await requireUser();
  const client = await createClient();
  return provisionOrganization(client, name, requestId);
}
