// Server-side operational probes only. Never pass request headers, cookies or
// user tokens here. Reports contain fixed check names and statuses, not errors.
export type ReadinessReport = { status: "ready" | "not_ready"; checks: Record<string, "ready" | "unavailable"> };
type Check = (signal: AbortSignal) => boolean | Promise<boolean>;

export function createReadinessCheck(checks: Record<string, Check>, now = Date.now) {
  let cached: ReadinessReport | undefined, expires = 0;
  let pending: Promise<ReadinessReport> | undefined;
  return (): Promise<ReadinessReport> => {
    if (cached && now() < expires) return Promise.resolve(cached);
    if (pending) return pending;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    pending = Promise.all(Object.entries(checks).map(async ([name, check]) => {
      let abort!: () => void;
      const timeout = new Promise<boolean>(resolve => {
        abort = () => resolve(false);
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      try {
        const ok = await Promise.race([Promise.resolve().then(() => check(controller.signal)), timeout]);
        return [name, ok === true ? "ready" : "unavailable"] as const;
      } catch { return [name, "unavailable"] as const; }
      finally { controller.signal.removeEventListener("abort", abort); }
    })).then(entries => {
      const report: ReadinessReport = {
        status: entries.length > 0 && entries.every(([, status]) => status === "ready") ? "ready" : "not_ready",
        checks: Object.fromEntries(entries),
      };
      cached = report; expires = now() + 5000;
      return report;
    }).finally(() => { clearTimeout(timer); pending = undefined; });
    return pending;
  };
}

export function supabaseReadiness(config: { url: string; key: string } | null, fetcher: typeof fetch = fetch): Record<string, Check> {
  return {
    async authentication(signal) {
      if (!config) return false;
      const response = await fetcher(`${config.url}/auth/v1/health`, {
        headers: { apikey: config.key }, cache: "no-store", redirect: "error", signal,
      });
      await response.body?.cancel();
      return response.status === 200;
    },
    async database(signal) {
      if (!config) return false;
      // No tenant reads or writes. The existing anonymous privilege denial is a
      // round trip through PostgREST to PostgreSQL. Unexpected grants fail closed.
      const response = await fetcher(`${config.url}/rest/v1/profiles?select=id&limit=0`, {
        headers: { apikey: config.key }, cache: "no-store", redirect: "error", signal,
      });
      if (response.status !== 401 && response.status !== 403) { await response.body?.cancel(); return false; }
      const data: unknown = await response.json();
      return !!data && typeof data === "object" && "code" in data && data.code === "42501";
    },
  };
}
