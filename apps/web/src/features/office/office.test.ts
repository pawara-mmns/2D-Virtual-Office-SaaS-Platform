import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { blocked, mapMarkers, tileLayer, validateOfficeMap } from "./maps/map-data.ts";
import { attachMovementInput, movement } from "./input/movement.ts";
import { officeZoom } from "./engine/camera.ts";
import { createOfficeLifecycle, type OfficeController } from "./engine/lifecycle.ts";
import { resolveOfficeAccess, type OfficeAccessSource } from "./access.ts";

function mapSource() { return JSON.parse(readFileSync(new URL("../../../public/office/studio.json", import.meta.url), "utf8")); }
test("original atlas and directional avatar sheets align with their fixed 32px grid", () => {
  for (const [name, width, height] of [["office-tiles.png", 512, 256], ["avatar.png", 96, 768]] as const) {
    const png = readFileSync(new URL(`../../../public/office/${name}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
  }
});
test("Tiled map has valid layers, closed boundaries and a collision-free foot-body spawn", () => {
  const map = validateOfficeMap(mapSource());
  assert.equal(map.tilewidth, 32); assert.equal(map.tileheight, 32);
  assert.equal(tileLayer(map, "Floor").data.every((gid) => gid > 0), true);
  for (const name of ["Architecture", "Furniture"]) for (const [i, gid] of tileLayer(map, name).data.entries()) if (gid) assert.equal(tileLayer(map, "Collision").data[i], 1);
  assert.equal(blocked(map, -1, 5), true); assert.equal(blocked(map, map.width, 5), true);
  assert.equal(mapMarkers(map).filter((m) => m.type === "spawn").length, 1);
});
test("all four areas have an unobstructed grid path from the entrance", () => {
  const map = validateOfficeMap(mapSource());
  const spawn = mapMarkers(map).find((m) => m.type === "spawn")!;
  const pending: [number, number][] = [[Math.floor(spawn.x / 32), Math.floor(spawn.y / 32)]];
  const seen = new Set<string>();
  while (pending.length) {
    const [x, y] = pending.pop()!;
    const key = `${x},${y}`; if (seen.has(key) || blocked(map, x, y)) continue;
    seen.add(key);
    pending.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const areas = mapMarkers(map).filter((m) => m.type === "area");
  assert.equal(areas.length, 4);
  for (const area of areas) assert.ok(seen.has(`${Math.floor(area.x / 32)},${Math.floor(area.y / 32)}`), `${area.name} must be reachable`);
});
test("malformed maps, open boundaries, binary collision violations and blocked spawns fail closed", () => {
  for (const change of [
    (m: ReturnType<typeof mapSource>) => { m.tilewidth = 16; },
    (m: ReturnType<typeof mapSource>) => { m.layers[3].data[1] = 0; },
    (m: ReturnType<typeof mapSource>) => { m.layers[3].data[50] = 2; },
    (m: ReturnType<typeof mapSource>) => { const s = m.layers[4].objects[0]; m.layers[3].data[Math.floor((s.y + 6) / 32) * m.width + Math.floor(s.x / 32)] = 1; },
  ]) { const source = mapSource(); change(source); assert.throws(() => validateOfficeMap(source)); }
});
test("WASD/arrows support four directions, normalize diagonals and retain idle facing", () => {
  assert.deepEqual(movement(new Set(["KeyW"])), { x: 0, y: -1, facing: "up" });
  assert.deepEqual(movement(new Set(["ArrowRight"])), { x: 1, y: 0, facing: "right" });
  assert.equal(movement(new Set(["KeyA"])).facing, "left");
  assert.equal(movement(new Set(["ArrowDown"])).facing, "down");
  assert.equal(movement(new Set(), "left").facing, "left");
  const diagonal = movement(new Set(["KeyD", "KeyW"]));
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-12);
  assert.equal(movement(new Set(["KeyA", "KeyD"])).x, 0);
});
function keyEvent(code: string) { const event = new Event("keydown", { cancelable: true }); Object.defineProperty(event, "code", { value: code }); return event; }
test("keyboard input is focus-scoped, never captures Tab, clears on blur and removes listeners", () => {
  const target = new EventTarget(), global = new EventTarget(); let focused = false;
  const input = attachMovementInput(target, () => focused, global);
  const ignored = keyEvent("ArrowUp"); target.dispatchEvent(ignored); assert.equal(ignored.defaultPrevented, false);
  focused = true;
  const down = keyEvent("ArrowUp"); target.dispatchEvent(down); assert.equal(down.defaultPrevented, true); assert.equal(input.pressed.has("ArrowUp"), true);
  const tab = keyEvent("Tab"); target.dispatchEvent(tab); assert.equal(tab.defaultPrevented, false);
  global.dispatchEvent(new Event("blur")); assert.equal(input.pressed.size, 0);
  input.destroy(); target.dispatchEvent(keyEvent("KeyD")); assert.equal(input.pressed.size, 0);
});
test("integer zoom always covers the viewport without exposing space outside the map", () => {
  for (const [w, h] of [[360, 500], [1200, 700], [2000, 1400], [4800, 2200]]) for (const requested of [-1, 1, 2, 10]) {
    const zoom = officeZoom(requested, w!, h!, 1152, 832);
    assert.ok(Number.isInteger(zoom) && w! / zoom <= 1152 && h! / zoom <= 832);
  }
});
const org = "250d1968-67d7-4d3c-8846-92f26747d76d", other = "7df17a9c-1c4c-472f-88d5-8d2db93e96a5";
function source(): OfficeAccessSource { return { organization: async () => ({ id: org, name: "Office", status: "ACTIVE" }), membership: async () => ({ organization_id: org, status: "ACTIVE", role: "MEMBER" }), office: async () => ({ id: other, organization_id: org, name: "Main office" }) }; }
test("office access needs an active matching tenant/membership and a real matching office", async () => {
  assert.equal((await resolveOfficeAccess(org, source())).status, "allowed");
  assert.equal((await resolveOfficeAccess(org, { ...source(), office: async () => null })).status, "unavailable");
  assert.equal((await resolveOfficeAccess(org, { ...source(), office: async () => ({ id: other, organization_id: other, name: "Other" }) })).status, "unavailable");
});
test("unauthorized, inactive, cross-tenant and malformed requests never fetch office data", async () => {
  let reads = 0;
  const office = async () => { reads++; return null; };
  for (const adapter of [
    { ...source(), membership: async () => null },
    { ...source(), membership: async () => ({ organization_id: org, status: "INACTIVE", role: "OWNER" }) },
    { ...source(), membership: async () => ({ organization_id: other, status: "ACTIVE", role: "OWNER" }) },
    { ...source(), organization: async () => null },
  ]) assert.equal((await resolveOfficeAccess(org, { ...adapter, office })).status, "denied");
  assert.equal((await resolveOfficeAccess("not-a-uuid", { ...source(), office })).status, "denied");
  assert.equal(reads, 0);
});
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
test("Strict Mode cancels pending imports and never initializes an unmounted office", async () => {
  const mount = createOfficeLifecycle(); let creates = 0;
  const controller: OfficeController = { destroy: async () => {}, zoomBy() {}, resetZoom() {} };
  const first = mount(async () => () => { creates++; return controller; }, () => assert.fail());
  await first.dispose(); assert.equal(creates, 0);
  const second = mount(async () => () => { creates++; return controller; }, () => assert.fail());
  await tick(); assert.equal(creates, 1); await second.dispose();
});
test("route remount waits for deferred Phaser destruction and import failures stay recoverable", async () => {
  const mount = createOfficeLifecycle(); let release!: () => void; let creates = 0; let errors = 0;
  const first = mount(async () => () => { creates++; return { destroy: () => new Promise<void>((resolve) => { release = resolve; }), zoomBy() {}, resetZoom() {} }; }, () => assert.fail());
  await tick(); const closing = first.dispose(); await tick();
  const second = mount(async () => () => { creates++; return { destroy: async () => {}, zoomBy() {}, resetZoom() {} }; }, () => assert.fail());
  await tick(); assert.equal(creates, 1); release(); await closing; await tick(); assert.equal(creates, 2); await second.dispose();
  const failed = mount(async () => { throw new Error("Chunk failed"); }, () => { errors++; }); await tick(); assert.equal(errors, 1); await failed.dispose();
});
