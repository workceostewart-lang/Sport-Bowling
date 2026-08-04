# Sport Bowling

Sport Bowling is a responsive Three.js/WebGL ten-pin bowling game for desktop and mobile. The current build uses a bright flat outlined lane, fixed-step Cannon physics, official scoring, and one shared position–angle–throw control model across mouse, touch, and phone motion.

## Local development

```bash
npm install
npm run dev
```

Run `npm test` for scoring conformance and `npm run build` for the production bundle.

## Phone remote

Create a multiplayer room, copy the generated controller link to a phone, and grant motion permission. Hold the large controller area, swing, then release your thumb; wrist rotation sets hook. The room service establishes a direct local peer channel, so swing input does not make a server round trip. A pull-back-and-flick fallback uses the same speed and rotation inputs when motion sensors are unavailable.
