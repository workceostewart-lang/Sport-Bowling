import test from "node:test";
import assert from "node:assert/strict";
import { BowlingGame } from "../src/scoring.js";

test("perfect game scores 300", () => {
  const game = new BowlingGame();
  for (let roll = 0; roll < 12; roll += 1) game.roll(10);
  assert.equal(game.cumulativeScores().at(-1), 300);
  assert.equal(game.complete, true);
});

test("all nines scores 90", () => {
  const game = new BowlingGame();
  for (let roll = 0; roll < 20; roll += 1) game.roll(roll % 2 === 0 ? 9 : 0);
  assert.equal(game.cumulativeScores().at(-1), 90);
});

test("spare applies one-ball bonus", () => {
  const game = new BowlingGame();
  game.roll(7);
  game.roll(3);
  game.roll(4);
  assert.equal(game.cumulativeScores()[0], 14);
  assert.deepEqual(game.notation(0), ["7", "/"]);
});
