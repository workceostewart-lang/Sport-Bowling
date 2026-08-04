# SPORT BOWLING — Art Direction, Mechanics & Control Model

**Version:** 2.0
**Date:** August 3, 2026
**Supersedes:** Art-Direction-and-Physics v1.0 (the top-down 2D model)
**References:** flat bright bowling screenshot (palette and rendering), Wii Sports Bowling (camera, mechanics, control feel)

---

## 1. What Changed and Why

Version 1.0 of this document read the flat overhead screenshot as the game's camera and specified a 2D top-down physics model. That reading was wrong. The overhead image was showing **how the pins fell** — it's a pin-scatter reference, not a camera reference.

The actual direction is:

> **Wii Sports Bowling's camera, mechanics, and control feel — rendered in the bright, flat, heavy-outlined style of the reference screenshot instead of Wii Sports' dim wooden alley.**

Bright where the reference is dark. Flat where the reference is lit and reflective. Same mechanics underneath.

---

## 2. Legal Note — Read This First

Wii Sports Bowling is Nintendo's. **Game mechanics are not copyrightable; specific visual designs, assets, characters, sounds, and overall trade dress are.**

- **Fine:** point-to-aim, hold-swing-release control, behind-the-bowler camera, motion-driven spin, the general feel and pacing.
- **Not fine:** Mii-style avatars, the Wii Sports alley design, its UI layout, its sound effects, its typography, its colour scheme, or anything a player would mistake for the original.

The brightening and the flat vector treatment aren't only an aesthetic choice — they're also what makes this visually its own product. Keep the divergence deliberate and obvious.

---

## 3. Camera & View

**Behind-the-bowler, third-person, low and close.** The lane recedes toward the pin deck. This is the Wii Sports framing and it's the right one — it's readable, it makes the pocket legible, and it puts the pins at a believable scale.

| | Spec |
|---|---|
| Default | Behind and slightly above the bowler, lane centred, pin deck visible in full |
| During roll | Camera holds; ball travels away from the viewer down the lane |
| On approach to pins | Slight push-in as the ball nears the deck |
| On impact | Cut to a closer pin-deck angle for the scatter, then return |
| Aiming | Camera stays fixed; the aim indicator moves, not the world |

**Portrait vs. landscape.** Same camera, different framing. Portrait uses a narrower horizontal field with the lane running up the screen; landscape widens out and shows adjacent lanes. Neither is a scaled version of the other, per PRD 5.2.

---

## 4. Visual Style — Bright, Flat, Outlined

The single biggest note from the client: **Wii Sports is too dark.** Its alley is warm, dim, wood-toned, and reflective. Ours is the opposite.

### 4.1 Lighting and value

- **High-key, flat, ambient.** No dramatic key light, no falloff into shadow, no dim corners.
- **No reflective lane.** Wii Sports' polished lane mirrors the ball and the ceiling. Ours does not reflect anything — the lane is a flat, bright surface.
- **No dark pit.** Behind the pins in Wii Sports is a black void. Ours is bright and readable — a light back wall, clearly lit, no cavern.
- Shadows exist only as **soft contact shadows directly under objects**, in the style of the reference screenshot. They ground objects; they don't darken the scene.

### 4.2 Rendering

- **Flat colour fills.** No gradients, no specular highlights, no texture maps, no wood grain.
- **Heavy black keyline** on pins and ball, matching the reference screenshot. Uniform weight, not tapered.
- Soft, rounded silhouettes. Nothing sharp.
- The result should read as a bright vector illustration that happens to be in 3D — not as a stylised simulation.

### 4.3 Palette

| Element | Treatment |
|---|---|
| **Lane** | Bright olive-yellow, flat, from the reference screenshot |
| **Gutters** | Darker olive, flat, no depth |
| **Back wall / environment** | Bright, light, low-saturation — never darker than the lane |
| **Pins** | White, heavy black outline, coloured neck stripe |
| **Ball** | Flat fill in the player's chosen colour from the ten-colour palette |
| **Outlines** | Black, everywhere, always |

**The ten-colour system survives as player identity** — ball fill, pin stripe, score numerals, effect tint. It no longer themes the environment; the environment is fixed and bright so that the player colours read against it. PRD 4.2 needs updating on that basis.

---

## 5. Control Model

**No meters. None.** No power bar to fill, no spin slider to drag, no timing gauge. This was explicit, and it's also what makes the Wii Sports control model feel good: the input *is* the motion, not a proxy for it.

### 5.1 The three stages

Identical in every mode. Only the input device changes.

| Stage | What the player does | What it sets |
|---|---|---|
| **1. Position** | Step left or right along the approach | Starting position across the lane |
| **2. Angle** | Turn the bowler to face a line | Direction of the throw |
| **3. Throw** | Hold, swing, release | Power from swing speed; hook from wrist rotation at release |

Power comes from **how fast you swing**, not how long you hold something. Hook comes from **how much you rotate at the moment of release**, not from a spin selector. Both are continuous, both are physical, neither has a UI element.

### 5.2 Family Mode — phone as motion controller

The shared-screen mode. Game runs on PC or TV; each player's phone becomes their controller.

**Setup**
1. Host starts Family Mode on the big screen. A room code appears.
2. Each player opens the app on their phone and enters the code — the same code mechanic as online rooms.
3. The phone switches to controller view: a large hold area, minimal text, no game rendering.

**Controlling**
- **Position and angle:** drag or tilt to step and turn. Shown on the big screen, not the phone.
- **Throw:** press and hold the phone's screen with your thumb (this is the "B button"), swing the phone forward in a real bowling motion, release your thumb at the bottom of the swing.
- **Hook:** rotate your wrist as you release. Rotating clockwise curves right, anticlockwise curves left. Amount of rotation sets amount of hook.
- **Feedback:** haptic pulse on release, second pulse on pin contact.

**Requirements**
- Reads accelerometer **and** gyroscope. Gyroscope is what makes hook work — without it, rotation can't be measured.
- **Fallback for phones without a usable gyroscope:** swipe-and-flick on the phone screen, with the flick's curve setting hook. Same three stages, degraded fidelity, no meters.
- **Latency budget: under 80 ms** from release to the ball leaving the bowler's hand on the big screen. Above roughly 100 ms the swing stops feeling connected to the result — this is the make-or-break number for the mode.
- Local network only for the controller link. No round trip to a server for input.
- Phone screen must never require the player to look at it mid-swing. Everything they need is on the big screen.

### 5.3 Solo and vs. CPU — same mechanics, phone as both screen and controller

The mechanics are identical. The input adapts to one device:

- **Motion (default on mobile):** hold the screen, swing the phone, release. Exactly the Family Mode motion, with the game rendered on the same device — the player looks at the screen before and after the swing, not during.
- **Touch (always available):** hold, swipe forward to throw, curve the swipe to hook. Swipe speed is power; swipe curvature is spin. Still no meters.
- **PC:** hold mouse button, drag back, flick forward, curve the flick. Or keyboard, per PRD 6.2.

Motion or touch is a player preference, switchable at any time in Settings, and the game must never assume one. Both produce the same physics inputs — position, angle, speed, rotation — so a motion player and a touch player are mechanically equal.

---

## 6. Physics Model

**3D rigid-body**, as in Wii Sports — not the 2D top-down model from v1.0 of this document.

### 6.1 The model

- Ball is a 3D rigid sphere with mass, linear velocity, and angular velocity.
- Pins are rigid bodies with a proper centre of mass — **the reason bowling pins are satisfying is that they're top-heavy and tip rather than slide.** This must be simulated, not approximated.
- Full 3D collision: ball-pin, pin-pin, pin-wall, pin-gutter. Pins fly, tumble, bounce off the back wall, and take other pins with them.
- Gravity, so pins leave the surface and land.
- Gutters are geometry, not a scoring rule — the ball physically falls in and rolls to the pit.

### 6.2 Hook

Hook comes from **angular velocity on a rolling ball creating a lateral friction force**. The ball skids early, gains traction, and curves as it transitions to a true roll.

This is a real physical effect and it does not require simulating oil chemistry. Lane friction is a single tunable constant rather than a six-pattern oil system.

**On oil patterns (PRD 3.6):** they don't fit this direction. Six patterns of invisible surface chemistry are exactly the kind of depth that a bright, pick-up-and-play family game should not carry. **They are cut from the accessible family build.** If lane variety is wanted later, vary the one friction constant and name the results — similar variety with a fraction of the complexity.

### 6.3 Feel targets

- **Heavy ball, light pins.** A strike should look like an explosion, not a nudge.
- Pin-on-pin contact does most of the work in a real strike. Tune pin mass and restitution first; ball behaviour second.
- Pins should occasionally survive a good-looking shot. A game where every pocket hit strikes is a game with no tension.
- The 10-pin should tap and wobble and sometimes stand. That single pin is where most of bowling's drama lives.

---

## 7. What This Reverses From v1.0

I need to be direct about this, because v1.0 made two claims that no longer hold.

| v1.0 claim | Status now |
|---|---|
| 2D top-down physics | **Wrong.** Back to 3D rigid-body |
| Oil patterns void | **Cut**, for accessibility and design reasons rather than because the model cannot support them |
| **Risk R1 (determinism) downgraded to Medium/Low** | **Reverted to Critical/Medium.** 3D rigid-body physics across iOS, Android, and PC is exactly the hard case. The week-12 gate and the Plan B fallback in `Risk-Register.md` §2 are back to being load-bearing |
| Risk R6 (VFX budget) nearly eliminated | **Partly holds.** Flat vector effects are still cheap; a 3D scene is not. Net: still improved, not eliminated |
| Regulation lane dimensions become proportional only | **Reverted.** PRD 3.3 specs are simulation inputs again |
| Scoring engine unaffected | **Still true.** Automated scoring conformance tests remain the gate. Scoring never cared how the pins fell |

**New risk to add to the register:** Family Mode's 80 ms input latency budget. If phone-to-screen latency can't be held under it on typical home wifi, the mode's core appeal collapses and it needs either a wired/BLE path or descoping. This should get its own gate, tested on real domestic networks — not on an office LAN, which will lie to you.

---

## 8. Effects, Restyled

Same intent as PRD 8.2–8.3, executed flat:

- **Fire trail:** a hard-edged vector ribbon behind the ball in orange and yellow, black keyline, growing in length and width with streak intensity. No particle clouds, no bloom, no heat shimmer.
- **Fireworks:** flat radiating burst shapes above the pin deck — comic-book impact stars in palette colours, not particle simulations.
- **Impact:** flat white flash shape at contact, plus a small camera punch.
- Everything stays bright. No effect may darken the scene to make itself visible.

---

## 9. Open Items

1. **Family Mode host is confirmed:** PC or TV is the shared big screen; each phone is a no-look controller.
2. **Family Mode launches with 2–4 players.** This keeps pairing and turn-taking easy to understand.
3. **Oil patterns are cut for the accessible family build.** One tunable lane-friction constant is the approved model.
4. **Avatar treatment.** There's a bowler on screen in this camera. Simple flat figures in the reference style — but they need a design that owes nothing to Miis.
