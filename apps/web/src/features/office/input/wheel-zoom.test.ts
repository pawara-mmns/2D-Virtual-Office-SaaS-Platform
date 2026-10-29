import assert from "node:assert/strict";
import { test } from "node:test";
import { clampOfficeZoom, fitOfficeZoom, nextOfficeZoom, zoomLevels } from "../engine/camera.ts";
import { wheelPixels } from "./wheel-zoom.ts";
import { softwareRenderer } from "../engine/renderer-effects.ts";

const wheel = { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
test("known software renderers use reduced HUD effects without guessing private/unknown graphics capabilities", () => {
  for (const name of ["ANGLE (Google, Vulkan SwiftShader Device)", "llvmpipe (LLVM)", "softpipe", "Software Rasterizer", "Microsoft Basic Render Driver"]) assert.equal(softwareRenderer(name), true);
  for (const name of ["ANGLE Intel Iris Xe", "Apple GPU", "WebKit WebGL", "", null, undefined]) assert.equal(softwareRenderer(name), false);
});
test("wheel normalization preserves trackpad precision and bounds pixel, line and page mice", () => {
  assert.equal(wheelPixels(wheel, 900), -100);
  assert.equal(wheelPixels({ ...wheel, deltaY: .25 }, 900), .25);
  assert.equal(wheelPixels({ ...wheel, deltaY: 3, deltaMode: 1 }, 900), 48);
  assert.equal(wheelPixels({ ...wheel, deltaY: -1, deltaMode: 2 }, 900), -160);
  assert.equal(wheelPixels({ ...wheel, deltaY: 100000 }, 900), 160);
  assert.equal(wheelPixels({ ...wheel, deltaY: 1, deltaMode: 2 }, 80), 80);
});
test("browser/accessibility modifiers, horizontal gestures and invalid wheel input pass through", () => {
  for (const modifier of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) assert.equal(wheelPixels({ ...wheel, [modifier]: true }, 900), null);
  for (const event of [{ deltaY: 0 }, { deltaY: NaN }, { deltaY: Infinity }, { deltaX: Infinity }, { deltaX: 101 }, { deltaMode: 3 }]) {
    assert.equal(wheelPixels({ ...wheel, ...event }, 900), null);
  }
  assert.equal(wheelPixels({ ...wheel, deltaMode: 2 }, Infinity), null);
});
test("continuous camera zoom stays positive and within the existing fit/maximum bounds", () => {
  for (const [width, height] of [[1440, 900], [1024, 900], [820, 1180], [390, 844], [320, 740]]) {
    const fit = fitOfficeZoom(width!, height!, 1152, 832), levels = zoomLevels(width!, height!, 1152, 832);
    for (const value of [-100, 0, .001, 1.37, 2.683, 999, NaN]) {
      const zoom = clampOfficeZoom(value, width!, height!, 1152, 832);
      assert.ok(Number.isFinite(zoom) && zoom >= fit && zoom <= levels.at(-1)!);
    }
    assert.equal(clampOfficeZoom(2.683, width!, height!, 1152, 832), 2.683);
  }
});
test("zoom buttons select the next original level from fractional wheel zoom and clamp at limits", () => {
  const levels = zoomLevels(390, 844, 1152, 832);
  assert.equal(nextOfficeZoom(1.37, 1, levels), 2);
  assert.equal(nextOfficeZoom(1.37, -1, levels), 1);
  assert.equal(nextOfficeZoom(3.999999999, 1, levels), 4);
  assert.equal(nextOfficeZoom(1.37, 2, levels), 3);
  assert.equal(nextOfficeZoom(1.37, -100, levels), levels[0]);
  assert.equal(nextOfficeZoom(levels[0]!, -1, levels), levels[0]);
  assert.equal(nextOfficeZoom(4, 1, levels), 4);
  assert.equal(nextOfficeZoom(2, NaN, levels), 2);
});
