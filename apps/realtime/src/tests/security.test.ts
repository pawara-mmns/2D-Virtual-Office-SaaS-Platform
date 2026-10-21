import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { authorizeIdentity, AccessDenied, type IdentitySource } from "../auth/authorize.ts";
import { realtimeConfig } from "../config/environment.ts";
import { canStand, simulate, type Position } from "../movement/simulation.ts";
import { validateOfficeMap, mapMarkers, PLAYER_SPEED } from "../../../../packages/shared/src/map.ts";
import { validInput, mapVersion, TICK_MS } from "../../../../packages/shared/src/protocol.ts";

const userId = "00000000-0000-4000-8000-000000000001", orgId = "00000000-0000-4000-8000-000000000002", officeId = "00000000-0000-4000-8000-000000000003";
const map = validateOfficeMap(JSON.parse(readFileSync(new URL("../../../web/public/office/studio.json", import.meta.url), "utf8")));
const token = (exp = Date.now() / 1000 + 60) => `test.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.test`;
function source(): IdentitySource {
  return { user: async () => ({ id: userId, confirmed: true, anonymous: false }), office: async (id) => id === officeId ? { id, organizationId: orgId } : null,
    activeOrganization: async () => true, activeMember: async () => true, profile: async () => ({ avatarKey: "slate", displayName: "Alice" }) };
}
test("authorization accepts only independently verified active members; saved profile is authoritative", async () => {
  const auth = await authorizeIdentity(token(), officeId, source());
  assert.equal(auth.userId, userId); assert.equal(auth.organizationId, orgId); assert.equal(auth.avatarKey, "slate"); assert.equal(auth.displayName, "Alice");
  assert.equal("email" in auth, false);
});
test("anonymous, invalid, unverified, expired and inactive identities fail closed", async () => {
  for (const change of [
    { user: async () => null }, { user: async () => ({ id: userId, confirmed: false, anonymous: false }) },
    { user: async () => ({ id: userId, confirmed: true, anonymous: true }) }, { activeMember: async () => false }, { activeOrganization: async () => false },
    { office: async () => ({ id: orgId, organizationId: orgId }) },
  ]) await assert.rejects(authorizeIdentity(token(), officeId, { ...source(), ...change }), AccessDenied);
  for (const bad of [undefined, "", "invalid", token(0), token(NaN)]) await assert.rejects(authorizeIdentity(bad, officeId, source()), AccessDenied);
  await assert.rejects(authorizeIdentity(token(), orgId, source()), AccessDenied);
});
test("input permits only finite unit axes and bounded monotonic sequence shapes", () => {
  assert.ok(validInput({ seq: 0, x: -1, y: 1 }));
  for (const value of [null, {}, [], { seq: 1, x: Infinity, y: 0 }, { seq: 1, x: NaN, y: 0 }, { seq: 1, x: .5, y: 0 },
    { seq: -1, x: 0, y: 0 }, { seq: 1, x: 1, y: 0, position: 999 }, { seq: 1, x: 999, y: 0 }, { seq: Number.MAX_SAFE_INTEGER + 1, x: 0, y: 0 }]) assert.equal(validInput(value), false);
});
test("server movement has normalized diagonal speed, fixed ticks, wall and furniture collision", () => {
  const start: Position = { x: 600, y: 450, direction: "down", isMoving: false };
  const straight = { ...start }, diagonal = { ...start };
  simulate(map, straight, { x: 1, y: 0 }); simulate(map, diagonal, { x: 1, y: 1 });
  const expected = PLAYER_SPEED * TICK_MS / 1000;
  assert.ok(Math.abs(straight.x - start.x - expected) < .001);
  assert.ok(Math.abs(Math.hypot(diagonal.x - start.x, diagonal.y - start.y) - expected) < .001);
  const wall = { ...start, x: 48, y: 496 }, furniture = { ...start, x: 512, y: 272 };
  for (let i = 0; i < 200; i++) { simulate(map, wall, { x: -1, y: 0 }); simulate(map, furniture, { x: 0, y: -1 }); }
  assert.ok(wall.x >= 39 && wall.x <= 40); assert.ok(furniture.y >= 186 && furniture.y <= 187);
  assert.ok(canStand(map, wall.x, wall.y)); assert.ok(canStand(map, furniture.x, furniture.y));
  assert.equal(wall.isMoving, false); assert.equal(furniture.isMoving, false);
  assert.equal(canStand(map, -50, -50), false); assert.equal(canStand(map, map.width * 32, map.height * 32), false);
});
test("canonical map fingerprint changes with geometry and spawn while preserving current map", () => {
  const same = structuredClone(map); assert.equal(mapVersion(same), mapVersion(map));
  const spawn = mapMarkers(same).find((m) => m.type === "spawn")!; spawn.x++;
  assert.notEqual(mapVersion(same), mapVersion(map));
});
test("configuration restricts origins, HTTPS and publishable keys", () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", REALTIME_ALLOWED_ORIGINS: "http://localhost:3000" };
  assert.equal(realtimeConfig(env).port, 2567);
  assert.throws(() => realtimeConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }));
  assert.throws(() => realtimeConfig({ ...env, REALTIME_ALLOWED_ORIGINS: "*" }));
  assert.throws(() => realtimeConfig({ ...env, NODE_ENV: "production" }));
  assert.equal(realtimeConfig({ ...env, NODE_ENV: "production", REALTIME_ALLOWED_ORIGINS: "https://office.example.test" }).origins[0], "https://office.example.test");
});
