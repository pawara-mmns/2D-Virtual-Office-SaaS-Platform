import assert from "node:assert/strict";
import { test } from "node:test";
import { connectOffice, realtimeUrl } from "./connection.ts";
import type { Presence } from "../../../../../../packages/shared/src/protocol.ts";
test("realtime endpoint accepts exact HTTP origins, requiring HTTPS in production", () => {
  assert.equal(realtimeUrl("http://localhost:2567", false), "http://localhost:2567");
  assert.equal(realtimeUrl("https://realtime.example.test", true), "https://realtime.example.test");
  for (const url of [undefined, "ws://localhost:2567", "http://localhost:2567/path", "http://name:password@localhost:2567", "https://realtime.example.test?token=bad"]) assert.throws(() => realtimeUrl(url, false));
  assert.throws(() => realtimeUrl("http://localhost:2567", true));
});
test("admission sends bearer only in headers, surfaces denial, and releases lifecycle timers", async () => {
  const original = globalThis.fetch;
  const states: Presence[] = [];
  globalThis.fetch = async (address, init) => {
    assert.equal(String(address), "http://localhost:2567/office/join");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-secret");
    assert.deepEqual(JSON.parse(String(init?.body)), { officeId: "office-fixture", mapVersion: "map-fixture" });
    assert.equal(init?.credentials, "omit"); assert.equal(init?.cache, "no-store");
    return new Response("{}", { status: 403 });
  };
  const network = connectOffice({ url: "http://localhost:2567", officeId: "office-fixture", mapVersion: "map-fixture", getToken: async () => "fixture-secret", onPresence: (state) => states.push(state) });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(states.at(-1)?.status, "offline"); assert.equal(states.at(-1)?.count, 0);
    assert.match(states.at(-1)!.notice, /access denied/);
    assert.equal(network.snapshot(), undefined);
    assert.equal(network.sendChat?.("offline", "00000000-0000-4000-8000-000000000001"), false);
    assert.equal(network.setAvailability?.("BUSY"), false);
  } finally { network.close(); network.close(); globalThis.fetch = original; }
});
test("cancelled asynchronous startup never requests or mounts a stale room", async () => {
  const original = globalThis.fetch;
  let finish!: (token: string | null) => void, requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("{}"); };
  const network = connectOffice({ url: "http://localhost:2567", officeId: "office-fixture", mapVersion: "map-fixture", getToken: () => new Promise((resolve) => { finish = resolve; }), onPresence() {} });
  try { network.close(); finish("fixture-secret"); await new Promise((resolve) => setTimeout(resolve, 10)); assert.equal(requests, 0); }
  finally { network.close(); globalThis.fetch = original; }
});
