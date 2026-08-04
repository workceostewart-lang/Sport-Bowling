# SPORT BOWLING — Risk Register & Contingencies

**Version:** 1.0
**Date:** August 3, 2026
**Companion to:** PRD v1.1 Final, MVP-Scope.md

A locked scope is not the same as a low-risk project. This document exists so that the PRD's confidence doesn't become false confidence. It covers what can go wrong, what we do about it in advance, and — for the two risks that could force a redesign — what the fallback actually is.

---

## 1. Risk Register

Ordered by expected cost, not probability. A low-probability risk that forces a rewrite outranks a likely risk that costs a week.

| # | Risk | Likelihood | Impact | Detected by | Response |
|---|---|---|---|---|---|
| **R1** | Cross-platform physics determinism proves unreachable | Medium | **Critical** — invalidates the netcode model in PRD 7.5 | Week-12 determinism gate | Switch to Plan B (§2). Budgeted, not improvised |
| **R2** | The roll doesn't feel good and can't be tuned into feeling good | Low | **Critical** — no product | Week-4 feel gate | Stop. This is the one risk with no fallback |
| **R3** | Turn-based multiplayer is too slow at 6–8 players; sessions abandoned mid-match | **High** | High | Beta telemetry: mid-match drop rate by room size | Pre-aim + spectate speed already specified. If insufficient, cap default room size at 4 and make 6–8 opt-in (§3.1) |
| **R4** | Team play doubles the scorecard surface area and slips the schedule | Medium | High | Alpha milestone review | Ship singles-only multiplayer first; teams as a fast-follow. Wireframes already isolate the layout work |
| **R5** | Portrait and landscape become two UIs to maintain rather than one that reflows | Medium | Medium | Any duplicated layout code in review | Single layout system with orientation as a parameter — enforce in code review from week 1, not retrofitted |
| **R6** | Fire and firework VFX blow the frame budget on low-end Android | **High** | Medium | Device-matrix perf testing in Beta | LOD scaling and Reduced Effects already specified. Add a hard particle ceiling per device tier |
| **R7** | Guest players hit the no-XP wall and churn rather than converting | Medium | Medium | Guest → account conversion rate | Retroactive XP grant already specified. If conversion is under 15%, revisit the wall itself |
| **R8** | Room codes get scraped and joined by strangers | Low | Medium | Reports of uninvited joiners | Private rooms by default, host approval toggle, code rotation on kick |
| **R9** | Scoring disputes — a player believes the score is wrong | Low | Low | Support volume | Reference engine + published test suite. Score is provable, not arguable |
| **R10** | Handicap is perceived as unfair by the stronger player | Medium | Low | Playtest feedback | Off by default, raw score always displayed, leaderboards scratch-only |
| **R11** | Family Mode release-to-screen latency exceeds 80 ms on typical home Wi-Fi | Medium | **Critical** — motion control stops feeling connected | Real-device domestic Wi-Fi gate before every multiplayer milestone | Keep swing input on a direct local peer channel; use the server only for signaling. If the gate still fails, investigate BLE/native LAN transport before expanding room size |

---

## 2. R1 — Determinism: Contingency Plan

This is the risk that most deserves a written fallback, because the failure mode is a mid-project rewrite and the temptation at week 12 will be to keep pushing on Plan A.

### 2.1 What Plan A assumes

PRD 7.5 specifies **server-authoritative physics with deterministic replay broadcast**: the server simulates the roll, sends a compact input record, and every client re-simulates it locally to produce a bit-identical result. It is bandwidth-cheap, gives every player a pixel-identical view, and makes replays and anti-cheat nearly free.

It assumes floating-point physics produces identical results on ARM (iOS), ARM (Android, different vendors and drivers), and x86 (PC). That assumption is reasonable and routinely fails.

### 2.2 The gate

**Week 12. Pass condition: 1,000 consecutive rolls produce bit-identical final pin states across iOS, Android, and Windows.** Not "visually identical." Not "99.8%." A single divergence in a thousand is a desync a player will hit.

If it fails, we do not spend another sprint on it. We switch.

### 2.3 Plan B — state broadcast

The server remains authoritative and simulates the roll once. Instead of broadcasting inputs for clients to re-simulate, it broadcasts **the resulting state**: pin outcome, plus a compressed trajectory for the client to animate against.

| | Plan A (replay) | Plan B (state) |
|---|---|---|
| Bandwidth per roll | ~50 bytes | ~2–4 KB |
| Client views identical? | Bit-identical | Visually near-identical; minor animation variance |
| Anti-cheat | Free | Free (still server-authoritative) |
| Replays | Free | Requires stored trajectory data |
| Physics determinism required | Yes | **No** |
| Client CPU cost | Higher (re-simulates) | Lower (plays animation) |

**What changes if we switch:**

1. **Bandwidth rises ~50×** per roll. Still trivial in absolute terms — a full 8-player game moves under 1 MB. This is not a real constraint; state it explicitly so nobody objects on instinct.
2. **Replay storage becomes a cost.** Plan A stores an input record; Plan B stores a trajectory. Saved replays of 250+ games need a storage budget line.
3. **Pin animation may differ slightly between clients.** Two players watching the same strike see the same pins fall, with cosmetically different tumbles. Acceptable — the *outcome* is authoritative either way, and no player can tell.
4. **Spectator latency improves**, because clients stop re-simulating.

**Cost of switching at week 12:** approximately 3 weeks. **Cost of switching at month 7:** approximately 10 weeks plus retesting everything downstream. This is the entire argument for the gate.

### 2.4 Determinism engineering checklist (Plan A)

If we're attempting determinism, these are non-negotiable from week 1. Retrofitting any of them costs more than doing them upfront.

- **Fixed timestep.** Physics runs at a constant tick, decoupled from render framerate, always.
- **No wall-clock time in simulation.** Nothing reads `deltaTime`, system time, or frame count inside the physics path.
- **Seeded RNG only.** One seeded generator, seeded from the roll record, used for every stochastic element including pin wobble. No platform RNG anywhere in simulation.
- **Deterministic collision ordering.** Contacts resolved in a stable, explicitly sorted order — never in hash-map or pointer order, which varies by platform and allocator.
- **Pin the math library.** Use a single cross-platform fixed-point or software-float math path for simulation. Do not trust platform `sin`, `cos`, or `sqrt` to agree at the last bit.
- **Disable fast-math and FMA contraction** in the physics compilation unit on every platform.
- **No multithreaded simulation** unless the work partition is itself deterministic.
- **Continuous conformance testing** from week 1: a fixed corpus of 100 recorded rolls replayed on every platform in CI, failing the build on any divergence. Discovering divergence at the week-12 gate is already too late; the gate should confirm what CI has been telling us for two months.

> **The single most important line in this document:** build the CI conformance harness in **week 1**, not week 12. The gate is a formality if the harness exists; it's a crisis if it doesn't.

---

## 3. R3 — Session Length: Contingency Plan

The most *likely* significant risk, and the one most easily dismissed because it doesn't sound technical.

An 8-player, 10-frame turn-based game is long. A player who joins one, waits through seven opponents for their second frame, and closes the app is a retention failure that no amount of physics polish addresses.

### 3.1 Layered response

Deploy in order; each step is cheap and reversible.

1. **Already specified:** pre-aim while waiting, 1×/2× spectate or skip, persistent estimated-time display, Sprint format.
2. **If mid-match drop rate in 6–8 player rooms exceeds 20%:** change the default room size to 4, with 6–8 available but not the path of least resistance. Defaults are the strongest lever we have and cost nothing to change.
3. **If it exceeds 30%:** make Sprint the default match length for rooms of 5+, with 10-frame opt-in.
4. **Only if all of the above fail:** consider parallel bowling — two lanes running simultaneously, teams bowling concurrently. This is a significant technical and design change and should not be reached for early. It also breaks the turn-taking rhythm that makes bowling feel like bowling.

**Instrument this from the first beta build.** Drop rate segmented by room size, position in turn order, and frame number. Without that segmentation the data says "people quit" and nothing actionable.

---

## 4. Recommended Additions

Three changes I'd argue for on the evidence, plus one decision already taken. 4.1–4.3 are proposals; 4.4 is settled.

### 4.1 Ghost Bowling — **recommend**

Async multiplayer: bowl against a friend's recorded game rather than requiring both players online simultaneously.

- **Why:** the core social loop currently requires synchronous attendance. Bowling is turn-based, which means the opponent's presence adds almost nothing mechanically — only socially. Ghost games capture friends who can't coordinate schedules, which is most friends.
- **Cost:** low. The replay system exists either way. This is mostly UI plus a challenge-notification flow.
- **Risk it addresses:** R3 directly, and D7 retention generally.
- **Where:** add as a mode in 6.3, spec after the netcode model is settled.

### 4.2 Pin-carry feedback — **recommend**

After a shot that leaves pins, a one-line, dismissible explanation of *why*: entry angle too shallow, ball arrived too fast, hit high on the head pin.

- **Why:** PRD 13.3 states "frustration is allowed; confusion is not." Leaving the 10-pin on what felt like a good shot is the single most confusing moment in bowling, and right now the game says nothing. This is the cheapest possible way to honour a principle the doc already commits to.
- **Cost:** low. The physics already knows entry angle and speed.
- **Guardrail:** off after the first ten games unless re-enabled, or it becomes noise.

### 4.3 Move accessibility architecture into the MVP — **recommend**

Not the features — the constraints. Never encoding state in hue alone, and keeping a text layer separable, cost nothing in week 3 and are expensive in month 8. The MVP doc already flags this as a caveat; I'd promote it to a stated build rule.

### 4.4 A friends list — **cut entirely (decided)**

Not deferred to v1.2 — removed from the product. Room codes are the social model, and they're the better one here: no account friction, no pending-request state, works with people you'll play once. Maintaining two social graphs means every social feature has to ask which one it belongs to.

**Two dependencies this created, both resolved:**

- **Voice chat (v1.1)** was gated on "mutual friends only." With no friends graph, it's gated on **room scope** instead: private rooms entered by code, per-participant opt-in, 18+ only, dies with the room. The code you were given is the trust signal.
- **Ghost Bowling** challenges are sent as **share codes or links**, exactly like room codes. Consistent with everything else and cheaper to build.

Both replacements are arguably better than what they replaced — the code model is already the thing players understand, and reusing it means one social primitive instead of two.

**One consequence to accept honestly:** without a friends graph there is no re-engagement hook. Nothing pings a lapsed player that someone wants to bowl. Ghost Bowling challenge links are the closest substitute, which raises their priority — they become the only mechanism by which one player can pull another back in.

---

## 5. Review Cadence

| When | Review |
|---|---|
| Weekly | CI determinism conformance results |
| Week 4 | Feel gate — go/no-go |
| Week 6 | Scoring conformance — 100% or block |
| Week 12 | Determinism gate — Plan A or Plan B decision, made in one meeting, documented same day |
| Week 14 | Second-game gate — 6 of 10 external testers |
| Every beta build | R3 telemetry review: drop rate by room size |

The week-12 decision is the only one in this project that should have a pre-agreed decision rule rather than a discussion. Write the rule now, while nobody is emotionally invested in Plan A.
