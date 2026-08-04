# Product Requirements Document — **SPORT BOWLING**

**Version:** 1.3 (Final)
**Date:** August 3, 2026
**Platforms:** iOS, Android, PC (Windows/macOS)
**Genre:** Sports / Casual Competitive
**Orientation:** Portrait + Landscape (both fully supported)
**Status:** Scope locked. No open blocking questions. Live risk tracking in `Risk-Register.md`.

---

## Contents

| § | Section | For |
|---|---|---|
| 1–2 | Overview, Goals & Metrics | Everyone |
| 3 | Official Rules Implementation | Engineering |
| 4 | Color System | Design, Art |
| 5 | Platforms & Orientation | Engineering, Design |
| 6 | Core Gameplay *(incl. 6.5 Menu Structure)* | Design, Engineering |
| 7 | Multiplayer | Engineering, Backend |
| 8 | Audio & Visual Effects | Audio, VFX |
| 9 | Tutorial | Design |
| 10 | How to Play *(player-facing copy)* | Design, Marketing |
| 11 | Cover Art & Key Art | Art, Marketing |
| 12 | Progression & Economy | Product |
| 13 | Player Experience & Anti-Frustration | Everyone |
| 14 | Accessibility | Design, Engineering |
| 15 | Technical Notes | Engineering |
| 16 | Release Plan | Production |
| 17 | Decisions & Open Questions | Everyone |
| 18 | Out of Scope for v1.0 | Everyone |

**Companion documents:** `MVP-Scope.md` (build order and go/no-go gates), `Risk-Register.md` (risk register, determinism contingency, review cadence — **the live document during build**), `scoring_engine.py` (reference scoring implementation and test suite), `scorecard-wireframes.html` (portrait vs. landscape team scorecard layouts).

---

## 1. Overview

**Sport Bowling** is a physics-based ten-pin bowling game built on **official USBC/World Bowling rules**, designed to feel authentic to real bowlers while remaining instantly playable for casual players. The game runs on mobile and PC, plays in both vertical and horizontal orientations, and supports online multiplayer through simple **room codes**.

The identity of the game is built on a **ten-color palette** — every ball, menu, and UI surface draws from the same set of ten colors, giving the product a bold, unmistakable visual signature.

### 1.1 Product Pillars

| Pillar | Description |
|---|---|
| **Authentic** | Real regulation lane dimensions, real scoring, real oil patterns |
| **Accessible** | One-swipe control scheme; playable one-handed in portrait |
| **Spectacular** | Fire trails on every roll, fireworks on every strike |
| **Social** | Create a room, share a code, bowl together in under 15 seconds |

### 1.2 Target Audience

- **Primary:** Casual mobile players 16–45 who want a quick, satisfying sports game
- **Secondary:** League and recreational bowlers who want accurate scoring and physics
- **Tertiary:** Friend/family groups looking for a low-friction shared multiplayer game

---

## 2. Goals & Success Metrics

### 2.1 Product Goals

1. Deliver a complete, rules-accurate ten-pin bowling experience on all target platforms.
2. Make multiplayer setup frictionless — no accounts required to join a room.
3. Make every roll visually and audibly rewarding.
4. Teach the game's controls and scoring to a first-time player in under 3 minutes.

### 2.2 Success Metrics

| Metric | Target |
|---|---|
| Tutorial completion rate | ≥ 85% |
| D1 retention | ≥ 40% |
| D7 retention | ≥ 18% |
| Median session length | ≥ 8 minutes |
| % of players who join or host a multiplayer room in week 1 | ≥ 30% |
| Crash-free session rate | ≥ 99.5% |
| Multiplayer room join success rate | ≥ 98% |
| Time from "Create Room" to first roll | ≤ 15 seconds |
| Instant-rematch rate (rooms playing 2+ games) | ≥ 45% |
| Multiplayer matches completed without a player dropping | ≥ 90% |
| First-session time to first roll | ≤ 60 seconds |
| Players who open **How to Play** at least once in week 1 | ≥ 25% |

---

## 3. Official Rules Implementation

The scoring and physics engine must conform to **United States Bowling Congress (USBC)** playing rules and equipment specifications.

### 3.1 Game Structure

- A game consists of **10 frames**.
- In frames 1–9, the player rolls up to **two balls** per frame. If all ten pins are knocked down on the first ball, the frame ends immediately (strike).
- In the **10th frame**, the player rolls a third ball if they bowl a strike or a spare.
- Maximum score: **300** (twelve consecutive strikes).

### 3.2 Scoring Rules

| Result | Notation | Scoring |
|---|---|---|
| **Strike** | `X` | 10 + the total of the next **two** balls |
| **Spare** | `/` | 10 + the total of the next **one** ball |
| **Open frame** | e.g. `7 2` | Total pins knocked down in that frame |
| **Gutter / miss** | `-` | 0 |
| **Foul** | `F` | 0 for that ball; pins reset if it was the first ball |
| **Split** | circled numeral | No score change — display indicator only |

**Tenth-frame handling:**
- Strike on ball 1 → two bonus balls, pins reset after each strike.
- Spare on balls 1–2 → one bonus ball, pins reset.
- Open frame → frame ends after ball 2.

**Split definition:** After the first ball of a frame, the headpin (pin 1) is down and at least two pins remain standing that are non-adjacent — separated by at least one downed pin or by a gap. The engine must detect and flag splits, including the standard named splits (7-10, 4-6-7-10 "Big Four", 3-7, 2-10, etc.).

### 3.3 Regulation Lane & Equipment Specs

These values drive the physics simulation and 3D geometry:

| Element | Specification |
|---|---|
| Lane length (foul line → headpin center) | 60 ft (18.29 m) |
| Total lane length (foul line → pit) | 62 ft 10 3/16 in |
| Lane width | 41.5 in (approx. 39 boards, ~1.06 in per board) |
| Approach length | Minimum 15 ft |
| Gutter width | 9.25 in each side |
| Pin spacing (center to center) | 12 in |
| Pin height | 15 in |
| Pin weight | 3 lb 6 oz – 3 lb 10 oz |
| Ball diameter | 8.5 – 8.595 in |
| Ball weight | Max 16 lb (selectable 6–16 lb in game) |
| Pin deck | 60 in wide, triangular 4-3-2-1 setup |

### 3.4 Pin Numbering

```
        7   8   9   10
          4   5   6
            2   3
              1
```

### 3.5 Foul Detection

- A foul occurs when any part of the bowler crosses or touches the foul line.
- In this game, a foul is triggered when the release point crosses the foul line marker during the swing gesture.
- Foul → ball scores 0. Audible buzzer + red "FOUL" overlay.

### 3.6 Oil Patterns

Lane conditioner affects ball trajectory and hook potential. Implemented patterns:

| Pattern | Length | Difficulty | Unlock |
|---|---|---|---|
| House Shot | 40 ft | Easy | Default |
| Chameleon | 39 ft | Medium | Level 5 |
| Scorpion | 42 ft | Medium | Level 10 |
| Cheetah | 35 ft | Hard | Level 15 |
| Shark | 44 ft | Hard | Level 20 |
| Wolf | 32 ft | Expert | Level 25 |

Oil depletes across frames, subtly shifting the playable line — visible as a translucent overlay when the "Oil View" toggle is enabled.

---

## 4. Color System

Ten core colors define the entire product. Every ball, menu panel, button, badge, and particle effect must be drawn from this palette.

| # | Color | Hex | Primary Use |
|---|---|---|---|
| 1 | **Gold** | `#D4AF37` | Perfect game, championship UI, premium accents, 300-game badge |
| 2 | **Red** | `#D7263D` | Foul states, destructive actions, "Red" ball, alerts |
| 3 | **Black** | `#0B0B0F` | Base background, lane shadow, high-contrast text |
| 4 | **Blue** | `#1B6CF2` | Primary action buttons, links, default ball |
| 5 | **Green** | `#17B978` | Confirmations, strikes, ready states, online indicator |
| 6 | **Yellow** | `#FFD23F` | Highlights, spares, tutorial pointers, XP |
| 7 | **Purple** | `#8B44C7` | Multiplayer mode identity, room UI, special events |
| 8 | **Silver** | `#C7CDD3` | Secondary text, borders, dividers, pin gloss |
| 9 | **Orange** | `#FF7A1A` | Fire effects, energy meter, streak counters |
| 10 | **Pink** | `#FF5FA2` | Cosmetic accents, celebration confetti, social features |

### 4.1 Ball Roster

Ten default balls, one per color, all available from the start. Each has distinct handling characteristics so color choice is also a gameplay choice.

| Ball | Color | Weight | Hook Rating | Speed Rating | Character |
|---|---|---|---|---|---|
| **Midas** | Gold | 15 lb | 8/10 | 6/10 | Premium all-rounder, strong backend |
| **Inferno** | Red | 16 lb | 7/10 | 8/10 | Heavy, powerful, high pin carry |
| **Onyx** | Black | 15 lb | 5/10 | 7/10 | Neutral, predictable — the tutorial ball |
| **Tidal** | Blue | 14 lb | 6/10 | 7/10 | Balanced starter ball |
| **Viper** | Green | 14 lb | 9/10 | 5/10 | Maximum hook, oil-hungry |
| **Solar** | Yellow | 12 lb | 4/10 | 9/10 | Fast and straight |
| **Nebula** | Purple | 15 lb | 8/10 | 6/10 | Late, sharp break point |
| **Chrome** | Silver | 16 lb | 3/10 | 9/10 | Straight-line power, dry-lane specialist |
| **Ember** | Orange | 13 lb | 7/10 | 7/10 | Even arc, forgiving |
| **Blossom** | Pink | 10 lb | 6/10 | 6/10 | Light, easy control, beginner-friendly |

**Customization:** Players can recolor any ball to any of the ten palette colors, choose a finish (matte / gloss / metallic / marbled / translucent), and apply a fire-trail tint.

### 4.2 UI Theming

- **Base surface:** Black (`#0B0B0F`) with Silver dividers
- **Primary CTA:** Blue fill, white text
- **Positive/confirm:** Green
- **Warning/destructive:** Red
- **Multiplayer surfaces:** Purple-dominant so the mode is recognizable at a glance
- **Progression/reward surfaces:** Gold + Yellow
- **Accessibility:** All text/background pairs must meet **WCAG AA (4.5:1)**. A colorblind mode adds pattern fills and icon markers so no state is communicated by hue alone.

---

## 5. Platforms & Orientation

### 5.1 Platform Requirements

| Platform | Minimum Spec | Target Framerate |
|---|---|---|
| iOS | iOS 15+, iPhone 8 / iPad 6th gen | 60 FPS (120 on ProMotion) |
| Android | Android 9+, 3 GB RAM, Vulkan/GLES 3.1 | 60 FPS |
| Windows | Win 10 64-bit, DX11 GPU, 4 GB RAM | 60–144 FPS |
| macOS | macOS 12+, Apple Silicon or Intel w/ Metal | 60–120 FPS |

Cross-platform multiplayer between all four platforms is required.

### 5.2 Dual Orientation Design

Both orientations are **first-class**, not scaled versions of one another. The player can rotate at any time — including mid-frame — and the layout reflows without interrupting play.

**Vertical (Portrait)**
- Camera: behind-the-bowler, narrow FOV, lane recedes up the screen
- Scorecard: collapsed strip at top, tap to expand into a full overlay
- Controls: bottom third of screen, thumb-reachable, one-handed play supported
- Power/spin meters: stacked vertically along the right edge
- Best for: quick solo sessions, commuting, one-handed play

**Horizontal (Landscape)**
- Camera: wider cinematic FOV, more lane and pin deck visible
- Scorecard: persistent full 10-frame strip across the top
- Controls: split — aim on the left, power/spin on the right
- Multiplayer roster: left rail showing all players and live scores
- Best for: PC, tablets, multiplayer sessions, spectating

**Requirements**
- Orientation change completes in < 300 ms with no loss of game state
- Safe-area handling for notches, dynamic islands, and gesture bars
- A manual orientation lock lives in Settings
- PC defaults to landscape but supports a portrait window mode

---

## 6. Core Gameplay

### 6.1 Control Scheme (Touch)

A three-stage swipe, the same in both orientations:

1. **Position** — drag left/right on the approach to set starting position (39 board positions)
2. **Aim** — drag the targeting arrow to set the line, using the seven lane arrows as reference
3. **Roll** — swipe forward; swipe **length** sets power, swipe **curve/end-angle** sets spin and hook

An optional **assist mode** (default ON for new players) shows a predicted trajectory line. Turning it off grants a +10% XP bonus.

### 6.2 Control Scheme (PC)

- **Mouse:** click-drag for position, aim, and roll — mirrors the touch flow
- **Keyboard:** `A`/`D` position, `←`/`→` aim, hold `Space` for power, release to roll, `Q`/`E` for spin
- **Gamepad:** left stick position/aim, right trigger power, right stick spin
- Full key rebinding in Settings

### 6.3 Game Modes

| Mode | Description |
|---|---|
| **Quick Play** | Single 10-frame game vs. AI or solo |
| **Practice** | Free rolling, no scoring, pin-setup editor for spare drills |
| **Career** | 40-lane progression through 6 oil patterns, unlockable venues |
| **Spare Challenge** | Convert increasingly difficult spare and split leaves |
| **Multiplayer** | Room-code online play, 2–8 players. Singles or teams (2v2 / 3v3 / 4v4) — see 7.2 |
| **Local Pass-and-Play** | 2–4 players on one device |
| **Daily Challenge** | Fixed seed, fixed conditions, global leaderboard, resets 00:00 UTC |
| **Ghost Bowling** | Async — bowl against someone's recorded game without both players online. Challenges are sent as a **share code or link**, matching the room-code model; no friends graph required. Scoped after the netcode model is settled; see `Risk-Register.md` §4.1 |

**Match length options.** Any mode except Career can be played as a **Sprint** — a 5-frame game with 10th-frame rules applied to frame 5. Host-selectable in multiplayer. Sprint scores are tracked separately and never mixed into 10-frame averages or leaderboards.

### 6.4 AI Opponents

Five difficulty tiers with realistic behavior — accuracy variance, situational spare conversion rates, and occasional misses. AI must never appear to cheat.

| Tier | Avg. Score | Strike % | Spare Conv. % |
|---|---|---|---|
| Rookie | 90–110 | 8% | 30% |
| Amateur | 120–140 | 18% | 45% |
| League | 150–175 | 30% | 62% |
| Pro | 185–210 | 45% | 78% |
| Legend | 215–240 | 58% | 88% |


### 6.5 Menu Structure & Navigation

The shell has one job: get a player from launch to a rolling ball in as few taps as possible, while keeping help permanently within reach.

**Main menu**

| Item | Goes to | Notes |
|---|---|---|
| **Play** | Mode select → ball select → lane | Primary CTA, Blue, largest target |
| **Multiplayer** | Create Room / Join Room | Purple-themed throughout |
| **Practice** | Free rolling + pin-setup editor | — |
| **My Stats** | Averages, history, saved replays | Account required |
| **Balls** | Ball roster and colour customisation | — |
| **How to Play** | Reference screen (section 10) | **Persistent. Never buried in Settings.** |
| **Settings** | Audio, effects, controls, accessibility, orientation lock | Tutorial replay lives here too |

**The How to Play button**

- Sits in the **main menu as a top-level item** — not inside Settings, not behind a "…" overflow, not a first-run-only prompt.
- Rendered with a Yellow question-mark glyph, matching the tutorial's highlight colour so the two read as the same system.
- Also reachable from:
  - the **pause menu**, mid-game, including mid-frame — opening it pauses the turn timer in singleplayer, and in multiplayer it opens as an overlay that does **not** pause the timer (one player cannot stall a room by reading)
  - the **multiplayer lobby**, so a first-timer who was handed a room code can read the rules before the host starts
  - the **tutorial's final screen**, so players learn it exists before they need it (see 9.4)
- Opens to a contents list, not to page one. A player checking what "F" means should not scroll through the basics to find it.
- Remembers the last section viewed within a session.

**Navigation rules**

- **Play is always reachable in two taps from anywhere.** Any deeper flow gets a persistent back affordance.
- Back never loses configuration — leaving ball select and returning restores the previous choice.
- The pause menu is identical in both orientations and in every mode; only the resume behaviour differs.
- Nothing in the shell is modal without an explicit dismiss control. No screen a player can get stuck on.

**Portrait vs. landscape shell**

| | Portrait | Landscape |
|---|---|---|
| Main menu | Single stacked column, thumb-reachable, Play at the bottom | Two columns, Play as a full-height left panel |
| Pause | Bottom sheet | Centred card |
| How to Play | Full-screen, single column, section list at top | Two-pane: section list left, content right |

---

## 7. Multiplayer

### 7.1 Room System

**Hosting**
1. Player taps **Create Room** from the multiplayer menu (Purple-themed).
2. Server generates a **6-character alphanumeric room code** (e.g. `K7P2QX`).
3. Ambiguous characters are excluded from the alphabet: no `0`, `O`, `I`, `1`, `L`.
4. Host configures: **format (Singles or Teams)**, player count (2–8), **match length (10-frame or Sprint)**, **handicap on/off**, oil pattern, turn timer, private/public, spectators on/off.
5. Code is displayed large and high-contrast, with **Copy** and **Share** buttons and an optional QR code.

**Joining**
1. Player taps **Join Room** and enters the code (case-insensitive, auto-uppercased).
2. Client validates and connects; player lands in the lobby.
3. **No account is required to join** — a guest can enter a code and play immediately.
4. **Guests play but do not progress.** Guest sessions earn no XP, no level progress, no unlocks, and no stat history. Scores count for the match and appear on the end-of-match summary only. A single non-blocking prompt at match end offers account creation, with the just-finished game's XP granted retroactively if they sign up within that session.

**Lobby**
- Roster shows each player's name, chosen ball color, and ready state (Green = ready)
- Players pick their ball and color; duplicate colors are allowed but visually differentiated by a border marker
- Host can kick players and start the game
- Host migration: if the host disconnects, the longest-connected player is promoted automatically
- **In Teams format:** two team slots (Team A / Team B), players drag themselves between them, host can rebalance, and the game cannot start until both teams have equal player counts

### 7.2 Team Play

Ships at **1.0**. Supported formats: **2v2 (doubles), 3v3, and 4v4**.

**Scoring**
- Every player still bowls a complete, individually-scored 10-frame game under standard USBC rules.
- **Team score = the sum of its members' individual scores.** No handicap system at 1.0.
- The team with the higher total after 10 frames wins. Ties trigger a **one-frame roll-off** — each team's highest scorer bowls one frame; if still tied, sudden-death single balls.

**Handicap (optional, host toggle — default OFF)**

Mixed-skill friend groups are the core audience for team play, and a 210-average bowler paired against a 95-average bowler is not a match anyone enjoys. Handicap makes those games competitive without touching the rules of bowling itself.

- Formula: `handicap = (basis − player average) × factor`, applied to the final score. Defaults: **basis 220, factor 90%**, both host-adjustable.
- Negative handicaps are floored at 0 — a player above the basis gets no penalty.
- Requires an established average (minimum 5 completed games). Players below that threshold, and all guests, bowl **scratch**.
- Handicap-applied scores are labelled on the scorecard with the raw score shown alongside, so nobody is confused about what they actually bowled.
- **Leaderboards, Daily Challenge, and all posted records are scratch-only.** Handicap exists for friend matches and never touches competitive standings.

**Turn order**
- Alternating by team, then by roster position: A1 → B1 → A2 → B2, and so on.
- Alternation is enforced so a team never bowls two frames back to back.

**Team identity**
- Team A defaults to **Blue**, Team B to **Red**. Host can reassign either team to any palette color; the two teams cannot share a color.
- Team color tints each member's frame row, name plate, and firework bursts — a player's *ball* color stays whatever they chose, so individual identity survives inside the team.

**Scorecard layout by orientation**

| Orientation | Team Scorecard |
|---|---|
| **Landscape** | Left rail groups players under team headers, each showing a running team total. Full 10-frame strip across the top for the current bowler only. Team totals are always visible. |
| **Portrait** | Collapsed top strip shows **Team A total vs. Team B total** plus the current bowler's frame. Tap to expand into a full overlay: teams stacked, players nested, swipe horizontally to scroll frames. |

- In both orientations the leading team's total is rendered in **Gold**.
- Portrait must never require more than one tap to reach any player's full frame history.

**Social**
- Team-only emotes are visually differentiated (bordered in team color)
- End-of-match summary shows team totals first, then individual breakdowns, then "Bowler of the Match" across both teams

### 7.3 Match Flow

- **Turn-based**, matching real bowling: each player completes their frame, then play passes on.
- **Turn timer:** 30 s default (host-configurable 15/30/60 s / off). On expiry, an auto-roll is taken with default settings.
- **Pre-aim while waiting:** during another player's turn, you can set your own position, aim, and ball selection. Your setup is held and applied the instant your turn begins. This is the primary mitigation for wait time in 6–8 player rooms.
- **Spectate controls:** watch another player's roll at 1x or 2x, or skip straight to the result. Per-player preference, remembered across matches.
- **Estimated match time** is shown on the room-creation screen and in the lobby, recalculated as players join.
- **Spectators:** up to 10 per room, can watch but not roll.
- **Live scorecard:** all players' frames visible at all times; the current bowler is highlighted in Gold.

**Disconnection & AI Takeover**

A team never bowls short. If a player drops, an AI assumes their frames so the match completes with balanced rosters.

| Stage | Behavior |
|---|---|
| 0–60 s (grace window) | Slot held. If their turn arrives, a single auto-roll is taken with their last-used settings. Name plate shows a Silver "reconnecting" pulse. |
| After 60 s | **AI takeover.** Name plate switches to `<Name> (AI)` in Silver; an AI-controlled marker appears on the scorecard row. |
| Player returns | Player is offered control back at the start of their next frame — never mid-frame. They may **resume** or **decline** and let the AI finish. AI-bowled frames stay on the card, flagged. |

**Handback prompt**

On reconnect, the player gets a single non-blocking prompt before their next frame: **Resume bowling** or **Let the AI finish**. It shows their own average alongside the AI's performance so the choice is informed. No response before the frame starts defaults to **Resume**.

- The choice is **reversible** — a player who declined can take control back at any later frame boundary via a persistent "Take over" button.
- Declining is a per-match choice; it does not persist across matches.
- Teammates see a Silver "AI (by choice)" marker on that player's row, distinct from the involuntary-takeover marker. Nobody is misled about whether a human is bowling.

**Anti-farming rules**

Letting the AI bowl must never be the *optimal* way to play. Three constraints enforce that:

1. **AI-bowled frames earn no XP** and do not count toward personal statistics, averages, or leaderboards — whether the takeover was voluntary or not. The team score still counts in full, so the player isn't punishing their teammates by dropping out.
2. **The AI's skill level is locked at the moment of disconnect** and never re-derived. A player cannot decline, watch the AI bowl three strikes, and have it get better.
3. **Voluntary disconnects do not trigger takeover.** Quitting through the menu forfeits the slot to AI *and* records a leave on the account. Only genuine connection loss opens the resume/decline path.

> **Design note:** The net effect is that declining is a graceful exit for someone whose connection is unstable or who has to leave — not a way to buy a better score. They keep their team competitive and give up their own progression for the match.

**AI skill matching**
- The AI inherits the disconnected player's **current-game average** to that point, so it bowls at roughly their level and doesn't swing the match.
- If they dropped before frame 3, it falls back to their **career average**; for a guest with no history, it uses the **Amateur** tier (see 6.4).
- The AI uses their selected ball, so trail color and handling stay consistent.

**Fairness**
- AI-bowled frames are visibly marked on the scorecard and in the end-of-match summary, so no one is misled about who bowled what.
- A player who is AI-substituted for **3+ consecutive frames** is not eligible for "Bowler of the Match."
- If a **guest** disconnects, AI takeover is permanent for that match — guests have no session to reconnect into.
- If **all** members of one team disconnect, the match ends and is recorded as a forfeit rather than played out by AI.
- Rage-quit protection: repeated mid-match disconnects within a rolling window flag the account for matchmaking penalties (post-launch enforcement).

### 7.4 Social Features

- Emote wheel — 8 reactions (nice shot, ouch, laugh, clap, etc.), rate-limited to prevent spam
- Optional text chat with profanity filter, disabled by default for under-18 accounts
- **Quick-chat phrase bank** — a fixed set of ~20 preset phrases ("good game", "nice pocket", "your turn"), unmoderatable by design and safe in any room
- **No voice chat at 1.0.** The moderation burden and the safety exposure for minors outweigh the benefit at launch, and the emote wheel plus quick-chat covers most of what players actually need mid-match. Voice is scheduled for v1.1 as **opt-in push-to-talk, private rooms only, off by default, with per-player mute and no server-side recording**.

  With no friends list in the product, voice cannot be gated on a mutual-friend relationship. It is gated on **room scope** instead: voice exists only inside a private room you entered with a code, is off until every participant opts in individually, is unavailable to accounts under 18, and dies with the room. A code you were given is the trust signal — the same one the whole social model already runs on
- Report and mute controls on every player in the roster
- End-of-match summary: final scores, strike counts, highest frame, "Bowler of the Match"

### 7.5 Technical Requirements

| Requirement | Target |
|---|---|
| Room code lifetime | 4 hours idle, or until the room empties |
| Concurrent rooms supported | 50,000 at launch |
| Roll-to-result latency (spectator view) | < 250 ms |
| Netcode model | Server-authoritative physics; deterministic replay sent to all clients |
| Region routing | Auto-select the lowest-latency region; manual override in Settings |
| Rate limiting | Max 10 room-join attempts per minute per client |

> **Note:** Physics must be simulated server-side and the result broadcast as a deterministic replay. Clients must not compute their own outcomes, which prevents score manipulation and keeps every player's view identical.

**Determinism dependency and fallback.** The replay model above assumes bit-identical floating-point physics across iOS, Android, and PC. That assumption is verified at a **week-12 gate** (1,000 consecutive rolls, bit-identical pin states, all three platforms). If it fails, the project switches to **state broadcast** — the server still simulates authoritatively but transmits the resulting trajectory and pin state rather than an input record. Bandwidth rises from roughly 50 bytes to 2–4 KB per roll, which is immaterial; determinism ceases to be required. Anti-cheat is unaffected either way, because the server remains authoritative in both models. The full contingency, including the week-1 CI conformance harness that makes the gate a formality rather than a crisis, is specified in `Risk-Register.md` §2.

---

## 8. Audio & Visual Effects

### 8.1 Sound Design

**Roll sounds**
- Ball release thud on the lane surface, pitch varying with ball weight
- Continuous rolling rumble, panned in stereo as the ball travels down the lane; volume and pitch scale with speed
- Distinct hook "hiss" as the ball transitions from skid to roll
- Gutter drop — hollow, unmistakable, deliberately disappointing

**Pin sounds**
- Layered pin-crash system: individual pin collisions are mixed dynamically rather than triggering one canned clip
- Strike hit uses a fuller, bass-heavy mix with an audible pin-scatter tail
- Pin wobble sound for pins that teeter and fall late
- Pinsetter mechanism sound between frames

**Celebration audio**
- Strike: crowd cheer + firework whistle and boom sequence
- Spare: shorter, warmer applause
- Turkey (3 strikes): escalating musical sting
- Perfect game: full crowd roar, extended firework finale
- Foul: harsh buzzer

**Music**
- Menu: upbeat, loopable
- In-game: low ambient bowling-alley bed (distant lanes, chatter, muted music)
- Multiplayer: slightly higher-energy variant
- Independent sliders for Music / SFX / Crowd / Voice in Settings

### 8.2 Fire Effects (Ball Roll)

Every roll produces a fire trail. Intensity scales with the player's current momentum, making the effect a readable gameplay signal rather than pure decoration.

| Streak State | Fire Intensity | Visual |
|---|---|---|
| Normal roll | Subtle | Faint Orange ember trail, low particle count |
| After 1 strike | Medium | Sustained Orange/Yellow flame trail |
| After 2 strikes | High | Bright flame with heat-shimmer distortion |
| Turkey+ (3+) | Maximum | Full Gold-white blaze, lane-surface glow, sparks |

**Specification**
- Trail tint inherits the ball's color, blended toward Orange/Yellow at the core
- GPU particle system with LOD scaling; particle budget drops automatically on lower-tier devices
- Scorch marks fade from the lane over ~2 seconds
- **Toggleable** — a "Reduced Effects" setting for performance and for photosensitive players

### 8.3 Fireworks (Strike)

On every strike, a fireworks sequence launches above the pin deck.

| Achievement | Fireworks Display |
|---|---|
| Strike | 3 bursts, colors drawn from the player's ball color + palette |
| Double (2 in a row) | 5 bursts, wider spread |
| Turkey (3 in a row) | 8 bursts + Gold text banner "TURKEY!" |
| 4-Bagger through 11 | Escalating bursts, screen-edge glow |
| Perfect game (300) | 20-second full-screen finale in all ten palette colors, Gold "300" banner, saved replay |
| Spare | No fireworks — Green sparkle burst only, to keep strikes distinct |

**Specification**
- Firework particle colors pull exclusively from the ten-color palette
- Skippable with a tap after 1 second; auto-skip option in Settings
- In multiplayer, fireworks render for all players so everyone sees the moment
- Sequence duration capped at 3 s for regular strikes to keep pace brisk
- **Celebration decay:** the full sequence plays for the first strike of a game; subsequent single strikes use an abbreviated 1.5 s version. Streaks (double and above), the 10th frame, and perfect games always play in full. This keeps the effect a reward rather than a tax on pace
- Spectators can skip a celebration individually without skipping it for the bowler

---

## 9. Tutorial

### 9.1 Design Principles

- Interactive, never a wall of text — the player is always doing something
- Fully **skippable** at any point, and replayable from Settings at any time
- Adapts to orientation: the same steps, laid out for portrait or landscape
- Uses the **Onyx (Black)** ball with neutral handling so lessons transfer cleanly
- Yellow is the tutorial's pointer/highlight color throughout

### 9.2 Structure — 7 Steps, ~3 Minutes

| # | Step | Teaches | Success Condition |
|---|---|---|---|
| 1 | **Welcome to the Lane** | Camera, lane layout, pin numbering, arrows and dots | Tap through — 20 s |
| 2 | **Your First Roll** | The swipe gesture; power via swipe length | Roll the ball down the lane |
| 3 | **Taking Aim** | Position and aim stages, using the arrows as targets | Hit the 1-3 pocket (guided) |
| 4 | **Adding Spin** | Curve gesture, hook, why hook improves pin carry | Land one hooked shot |
| 5 | **Scoring Basics** | Strikes, spares, open frames, how bonuses carry forward | Bowl a strike (pins pre-set to a gimme leave) |
| 6 | **Picking Up Spares** | Spare shooting, split identification, adjusting position | Convert a simple 2-pin spare |
| 7 | **Ball Selection** | Ball weights, hook ratings, color customization | Choose a ball and finish |

### 9.3 Ongoing Coaching

After the tutorial, contextual tips appear for the first three games:
- First split encountered → explains what a split is and suggests a strategy
- First gutter ball → suggests a position adjustment
- First oil-pattern change → explains how the new pattern changes the line
- All contextual tips are dismissible permanently via "Don't show tips again"

### 9.4 How to Play Reference

The tutorial teaches by doing; the **How to Play** screen (section 10) is the reference players check later. It is reachable from both the main menu and the pause menu, at any time, including mid-frame. The tutorial's final screen links to it directly so players know it exists before they need it.

### 9.5 Practice Mode Link

The tutorial ends with a direct link to **Practice Mode**, where the player can set up any pin configuration and drill spares with no scoring pressure.

---

## 10. How to Play

> **Note:** This section is written in player-facing voice. It is the source copy for the in-app **How to Play** screen (reachable from the pause menu and the main menu at any time) and for store-page descriptions. It complements the tutorial rather than replacing it — the tutorial teaches by doing, this is the reference you check when you've forgotten something mid-game.

### 10.1 The Basics

**The goal:** knock down all ten pins. Do it with your first ball and that's a **strike**. Do it across two balls and that's a **spare**. Leave pins standing after two balls and that's an **open frame**.

A game is **10 frames**. Highest score wins. The best possible score is **300** — twelve strikes in a row.

**Why strikes are worth chasing.** A strike isn't worth 10 points; it's worth 10 *plus whatever you knock down with your next two balls*. A spare is worth 10 plus your next one ball. This is why a good streak snowballs, and why the scoreboard sometimes waits before showing your total — it's waiting on the bonus.

**Your three moves, in order:**

| Step | What you do | What it controls |
|---|---|---|
| **1. Stand** | Drag left or right along the approach | Where you start — your angle into the pocket |
| **2. Aim** | Drag the targeting arrow | Your line. Use the seven arrows on the lane as targets, not the pins |
| **3. Roll** | Swipe forward | Swipe **length** sets power. Swipe **curve** sets spin and hook |

Beginner tip: aim at the arrows, not the pins. Every bowler in the building is doing the same thing.

**The pocket.** The gap between the 1 and 3 pins (1 and 2 if you're left-handed) is where strikes come from. Hitting it dead-on isn't the goal — hitting it at an *angle*, with the ball still turning, is what scatters all ten.

---

### 10.2 Playing Solo Against the CPU

**Getting into a game**

1. From the main menu, choose **Play**, then **Quick Play**.
2. Pick your opponent's difficulty — Rookie, Amateur, League, Pro, or Legend.
3. Pick a ball. Heavier balls carry pins better but are harder to control; higher hook ratings curve more but need oil to work with.
4. Choose your lane condition, or leave it on House Shot.
5. Bowl.

**Choosing a difficulty honestly**

| Tier | Bowls around | Pick this if |
|---|---|---|
| **Rookie** | 90–110 | It's your first day |
| **Amateur** | 120–140 | You can hit the pocket sometimes |
| **League** | 150–175 | You convert most single-pin spares |
| **Pro** | 185–210 | You're striking regularly and want a fight |
| **Legend** | 215–240 | You want to lose, occasionally |

The CPU plays fair. It has no hidden accuracy bonus and no rubber-banding — its listed averages are what it actually bowls. If it beats you, it out-bowled you.

**How a solo game runs**

- You and the CPU alternate frames. The CPU takes its turn immediately; watch it or skip to the result.
- The scorecard fills in as you go. A dash means the frame is waiting on bonus balls.
- Between frames, watch the **oil**. It breaks down as the game goes on, and the line that worked in frame 2 may not work in frame 8. Turn on **Oil View** if you want to see it.
- The game ends after your 10th frame. Highest score wins.

**When you're losing badly**, you can restart from the pause menu at any time — no penalty, no stat recorded.

**Where to practise instead.** Solo play against a CPU isn't the fastest way to improve. **Practice Mode** lets you set up any pin arrangement and drill it — spares, splits, whatever keeps beating you — with no scoring pressure and no opponent waiting.

---

### 10.3 Playing Multiplayer

**Hosting a room**

1. Choose **Multiplayer → Create Room**.
2. Set it up: singles or teams, how many players, 10 frames or a 5-frame Sprint, lane condition, turn timer, and whether handicap is on.
3. You'll get a **six-character room code**. Share it — as a code, a link, or a QR code.
4. When everyone's in and marked ready, start the game.

**Joining a room**

1. Choose **Multiplayer → Join Room**.
2. Type the code. Capitals don't matter. The code never contains `0`, `O`, `I`, `1`, or `L`, so you won't get caught out by lookalikes.
3. Pick your ball and colour, then mark yourself ready.

You don't need an account to join a room. **You will need one to keep anything** — as a guest, your score counts for the match, but you earn no XP and nothing is saved to your record. Signing up at the end of the match backdates that game's XP to you.

**Playing as a team**

- Teams alternate: A1, B1, A2, B2, and so on. Your team never bowls twice in a row.
- **Your team's score is everyone's scores added together.** You're not bowling against your teammate; you're bowling with them.
- You keep your own ball and colour inside your team colour, so you're still recognisably you on the scorecard.
- If the game is a blowout between mismatched players, the host can turn on **handicap**, which adds pins based on each player's average. Your raw score is always shown alongside the adjusted one.

**While it's not your turn**

Don't just sit there. You can:
- **Set up your next shot early** — position, aim, and ball. It's held and applied the moment your turn starts.
- **Watch at normal speed, double speed, or skip to the result.** Your choice, remembered between matches.
- **React** with the emote wheel or a quick-chat phrase.

**The turn timer.** Default is 30 seconds per turn. Let it run out and the game rolls for you with your current settings, so set your shot up early if you're prone to overthinking.

**If someone drops out**

Nobody's team bowls short. After a 60-second grace window, an AI takes over the missing player's frames, bowling at roughly the level they'd been bowling at that game, using their ball. Those frames are marked on the scorecard so everyone can see what happened.

If you're the one who dropped and you make it back, you'll be offered your slot at the start of the next frame — **resume**, or let the AI finish. Either is fine, and you can take over later if you change your mind. One thing worth knowing: **frames the AI bowls earn you no XP and don't count towards your stats.** Your team keeps the points; you don't keep the credit.

**When the game ends**

Final scores, strike counts, best frame, and Bowler of the Match. Then **Play Again** keeps everyone in the room for another game — no re-sharing the code, no re-picking balls.

---

### 10.4 Reading the Scorecard

| Symbol | Means |
|---|---|
| **X** | Strike — all ten on the first ball |
| **/** | Spare — all ten across two balls |
| **–** | No pins on that ball |
| **F** | Foul — you crossed the line, that ball scores zero |
| **○** (circled) | Split — the headpin is down and the pins left have a gap between them |
| **—** in the total | Waiting on bonus balls before the score can be worked out |

**The 10th frame is different.** Bowl a strike or a spare there and you get an extra ball — up to three deliveries in that frame. That's how a perfect game needs twelve strikes and not ten.

---

### 10.5 Five Things That Will Improve Your Score Fastest

1. **Take spares seriously.** Ten spares and no strikes is a 150 game. Most players chase strikes and leak points on easy spares.
2. **Move your feet, not your aim.** Missing left? Start further left and keep the same target. Adjusting your line is a much smaller correction than changing where you're throwing.
3. **Slow down.** Speed doesn't carry pins — angle does. A slower ball has more time to hook into the pocket.
4. **Turn off the trajectory guide** once you can hit the pocket. It's holding you back, and you earn more XP without it.
5. **Watch the oil.** If your ball stops hooking around frame 6, that's the lane changing, not you getting worse. Move a board or two left.

---

## 11. Cover Art & Key Art

### 11.1 Mandatory Elements

Every version of the cover art **must** feature:
1. **The pins** — a full rack of ten, in regulation triangular formation
2. **The ball** — hero-framed, mid-motion

### 11.2 Composition

- **Focal point:** A ball streaking toward the rack with a Gold-Orange fire trail behind it, caught in the instant before impact
- **Pins:** White with Red neck stripes (regulation), some beginning to scatter for a sense of motion; front pins sharply lit, rear pins slightly motion-blurred
- **Background:** Black lane fading into darkness, with fireworks in the palette colors bursting overhead
- **Lighting:** Warm Orange/Gold key light from the ball's fire trail, cool Blue/Purple rim light on the pins for separation
- **Palette use:** All ten colors present — the ball and fire carry Gold/Orange/Red; the fireworks and background lighting carry Blue, Green, Yellow, Purple, Pink; Silver on the pin gloss and lane reflections; Black as the ground
- **Logo:** "SPORT BOWLING" in a bold condensed sans, Gold with a Silver bevel, positioned upper-third
- **Negative space** reserved lower-right for platform badges and ratings marks

### 11.3 Required Deliverables

| Asset | Dimensions | Use |
|---|---|---|
| App Store icon | 1024 × 1024 | iOS |
| Play Store icon | 512 × 512 | Android |
| Play Store feature graphic | 1024 × 500 | Android |
| Steam capsule (main) | 616 × 353 | PC |
| Steam library hero | 1920 × 620 | PC |
| Key art — landscape | 3840 × 2160 | Marketing, splash |
| Key art — portrait | 2160 × 3840 | Mobile splash, social |
| Social square | 1200 × 1200 | Social channels |

**Rule:** The icon crop must still clearly read as *pins + ball* at 48 × 48 px. If the pins are not identifiable at that size, the composition must be simplified.

---

## 12. Progression & Economy

### 12.1 Player Progression

- XP earned per frame, with bonuses for strikes, spares, clean games, and playing with assists off
- **Account required.** Guest room-code sessions earn no XP and record no stats (see 7.1)
- 50 levels, unlocking oil patterns, venues, ball finishes, and cosmetic trails
- Career mode unlocks new venues every 5 levels

### 12.2 Statistics Tracked

Average score, high score, total games, strike percentage, spare conversion percentage, split conversion percentage, first-ball average, per-pattern averages, and a full game history with saved replays of any 250+ game.

**Replay privacy.** All replays are **private by default**. Nothing is ever auto-posted to a public feed, a friends feed, or social media. A one-tap Share button exports a video clip the player can send wherever they like, and a separate opt-in setting adds a game to the public Hall of Fame board. The moment belongs to the player; the game asks, it never assumes.

### 12.3 Monetization (Non-Pay-to-Win)

- **Free to play** with a single rewarded-video option after a game (optional, never forced)
- **Premium unlock** — one-time purchase removes ads and grants a Gold cosmetic set
- **Cosmetics only** — ball finishes, fire-trail colors, firework styles, name plates
- **Explicitly excluded:** No purchasable stat boosts, no energy system, no loot boxes, no paywalled game modes or oil patterns.

**Ad placement rules**
- Never mid-match, never between frames, never on app open
- Only after a completed game, and only as an opt-in rewarded video the player chooses to watch
- No ads at all during multiplayer matches, for any player in the room
- No fake countdown timers, no artificial scarcity messaging, no price obscuring — full price shown before any purchase flow begins

---

## 13. Player Experience & Anti-Frustration

Everything in this section exists because of a predictable player reaction — either something they will love and we should lean into, or something they will hate and we should design out before it ships.

### 13.1 Lean Into

| Feature | Why players want it |
|---|---|
| **Instant rematch** | Room persists after the final frame. "Play Again" keeps every player in their slot and starts a new game in under 5 seconds — no re-sharing the code, no re-picking balls |
| **Deep-linked room codes** | Sharing a room sends a tappable link, not just six characters. Tapping it opens the app straight into the lobby; if the app isn't installed, the code survives install and applies on first launch |
| **Pre-aim while waiting** | Set your position, aim, and ball during other players' turns (see 7.3). Turns the dead time in an 8-player room into preparation |
| **Ball identity** | Your color follows you — trail, fireworks, name plate, scorecard row. In team play your ball color survives inside the team color, so you're never anonymous |
| **Instant replay** | Last-frame replay available on demand, plus auto-saved replays of any 250+ game |
| **Full offline play** | Every solo mode works with no connection. Progress syncs when you're back online |
| **Real stats** | League bowlers get first-ball average, per-pattern splits, and spare-conversion rates — depth that respects players who actually bowl |
| **Nothing gated behind money** | Every mode, pattern, and ball is earnable. Purchases are cosmetic, full stop |

### 13.2 Design Out

| Friction | Mitigation |
|---|---|
| **Waiting through 7 opponents' turns** | Pre-aim queue, 1x/2x spectate or skip-to-result, estimated match time shown before you commit to a room |
| **Matches that run too long** | Optional 5-frame Sprint format (see 6.3), host-selectable, tracked separately from 10-frame averages |
| **Celebration fatigue** | Fireworks decay after the first strike of a game; streaks and 10th-frame strikes always play in full (see 8.3). Skippable after 1 second, always |
| **Ads at the worst moment** | Never mid-match, between frames, or on app open. Post-game opt-in rewarded video only, and none at all during multiplayer (see 12.3) |
| **Notification spam** | Everything off by default except "it's your turn" in a room you're actively in. Hard cap of one non-gameplay notification per day |
| **Forced tutorial** | Skippable from step one, replayable forever from Settings |
| **Losing a great game to a crash** | Frame state persisted server-side in multiplayer and locally in solo; games resume from the last completed frame |
| **Rage quitters wrecking a match** | AI takeover with skill matched to the departed player, plus leave tracking on the account (see 7.3) |
| **Haptic overload** | Per-event haptic toggles, default medium, full off available |
| **Not knowing why you left the 10-pin** | One-line, dismissible pin-carry explanation after a shot that leaves pins — entry angle, speed, or hit location. Auto-disables after the first ten games. Directly serves 13.3 principle 5 |
| **Feeling cheated by the AI** | AI never gets hidden accuracy bonuses. Its stated tier stats are its actual stats, and AI-bowled frames are always visibly marked |
| **Dark patterns** | No fake countdowns, no artificial scarcity, no obscured pricing, no streak-loss guilt messaging |

### 13.3 Governing Principles

1. **Never take input away for more than 3 seconds without a skip.**
2. **Never punish a player for someone else's connection.** A teammate dropping should cost you a close match, not a guaranteed loss.
3. **Everything celebratory is skippable; nothing informative is.** A player can skip fireworks. A player cannot skip seeing why their ball scored zero.
4. **The loudest reward is never the purchased one.** A 300 game must always look more impressive than anything bought in the store.
5. **Frustration is allowed; confusion is not.** Missing a 7-10 split should hurt. Not knowing why the ball hooked left should never happen.

---

## 14. Accessibility

- Colorblind modes: Deuteranopia, Protanopia, Tritanopia — with pattern fills and icon markers so state is never hue-only
- Text scaling up to 200%
- Reduced Motion setting — trims fire, fireworks, and camera shake
- Full screen-reader support on menus and the **How to Play** screen (VoiceOver / TalkBack)
- One-handed portrait play with a left/right handedness toggle
- Subtitles for all voice lines and audio cues, plus a visual indicator for key sounds
- Adjustable turn timer, including off, in single-player and host-configurable rooms
- Full input remapping on PC

---

## 15. Technical Notes

| Area | Approach |
|---|---|
| Engine | Unity or Unreal — must support deterministic fixed-timestep physics |
| Physics | Server-authoritative, fixed timestep, deterministic across platforms |
| Backend | Managed realtime service or custom authoritative server with regional deployment |
| Data | Cloud save with local fallback; offline play fully supported for solo modes |
| Analytics | Funnel events for tutorial steps, room creation/join, first roll, session length |
| Localization | English at launch; string externalization required for EN, ES, PT-BR, FR, DE, JA, KO, ZH-Hans in v1.1 |
| Build size | Mobile initial download ≤ 250 MB; venues and patterns delivered as on-demand assets |

---

## 16. Release Plan

| Phase | Scope | Timing |
|---|---|---|
| **Prototype** | Core physics, one lane, scoring engine, landscape only | Months 1–2 |
| **Alpha** | Full rules, 10 balls, both orientations, tutorial, AI | Months 3–5 |
| **Beta** | Multiplayer rooms, team play, fire/firework VFX, full audio, 3 venues | Months 6–8 |
| **Soft Launch** | Limited regions, tuning retention and multiplayer stability | Month 9 |
| **1.0 Launch** | All platforms, all modes, full polish | Month 10 |

### 16.1 Post-Launch Roadmap

- **v1.1** — Localization, tournament brackets, additional venues, **cross-progression (mobile ↔ PC)**, **gated voice chat**
- **v1.2** — Persistent leagues (code-joined, like rooms), season passes (cosmetic), Ghost Bowling
- **v1.3** — Custom ball designer, public Hall of Fame feed, spectator improvements

---

## 17. Decisions & Open Questions

### 17.1 Decided

| Question | Decision | Impact |
|---|---|---|
| Doubles/team play at launch? | **Yes — ships in 1.0** (2v2, 3v3, 4v4) | Team scorecard required in both orientations; alternating turn order in netcode; team assignment in lobby (see 7.2) |
| Can guests joining by code earn XP? | **No — play only, no progression** | Guest sessions record no XP, unlocks, or stats; sign-up prompt at match end (see 7.1) |
| Cross-progression mobile ↔ PC in 1.0? | **No** | Progression is per-platform at launch; moved to post-launch roadmap. Cross-*play* is unaffected and still ships in 1.0 |
| Guest disconnects mid-match in a team game? | **AI takeover** | Teams never bowl short; AI inherits the player's current-game average and their ball. AI-bowled frames are flagged on the scorecard (see 7.3) |
| Can a returning player decline control? | **Yes** | Resume/decline prompt at the next frame boundary, reversible at any later frame. Gated by anti-farming rules: AI frames earn no XP or stats, AI skill is locked at disconnect, voluntary quits don't qualify (see 7.3) |
| Voice chat in rooms? | **No at 1.0 — v1.1, heavily gated** | Moderation cost and minor-safety exposure outweigh launch benefit. Emote wheel + quick-chat phrase bank ship instead. v1.1 voice is opt-in push-to-talk, private rooms entered by code, per-participant opt-in, 18+ only, off by default (see 7.4) |
| Perfect-game replay sharing? | **Private by default, one-tap share** | Nothing is ever auto-posted. Player owns the moment and chooses whether it leaves the app (see 12.2) |
| A friends list? | **No — not at 1.0, not on the roadmap** | Room codes are the social model. No account friction, no pending-request state, works with people you'll play once. Voice gating and Ghost Bowling challenges are code-scoped instead of friend-scoped (see 7.4, 6.3) |
| Team handicap for mixed-skill groups? | **Yes — optional host toggle, default OFF** | `(220 − average) × 90%`, host-adjustable. Requires 5+ games; guests bowl scratch. Leaderboards and Daily Challenge are scratch-only (see 7.2) |

### 17.2 Still Open

*None blocking. The decisions above close out the launch scope; remaining questions are tuning problems for playtest — handicap factor defaults, celebration decay timing, and turn-timer defaults for 8-player rooms.*

**Scope is locked; risk is not.** A closed decision list should not be read as a low-risk project. Two risks can still force redesign after this document is signed: cross-platform physics determinism (7.5), which has a budgeted fallback and a week-12 decision gate, and turn-based session length at 6–8 players, which has a layered response keyed to telemetry. Both are specified in `Risk-Register.md`, along with the full register, the determinism engineering checklist, and the review cadence. That document is the live one during build; this one is the reference.

---

## 18. Out of Scope for v1.0

- Candlepin, duckpin, or five-pin bowling variants
- VR support
- Real-money wagering or tournaments with cash prizes
- Licensed real-world bowler or brand tie-ins
- User-generated lane or venue creation
- Cross-progression between mobile and PC (cross-*play* is in scope; shared accounts are not)
- Voice chat (v1.1, room-scoped — see 7.4)
- A friends list, in any version. Codes are the social graph
- Handicap in any competitive context — leaderboards, Daily Challenge, and records are scratch-only, permanently

---

## Document History

| Version | Change |
|---|---|
| 1.0 Draft | Initial PRD — rules, colours, platforms, multiplayer, effects, tutorial, cover art |
| 1.0 Rev A | Team play confirmed for 1.0; guest progression rules; cross-progression deferred |
| 1.0 Rev B | AI takeover on disconnect, with skill matching and fairness marking |
| 1.0 Rev C | Voluntary handback declined-control flow and anti-farming rules |
| 1.0 Final Draft | Voice chat, replay privacy, and handicap resolved; section 13 (Player Experience) added |
| 1.0 Rev D | Section 10 (How to Play) added as player-facing reference copy |
| **1.1 Final** | Contents table added; section 6.5 (Menu Structure & Navigation) added with persistent How to Play entry point; Team Play corrected from a mode to a multiplayer format; two success metrics added; cross-references verified |
| **1.2** | Determinism fallback documented in 7.5; Ghost Bowling added to 6.3; pin-carry feedback added to 13.2; risk pointer added to 17.2; `Risk-Register.md` established as the companion live document |
| **1.3** | Friends list removed from the product entirely; voice chat re-gated on room scope rather than mutual friends; Ghost Bowling challenges specified as share codes |
