import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { matchesGlob, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");
test("Railway retains the shared build context, canonical map and readiness-gated single Node authority", () => {
  const config = JSON.parse(readFileSync(resolve(root, "railway.json"), "utf8"));
  const manifest = JSON.parse(readFileSync(resolve(root, "apps/realtime/package.json"), "utf8"));
  assert.equal(config.build.builder, "RAILPACK");
  assert.equal(config.build.buildCommand, `pnpm --filter ${manifest.name} build`);
  assert.equal(config.deploy.startCommand, `cd apps/realtime && exec ${manifest.scripts.start}`);
  assert.equal(config.deploy.healthcheckPath, "/ready", "Liveness must not activate an unavailable voice service");
  assert.ok(config.deploy.healthcheckTimeout >= 30);
  assert.equal(config.deploy.numReplicas, 1);
  assert.equal(config.deploy.overlapSeconds, 0);
  assert.ok(config.deploy.drainingSeconds >= 30);
  assert.equal(config.deploy.restartPolicyType, "ON_FAILURE");
  assert.ok(config.deploy.restartPolicyMaxRetries > 0 && config.deploy.restartPolicyMaxRetries <= 3);
  for (const path of ["pnpm-lock.yaml", "pnpm-workspace.yaml", "packages/shared/src/protocol.ts", "apps/web/public/office/studio.json"]) {
    assert.ok(existsSync(resolve(root, path)), "Shared source and runtime assets must be retained in the repository-root build context");
  }
});

test("Vercel upload exclusions cover local secrets without excluding shared source, manifests or office assets", () => {
  const patterns = readFileSync(resolve(root, ".vercelignore"), "utf8").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
  // These rules intentionally use plain ** globs/negations only. This tests the
  // local policy, not a remote Vercel CLI archive or a hosted source inspection.
  const excluded = path => patterns.reduce((ignored, pattern) => {
    const negated = pattern.startsWith("!");
    return matchesGlob(path, negated ? pattern.slice(1) : pattern) ? !negated : ignored;
  }, false);
  for (const path of ["apps/web/.env", "apps/realtime/.env", "apps/web/.env.local", "apps/web/.env.production.local", "supabase/.env.organization-tests.local", ".aws/credentials", ".codex/settings.json", ".cache/fixture.html", ".pnpm-store/v10/index/cache.json", "supabase/.temp/project-ref", "private.pem", "apps/realtime/dist/server.js"]) {
    assert.equal(excluded(path), true, "Local credentials and artifacts must not enter a CLI upload");
  }
  for (const path of ["apps/web/.env.example", "apps/realtime/.env.example", "pnpm-lock.yaml", "pnpm-workspace.yaml", "apps/web/package.json", "packages/shared/src/readiness.ts", "apps/web/public/office/studio.json", "apps/web/public/office/avatar.png", "apps/web/src/app/api/v1/voice/token/route.ts"]) {
    assert.equal(excluded(path), false, "Build/runtime source must remain available");
  }
});
