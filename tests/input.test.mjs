import test from "node:test";
import assert from "node:assert/strict";
import { motionThrow, throwFromPointerPath } from "../src/input.js";

test("a straight forward flick produces speed without hook", () => {
  const result = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 160, y: 250, at: 120 },
    { x: 160, y: 80, at: 230 },
  ], { width: 320, height: 320 });
  assert.ok(result.speed >= 0.42);
  assert.equal(result.rotation, 0);
});

test("curving the release produces continuous hook", () => {
  const result = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 160, y: 250, at: 120 },
    { x: 220, y: 70, at: 230 },
  ], { width: 320, height: 320 });
  assert.ok(result.rotation > 0.5);
});

test("small accidental gestures do not roll", () => {
  const result = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 166, y: 165, at: 100 },
  ], { width: 320, height: 320 });
  assert.equal(result, null);
});

test("motion and touch share the same speed and rotation shape", () => {
  assert.deepEqual(Object.keys(motionThrow({ peakAcceleration: 24, peakRotation: -80 })).sort(), ["rotation", "speed"]);
});
