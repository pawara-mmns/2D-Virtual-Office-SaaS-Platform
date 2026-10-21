import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/database.types.ts";
import { avatarBaseFrame, avatarBody, avatarDirections, avatarDisplayName, avatarIdleFrame, avatarPresets, defaultAvatar, isAvatarKey, safeAvatarKey } from "./presets.ts";
import { animationDirection, avatarIsWalking } from "./animation.ts";
import { loadAvatarProfile, saveAvatarPreference } from "./service.ts";
import { movement } from "../office/input/movement.ts";

const id = "250d1968-67d7-4d3c-8846-92f26747d76d";
const other = "7df17a9c-1c4c-472f-88d5-8d2db93e96a5";
function database(fetcher: typeof fetch) { return createClient<Database>("https://database.example.invalid", "unit-public-key", { global: { fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } }); }
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }
const verified = { id, email: "test@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };

test("six allowlisted presets occupy disjoint twelve-frame ranges with one collision footprint", () => {
  assert.equal(avatarPresets.length, 6);
  const frames = new Set<number>();
  for (const preset of avatarPresets) {
    assert.equal(isAvatarKey(preset.key), true);
    assert.equal(avatarBaseFrame(preset.key), preset.index * 12);
    for (const direction of avatarDirections) for (const step of [0, 1, 2]) frames.add(avatarIdleFrame(preset.key, direction) + step);
  }
  assert.equal(frames.size, 72);
  assert.deepEqual(avatarBody, { width: 14, height: 10, offsetX: 9, offsetY: 22 });
  for (const key of [null, undefined, "", "FERN", "../../file", "unknown", { key: "fern" }]) { assert.equal(isAvatarKey(key), false); assert.equal(safeAvatarKey(key), defaultAvatar); }
});
test("profile names are compact, strip controls and never disclose email-like display names", () => {
  assert.equal(avatarDisplayName("  Alex   Lee  "), "Alex Lee");
  assert.equal(avatarDisplayName("test@example.invalid"), "You");
  assert.equal(avatarDisplayName("   "), "You");
  assert.equal(avatarDisplayName(null), "You");
  assert.equal(avatarDisplayName("A\nB\u202eC"), "A B C");
  assert.equal([...avatarDisplayName("A".repeat(100))].length, 18);
});
test("standing or wall-blocked motion is idle; wall slides and diagonals retain a correct stable facing", () => {
  assert.equal(avatarIsWalking(0, 0, 1, 0), false);
  assert.equal(avatarIsWalking(1, 0, 0, 0), false);
  assert.equal(avatarIsWalking(1, 0, 1, 0), true);
  assert.equal(animationDirection("right", 1, -1, 0, -2), "up");
  assert.equal(animationDirection("up", 1, -1, 2, 0), "right");
  const buffer = { x: 0, y: 0, facing: "up" as const };
  const diagonal = movement(new Set(["KeyW", "KeyD"]), "up", buffer);
  assert.equal(diagonal, buffer); assert.equal(diagonal.facing, "up");
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
  assert.equal(movement(new Set(["KeyW", "KeyD"]), "right").facing, "right");
});
test("saved profile loads only for the supplied authenticated identity and safely defaults legacy/missing keys", async () => {
  for (const profile of [{ avatar_key: "plum", display_name: "Alex" }, { avatar_key: "legacy-character", display_name: "" }, null]) {
    const client = database(async (url) => { const parsed = new URL(String(url)); assert.equal(parsed.searchParams.get("id"), `eq.${id}`); return json(profile); });
    const result = await loadAvatarProfile(client, id);
    assert.equal(result.avatarKey, profile?.avatar_key === "plum" ? "plum" : defaultAvatar);
    assert.equal(result.displayName, profile?.display_name || "You");
  }
  await assert.rejects(loadAvatarProfile(database(async () => json({ code: "42501", message: "private" }, 403)), id), /could not be loaded/);
});
test("save derives identity from verified Auth and changes only avatar_key", async (context) => {
  const client = database(async (url, options) => {
    assert.equal(options?.method, "PATCH");
    assert.equal(new URL(String(url)).searchParams.get("id"), `eq.${id}`);
    assert.deepEqual(JSON.parse(String(options?.body)), { avatar_key: "harbor" });
    assert.equal(String(options?.body).includes(other), false);
    return json([{ avatar_key: "harbor" }]);
  });
  context.mock.method(client.auth, "getUser", async () => ({ data: { user: verified }, error: null }));
  assert.equal(await saveAvatarPreference(client, "harbor"), "harbor");
});
test("missing profile insertion and creation races preserve unrelated fields", async (context) => {
  for (const conflict of [false, true]) {
    let calls = 0;
    const client = database(async (_url, options) => {
      calls++;
      if (calls === 1) return json([]);
      if (calls === 2) {
        assert.deepEqual(JSON.parse(String(options?.body)), { id, avatar_key: "clay" });
        return conflict ? json({ code: "23505", message: "race" }, 409) : json({ avatar_key: "clay" });
      }
      assert.equal(options?.method, "PATCH"); assert.deepEqual(JSON.parse(String(options?.body)), { avatar_key: "clay" });
      return json([{ avatar_key: "clay" }]);
    });
    context.mock.method(client.auth, "getUser", async () => ({ data: { user: verified }, error: null }));
    assert.equal(await saveAvatarPreference(client, "clay"), "clay"); assert.equal(calls, conflict ? 3 : 2);
  }
});
test("save/reload preferences remain specific to each freshly authenticated user", async (context) => {
  let actor = verified;
  const profiles = new Map([[id, { display_name: "Alex", avatar_key: "fern" }], [other, { display_name: "Sam", avatar_key: "fern" }]]);
  const client = database(async (url, options) => {
    const target = new URL(String(url)).searchParams.get("id")!.slice(3);
    const profile = profiles.get(target)!;
    if (options?.method === "PATCH") { profile.avatar_key = JSON.parse(String(options.body)).avatar_key; return json([{ avatar_key: profile.avatar_key }]); }
    return json(profile);
  });
  context.mock.method(client.auth, "getUser", async () => ({ data: { user: actor }, error: null }));
  await saveAvatarPreference(client, "plum"); actor = { ...verified, id: other };
  await saveAvatarPreference(client, "ochre");
  assert.deepEqual(await loadAvatarProfile(client, id), { avatarKey: "plum", displayName: "Alex" });
  assert.deepEqual(await loadAvatarProfile(client, other), { avatarKey: "ochre", displayName: "Sam" });
});
test("invalid selections and anonymous/unverified users never reach profile writes", async (context) => {
  let writes = 0;
  const client = database(async () => { writes++; return json([]); });
  await assert.rejects(saveAvatarPreference(client, "unknown"), /supported avatar/);
  for (const user of [null, { ...verified, email_confirmed_at: undefined }, { ...verified, is_anonymous: true }]) {
    const mock = context.mock.method(client.auth, "getUser", async () => ({ data: { user }, error: null }));
    await assert.rejects(saveAvatarPreference(client, "fern"), /verified account/); mock.mock.restore();
  }
  assert.equal(writes, 0);
});
test("RLS denial and unsuccessful writes never become a successful save", async (context) => {
  for (const response of [() => json({ code: "42501", message: "private" }, 403), () => json([{ avatar_key: "fern" }])]) {
    const client = database(async () => response());
    context.mock.method(client.auth, "getUser", async () => ({ data: { user: verified }, error: null }));
    await assert.rejects(saveAvatarPreference(client, "slate"), /could not be/);
  }
});
