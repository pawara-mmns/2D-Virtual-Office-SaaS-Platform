import { createClient } from "@supabase/supabase-js";
import { avatarDisplayName, safeAvatarKey, type AvatarAppearance } from "../../../../packages/shared/src/avatars.ts";
import { isId } from "../../../../packages/shared/src/protocol.ts";
export class AccessDenied extends Error { constructor() { super("Office access denied. Sign in and verify active membership."); } }
export type Authorization = AvatarAppearance & { userId: string; organizationId: string; officeId: string; token: string; expiresAt: number; checkedAt: number };
export type Authorize = (token: unknown, officeId: unknown) => Promise<Authorization>;
export type IdentitySource = {
  user(): Promise<{ id: string; confirmed: boolean; anonymous: boolean } | null>;
  office(id: string): Promise<{ id: string; organizationId: string } | null>;
  activeOrganization(id: string): Promise<boolean>;
  activeMember(organizationId: string, userId: string): Promise<boolean>;
  profile(id: string): Promise<{ avatarKey: unknown; displayName: unknown } | null>;
};
export async function authorizeIdentity(token: unknown, officeId: unknown, source: IdentitySource, now = Date.now()): Promise<Authorization> {
  if (typeof token !== "string" || !token || token.length > 8192 || !isId(officeId)) throw new AccessDenied();
  const user = await source.user();
  if (!user || !isId(user.id) || !user.confirmed || user.anonymous) throw new AccessDenied();
  // Read expiry ONLY after the Auth server independently validates the token.
  let expiresAt: number;
  try { expiresAt = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()).exp * 1000; } catch { throw new AccessDenied(); }
  if (!Number.isFinite(expiresAt) || expiresAt <= now) throw new AccessDenied();
  const office = await source.office(officeId);
  if (!office || office.id !== officeId || !isId(office.organizationId)) throw new AccessDenied();
  const [activeOrganization, activeMember, profile] = await Promise.all([
    source.activeOrganization(office.organizationId), source.activeMember(office.organizationId, user.id), source.profile(user.id),
  ]);
  if (!activeOrganization || !activeMember) throw new AccessDenied();
  const name = avatarDisplayName(profile?.displayName);
  return { userId: user.id, organizationId: office.organizationId, officeId, token, expiresAt, checkedAt: now,
    avatarKey: safeAvatarKey(profile?.avatarKey), displayName: name };
}
export function supabaseAuthorizer(url: string, key: string): Authorize {
  return async (token, officeId) => {
    if (typeof token !== "string" || !token || token.length > 8192 || !isId(officeId)) throw new AccessDenied();
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4000) }) } });
    const source: IdentitySource = {
      async user() { const { data, error } = await client.auth.getUser(token); if (error || !data.user) return null;
        return { id: data.user.id, confirmed: !!data.user.email_confirmed_at, anonymous: !!data.user.is_anonymous }; },
      async office(id) { const { data, error } = await client.from("offices").select("id,organization_id").eq("id", id).maybeSingle();
        if (error) throw new AccessDenied(); return data ? { id: data.id, organizationId: data.organization_id } : null; },
      async activeOrganization(id) { const { data, error } = await client.from("organizations").select("id").eq("id", id).eq("status", "ACTIVE").maybeSingle(); return !error && !!data; },
      async activeMember(organizationId, userId) { const { data, error } = await client.from("organization_members").select("id,role").eq("organization_id", organizationId).eq("user_id", userId).eq("status", "ACTIVE").maybeSingle(); return !error && !!data && ["OWNER", "ADMIN", "MEMBER"].includes(data.role); },
      async profile(id) { const { data, error } = await client.from("profiles").select("avatar_key,display_name").eq("id", id).maybeSingle();
        if (error) throw new AccessDenied(); return data ? { avatarKey: data.avatar_key, displayName: data.display_name } : null; },
    };
    // Total authorization deadline, including sequential RLS reads.
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([authorizeIdentity(token, officeId, source), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new AccessDenied()), 4500); deadline.unref(); })]); }
    finally { clearTimeout(deadline); }
  };
}
