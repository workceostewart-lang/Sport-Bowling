# Sport Bowling

Sport Bowling is a responsive Three.js/WebGL ten-pin bowling game for desktop and mobile. The current build focuses on the menu, fast first-roll flow, regulation lane presentation, fixed-step Cannon physics, official scoring, and a motion-enabled phone controller for multiplayer rooms.

## Local development

```bash
npm install
npm run dev
```

Run `npm test` for scoring conformance and `npm run build` for the production bundle.

## Phone remote

Create a multiplayer room, copy the generated controller link to a phone, grant motion permission, and swing. The hosted Cloudflare Worker relays phone motion to the lane through a room-scoped Durable Object. A touch-swipe control is available when motion sensors or permission are unavailable.
