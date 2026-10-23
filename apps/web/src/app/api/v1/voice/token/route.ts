import { createClient } from "@/lib/supabase/server";
import { lookupVerifiedUser } from "@/features/auth/service";
import { invitationAppOrigin } from "@/features/invitations/delivery-config";
import { issueVoiceToken } from "@/features/voice/token-service";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export async function POST(request: Request) {
  const origin = invitationAppOrigin();
  if (!origin || request.headers.get("origin") !== origin) return Response.json({ error: "Voice origin denied." },{ status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required." },{ status: 415, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 1024) { await reader.cancel(); return Response.json({ error: "Request too large." },{ status: 413, headers }); } chunks.push(part.value); }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const client = await createClient();
    const result = await issueVoiceToken(input,{
      user: () => lookupVerifiedUser(client.auth),
      async session() { const { data,error } = await client.auth.getSession(); return !error && data.session ? { userId: data.session.user.id, token: data.session.access_token } : null; },
      async forward(token, body) {
        const target = new URL(process.env.REALTIME_INTERNAL_URL || process.env.NEXT_PUBLIC_REALTIME_URL || "");
        if (!["http:","https:"].includes(target.protocol) || target.username || target.password || target.pathname !== "/" || target.search || target.hash ||
          target.protocol !== "https:" && !["localhost","127.0.0.1"].includes(target.hostname)) throw new Error();
        const response = await fetch(`${target.origin}/voice/token`,{ method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.any([request.signal,AbortSignal.timeout(6500)]),
          headers: { "Content-Type": "application/json", Origin: origin, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
        return { status: response.status, data: await response.json() };
      },
    });
    return Response.json(result.data,{ status: result.status, headers });
  } catch (error) { return Response.json({ error: error instanceof SyntaxError ? "Invalid voice request." : "Voice request could not complete. Check your session and server configuration." },{ status: error instanceof SyntaxError ? 400 : 503, headers }); }
}
