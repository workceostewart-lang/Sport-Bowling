import test from "node:test";
import assert from "node:assert/strict";
import { BowlingGame, detectSplit } from "../src/scoring.js";

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

test("tenth-frame spare earns one bonus ball", () => {
  const game = new BowlingGame();
  for (let frame = 0; frame < 9; frame += 1) {
    game.roll(0);
    game.roll(0);
  }
  game.roll(7);
  game.roll(3);
  game.roll(6);
  assert.equal(game.cumulativeScores().at(-1), 16);
  assert.equal(game.complete, true);
});

test("tenth-frame strike keeps the second-ball leave for the third ball", () => {
  const game = new BowlingGame();
  for (let frame = 0; frame < 9; frame += 1) {
    game.roll(0);
    game.roll(0);
  }
  game.roll(10);
  game.roll(6);
  assert.equal(game.pinsStanding(), 4);
  assert.throws(() => game.roll(5), /4 standing/);
  game.roll(4);
  assert.equal(game.cumulativeScores().at(-1), 20);
});

test("a foul scores zero and consumes the ball", () => {
  const game = new BowlingGame();
  game.roll(7, { foul: true });
  game.roll(3);
  assert.deepEqual(game.notation(0), ["F", "3"]);
  assert.equal(game.frameIndex, 1);
});

test("split detection finds disconnected leaves", () => {
  assert.equal(detectSplit([7, 10]), true);
  assert.equal(detectSplit([4, 7, 6, 10]), true);
  assert.equal(detectSplit([2, 4, 7]), false);
  assert.equal(detectSplit([1, 7, 10]), false);
});
