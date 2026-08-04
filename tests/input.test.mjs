import test from "node:test";
import assert from "node:assert/strict";
import { motionThrow, throwFromPointerPath } from "../src/input.js";

test("a straight forward flick preserves the selected line without hook", () => {
  const result = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 160, y: 250, at: 120 },
    { x: 160, y: 155, at: 175 },
    { x: 160, y: 70, at: 230 },
  ], { width: 320, height: 320, position: 18, angle: 21 });
  assert.ok(result.speed > 0.45);
  assert.deepEqual({ position: result.position, angle: result.angle, rotation: result.rotation }, { position: 18, angle: 21, rotation: 0 });
});

test("a diagonal but straight flick changes direction without manufacturing hook", () => {
  const result = throwFromPointerPath([
    { x: 150, y: 180, at: 0 },
    { x: 150, y: 250, at: 110 },
    { x: 180, y: 160, at: 170 },
    { x: 210, y: 70, at: 230 },
  ], { width: 320, height: 320, angle: 20 });
  assert.ok(result.angle > 20);
  assert.ok(Math.abs(result.rotation) < 0.05);
});

test("curvature near release produces continuous hook", () => {
  const result = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 160, y: 250, at: 110 },
    { x: 170, y: 155, at: 175 },
    { x: 220, y: 70, at: 230 },
  ], { width: 320, height: 320 });
  assert.ok(result.rotation > 0.35);
});

test("slower sloppy swipes produce weaker deliveries", () => {
  const slow = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 160, y: 245, at: 180 },
    { x: 169, y: 160, at: 430 },
    { x: 180, y: 95, at: 680 },
  ], { width: 320, height: 320 });
  const fast = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 160, y: 245, at: 80 },
    { x: 160, y: 150, at: 115 },
    { x: 160, y: 55, at: 150 },
  ], { width: 320, height: 320 });
  assert.ok(slow.speed < fast.speed);
});

test("small accidental gestures never throw", () => {
  const result = throwFromPointerPath([
    { x: 160, y: 180, at: 0 },
    { x: 163, y: 188, at: 50 },
    { x: 166, y: 165, at: 100 },
  ], { width: 320, height: 320 });
  assert.equal(result, null);
});

test("motion and touch produce the identical four physics inputs", () => {
  const motion = motionThrow({ peakAcceleration: 24, peakRotation: -80, lateralAcceleration: 2, position: 17, angle: 22 });
  assert.deepEqual(Object.keys(motion).sort(), ["angle", "position", "rotation", "speed"]);
  assert.equal(motion.position, 17);
  assert.ok(motion.angle > 22);
});

test("holding and releasing a stationary phone never throws", () => {
  assert.equal(motionThrow({ peakAcceleration: 9.82, peakRotation: 0 }), null);
  assert.equal(motionThrow({ peakAcceleration: 11.9, peakRotation: 30 }), null);
});

test("motion power comes continuously from measured swing force", () => {
  const gentle = motionThrow({ peakAcceleration: 14, peakRotation: 0 });
  const strong = motionThrow({ peakAcceleration: 25, peakRotation: 0 });
  assert.ok(gentle.speed > 0);
  assert.ok(gentle.speed < strong.speed);
});
