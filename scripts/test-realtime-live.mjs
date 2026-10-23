// Built server + configured Supabase negative paths only. No real users, tokens,
// email, database writes, or privileged access. Positive joins remain manual.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root = resolve(import.meta.dirname, "..");
// Exercise the entry/CWD described by the actual Railway start command. Node
// is spawned directly here on Windows; the Linux shell/exec layer is not claimed
// as tested. Never run a Railway CLI or upload/deploy from this fixture.
const deployment = JSON.parse(readFileSync(resolve(root, "railway.json"), "utf8"));
const prefix = "cd apps/realtime && exec node ";
assert.ok(deployment.deploy.startCommand.startsWith(prefix));
const startArguments = deployment.deploy.startCommand.slice(prefix.length).split(" ");
assert.deepEqual(startArguments, ["--env-file-if-exists=.env", "dist/apps/realtime/src/index.js"]);
test("built realtime server connects safely and rejects anonymous, invalid-token and foreign-origin admission", { timeout: 20_000 }, async () => {
  const cwd = resolve(root, "apps/realtime");
  assert.ok(existsSync(resolve(cwd, ".env")), "Configure the ignored realtime .env first.");
  const port = await new Promise((done) => {
    const socket = createServer(); socket.listen(0, "127.0.0.1", () => { const number = socket.address().port; socket.close(() => done(number)); });
  });
  const child = spawn(process.execPath, startArguments, {
    // These are negative office/Auth checks, never a second Cloud voice authority.
    // Empty child-only values override the env file and prevent orphan sweeps
    // from removing participants owned by the user's running development server.
    cwd, env: { ...process.env, NODE_ENV: "test", PORT: String(port), REALTIME_ALLOWED_ORIGINS: "http://localhost:3000",
      LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "" }, stdio: "ignore", windowsHide: true,
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (child.exitCode !== null) throw new Error("Built realtime server could not start.");
      try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch { /* starting */ }
      await delay(100);
    }
    assert.ok(ready, "Built realtime server health.");
    const { mapVersion } = await import("../packages/shared/src/protocol.ts");
    const map = JSON.parse(readFileSync(resolve(root, "apps/web/public/office/studio.json"), "utf8"));
    const request = (authorization, origin = "http://localhost:3000") => fetch(`${base}/office/join`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({ officeId: "00000000-0000-4000-8000-000000000001", mapVersion: mapVersion(map) }),
    });
    assert.equal((await request()).status, 403);
    assert.equal((await request("Bearer deliberately-invalid-proof")).status, 403);
    assert.equal((await request(undefined, "https://untrusted.example")).status, 403);
    assert.deepEqual(await (await fetch(`${base}/health`)).json(), { status: "ok" });
    const readiness = await fetch(`${base}/ready`);
    assert.equal(readiness.status,503,"An intentionally voice-disabled process is alive but not ready for the complete beta");
    assert.match(readiness.headers.get("cache-control"),/no-store/);
    assert.deepEqual(await readiness.json(),{status:"not_ready",checks:{configuration:"ready",authentication:"ready",database:"ready",voice:"unavailable"}});
  } finally { if (child.exitCode === null) { child.kill(); await new Promise((done) => child.once("exit", done)); } }
});

test("configured Railway entry fails closed before serving when required public project configuration is missing", { timeout: 20000 }, async () => {
  const child = spawn(process.execPath, startArguments, {
    cwd: resolve(root, "apps/realtime"),
    env: { ...process.env, NODE_ENV: "production", SUPABASE_URL: "", SUPABASE_PUBLISHABLE_KEY: "",
      LIVEKIT_URL: "", LIVEKIT_API_KEY: "", LIVEKIT_API_SECRET: "" },
    stdio: "ignore", windowsHide: true,
  });
  // Cold module imports can compete with browser/installation I/O in CI. This
  // is a harness watchdog, not an application admission or security timeout.
  const timer = setTimeout(() => child.kill(), 15000);
  try {
    const code = await new Promise((done, reject) => { child.once("error", () => reject(new Error("Local compiled process could not launch."))); child.once("exit", done); });
    assert.equal(code, 1, "Missing required configuration must exit with failure, not keep an apparently healthy process");
  } finally { clearTimeout(timer); if (child.exitCode === null) child.kill(); }
});
