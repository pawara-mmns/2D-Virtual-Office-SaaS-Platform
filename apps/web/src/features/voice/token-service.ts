import { validVoiceRequest } from "../../../../../packages/shared/src/voice.ts";
import type { UserLookup } from "../auth/service.ts";

export async function issueVoiceToken(input: unknown, dependencies: {
  user(): Promise<UserLookup>;
  session(): Promise<{ userId: string; token: string } | null>;
  forward(token: string, input: { officeId: string; sessionId: string }): Promise<{ status: number; data: unknown }>;
}) {
  if (!validVoiceRequest(input)) return { status: 400, data: { error: "Invalid voice request." } };
  const user = await dependencies.user();
  if (user.status !== "authenticated") return { status: user.status === "unavailable" ? 503 : 401, data: { error: "Sign in with a verified account before joining voice." } };
  const session = await dependencies.session();
  if (!session || session.userId !== user.user.id) return { status: 401, data: { error: "Your session ended. Sign in again." } };
  try {
    const response = await dependencies.forward(session.token,input);
    if (response.status !== 200) {
      const status = [403,409,429,503].includes(response.status) ? response.status : 503;
      const errors: Record<number,string> = { 403: "Voice access denied. Enter the meeting room and check your active membership.",409: "Leave your existing voice session before joining again.",429: "Wait a moment before joining voice again.",503: "Voice is unavailable. Ask an administrator to check LiveKit configuration and connectivity." };
      return { status, data: { error: errors[status] } };
    }
    const data = response.data as { token?: unknown; url?: unknown } | null;
    if (!data || typeof data.token !== "string" || data.token.length > 8192 || !data.token || typeof data.url !== "string") throw new Error();
    const url = new URL(data.url);
    if (url.protocol !== "wss:" || !url.hostname.endsWith(".livekit.cloud") || url.origin !== data.url) throw new Error();
    return { status: 200, data: { token: data.token, url: url.origin } };
  } catch { return { status: 503, data: { error: "Voice authorization could not complete. Check the connection and retry." } }; }
}
