export async function readPlatformTelemetry(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch) {
  const url = env.REALTIME_INTERNAL_URL || env.NEXT_PUBLIC_REALTIME_URL, key = env.PLATFORM_OPERATIONS_KEY;
  const unavailable = (reason: string, message: string) => ({ available: false as const, observedAt: null,
    connectedUsers: null, realtimeRooms: null, voiceSessions: null, readiness: 'unobservable', reason, message });
  if (!url || !key) return unavailable('missing_configuration', 'Realtime origin or shared operations key is not configured.');
  let origin: URL;
  try {
    origin = new URL(url);
    if (key.length < 43 || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname))) throw new Error();
  } catch { return unavailable('invalid_configuration', 'Realtime operations configuration is invalid.'); }
  try {
    const response = await fetcher(`${origin.origin}/platform/metrics`, { headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(3000) });
    if ([401,403].includes(response.status)) return unavailable('authorization_rejected', 'The realtime server rejected the operations key. Check both services and restart after changing it.');
    if (response.status === 404) return unavailable('endpoint_missing', 'This realtime server does not expose platform telemetry. Restart it with the matching application version.');
    if (!response.ok) return unavailable('service_unavailable', 'The realtime authority is reachable but cannot provide metrics.');
    const result = await response.json();
    if (!result || !['connectedUsers','realtimeRooms','voiceSessions'].every(k => result[k] === null || Number.isSafeInteger(result[k]) && result[k] >= 0) ||
      result.connectedUsers === null || result.realtimeRooms === null) return unavailable('invalid_response', 'Realtime telemetry returned an invalid response.');
    return { available: true as const, observedAt: new Date().toISOString(), connectedUsers: result.connectedUsers,
      realtimeRooms: result.realtimeRooms, voiceSessions: result.voiceSessions, readiness: result.readiness === 'ready' ? 'ready' : 'not_ready',
      reason: null, message: result.voiceSessions === null ? 'Voice observations are unavailable from the provider.' : 'Observed by the realtime authority.' };
  } catch { return unavailable('unreachable', 'The configured realtime authority could not be reached.'); }
}
