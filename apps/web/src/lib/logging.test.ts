import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import config from "../../next.config.ts";

test("Next development access logs suppress invitation and Auth confirmation/recovery proof URLs", () => {
  const logging = config.logging;
  assert.ok(logging && typeof logging === "object");
  const incoming = logging.incomingRequests;
  assert.ok(incoming && typeof incoming === "object");
  const ignored = incoming.ignore ?? [];
  for (const path of ["/invite/synthetic-proof", "/invite?proof=synthetic", "/auth/confirm?type=email&token_hash=synthetic", "/auth/confirm?type=recovery&token_hash=synthetic"]) {
    assert.ok(ignored.some(pattern => pattern.test(path)), "One-time proof paths must never enter the access log");
  }
  assert.equal(ignored.some(pattern => pattern.test("/api/health")), false, "Ordinary operational request logging stays available");
});

test("framework Server Function argument logging is disabled for sensitive prior action state", () => {
  const require = createRequire(import.meta.url);
  const { formatArgs } = require("next/dist/server/dev/server-action-logger.js");
  const marker = "synthetic-invitation-proof";
  assert.ok(formatArgs([{ status: "success", message: "Invitation created", invitationLink: { url: `https://office.example.test/invite/${marker}`, expiresAt: "2026-10-29T00:00:00Z" } }]).includes(marker), "Next's default formatter does not redact a returned link in prior action state");
  assert.ok(config.logging && typeof config.logging === "object");
  assert.equal(config.logging.serverFunctions, false, "Framework argument logging must not serialize one-time links on the next form submission");
});
