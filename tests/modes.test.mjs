import test from "node:test";
import assert from "node:assert/strict";
import { canControllerThrow, normalizeAssignments, upsertPairedController } from "../src/modes.js";

test("TV Mode accepts its verified paired controller", () => {
  const controllers = [];
  const paired = upsertPairedController(controllers, { controllerId: "phone-a", deviceName: "Alex's phone", gyro: true }, "tv");
  assert.equal(paired.player, 0);
  assert.equal(canControllerThrow(controllers, "phone-a", "tv", 0), true);
});

test("Family Mode defaults a phone to Shared for pass-and-play", () => {
  const controllers = [];
  const paired = upsertPairedController(controllers, { controllerId: "phone-a", deviceName: "Family phone", gyro: true }, "family");
  assert.equal(paired.player, -1);
  assert.equal(canControllerThrow(controllers, "phone-a", "family", 3), true);
});

test("dedicated Family phones can bowl only for their assigned player", () => {
  const controllers = [{ id: "phone-a", name: "A", player: 1 }];
  assert.equal(canControllerThrow(controllers, "phone-a", "family", 1), true);
  assert.equal(canControllerThrow(controllers, "phone-a", "family", 0), false);
  assert.equal(canControllerThrow(controllers, "missing", "family", 0), false);
});

test("reducing the family size returns out-of-range assignments to Shared", () => {
  const controllers = [{ id: "phone-a", player: 3 }, { id: "phone-b", player: 1 }];
  normalizeAssignments(controllers, 2);
  assert.deepEqual(controllers.map((controller) => controller.player), [-1, 1]);
});
