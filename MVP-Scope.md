# SPORT BOWLING — MVP Scope

**Purpose:** define the smallest build that answers *"is this game fun?"* — nothing more.
**Companion to:** PRD v1.0 Final
**Target:** playable internal build, ~14 weeks

---

## The question the MVP exists to answer

> **Does rolling a ball feel good enough that a person wants to roll another one?**

Everything below is included because it's needed to answer that, or excluded because it isn't. If a feature can't be traced to that question, it's out — no matter how central it is to the shipped product.

This is deliberately uncomfortable. The ten-color system, the fire trails, the cover art, and the fireworks are the most visible things in the PRD, and none of them are in the MVP. They make a good game feel better. They cannot make a bad-feeling roll feel good, and if they're present during playtest they will mask the answer.

---

## Phase 1 — Feel (weeks 1–4)

**Build:** one lane, one ball, gray-box art, no UI.

| In | Out |
|---|---|
| Regulation lane geometry (60 ft, 41.5 in, 12 in pin spacing) | All ten balls |
| One ball with tunable weight, hook, speed | Ball selection, customization |
| Pin physics — collision, deflection, wobble, late falls | Oil patterns |
| Skid → hook → roll transition | Scoring |
| Touch swipe + mouse drag release | Keyboard, gamepad |
| Debug overlay: entry board, entry angle, ball speed, revs | Any menu at all |

**Exit criteria**
- Five internal testers roll 20 balls each and can consistently *repeat* a shot they liked. Repeatability is the whole test — if a good shot feels like luck, the physics aren't done.
- Pocket hits carry pins at a believable rate; the 10-pin taps but doesn't disappear.
- Nobody says "the ball feels floaty" or "the pins feel like bowling pins made of paper."

**If this fails, stop.** Do not proceed to Phase 2 hoping art will fix it.

---

## Phase 2 — Rules (weeks 5–6)

**Build:** the scoring engine, standalone, then wired in.

| In | Out |
|---|---|
| Full USBC scoring (see `scoring_engine.py`) | Handicap |
| 10th-frame handling, fouls, splits | Sprint format |
| Text-only scorecard | Designed scorecard UI |
| Split detection and naming | Stats, averages, history |

**Exit criteria**
- The reference test suite passes 100%, including a 300 game, a Dutch 200, and every 10th-frame variant.
- Scoring is byte-identical between client and server implementations.

This phase is short because the problem is solved. Port the reference engine, run its tests, move on. Resist the urge to design the scorecard here.

---

## Phase 3 — Netcode (weeks 7–12)

**Build:** server-authoritative multiplayer with room codes. **The highest-risk item in the project.**

| In | Out |
|---|---|
| Room create / join by 6-char code | Lobby polish, QR codes, deep links |
| 2 players, singles only, turn-based | Teams, 8-player rooms, handicap |
| Server-side physics + deterministic replay broadcast | Spectators, emotes, chat |
| Cross-platform determinism test: iOS ↔ Android ↔ PC | Reconnection, AI takeover |
| Latency instrumentation | Region routing |

**Exit criteria**
- The same roll produces a **bit-identical pin outcome** on all three platforms, 1,000 consecutive trials.
- Roll-to-result under 250 ms for the non-bowling player.
- Two people on different platforms complete a full game without desync.

**The decision point:** if cross-platform determinism proves unreachable, the netcode model changes — from replay broadcast to state broadcast — and that ripples into physics, anti-cheat, and spectating. **This is why netcode is in the MVP and fireworks are not.** Finding out in week 10 is a schedule adjustment. Finding out in month 7 is a rewrite.

---

## Phase 4 — First impression (weeks 13–14)

**Build:** just enough shell to hand the build to someone who has never seen it.

| In | Out |
|---|---|
| Tutorial steps 1–3 (lane, roll, aim) | Steps 4–7, contextual coaching |
| Portrait + landscape layouts, functional | Final visual design, ten-color theming |
| Minimal strike feedback — one sound, one simple burst | Fire trails, fireworks, celebration decay |
| Quick Play vs. one AI tier | Career, Daily, Sprint, Practice |
| Ambient alley audio bed, pin crash, roll rumble | Full layered audio, music |

**Exit criteria**
- A first-time player reaches their first roll in under 60 seconds without being told anything.
- Ten external testers play unprompted. **Target: 6 of 10 play a second game without being asked.**

---

## Explicitly not in the MVP

Not because they don't matter — most are core to the shipped product — but because they answer a different question.

- Ten-color palette and full UI theming
- Fire trail effects and firework celebrations
- Cover art and all store assets
- Team play, handicap, AI takeover, pre-aim, spectators
- Six oil patterns (Phase 1 uses one flat condition)
- Progression, XP, levels, unlocks, stats
- Monetization of any kind
- Accessibility features beyond text scaling *(see caveat below)*
- Localization
- Cosmetics, ball customization, replays

### Standing build rules (apply from week 1, not deferred)

These are not features and they are not in the "out" column. They cost nothing now and are expensive to retrofit.

1. **Never encode game state in hue alone**, even in gray-box. Colorblind support is a Phase 4+ feature; the constraint that makes it possible is a week-1 rule.
2. **Keep the text layer separable** from layout. Localization is out of the MVP; hardcoded strings are not a shortcut, they're a debt.
3. **Build the determinism CI conformance harness in week 1**, not at the week-12 gate. See `Risk-Register.md` §2.4 — the gate should confirm what CI has been reporting for two months, not discover something new.
4. **Single layout system with orientation as a parameter.** Two hand-maintained UIs is the failure mode; enforce it in code review from the first screen.

---

## What the MVP does not tell you

Be honest about the limits of this build. It answers whether the core loop is fun. It does **not** answer:

- Whether the game retains past day one — no progression exists to retain against
- Whether the multiplayer is *social* — 2-player singles isn't the 6-player team experience
- Whether the tutorial works — only 3 of 7 steps exist
- Whether the visual identity lands — there isn't one yet

Don't over-read a good MVP playtest. It clears the riskiest gate; it doesn't validate the product.

---

## Team shape

| Role | Phase 1–2 | Phase 3 | Phase 4 |
|---|---|---|---|
| Gameplay / physics engineer | ●●● | ● | ● |
| Backend / netcode engineer | — | ●●● | ● |
| Client engineer | ● | ●● | ●● |
| Designer | ● | ● | ●● |
| Audio | — | — | ● |
| Artist | — | — | ● |

Art and audio join late by design. Their absence in Phases 1–3 is a feature: it keeps playtest feedback pointed at the thing being tested.

---

## Go / no-go gates

| Gate | Week | Pass condition | On failure |
|---|---|---|---|
| **Feel** | 4 | Testers can repeat a shot they liked | Stop. Re-tune or kill. |
| **Rules** | 6 | 100% of the reference test suite passes | Fix before proceeding; non-negotiable |
| **Determinism** | 12 | Bit-identical outcomes across 3 platforms, 1,000 trials | Switch netcode model; re-plan Phase 3 |
| **Second game** | 14 | 6 of 10 external testers play again unprompted | Return to Phase 1 with their feedback |
