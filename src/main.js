import "./styles.css";
import { BowlingScene } from "./bowling-scene.js";
import { BowlingGame, detectSplit } from "./scoring.js";
import { clamp, motionThrow, throwFromPointerPath } from "./input.js";

const app = document.querySelector("#app");
const query = new URLSearchParams(window.location.search);
const controllerCode = sanitizeRoomCode(query.get("controller") ?? "");

const BALLS = [
  { name: "Midas", color: "#D4AF37", weight: 15, hook: 8, speed: 6 },
  { name: "Inferno", color: "#D7263D", weight: 16, hook: 7, speed: 8 },
  { name: "Onyx", color: "#202028", weight: 15, hook: 5, speed: 7 },
  { name: "Tidal", color: "#1B6CF2", weight: 14, hook: 6, speed: 7 },
  { name: "Viper", color: "#17B978", weight: 14, hook: 9, speed: 5 },
  { name: "Solar", color: "#FFD23F", weight: 12, hook: 4, speed: 9 },
  { name: "Nebula", color: "#8B44C7", weight: 15, hook: 8, speed: 6 },
  { name: "Chrome", color: "#C7CDD3", weight: 16, hook: 3, speed: 9 },
  { name: "Ember", color: "#FF7A1A", weight: 13, hook: 7, speed: 7 },
  { name: "Blossom", color: "#FF5FA2", weight: 10, hook: 6, speed: 6 },
];

const state = {
  screen: "menu",
  selectedBall: 3,
  board: 20,
  aim: 20,
  rotation: 0,
  speed: 0.64,
  game: null,
  games: [],
  players: [],
  currentPlayer: 0,
  familyMode: true,
  playerCount: 2,
  roomCode: "",
  roomTransport: null,
  lastInputLatencyMs: null,
  reducedEffects: matchMedia("(prefers-reduced-motion: reduce)").matches,
  assist: true,
  sound: true,
  lastHelpSection: "basics",
};

if (controllerCode) {
  renderPhoneController(controllerCode);
} else {
  const scene = new BowlingScene({
    onRollComplete: handleRollComplete,
    onPinImpact: () => state.roomTransport?.send({ type: "pin-contact" }),
  });
  window.__sportBowling = { scene, state };
  renderMenu();
  window.addEventListener("resize", () => scene.resize(), { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(() => scene.resize(), 120), { passive: true });
  window.addEventListener("keydown", handleKeyboard);

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    activate(target.dataset.action, target);
  });

  app.addEventListener("input", (event) => {
    const input = event.target;
    if (input.matches("[data-board]")) {
      state.board = Number(input.value);
      scene.setPosition(state.board);
      updateLiveControls();
    }
    if (input.matches("[data-aim]")) {
      state.aim = Number(input.value);
      scene.setAim(state.aim);
      updateLiveControls();
    }
  });

  let pointerPath = null;
  app.addEventListener("pointerdown", (event) => {
    const stage = event.target.closest(".lane-stage, .throw-surface");
    if (!stage || state.screen !== "game" || scene.rolling) return;
    pointerPath = [{ x: event.clientX, y: event.clientY, at: performance.now() }];
    pointerPath.stage = stage;
    stage.setPointerCapture?.(event.pointerId);
    stage.classList.add("is-dragging");
  });

  app.addEventListener("pointermove", (event) => {
    if (!pointerPath) return;
    pointerPath.push({ x: event.clientX, y: event.clientY, at: performance.now() });
    if (pointerPath.length > 32) pointerPath.splice(1, pointerPath.length - 32);
  });

  app.addEventListener("pointerup", (event) => {
    if (!pointerPath) return;
    const stage = pointerPath.stage;
    pointerPath.push({ x: event.clientX, y: event.clientY, at: performance.now() });
    const input = throwFromPointerPath(pointerPath, {
      width: stage.clientWidth,
      height: stage.clientHeight,
      assist: state.assist,
    });
    pointerPath = null;
    stage.classList.remove("is-dragging");
    if (!input) return;
    state.speed = input.speed;
    state.rotation = input.rotation;
    rollBall();
  });

  app.addEventListener("pointercancel", () => {
    pointerPath?.stage?.classList.remove("is-dragging");
    pointerPath = null;
  });

  function activate(action, target) {
    switch (action) {
      case "menu":
        state.screen = "menu";
        state.game = null;
        state.games = [];
        state.players = [];
        renderMenu();
        break;
      case "play":
        renderPlaySetup();
        break;
      case "set-mode":
        state.familyMode = target.dataset.mode === "family";
        if (!state.familyMode) state.playerCount = 1;
        else if (state.playerCount < 2) state.playerCount = 2;
        renderPlaySetup();
        break;
      case "set-players":
        state.playerCount = clamp(Number(target.dataset.players) || 2, 2, 4);
        state.familyMode = true;
        renderPlaySetup();
        break;
      case "start-game":
      case "practice":
        startGame(action === "practice");
        break;
      case "multiplayer":
        renderMultiplayer();
        break;
      case "create-room":
        state.roomCode = makeRoomCode();
        renderMultiplayer("host");
        connectHostRoom();
        break;
      case "join-room": {
        const field = app.querySelector("#room-code");
        const code = sanitizeRoomCode(field?.value ?? "");
        if (code.length !== 6) {
          field?.setAttribute("aria-invalid", "true");
          setStatus("Enter the complete 6-character room code.", "error");
          return;
        }
        state.roomCode = code;
        renderMultiplayer("lobby");
        connectHostRoom();
        break;
      }
      case "copy-controller":
        copyControllerLink();
        break;
      case "share-controller":
        shareControllerLink();
        break;
      case "test-remote":
        state.roomTransport?.send({ type: "swing", position: state.board, angle: state.aim, speed: 0.74, rotation: 0.16, source: "test" });
        setStatus("Test swing sent. Start the lane to use it.", "success");
        break;
      case "start-room-game":
        startGame(false, true);
        break;
      case "balls":
        renderBalls();
        break;
      case "select-ball":
        state.selectedBall = Number(target.dataset.index);
        renderBalls();
        break;
      case "stats":
        renderStats();
        break;
      case "help":
        if (state.screen === "game") {
          renderGameHelp(target.dataset.section || "controls");
        } else {
          renderHowToPlay(target.dataset.section || state.lastHelpSection);
        }
        break;
      case "help-section":
        state.lastHelpSection = target.dataset.section;
        if (state.screen === "game") renderGameHelp(state.lastHelpSection);
        else renderHowToPlay(state.lastHelpSection);
        break;
      case "settings":
        renderSettings();
        break;
      case "toggle-assist":
        state.assist = !state.assist;
        renderSettings();
        break;
      case "toggle-effects":
        state.reducedEffects = !state.reducedEffects;
        scene.setReducedEffects(state.reducedEffects);
        renderSettings();
        break;
      case "toggle-sound":
        state.sound = !state.sound;
        renderSettings();
        break;
      case "pause":
        scene.setPaused(true);
        renderPauseMenu();
        break;
      case "resume":
        scene.setPaused(false);
        document.querySelector(".pause-layer")?.classList.remove("open");
        break;
      case "roll":
        rollBall();
        break;
      case "board-left":
        state.board = clamp(state.board - 1, 1, 39);
        scene.setPosition(state.board);
        updateLiveControls();
        break;
      case "board-right":
        state.board = clamp(state.board + 1, 1, 39);
        scene.setPosition(state.board);
        updateLiveControls();
        break;
      case "aim-left":
        state.aim = clamp(state.aim - 1, 1, 39);
        scene.setAim(state.aim);
        updateLiveControls();
        break;
      case "aim-right":
        state.aim = clamp(state.aim + 1, 1, 39);
        scene.setAim(state.aim);
        updateLiveControls();
        break;
      case "new-game":
        startGame(state.practice, state.multiplayer);
        break;
      default:
        break;
    }
  }

  function renderMenu() {
    state.screen = "menu";
    app.innerHTML = `
      <section class="menu-screen screen-enter">
        ${topBar("HOME")}
        <div class="menu-layout">
          <div class="hero-lane">
            <div id="lane-mount" class="lane-mount menu-canvas"></div>
            <div class="hero-shade"></div>
            <div class="brand-lockup">
              <span class="eyebrow">FANTOMZONE ORIGINAL</span>
              <h1><span>SPORT</span> BOWLING</h1>
              <p>Pick your line. Trust your roll. <strong>Own the lane.</strong></p>
            </div>
            <button class="hero-play" data-action="play">
              <span class="play-icon" aria-hidden="true">▶</span>
              <span><b>PLAY</b><small>Family Bowl · solo or 2–4 players</small></span>
              <i aria-hidden="true">→</i>
            </button>
          </div>

          <nav class="menu-panel" aria-label="Main menu">
            <div class="profile-card">
              <span class="profile-badge">SB</span>
              <span><b>Guest Bowler</b><small>Level 1 · House Shot</small></span>
              <span class="level-ring">01</span>
            </div>
            <button class="menu-tile multiplayer" data-action="multiplayer">
              <span class="tile-icon">⌁</span><span><b>MULTIPLAYER</b><small>Room code · phone remote</small></span><i>→</i>
            </button>
            <div class="menu-grid">
              <button class="menu-tile" data-action="practice"><span class="tile-icon">◎</span><span><b>PRACTICE</b><small>Free roll</small></span></button>
              <button class="menu-tile" data-action="balls"><span class="tile-icon">●</span><span><b>MY BALLS</b><small>${BALLS[state.selectedBall].name}</small></span></button>
              <button class="menu-tile" data-action="stats"><span class="tile-icon">⌁</span><span><b>MY STATS</b><small>Games & averages</small></span></button>
              <button class="menu-tile help" data-action="help"><span class="tile-icon">?</span><span><b>HOW TO PLAY</b><small>Rules & controls</small></span></button>
            </div>
            <button class="settings-row" data-action="settings"><span>⚙</span><b>SETTINGS</b><small>Controls · audio · access</small><i>→</i></button>
          </nav>
        </div>
      </section>`;
    scene.mount(app.querySelector("#lane-mount"), "menu");
    scene.setFamilyMode(false);
    scene.setPaused(false);
    scene.resize();
  }

  function renderPlaySetup() {
    state.screen = "setup";
    const ball = BALLS[state.selectedBall];
    const family = state.familyMode;
    app.innerHTML = `
      <section class="sub-screen setup-screen screen-enter">
        ${subHeader("Choose your game", "menu", "SIMPLE START · NO ACCOUNT NEEDED")}
        <div class="setup-layout">
          <article class="mode-card selected ${family ? "family-mode" : ""}">
            <span class="mode-number">${family ? "FZ" : "01"}</span><span class="mode-kicker">${family ? "PASS · PLAY · CHEER" : "AUTHENTIC SOLO"}</span>
            <h2>${family ? "FAMILY BOWL" : "QUICK PLAY"}</h2>
            <p>${family ? "Hand the device around and bowl together. Smart bumpers, helpful aim, and forgiving rolls keep every age in the game." : "One regulation game on the House Shot. Authentic scoring, one simple swipe, no pressure."}</p>
            <div class="mode-meta">${family ? `<span>${state.playerCount} BOWLERS</span><span>SMART BUMPERS</span><span>TAKE TURNS</span>` : "<span>10 FRAMES</span><span>HOUSE 40'</span><span>~8 MIN</span>"}</div>
          </article>
          <div class="quick-config">
            <div class="mode-switch" aria-label="Play style">
              <button data-action="set-mode" data-mode="family" class="${family ? "active" : ""}"><b>FAMILY</b><small>2–4 players</small></button>
              <button data-action="set-mode" data-mode="solo" class="${!family ? "active" : ""}"><b>SOLO</b><small>Just me</small></button>
            </div>
            ${family ? `<div class="family-config"><span><b>HOW MANY BOWLERS?</b><small>Pass the same device after each frame</small></span><div class="player-count">${[2, 3, 4].map((count) => `<button data-action="set-players" data-players="${count}" class="${state.playerCount === count ? "active" : ""}">${count}</button>`).join("")}</div></div>` : ""}
            <div class="config-title"><span>YOUR BALL</span><button data-action="balls">CHANGE</button></div>
            <button class="ball-choice" data-action="balls">
              <span class="ball-orb" style="--ball:${ball.color}"><i></i><i></i><i></i></span>
              <span><b>${ball.name}</b><small>${ball.weight} LB · Hook ${ball.hook}/10 · Speed ${ball.speed}/10</small></span><em>›</em>
            </button>
            <label class="assist-choice"><span><b>${family ? "Family assists are ready" : "Trajectory assist"}</b><small>${family ? "Smart bumpers · gentle-roll boost · aim guide" : "Shows your predicted line"}</small></span><input type="checkbox" checked disabled><i></i></label>
            <button class="primary-button ${family ? "family-button" : ""}" data-action="start-game"><span>${family ? "START FAMILY BOWL" : "BOWL NOW"}</span><small>${family ? "Everyone gets a turn" : "Step onto lane 07"}</small><i>→</i></button>
          </div>
          <div class="other-modes">
            <button data-action="practice"><b>PRACTICE</b><small>Free roll · no score</small><i>→</i></button>
            <button class="locked"><b>CAREER</b><small>40-lane tour · coming next</small><i>◇</i></button>
            <button class="locked"><b>SPARE CHALLENGE</b><small>Pin drills · coming next</small><i>◇</i></button>
          </div>
        </div>
      </section>`;
  }

  function startGame(practice = false, multiplayer = false) {
    state.screen = "game";
    state.practice = practice;
    state.multiplayer = multiplayer;
    const useFamily = state.familyMode && !practice && !multiplayer;
    const playerCount = useFamily ? state.playerCount : 1;
    state.players = Array.from({ length: playerCount }, (_, index) => ({
      name: useFamily ? `PLAYER ${index + 1}` : "YOU",
      color: BALLS[(state.selectedBall + index) % BALLS.length].color,
    }));
    state.games = state.players.map(() => new BowlingGame());
    state.currentPlayer = 0;
    state.game = state.games[0];
    scene.setFamilyMode(useFamily);
    scene.prepareNextBall({ fullRack: true });
    scene.setPosition(state.board);
    scene.setAim(state.aim);
    app.innerHTML = `
      <section class="game-screen screen-enter">
        <header class="game-hud">
          <button class="hud-button" data-action="pause" aria-label="Pause game">Ⅱ</button>
          <div class="player-score"><span class="active-dot"></span><span><b id="current-player-name">${state.players[0].name}</b><small id="player-mode">${BALLS[state.selectedBall].name.toUpperCase()} · ${useFamily ? "FAMILY BOWL" : practice ? "PRACTICE" : multiplayer ? `ROOM ${state.roomCode}` : "HOUSE SHOT"}</small></span></div>
          <div id="scoreboard" class="scoreboard">${scoreboardMarkup()}</div>
          <div class="total-score"><small>TOTAL</small><b id="total-score">0</b></div>
          <button class="hud-button help-hud" data-action="help" data-section="controls" aria-label="How to play">?</button>
        </header>

        <div class="game-main">
          <aside id="player-rail-content" class="player-rail">${playerRailMarkup()}</aside>
          <div id="lane-stage" class="lane-stage" aria-label="Bowling lane. Hold, pull back, then flick forward to roll. Curve the flick to hook." tabindex="0">
            <div id="lane-mount" class="lane-mount"></div>
            <div class="lane-readout top-left"><span>LANE 07</span><b>${useFamily ? "SMART BUMPERS ✓" : "HOUSE 40'"}</b></div>
            <div class="lane-readout top-right"><span>FRAME <b id="frame-readout">1</b></span><span>BALL <b id="ball-readout">1</b></span></div>
            <div class="aim-reticle" aria-hidden="true"><i></i><span>AIM <b id="aim-board">${state.aim}</b></span></div>
            <div id="roll-callout" class="roll-callout"><b>HOLD · PULL BACK · FLICK</b><span>${useFamily ? "Smart bumpers and gentle-roll help are on" : "Flick speed sets power · curve sets hook"}</span></div>
            <div id="result-callout" class="result-callout" aria-live="assertive"></div>
          </div>
        </div>

        <footer class="game-controls">
          <div class="control-cluster position-control">
            <small>1 · POSITION</small>
            <div><button data-action="board-left" aria-label="Move left">−</button><b><span id="position-board">${state.board}</span><em>/39</em></b><button data-action="board-right" aria-label="Move right">+</button></div>
          </div>
          <div class="control-cluster angle-control">
            <small>2 · ANGLE</small>
            <div><button data-action="aim-left" aria-label="Turn aim left">↶</button><b id="aim-label">BOARD ${state.aim}</b><button data-action="aim-right" aria-label="Turn aim right">↷</button></div>
          </div>
          <button class="throw-surface roll-button" data-action="roll" aria-label="Throw. Hold, pull back, and flick forward. Tap or press Space for a gentle accessible roll."><i>↑</i><span><b>3 · THROW</b><small>Hold · pull back · flick forward</small></span></button>
          <div class="physical-input-note"><b>NO METERS</b><span>Speed and hook come from your flick</span></div>
        </footer>

        <div class="pause-layer" role="dialog" aria-modal="true" aria-label="Game paused">
          <div class="pause-card"><span class="eyebrow">LANE 07</span><h2>GAME PAUSED</h2><button class="primary-button" data-action="resume">RESUME <i>→</i></button><button data-action="help" data-section="controls">HOW TO PLAY</button><button data-action="menu">EXIT TO MENU</button></div>
        </div>
        <div id="game-over" class="pause-layer" role="dialog" aria-label="Game complete"></div>
      </section>`;
    scene.mount(app.querySelector("#lane-mount"), "game");
    scene.setPaused(false);
    scene.setReducedEffects(state.reducedEffects);
    scene.resize();
    updateScoreboard();
  }

  function renderMultiplayer(mode = "entry") {
    state.screen = "multiplayer";
    const hasRoom = Boolean(state.roomCode);
    const link = hasRoom ? controllerLink(state.roomCode) : "";
    app.innerHTML = `
      <section class="sub-screen multiplayer-screen screen-enter">
        ${subHeader("Multiplayer", "menu", "ROOM CODES · NO ACCOUNT NEEDED")}
        <div class="multi-layout">
          <aside class="multi-intro">
            <span class="eyebrow">PLAY TOGETHER</span><h2>YOUR PHONE<br><em>IS THE BALL.</em></h2>
            <p>Create a room on the big screen, open its controller link on a phone, then hold, swing, and release. A touch-flick fallback is always available.</p>
            <div class="phone-remote-art" aria-hidden="true"><span class="signal signal-a"></span><span class="signal signal-b"></span><div><i>●</i><b>SWING</b><small>REMOTE</small></div></div>
            <ul><li><b>1</b>Create or join a room</li><li><b>2</b>Open the controller link on your phone</li><li><b>3</b>Hold tight and swing forward</li></ul>
          </aside>
          <div class="multi-card">
            ${hasRoom ? `
              <div class="room-heading"><span>${mode === "lobby" ? "JOINED ROOM" : "YOUR ROOM CODE"}</span><b>${state.roomCode}</b><small>Share this code with up to 7 bowlers</small></div>
              <div class="lobby-roster">
                <div><i class="host-mark">H</i><span><b>Guest Bowler</b><small>HOST · TIDAL BALL</small></span><em class="ready">READY ✓</em></div>
                <div id="remote-player"><i class="remote-mark">⌁</i><span><b>Phone Remote</b><small id="remote-state">WAITING FOR PHONE</small></span><em class="waiting">OPEN LINK</em></div>
              </div>
              <div class="controller-link"><span>PHONE CONTROLLER LINK</span><code>${escapeHtml(link.replace(/^https?:\/\//, ""))}</code><div><button data-action="copy-controller">COPY LINK</button><button data-action="share-controller">SHARE</button></div></div>
              <div id="status" class="status-line">Room is ready. Open the link on your phone.</div>
              <button class="primary-button purple-button" data-action="start-room-game"><span>START MATCH</span><small>Remote can connect at any time</small><i>→</i></button>
            ` : `
              <div class="multi-tabs"><button class="active">CREATE</button><button>JOIN</button></div>
              <div class="create-panel"><span class="step-label">HOST A LANE</span><h3>Create a room in one tap.</h3><p>Private by default. The room stays open for instant rematches.</p><button class="primary-button purple-button" data-action="create-room"><span>CREATE ROOM</span><small>6-character private code</small><i>→</i></button></div>
              <div class="join-divider"><span>OR JOIN A ROOM</span></div>
              <label class="room-input"><span>ROOM CODE</span><input id="room-code" maxlength="6" inputmode="text" autocomplete="off" placeholder="K7P2QX" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z2-9]/g,'')"><button data-action="join-room">JOIN →</button></label>
              <div id="status" class="status-line"></div>
            `}
            <button class="help-inline" data-action="help" data-section="multiplayer"><b>?</b><span>First time? Read multiplayer basics</span><i>→</i></button>
          </div>
        </div>
      </section>`;
  }

  function connectHostRoom() {
    state.roomTransport?.close?.();
    state.roomTransport = createRoomTransport(state.roomCode, "host", (message) => {
      if (message.type === "connected" || message.type === "controller-ready") {
        const remote = document.querySelector("#remote-player");
        remote?.classList.add("connected");
        const label = document.querySelector("#remote-state");
        if (label) label.textContent = "MOTION REMOTE CONNECTED";
        setStatus("Phone connected — swing when the lane is ready.", "success");
      }
      if (message.type === "local-input-ready") {
        const label = document.querySelector("#remote-state");
        if (label) label.textContent = "LOCAL INPUT READY";
        setStatus("Direct local input is ready — no server round trip.", "success");
      }
      if (message.type === "local-input-closed") setStatus("Local input paused. Keep both devices on the same Wi-Fi.", "error");
      if (message.type === "swing") {
        if (state.screen !== "game") startGame(false, true);
        state.lastInputLatencyMs = Number(message.releasedAt) > 0 ? Math.max(0, Date.now() - Number(message.releasedAt)) : null;
        document.documentElement.dataset.inputLatency = state.lastInputLatencyMs === null ? "unknown" : String(state.lastInputLatencyMs);
        state.board = clamp(Number(message.position) || state.board, 1, 39);
        state.aim = clamp(Number(message.angle) || state.aim, 1, 39);
        state.speed = clamp(Number(message.speed ?? message.power) || 0.64, 0.25, 1);
        state.rotation = clamp(Number(message.rotation ?? message.spin) || 0, -1, 1);
        scene.setPosition(state.board);
        scene.setAim(state.aim);
        rollBall();
      }
    });
  }

  function renderBalls() {
    state.screen = "balls";
    app.innerHTML = `
      <section class="sub-screen balls-screen screen-enter">
        ${subHeader("Ball Locker", state.game ? "play" : "menu", "10 BALLS · ALL PLAY STYLES")}
        <div class="balls-heading"><span class="eyebrow">CHOOSE YOUR SHAPE</span><h2>EVERY COLOR<br><em>ROLLS DIFFERENT.</em></h2><p>Weight, speed, and hook change how your shot enters the pocket. No ball is pay-to-win.</p></div>
        <div class="ball-grid">${BALLS.map((ball, index) => `
          <button class="ball-card ${state.selectedBall === index ? "selected" : ""}" data-action="select-ball" data-index="${index}" style="--ball:${ball.color}">
            <span class="ball-orb"><i></i><i></i><i></i></span><span class="ball-index">${String(index + 1).padStart(2, "0")}</span>
            <b>${ball.name}</b><small>${ball.weight} LB</small><dl><div><dt>HOOK</dt><dd><i style="width:${ball.hook * 10}%"></i></dd></div><div><dt>SPEED</dt><dd><i style="width:${ball.speed * 10}%"></i></dd></div></dl>
            <em>${state.selectedBall === index ? "EQUIPPED ✓" : "SELECT"}</em>
          </button>`).join("")}</div>
      </section>`;
  }

  function renderStats() {
    state.screen = "stats";
    app.innerHTML = `
      <section class="sub-screen stats-screen screen-enter">
        ${subHeader("My Stats", "menu", "LOCAL PROFILE")}
        <div class="stats-layout"><div class="stats-hero"><span class="eyebrow">FIRST GAME AWAITS</span><b>—</b><small>AVERAGE SCORE</small><p>Finish a full ten-frame game and your bowling profile starts here.</p><button class="primary-button" data-action="play">PLAY FIRST GAME <i>→</i></button></div>
        <div class="stat-grid"><article><span>HIGH SCORE</span><b>—</b><small>No games yet</small></article><article><span>STRIKE RATE</span><b>0%</b><small>0 strikes</small></article><article><span>SPARE RATE</span><b>0%</b><small>0 attempts</small></article><article><span>GAMES</span><b>0</b><small>10-frame</small></article></div></div>
      </section>`;
  }

  function renderSettings() {
    state.screen = "settings";
    app.innerHTML = `
      <section class="sub-screen settings-screen screen-enter">
        ${subHeader("Settings", "menu", "DEVICE PREFERENCES")}
        <div class="settings-layout"><aside><span class="eyebrow">GAME SETTINGS</span><h2>MAKE THE LANE<br><em>YOURS.</em></h2><p>Preferences are saved on this device.</p></aside><div class="settings-list">
          ${settingRow("Trajectory assist", "Predicted path while you aim", state.assist, "toggle-assist")}
          ${settingRow("Full effects", "Flat fire ribbon and strike bursts", !state.reducedEffects, "toggle-effects")}
          ${settingRow("Sound", "Lane ambience, roll, and pin impact", state.sound, "toggle-sound")}
          <div class="setting-row"><span><b>Orientation</b><small>Follows your device; PC uses landscape</small></span><em>AUTO</em></div>
          <div class="setting-row"><span><b>Colorblind support</b><small>Labels and shapes always accompany color</small></span><em>ALWAYS ON</em></div>
          <button class="help-inline" data-action="help" data-section="controls"><b>?</b><span>Replay control tutorial</span><i>→</i></button>
        </div></div>
      </section>`;
  }

  function renderHowToPlay(section = "basics") {
    state.screen = "help";
    state.lastHelpSection = section;
    const sections = {
      basics: ["THE BASICS", "Ten frames. Ten pins. Roll twice unless your first ball is a strike. Knock down all ten across two balls for a spare.", ["X = strike", "/ = spare", "– = zero pins", "F = foul"]],
      controls: ["THREE SIMPLE STEPS", "Move left or right, turn toward a lane board, then hold, pull back, and flick forward. Flick speed sets power and the release curve sets hook — no meters to watch.", ["A / D moves your feet", "Arrow keys turn your aim", "Mouse or touch: hold and flick", "Space sends a gentle accessible roll"]],
      scoring: ["READ THE SCORE", "A strike earns 10 plus your next two balls. A spare earns 10 plus your next ball. In frame ten, a strike or spare earns bonus rolls.", ["Maximum score: 300", "Twelve strikes make perfect", "Pending bonuses show —", "Raw pinfall is never hidden"]],
      multiplayer: ["BOWL TOGETHER", "Create a room, share its six-character code, and start when everyone is ready. Guests join without an account.", ["2–8 bowlers", "Sprint or 10 frames", "Phone motion remote", "Instant rematch"]],
      tips: ["FIND THE POCKET", "Right-handers aim between pins 1 and 3; left-handers between 1 and 2. A controlled entry angle carries more pins than raw speed.", ["Move your feet first", "Use a smooth forward flick", "Curve only near release", "Treat spares seriously"]],
    };
    const [title, copy, bullets] = sections[section] ?? sections.basics;
    app.innerHTML = `
      <section class="sub-screen help-screen screen-enter">
        ${subHeader("How to Play", state.game ? "resume" : "menu", "ALWAYS ONE TAP AWAY")}
        <div class="help-layout"><nav aria-label="How to play sections">${Object.entries(sections).map(([key, value], index) => `<button data-action="help-section" data-section="${key}" class="${key === section ? "active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><b>${value[0]}</b><i>→</i></button>`).join("")}</nav>
          <article><span class="eyebrow">${section.toUpperCase()}</span><h2>${title}</h2><p>${copy}</p><div class="help-points">${bullets.map((item, index) => `<div><b>${index + 1}</b><span>${item}</span></div>`).join("")}</div>${section === "controls" ? '<div class="swipe-demo"><i>●</i><span></span><b>PULL BACK · FLICK FORWARD</b></div>' : ""}<button class="primary-button" data-action="${state.game ? "resume" : "play"}">${state.game ? "BACK TO LANE" : "PLAY NOW"} <i>→</i></button></article></div>
      </section>`;
  }

  function renderGameHelp(section = "controls") {
    const layer = document.querySelector(".pause-layer");
    if (!layer) return;
    if (!state.multiplayer) scene.setPaused(true);
    const content = {
      controls: ["POSITION · ANGLE · THROW", "Move your start and angle with the labelled buttons. Then hold, pull back, and flick forward on the lane. Speed and release curve become power and hook automatically."],
      scoring: ["READ THE SCORE", "A strike adds your next two balls. A spare adds your next one. Bonus rolls happen in frame ten."],
      multiplayer: ["ROOM PLAY", "Your turn stays live while this help card is open. Close it when you are ready to bowl."],
    }[section] ?? ["THE BASICS", "Knock down ten pins in ten frames. Strikes and spares earn bonus pinfall."];
    layer.innerHTML = `<div class="pause-card"><span class="eyebrow">HOW TO PLAY</span><h2>${content[0]}</h2><p>${content[1]}</p><button class="primary-button" data-action="resume">BACK TO LANE <i>→</i></button><button data-action="help-section" data-section="scoring">SCORING SYMBOLS</button></div>`;
    layer.classList.add("open");
  }

  function renderPauseMenu() {
    const layer = document.querySelector(".pause-layer");
    if (!layer) return;
    layer.innerHTML = `<div class="pause-card"><span class="eyebrow">LANE 07</span><h2>GAME PAUSED</h2><button class="primary-button" data-action="resume">RESUME <i>→</i></button><button data-action="help" data-section="controls">HOW TO PLAY</button><button data-action="menu">EXIT TO MENU</button></div>`;
    layer.classList.add("open");
  }

  function rollBall() {
    if (state.screen !== "game" || scene.rolling || state.game?.complete) return;
    const family = state.familyMode && state.players.length > 1;
    const rolled = scene.roll({
      speed: family ? clamp(state.speed, 0.46, 0.88) : state.speed,
      rotation: family ? state.rotation * 0.62 : state.rotation,
      angle: family ? Math.round(state.aim * 0.72 + 20 * 0.28) : state.aim,
    });
    if (!rolled) return;
    document.querySelector("#roll-callout")?.classList.add("hidden");
    const result = document.querySelector("#result-callout");
    if (result) result.innerHTML = "";
    updateLiveControls();
  }

  function handleRollComplete({ knocked, standingPins = [] }) {
    if (!state.game || state.screen !== "game") return;
    const frameBefore = state.game.frameIndex;
    const standingBefore = state.game.pinsStanding();
    const legalPins = Math.min(knocked, standingBefore);
    const isStrike = standingBefore === 10 && legalPins === 10;
    const isSpare = standingBefore < 10 && legalPins === standingBefore;
    const isSplit = standingBefore === 10 && legalPins > 0 && legalPins < 10 && detectSplit(standingPins);
    state.game.roll(legalPins);
    const frameFinished = state.game.complete || state.game.frameIndex !== frameBefore;
    updateScoreboard();
    const result = document.querySelector("#result-callout");
    const label = isStrike ? "STRIKE!" : isSpare ? "SPARE!" : legalPins === 0 ? "GUTTER" : isSplit ? `${legalPins} PINS · SPLIT` : `${legalPins} PIN${legalPins === 1 ? "" : "S"}`;
    if (result) {
      result.innerHTML = `<b>${label}</b><span>${isStrike ? "Perfect pocket. All ten down." : isSpare ? "Clean conversion. Frame closed." : legalPins === 0 ? "Keep the line inside the arrows." : isSplit ? "A gap remains. Pick one pin and make a confident spare try." : "Read the leave. Set up your next ball."}</span>`;
      result.classList.add("show");
    }

    if (state.games.every((game) => game.complete)) {
      setTimeout(showGameOver, 1100);
      return;
    }

    setTimeout(() => {
      if (state.familyMode && state.players.length > 1 && frameFinished) {
        advanceFamilyTurn();
        return;
      }
      const fullRack = state.game.pinsStanding() === 10;
      scene.prepareNextBall({ fullRack });
      result?.classList.remove("show");
      document.querySelector("#roll-callout")?.classList.remove("hidden");
      updateScoreboard();
    }, 1500);
  }

  function advanceFamilyTurn() {
    if (state.games.every((game) => game.complete)) {
      showGameOver();
      return;
    }
    for (let offset = 1; offset <= state.games.length; offset += 1) {
      const next = (state.currentPlayer + offset) % state.games.length;
      if (!state.games[next].complete) {
        state.currentPlayer = next;
        state.game = state.games[next];
        break;
      }
    }
    scene.prepareNextBall({ fullRack: true });
    updateScoreboard();
    const result = document.querySelector("#result-callout");
    if (result) {
      result.innerHTML = `<b>${state.players[state.currentPlayer].name}</b><span>Your turn — pick a line and roll.</span>`;
      result.classList.add("show", "turn-change");
      setTimeout(() => {
        result.classList.remove("show", "turn-change");
        document.querySelector("#roll-callout")?.classList.remove("hidden");
      }, 950);
    }
  }

  function showGameOver() {
    const totals = state.games.map((game) => scoreForGame(game));
    const total = totals[state.currentPlayer] ?? 0;
    const best = Math.max(...totals);
    const winner = totals.indexOf(best);
    const overlay = document.querySelector("#game-over");
    if (!overlay) return;
    const familyResults = state.players.length > 1 ? `<div class="family-results">${state.players.map((player, index) => `<div class="${index === winner ? "winner" : ""}"><i style="background:${player.color}"></i><span><b>${player.name}</b><small>${index === winner ? "FAMILY CHAMPION ★" : "GREAT GAME"}</small></span><em>${totals[index]}</em></div>`).join("")}</div>` : `<div class="final-score"><b>${total}</b><small>FINAL SCORE</small></div>`;
    overlay.innerHTML = `<div class="pause-card end-card"><span class="eyebrow">GAME COMPLETE</span><h2>${state.players.length > 1 ? `${state.players[winner].name} WINS!` : total >= 200 ? "LANE MASTER" : total >= 130 ? "SOLID GAME" : "FIRST GAME DOWN"}</h2>${familyResults}<p>${state.players.length > 1 ? "High fives all around. Keep everyone in the lineup for an instant rematch." : "Every frame is now on your card. Want another line at it?"}</p><button class="primary-button" data-action="new-game">PLAY AGAIN <i>→</i></button><button data-action="menu">MAIN MENU</button></div>`;
    overlay.classList.add("open");
  }

  function scoreForGame(game) {
    const scores = game?.cumulativeScores() ?? [];
    return [...scores].reverse().find((score) => score !== null) ?? game?.ballValues().reduce((sum, pins) => sum + pins, 0) ?? 0;
  }

  function playerRailMarkup() {
    const playerRows = state.players.map((player, index) => {
      const active = index === state.currentPlayer;
      const complete = state.games[index]?.complete;
      return `<div class="rail-player ${active ? "active" : ""}"><i style="background:${player.color}"></i><span><b>${player.name}</b><small>${active ? "YOUR TURN" : complete ? "FINISHED" : "CHEERING"}</small></span><em>${scoreForGame(state.games[index])}</em></div>`;
    }).join("");
    const companion = state.players.length > 1 ? "" : state.multiplayer ? '<div class="rail-player"><i class="purple"></i><span><b>PHONE</b><small>REMOTE READY</small></span><em>⌁</em></div>' : '<div class="rail-player ai"><i></i><span><b>CPU</b><small>ROOKIE</small></span><em>—</em></div>';
    return `<span class="rail-label">BOWLERS</span>${playerRows}${companion}`;
  }

  function scoreboardMarkup() {
    const game = state.game;
    const scores = game?.cumulativeScores() ?? Array(10).fill(null);
    return Array.from({ length: 10 }, (_, index) => {
      const marks = game?.notation(index) ?? [];
      const active = !game?.complete && index === game?.frameIndex;
      return `<div class="score-frame ${active ? "active" : ""}"><span>${index + 1}</span><div>${Array.from({ length: index === 9 ? 3 : 2 }, (__, ball) => `<i>${marks[ball] ?? ""}</i>`).join("")}</div><b>${scores[index] ?? "—"}</b></div>`;
    }).join("");
  }

  function updateScoreboard() {
    const board = document.querySelector("#scoreboard");
    if (board) board.innerHTML = scoreboardMarkup();
    const latest = scoreForGame(state.game);
    const total = document.querySelector("#total-score");
    if (total) total.textContent = latest;
    const frame = document.querySelector("#frame-readout");
    if (frame) frame.textContent = Math.min(10, (state.game?.frameIndex ?? 0) + 1);
    const ball = document.querySelector("#ball-readout");
    if (ball) ball.textContent = (state.game?.currentFrame?.length ?? 0) + 1;
    const currentName = document.querySelector("#current-player-name");
    if (currentName) currentName.textContent = state.players[state.currentPlayer]?.name ?? "YOU";
    const playerMode = document.querySelector("#player-mode");
    if (playerMode) playerMode.textContent = state.players.length > 1 ? `FAMILY BOWL · ${state.currentPlayer + 1} OF ${state.players.length}` : state.multiplayer ? `ROOM ${state.roomCode}` : state.practice ? "PRACTICE" : "HOUSE SHOT";
    const rail = document.querySelector("#player-rail-content");
    if (rail) rail.innerHTML = playerRailMarkup();
  }

  function updateLiveControls() {
    textContent("#position-board", state.board);
    textContent("#aim-board", state.aim);
    textContent("#aim-label", `BOARD ${state.aim}`);
  }

  function handleKeyboard(event) {
    if (state.screen !== "game") return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (event.code === "Space") {
      event.preventDefault();
      rollBall();
    }
    if (event.key.toLowerCase() === "a") activate("board-left", document.body);
    if (event.key.toLowerCase() === "d") activate("board-right", document.body);
    if (event.key === "ArrowLeft") activate("aim-left", document.body);
    if (event.key === "ArrowRight") activate("aim-right", document.body);
    updateLiveControls();
  }
}

function topBar(section) {
  return `<header class="topbar"><span class="zone-mark"><i>FZ</i><b>FANTOMZONE</b></span><span class="section-name">/ ${section}</span><div class="top-status"><span><i class="online-dot"></i> ONLINE</span><span>v0.1</span></div></header>`;
}

function subHeader(title, backAction, meta = "") {
  return `<header class="sub-header"><button data-action="${backAction}" aria-label="Go back">←</button><span><small>${meta}</small><b>${title}</b></span><i class="brand-mini">SB</i></header>`;
}

function settingRow(title, copy, enabled, action) {
  return `<button class="setting-row" data-action="${action}"><span><b>${title}</b><small>${copy}</small></span><i class="switch ${enabled ? "on" : ""}"><em></em></i></button>`;
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function sanitizeRoomCode(code) {
  return code.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, "").slice(0, 6);
}

function controllerLink(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("controller", code);
  return url.toString();
}

async function copyControllerLink() {
  const link = controllerLink(state.roomCode);
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Controller link copied. Open it on your phone.", "success");
  } catch {
    setStatus(link, "success");
  }
}

async function shareControllerLink() {
  const link = controllerLink(state.roomCode);
  if (navigator.share) {
    await navigator.share({ title: "Sport Bowling phone remote", text: `Join room ${state.roomCode}`, url: link });
  } else {
    await copyControllerLink();
  }
}

function createRoomTransport(code, role, onMessage = () => {}) {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`sport-bowling-${code}`) : null;
  let socket = null;
  let socketReady = false;
  let closed = false;
  let peer = null;
  let dataChannel = null;
  let localInputReady = false;
  let broadcastReady = false;
  const pendingCandidates = [];

  const sendSignal = (type, value) => {
    if (!socketReady) return;
    socket.send(JSON.stringify({ type, signal: JSON.stringify(value) }));
  };

  const attachDataChannel = (nextChannel) => {
    dataChannel = nextChannel;
    dataChannel.addEventListener("open", () => {
      localInputReady = true;
      onMessage({ type: "local-input-ready", transport: "peer" });
    });
    dataChannel.addEventListener("close", () => {
      localInputReady = false;
      onMessage({ type: "local-input-closed" });
    });
    dataChannel.addEventListener("message", (event) => {
      try { onMessage(JSON.parse(event.data)); } catch { /* ignore malformed local input */ }
    });
  };

  const ensurePeer = () => {
    if (peer || typeof RTCPeerConnection === "undefined") return peer;
    peer = new RTCPeerConnection({ iceServers: [] });
    peer.addEventListener("icecandidate", (event) => {
      if (event.candidate) sendSignal("rtc-candidate", event.candidate.toJSON());
    });
    peer.addEventListener("connectionstatechange", () => {
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
        localInputReady = false;
        onMessage({ type: "local-input-closed" });
      }
    });
    if (role === "controller") peer.addEventListener("datachannel", (event) => attachDataChannel(event.channel));
    return peer;
  };

  const flushCandidates = async () => {
    if (!peer?.remoteDescription) return;
    while (pendingCandidates.length) {
      try { await peer.addIceCandidate(pendingCandidates.shift()); } catch { /* stale candidate */ }
    }
  };

  const beginLocalLink = async () => {
    if (role !== "host" || dataChannel) return;
    const connection = ensurePeer();
    if (!connection) return;
    attachDataChannel(connection.createDataChannel("bowling-input", { ordered: false, maxRetransmits: 0 }));
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    sendSignal("rtc-offer", connection.localDescription);
  };

  const handleSocketMessage = async (message) => {
    onMessage(message);
    if (message.type === "controller-ready" && role === "host") await beginLocalLink();
    if (message.type === "rtc-offer" && role === "controller") {
      const connection = ensurePeer();
      if (!connection) return;
      await connection.setRemoteDescription(JSON.parse(message.signal));
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      sendSignal("rtc-answer", connection.localDescription);
      await flushCandidates();
    }
    if (message.type === "rtc-answer" && role === "host" && peer) {
      await peer.setRemoteDescription(JSON.parse(message.signal));
      await flushCandidates();
    }
    if (message.type === "rtc-candidate") {
      const candidate = JSON.parse(message.signal);
      const connection = ensurePeer();
      if (!connection?.remoteDescription) pendingCandidates.push(candidate);
      else await connection.addIceCandidate(candidate);
    }
  };

  channel?.addEventListener("message", (event) => {
    const counterpartReady =
      (role === "host" && event.data?.type === "controller-ready") ||
      (role === "controller" && event.data?.type === "host-ready");
    if (counterpartReady) {
      broadcastReady = true;
      if (role === "host" && event.data?.type === "controller-ready") {
        channel.postMessage({ type: "host-ready", role });
      }
    }
    onMessage({ ...event.data, transport: "same-device" });
  });
  try {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}?role=${role}`);
    socket.addEventListener("open", () => {
      socketReady = true;
      const ready = { type: role === "controller" ? "controller-ready" : "host-ready", role };
      socket.send(JSON.stringify(ready));
      channel?.postMessage(ready);
      onMessage({ type: "connected", transport: "signaling" });
    });
    socket.addEventListener("message", (event) => {
      try { handleSocketMessage(JSON.parse(event.data)).catch(() => {}); } catch { /* ignore malformed room messages */ }
    });
    socket.addEventListener("close", () => { socketReady = false; });
    socket.addEventListener("error", () => { socketReady = false; });
  } catch {
    socketReady = false;
  }

  return {
    send(message) {
      const payload = { ...message, role, at: Date.now() };
      channel?.postMessage(payload);
      const isLocalMessage = message.type === "swing" || message.type === "pin-contact";
      if (isLocalMessage && localInputReady) dataChannel.send(JSON.stringify(payload));
      if (!isLocalMessage && socketReady) socket.send(JSON.stringify(payload));
      onMessage(payload);
      return !isLocalMessage || localInputReady || broadcastReady;
    },
    close() {
      closed = true;
      channel?.close();
      dataChannel?.close();
      peer?.close();
      socket?.close();
    },
    get closed() { return closed; },
    get localInputReady() { return localInputReady; },
  };
}

function renderPhoneController(code) {
  document.body.classList.add("controller-body");
  app.innerHTML = `
    <section class="phone-controller">
      <header><span class="zone-mark"><i>SB</i><b>ROOM ${code}</b></span><span class="connection-pill" id="controller-connection"><i></i> CONNECTING</span></header>
      <main>
        <span class="eyebrow">PHONE CONTROLLER</span><h1>HOLD · SWING<br><em>RELEASE.</em></h1><p>Once armed, keep your eyes on the big screen. Release your thumb at the bottom of the swing.</p>
        <button class="enable-motion" id="enable-motion"><b>ENABLE MOTION + GYRO</b><small>One-time permission on this phone</small></button>
        <button class="controller-hold-zone" id="hold-swing" aria-describedby="controller-status">
          <i aria-hidden="true">●</i><b>HOLD HERE</b><span>SWING · RELEASE</span><small>NO SENSOR? PULL BACK AND FLICK</small>
        </button>
      </main>
      <footer><div class="safety-note"><b>!</b><span>Keep a firm grip, clear the space around you, and never release the phone.</span></div><small id="controller-status" aria-live="polite">Touch flick is ready.</small></footer>
    </section>`;

  const transport = createRoomTransport(code, "controller", (message) => {
    if (message.type === "connected" || message.type === "host-ready") {
      const pill = document.querySelector("#controller-connection");
      if (pill) pill.innerHTML = "<i></i> CONNECTED";
    }
    if (message.type === "local-input-ready") {
      const pill = document.querySelector("#controller-connection");
      if (pill) pill.innerHTML = "<i></i> LOCAL LINK";
      if (status) status.textContent = "Direct link ready. Hold, swing, and release.";
    }
    if (message.type === "local-input-closed" && status) status.textContent = "Local link paused. Keep both devices on the same Wi-Fi.";
    if (message.type === "pin-contact") navigator.vibrate?.(45);
  });
  transport.send({ type: "controller-ready" });

  const holdZone = document.querySelector("#hold-swing");
  const status = document.querySelector("#controller-status");
  let lastSwing = 0;
  let motionReady = false;
  let armed = false;
  let peakAcceleration = 0;
  let peakRotation = 0;
  let gesturePath = null;

  const sendSwing = ({ speed, rotation }) => {
    if (Date.now() - lastSwing < 850) return;
    lastSwing = Date.now();
    const delivered = transport.send({
      type: "swing",
      position: 20,
      angle: 20,
      speed: clamp(speed, 0.25, 1),
      rotation: clamp(rotation, -1, 1),
      releasedAt: Date.now(),
    });
    if (!delivered) {
      if (status) status.textContent = "Local link is still connecting. Try again in a moment.";
      return;
    }
    navigator.vibrate?.(28);
    holdZone?.classList.add("released");
    setTimeout(() => holdZone?.classList.remove("released"), 320);
    if (status) status.textContent = "Roll sent. Watch the pins!";
  };

  const onMotion = (event) => {
    if (!armed) return;
    const accel = event.accelerationIncludingGravity || event.acceleration;
    if (!accel) return;
    const magnitude = Math.hypot(accel.x || 0, accel.y || 0, accel.z || 0);
    const rotationRate = event.rotationRate || {};
    peakAcceleration = Math.max(peakAcceleration, magnitude);
    peakRotation = Math.abs(rotationRate.gamma || 0) > Math.abs(peakRotation) ? rotationRate.gamma || 0 : peakRotation;
  };

  document.querySelector("#enable-motion")?.addEventListener("click", async () => {
    try {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") throw new Error("Motion permission denied");
      }
      window.addEventListener("devicemotion", onMotion, { passive: true });
      motionReady = true;
      const enable = document.querySelector("#enable-motion");
      enable.innerHTML = "<b>MOTION + GYRO READY ✓</b><small>Use the large hold area below</small>";
      enable.disabled = true;
      if (status) status.textContent = "Ready. Hold the large area, swing, then release.";
    } catch {
      motionReady = false;
      if (status) status.textContent = "Motion unavailable. Pull back and flick in the large area.";
    }
  });

  holdZone?.addEventListener("pointerdown", (event) => {
    armed = true;
    peakAcceleration = 0;
    peakRotation = 0;
    gesturePath = [{ x: event.clientX, y: event.clientY, at: performance.now() }];
    holdZone.setPointerCapture?.(event.pointerId);
    holdZone.classList.add("holding");
    if (status) status.textContent = motionReady ? "Armed. Look at the big screen and swing." : "Pull back, then flick forward and release.";
  });

  holdZone?.addEventListener("pointermove", (event) => {
    if (!gesturePath) return;
    gesturePath.push({ x: event.clientX, y: event.clientY, at: performance.now() });
  });

  holdZone?.addEventListener("pointerup", (event) => {
    if (!armed || !gesturePath) return;
    gesturePath.push({ x: event.clientX, y: event.clientY, at: performance.now() });
    holdZone.classList.remove("holding");
    const input = motionReady
      ? motionThrow({ peakAcceleration, peakRotation, assist: true })
      : throwFromPointerPath(gesturePath, { width: holdZone.clientWidth, height: holdZone.clientHeight, assist: true });
    armed = false;
    gesturePath = null;
    if (!input) {
      if (status) status.textContent = "Pull back, then flick forward a little farther.";
      return;
    }
    sendSwing(input);
  });
}

function setStatus(message, type = "") {
  const status = document.querySelector("#status");
  if (!status) return;
  status.textContent = message;
  status.className = `status-line ${type}`;
}

function textContent(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = String(value);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
