import { createWebReadiness } from "@/lib/readiness";
import { getSupabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const readiness = createWebReadiness(process.env, getSupabaseConfig());

export async function GET() {
  const report = await readiness();
  return Response.json(report, {
    status: report.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow" },
  });
}
