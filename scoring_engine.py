"""
SPORT BOWLING — Reference Scoring Engine
=========================================

Authoritative implementation of USBC ten-pin scoring. This module is the
single source of truth for scoring behavior; the game client and server
must both produce identical results to this reference.

Design rules:
  - Pure logic. No rendering, no physics, no network, no I/O.
  - A Game is a state machine advanced one roll at a time.
  - Scores are recomputed from the roll history, never accumulated
    incrementally. Bonus carry-forward is the most common source of
    scoring bugs; recomputation makes it impossible to drift.

Run: python3 scoring_engine.py
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


TOTAL_PINS = 10
FRAMES_PER_GAME = 10
SPRINT_FRAMES = 5           # Sprint format: 5 frames, 10th-frame rules on the last


class Roll(Enum):
    """A single delivery. FOUL scores zero but still consumes a ball."""
    NORMAL = "normal"
    FOUL = "foul"


@dataclass
class Delivery:
    pins: int                       # pins actually knocked down (0 if foul)
    kind: Roll = Roll.NORMAL
    standing_before: int = TOTAL_PINS   # pins standing when this ball was thrown

    @property
    def counted(self) -> int:
        """Pins credited. A foul credits nothing."""
        return 0 if self.kind is Roll.FOUL else self.pins


class BowlingGame:
    """
    Ten-pin game for a single bowler.

    Usage:
        g = BowlingGame()
        while not g.complete:
            g.roll(pins)
        g.total          -> final score
        g.frame_scores() -> cumulative score per frame
    """

    def __init__(self, frames: int = FRAMES_PER_GAME):
        if frames not in (SPRINT_FRAMES, FRAMES_PER_GAME):
            raise ValueError("frames must be 5 (Sprint) or 10 (standard)")
        self.frames = frames
        self.deliveries: List[Delivery] = []

    # ---------------------------------------------------------------- rolling

    def roll(self, pins: int, kind: Roll = Roll.NORMAL) -> None:
        if self.complete:
            raise RuntimeError("game is already complete")
        standing = self.pins_standing()
        if not 0 <= pins <= standing:
            raise ValueError(f"cannot fell {pins} pins; only {standing} standing")
        self.deliveries.append(
            Delivery(pins=pins, kind=kind, standing_before=standing)
        )

    def foul(self) -> None:
        """A foul: zero credited, ball consumed, and the rack does NOT reset
        mid-frame (the pins the bowler knocked over stay down and are re-spotted
        only at the start of the next frame per USBC 9a)."""
        self.roll(0, kind=Roll.FOUL)

    # ------------------------------------------------------------ frame model

    def _partition(self) -> List[List[Delivery]]:
        """Split the delivery list into frames. The final frame absorbs its
        bonus balls."""
        frames: List[List[Delivery]] = []
        i = 0
        for f in range(self.frames):
            if i >= len(self.deliveries):
                break
            last_frame = f == self.frames - 1
            if last_frame:
                frames.append(self.deliveries[i:])
                break
            first = self.deliveries[i]
            if first.counted == TOTAL_PINS:          # strike: one ball
                frames.append([first])
                i += 1
            else:                                     # two balls
                frames.append(self.deliveries[i:i + 2])
                i += 2
        return frames

    def pins_standing(self) -> int:
        """Pins standing for the ball about to be thrown."""
        frames = self._partition()
        if not frames:
            return TOTAL_PINS
        current = frames[-1]
        is_final = len(frames) == self.frames

        if not is_final:
            # Mid-game frame with one ball thrown and not a strike.
            if len(current) == 1 and current[0].counted < TOTAL_PINS:
                return TOTAL_PINS - current[0].pins
            return TOTAL_PINS

        # Final frame: the rack resets after each strike or completed spare.
        standing = TOTAL_PINS
        for d in current:
            if standing - d.pins == 0:      # rack cleared -> re-spot
                standing = TOTAL_PINS
            else:
                standing -= d.pins
        return standing

    @property
    def complete(self) -> bool:
        frames = self._partition()
        if len(frames) < self.frames:
            return False
        final = frames[-1]
        if len(final) < 2:
            return False
        first, second = final[0], final[1]
        earned_third = (
            first.counted == TOTAL_PINS
            or first.pins + second.pins == TOTAL_PINS
        )
        return len(final) >= (3 if earned_third else 2)

    # ---------------------------------------------------------------- scoring

    def frame_scores(self) -> List[Optional[int]]:
        """Cumulative score after each frame. None where the frame's bonus
        balls have not yet been thrown."""
        results: List[Optional[int]] = []
        running = 0
        i = 0
        for f in range(self.frames):
            last_frame = f == self.frames - 1
            if i >= len(self.deliveries):
                results.append(None)
                continue

            if last_frame:
                final = self.deliveries[i:]
                if not self.complete:
                    results.append(None)
                    continue
                running += sum(d.counted for d in final)
                results.append(running)
                continue

            first = self.deliveries[i]

            if first.counted == TOTAL_PINS:                    # STRIKE
                bonus = self.deliveries[i + 1:i + 3]
                if len(bonus) < 2:
                    results.append(None)
                    i += 1
                    continue
                running += TOTAL_PINS + sum(b.counted for b in bonus)
                results.append(running)
                i += 1
                continue

            if i + 1 >= len(self.deliveries):                  # incomplete frame
                results.append(None)
                continue

            second = self.deliveries[i + 1]
            if first.pins + second.pins == TOTAL_PINS:         # SPARE
                # Note: a foul on either ball means pins fell but were not
                # credited, so a "spare" requires 10 *credited* pins.
                if first.counted + second.counted < TOTAL_PINS:
                    running += first.counted + second.counted
                    results.append(running)
                    i += 2
                    continue
                bonus = self.deliveries[i + 2:i + 3]
                if not bonus:
                    results.append(None)
                    i += 2
                    continue
                running += TOTAL_PINS + bonus[0].counted
                results.append(running)
                i += 2
                continue

            running += first.counted + second.counted          # OPEN
            results.append(running)
            i += 2

        return results

    @property
    def total(self) -> Optional[int]:
        scores = [s for s in self.frame_scores() if s is not None]
        return scores[-1] if self.complete and scores else None

    # ------------------------------------------------------------- annotation

    def notation(self) -> List[List[str]]:
        """Scorecard glyphs per frame: X, /, -, F, or the numeral."""
        out = []
        for frame in self._partition():
            marks = []
            standing = TOTAL_PINS
            for n, d in enumerate(frame):
                if d.kind is Roll.FOUL:
                    marks.append("F")
                elif d.pins == standing and d.pins > 0:
                    marks.append("X" if (n == 0 or standing == TOTAL_PINS) else "/")
                elif d.pins == 0:
                    marks.append("-")
                else:
                    marks.append(str(d.pins))
                standing = TOTAL_PINS if standing - d.pins == 0 else standing - d.pins
            out.append(marks)
        return out


# ---------------------------------------------------------------------------
# Split detection
# ---------------------------------------------------------------------------

# Board position of each pin (x, row) on the pin deck, 12in spacing.
PIN_LAYOUT = {
    1: (0.0, 0), 2: (-1.0, 1), 3: (1.0, 1),
    4: (-2.0, 2), 5: (0.0, 2), 6: (2.0, 2),
    7: (-3.0, 3), 8: (-1.0, 3), 9: (1.0, 3), 10: (3.0, 3),
}

NAMED_SPLITS = {
    frozenset({7, 10}): "Bedposts (7-10)",
    frozenset({4, 6, 7, 10}): "Big Four",
    frozenset({4, 6}): "4-6",
    frozenset({3, 7}): "3-7",
    frozenset({2, 10}): "2-10",
    frozenset({5, 7}): "5-7 (Woolworth)",
    frozenset({5, 10}): "5-10 (Woolworth)",
    frozenset({4, 7, 10}): "4-7-10",
    frozenset({6, 7, 10}): "6-7-10",
    frozenset({8, 10}): "8-10",
    frozenset({4, 9}): "4-9",
}


def is_split(standing: set) -> bool:
    """USBC split: the headpin is down and two or more pins remain with at
    least one downed pin between them.

    Pin spacing in this coordinate system is 2.0 units between neighbours in
    the same row, so a *gap* in a row is 4.0 or more. Diagonally, the minimum
    separation that guarantees a downed pin between two standing pins depends
    on how many rows apart they are.
    """
    if 1 in standing or len(standing) < 2:
        return False
    gap_threshold = {0: 4.0, 1: 3.0, 2: 2.0, 3: 2.0}
    pins = sorted(standing, key=lambda p: (PIN_LAYOUT[p][1], PIN_LAYOUT[p][0]))
    for i, a in enumerate(pins):
        for b in pins[i + 1:]:
            ax, arow = PIN_LAYOUT[a]
            bx, brow = PIN_LAYOUT[b]
            if abs(ax - bx) >= gap_threshold[abs(arow - brow)]:
                return True
    return False


def split_name(standing: set) -> Optional[str]:
    return NAMED_SPLITS.get(frozenset(standing))


# ---------------------------------------------------------------------------
# Handicap  (see PRD 7.2)
# ---------------------------------------------------------------------------

def handicap(average: float, basis: int = 220, factor: float = 0.90) -> int:
    """Pins added to a player's final score. Floored at zero — a player above
    the basis is never penalized."""
    return max(0, int((basis - average) * factor))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def _play(rolls, frames=FRAMES_PER_GAME):
    g = BowlingGame(frames)
    for r in rolls:
        g.foul() if r == "F" else g.roll(r)
    return g


def run_tests():
    cases = []

    def check(name, got, want):
        cases.append((name, got == want, got, want))

    # --- canonical games
    check("Perfect game (300)", _play([10] * 12).total, 300)
    check("All gutters (0)", _play([0] * 20).total, 0)
    check("All spares, 5s (150)", _play([5] * 21).total, 150)
    check("All nines, open (90)", _play([9, 0] * 10).total, 90)
    check("Dutch 200 (X 9/ alternating)",
          _play([10, 9, 1] * 5 + [10]).total, 200)

    # --- bonus carry-forward
    check("Single strike then 3,4", _play([10, 3, 4] + [0] * 16).total, 24)
    check("Single spare then 4", _play([6, 4, 4, 2] + [0] * 16).total, 20)
    check("Turkey then 5,3",
          _play([10, 10, 10, 5, 3] + [0] * 12).total, 30 + 25 + 18 + 8)

    # --- 10th frame variants
    check("10th: strike + 2 bonus",
          _play([0] * 18 + [10, 7, 2]).total, 19)
    check("10th: spare + 1 bonus",
          _play([0] * 18 + [7, 3, 5]).total, 15)
    check("10th: open, no bonus",
          _play([0] * 18 + [7, 2]).total, 9)
    check("10th: three strikes",
          _play([0] * 18 + [10, 10, 10]).total, 30)

    # --- fouls
    check("Foul scores zero", _play([("F"), 5] + [0] * 18).total, 5)
    check("Foul does not create a spare",
          _play([("F"), 10] + [0] * 18).total, 10)

    # --- completion state
    g = _play([0] * 18 + [10, 7])
    check("10th strike is incomplete after 2 balls", g.complete, False)
    g = _play([0] * 18 + [7, 2])
    check("10th open is complete after 2 balls", g.complete, True)

    # --- Sprint format
    check("Sprint perfect (150)", _play([10] * 7, frames=SPRINT_FRAMES).total, 150)

    # --- splits
    check("7-10 is a split", is_split({7, 10}), True)
    check("7-10 is named", split_name({7, 10}), "Bedposts (7-10)")
    check("Big Four is a split", is_split({4, 6, 7, 10}), True)
    check("Headpin standing is never a split", is_split({1, 7, 10}), False)
    check("Adjacent 2-4-5 is not a split", is_split({2, 4, 5}), False)
    check("Single pin is not a split", is_split({10}), False)
    check("3-10 baby split", is_split({3, 10}), True)
    check("2-7 baby split", is_split({2, 7}), True)
    check("3-9 is not a split", is_split({3, 9}), False)
    check("4-5 adjacent is not a split", is_split({4, 5}), False)
    check("5-7 Woolworth", is_split({5, 7}), True)
    check("4-7-10 split", is_split({4, 7, 10}), True)
    check("6-9-10 is not a split", is_split({6, 9, 10}), False)

    # --- handicap
    check("Handicap for 150 avg", handicap(150), 63)
    check("Handicap floors at zero", handicap(235), 0)

    # --- notation
    check("Notation of a perfect game",
          _play([10] * 12).notation()[0], ["X"])

    width = max(len(n) for n, *_ in cases)
    failed = 0
    for name, ok, got, want in cases:
        if ok:
            print(f"  PASS  {name}")
        else:
            failed += 1
            print(f"  FAIL  {name.ljust(width)}  got={got!r} want={want!r}")
    print(f"\n{len(cases) - failed}/{len(cases)} passed")
    return failed == 0


if __name__ == "__main__":
    raise SystemExit(0 if run_tests() else 1)
