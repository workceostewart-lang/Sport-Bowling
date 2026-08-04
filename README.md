# Sport Bowling

Sport Bowling is a responsive Three.js/WebGL ten-pin bowling game for desktop and mobile. The current build uses a bright flat outlined lane, fixed-step Cannon physics, official scoring, and one shared position–angle–speed–rotation model across mouse, touch, and phone motion. There is no roll button or tap-to-throw path.

## Local development

```bash
npm install
npm run dev
```

Run `npm test` for scoring conformance and `npm run build` for the production bundle.

## Phone remote

TV Mode creates a solo motion room on a computer connected to a big screen. Family Mode creates a 2–4 player motion room and accepts either one Shared phone or several assigned phones. Each phone must verify both an accelerometer and gyroscope before it appears in the lobby; there is no touch fallback in either mode. Hold the full-screen controller area, swing, then release your thumb. The room service uses the online room-code mechanic for signaling and a direct local peer channel for time-critical swing input.
