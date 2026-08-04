export const TOTAL_PINS = 10;
export const FRAME_COUNT = 10;

export class BowlingGame {
  constructor() {
    this.frames = Array.from({ length: FRAME_COUNT }, () => []);
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
      if (first === 10 || first + second === 10) return 10;
      return 0;
    }
    return 0;
  }

  roll(pins) {
    const standing = this.pinsStanding();
    if (this.complete) throw new Error("Game is complete");
    if (!Number.isInteger(pins) || pins < 0 || pins > standing) {
      throw new Error(`Cannot knock down ${pins}; ${standing} standing`);
    }

    const frame = this.currentFrame;
    frame.push(pins);

    if (this.frameIndex < 9) {
      if (pins === 10 || frame.length === 2) this.frameIndex += 1;
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
    if (!frame.length) return [];
    if (frameIndex < 9) {
      if (frame[0] === 10) return ["X", ""];
      return [mark(frame[0]), frame.length > 1 ? (frame[0] + frame[1] === 10 ? "/" : mark(frame[1])) : ""];
    }

    return frame.map((pins, index) => {
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

function mark(pins) {
  return pins === 0 ? "–" : String(pins);
}
