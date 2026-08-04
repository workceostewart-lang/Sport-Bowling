export const TOTAL_PINS = 10;
export const FRAME_COUNT = 10;

export class BowlingGame {
  constructor() {
    this.frames = Array.from({ length: FRAME_COUNT }, () => []);
    this.fouls = Array.from({ length: FRAME_COUNT }, () => []);
    this.frameIndex = 0;
    this.complete = false;
  }

  get currentFrame() {
    return this.frames[this.frameIndex] ?? this.frames[FRAME_COUNT - 1];
  }

  pinsStanding() {
    if (this.complete) return 0;
    const frame = this.currentFrame;
    if (this.frameIndex < 9) {
      return frame.length === 0 ? 10 : 10 - frame[0];
    }
    if (frame.length === 0) return 10;
    if (frame.length === 1) return frame[0] === 10 ? 10 : 10 - frame[0];
    if (frame.length === 2) {
      const [first, second] = frame;
      if (first === 10) return second === 10 ? 10 : 10 - second;
      if (first + second === 10) return 10;
      return 0;
    }
    return 0;
  }

  roll(pins, { foul = false } = {}) {
    const standing = this.pinsStanding();
    if (this.complete) throw new Error("Game is complete");
    if (!Number.isInteger(pins) || pins < 0 || pins > standing) {
      throw new Error(`Cannot knock down ${pins}; ${standing} standing`);
    }

    const frame = this.currentFrame;
    const scoredPins = foul ? 0 : pins;
    frame.push(scoredPins);
    this.fouls[this.frameIndex].push(Boolean(foul));

    if (this.frameIndex < 9) {
      if (scoredPins === 10 || frame.length === 2) this.frameIndex += 1;
      return;
    }

    if (frame.length === 2 && frame[0] < 10 && frame[0] + frame[1] < 10) {
      this.complete = true;
    } else if (frame.length === 3) {
      this.complete = true;
    }
  }

  ballValues() {
    return this.frames.flat();
  }

  cumulativeScores() {
    const balls = this.ballValues();
    const scores = [];
    let ball = 0;
    let total = 0;

    for (let frame = 0; frame < 10; frame += 1) {
      if (frame === 9) {
        const tenth = this.frames[9];
        if (!this.complete) {
          scores.push(null);
        } else {
          total += tenth.reduce((sum, value) => sum + value, 0);
          scores.push(total);
        }
        break;
      }

      if (balls[ball] === undefined) {
        scores.push(null);
        continue;
      }

      if (balls[ball] === 10) {
        if (balls[ball + 1] === undefined || balls[ball + 2] === undefined) {
          scores.push(null);
        } else {
          total += 10 + balls[ball + 1] + balls[ball + 2];
          scores.push(total);
        }
        ball += 1;
      } else if (balls[ball + 1] === undefined) {
        scores.push(null);
      } else if (balls[ball] + balls[ball + 1] === 10) {
        if (balls[ball + 2] === undefined) {
          scores.push(null);
        } else {
          total += 10 + balls[ball + 2];
          scores.push(total);
        }
        ball += 2;
      } else {
        total += balls[ball] + balls[ball + 1];
        scores.push(total);
        ball += 2;
      }
    }

    return scores;
  }

  notation(frameIndex) {
    const frame = this.frames[frameIndex];
    const fouls = this.fouls[frameIndex];
    if (!frame.length) return [];
    if (frameIndex < 9) {
      if (fouls[0]) return ["F", frame.length > 1 ? (fouls[1] ? "F" : frame[0] + frame[1] === 10 ? "/" : mark(frame[1])) : ""];
      if (frame[0] === 10) return ["X", ""];
      return [mark(frame[0]), frame.length > 1 ? (fouls[1] ? "F" : frame[0] + frame[1] === 10 ? "/" : mark(frame[1])) : ""];
    }

    return frame.map((pins, index) => {
      if (fouls[index]) return "F";
      if (pins === 10) return "X";
      if (index > 0) {
        const previous = frame[index - 1];
        const freshRack = previous === 10;
        if (!freshRack && previous + pins === 10) return "/";
      }
      return mark(pins);
    });
  }
}

const PIN_COORDINATES = new Map([
  [1, [0, 0]], [2, [-0.5, 1]], [3, [0.5, 1]], [4, [-1, 2]], [5, [0, 2]],
  [6, [1, 2]], [7, [-1.5, 3]], [8, [-0.5, 3]], [9, [0.5, 3]], [10, [1.5, 3]],
]);

export function detectSplit(standingPins) {
  const pins = [...new Set(standingPins)].filter((pin) => PIN_COORDINATES.has(pin));
  if (pins.length < 2 || pins.includes(1)) return false;
  const unvisited = new Set(pins);
  const queue = [pins[0]];
  unvisited.delete(pins[0]);
  while (queue.length) {
    const current = queue.shift();
    const [x, y] = PIN_COORDINATES.get(current);
    for (const candidate of [...unvisited]) {
      const [nextX, nextY] = PIN_COORDINATES.get(candidate);
      if (Math.hypot(nextX - x, nextY - y) <= 1.13) {
        unvisited.delete(candidate);
        queue.push(candidate);
      }
    }
  }
  return unvisited.size > 0;
}

function mark(pins) {
  return pins === 0 ? "–" : String(pins);
}
