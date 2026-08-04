import "./styles.css";
import { BowlingScene } from "./bowling-scene.js";
import { BowlingGame, detectSplit } from "./scoring.js";
import { clamp, motionThrow, throwFromPointerPath } from "./input.js";
import { canControllerThrow, normalizeAssignments, upsertPairedController } from "./modes.js";

const app = document.querySelector("#app");
const query = new URLSearchParams(window.location.search);
const controllerCode = sanitizeRoomCode(query.get("controller") ?? "");
const controllerMode = ["tv", "family"].includes(query.get("mode")) ? query.get("mode") : "motion";

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
  playMode: "solo",
  familyMode: false,
  playerCount: 2,
  roomPurpose: "",
  roomCode: "",
  roomTransport: null,
  controllers: [],
  lastInputLatencyMs: null,
  reducedEffects: matchMedia("(prefers-reduced-motion: reduce)").matches,
  motionAvailable: isLikelyPhoneWithMotionApis(),
  motionEnabled: false,
  motionMessage: "",
  sound: true,
  lastHelpSection: "basics",
};

if (controllerCode) {
  renderPhoneController(controllerCode, controllerMode);
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
  let soloMotionCapture = null;
  let soloMotionListenerAttached = false;

  const recordSoloMotion = (event) => {
    if (!soloMotionCapture) return;
    const acceleration = event.accelerationIncludingGravity || event.acceleration;
    const rotationRate = event.rotationRate;
    if (!acceleration || !rotationRate) return;
    const magnitude = Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0);
    soloMotionCapture.peakAcceleration = Math.max(soloMotionCapture.peakAcceleration, magnitude);
    if (Math.abs(rotationRate.gamma || 0) > Math.abs(soloMotionCapture.peakRotation)) soloMotionCapture.peakRotation = rotationRate.gamma || 0;
    if (Math.abs(acceleration.x || 0) > Math.abs(soloMotionCapture.lateralAcceleration)) soloMotionCapture.lateralAcceleration = acceleration.x || 0;
  };

  app.addEventListener("pointerdown", (event) => {
    const stage = event.target.closest(".lane-stage");
    if (!stage || state.screen !== "game" || scene.rolling) return;
    if (state.motionEnabled && !state.multiplayer) {
      soloMotionCapture = { peakAcceleration: 0, peakRotation: 0, lateralAcceleration: 0, stage };
      stage.setPointerCapture?.(event.pointerId);
      stage.classList.add("is-dragging");
      updateThrowInstruction("ARMED · SWING · RELEASE");
      return;
    }
    if (state.multiplayer) return;
    pointerPath = [{ x: event.clientX, y: event.clientY, at: performance.now() }];
    pointerPath.stage = stage;
    stage.setPointerCapture?.(event.pointerId);
    stage.classList.add("is-dragging");
  });

  app.addEventListener("pointermove", (event) => {
    if (soloMotionCapture) return;
    if (!pointerPath) return;
    pointerPath.push({ x: event.clientX, y: event.clientY, at: performance.now() });
    if (pointerPath.length > 32) pointerPath.splice(1, pointerPath.length - 32);
  });

  app.addEventListener("pointerup", (event) => {
    if (soloMotionCapture) {
      const capture = soloMotionCapture;
      soloMotionCapture = null;
      capture.stage.classList.remove("is-dragging");
      const input = motionThrow({ ...capture, position: state.board, angle: state.aim });
      if (!input) {
        updateThrowInstruction("SWING NEEDED · TRY AGAIN");
        return;
      }
      applyThrowInput(input);
      return;
    }
    if (!pointerPath) return;
    const stage = pointerPath.stage;
    pointerPath.push({ x: event.clientX, y: event.clientY, at: performance.now() });
    const input = throwFromPointerPath(pointerPath, {
      width: stage.clientWidth,
      height: stage.clientHeight,
      position: state.board,
      angle: state.aim,
    });
    pointerPath = null;
    stage.classList.remove("is-dragging");
    if (!input) return;
    applyThrowInput(input);
  });

  app.addEventListener("pointercancel", () => {
    soloMotionCapture?.stage?.classList.remove("is-dragging");
    soloMotionCapture = null;
    pointerPath?.stage?.classList.remove("is-dragging");
    pointerPath = null;
  });

  function activate(action, target) {
    switch (action) {
      case "menu":
        state.roomTransport?.close?.();
        state.roomTransport = null;
        state.roomPurpose = "";
        state.controllers = [];
        state.screen = "menu";
        state.game = null;
        state.games = [];
        state.players = [];
        renderMenu();
        break;
      case "play":
        state.playMode = "solo";
        state.familyMode = false;
        renderPlaySetup();
        break;
      case "set-mode":
        state.playMode = target.dataset.mode === "cpu" ? "cpu" : "solo";
        state.familyMode = false;
        renderPlaySetup();
        break;
      case "set-players":
        state.playerCount = clamp(Number(target.dataset.players) || 2, 2, 4);
        normalizeAssignments(state.controllers, state.playerCount);
        renderMotionLobby("family");
        break;
      case "start-game":
      case "practice":
        startGame(action === "practice");
        break;
      case "multiplayer":
        renderMultiplayer();
        break;
      case "tv-mode":
        createMotionRoom("tv");
        break;
      case "family-mode":
        createMotionRoom("family");
        break;
      case "pair-phone":
        renderPhoneCodeEntry();
        break;
      case "pair-phone-code": {
        const field = app.querySelector("#phone-room-code");
        const code = sanitizeRoomCode(field?.value ?? "");
        if (code.length !== 6) {
          field?.setAttribute("aria-invalid", "true");
          setStatus("Enter the complete 6-character room code.", "error");
          return;
        }
        window.location.assign(`${window.location.pathname}?controller=${code}&mode=motion`);
        break;
      }
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
      case "start-room-game":
        if (state.roomPurpose === "tv" || state.roomPurpose === "family") startMotionRoomGame();
        else startGame(false, true);
        break;
      case "assign-controller":
        assignController(target.dataset.controllerId, Number(target.dataset.player));
        break;
      case "controllers":
        if (!scene.rolling) renderControllerAssignmentsLayer();
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
      case "toggle-motion":
        void toggleSoloMotion();
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

  async function toggleSoloMotion() {
    if (state.motionEnabled) {
      state.motionEnabled = false;
      state.motionMessage = "Touch swipe is active.";
      updateMotionUi();
      return;
    }
    const available = await requestRequiredMotionSensors();
    if (!available) {
      state.motionAvailable = false;
      state.motionEnabled = false;
      state.motionMessage = "Gyroscope not found. Touch swipe remains active.";
      updateMotionUi();
      return;
    }
    if (!soloMotionListenerAttached) {
      window.addEventListener("devicemotion", recordSoloMotion, { passive: true });
      soloMotionListenerAttached = true;
    }
    state.motionEnabled = true;
    state.motionMessage = "Hold the lane, swing the phone, and release.";
    updateMotionUi();
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
              <span><b>PLAY</b><small>Solo or vs CPU · touch or optional motion</small></span>
              <i aria-hidden="true">→</i>
            </button>
          </div>

          <nav class="menu-panel" aria-label="Main menu">
            <div class="profile-card">
              <span class="profile-badge">SB</span>
              <span><b>Guest Bowler</b><small>Level 1 · House Shot</small></span>
              <span class="level-ring">01</span>
            </div>
            <button class="menu-tile tv-mode" data-action="tv-mode">
              <span class="tile-icon">▣</span><span><b>TV MODE</b><small>Solo · phone motion controller</small></span><i>→</i>
            </button>
            <button class="menu-tile family-mode" data-action="family-mode">
              <span class="tile-icon">◆</span><span><b>FAMILY MODE</b><small>MOTION CONTROLS REQUIRED · 2–4 players</small></span><i>→</i>
            </button>
            <div class="menu-grid">
              <button class="menu-tile multiplayer" data-action="multiplayer"><span class="tile-icon">⌁</span><span><b>ONLINE</b><small>Room-code multiplayer</small></span></button>
              <button class="menu-tile" data-action="pair-phone"><span class="tile-icon">▯</span><span><b>PAIR PHONE</b><small>Enter a TV or Family room code</small></span></button>
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
    scene.setPaused(false);
    scene.resize();
  }

  function renderPlaySetup() {
    state.screen = "setup";
    const ball = BALLS[state.selectedBall];
    const vsCpu = state.playMode === "cpu";
    app.innerHTML = `
      <section class="sub-screen setup-screen screen-enter">
        ${subHeader("Choose your game", "menu", "SIMPLE START · NO ACCOUNT NEEDED")}
        <div class="setup-layout">
          <article class="mode-card selected">
            <span class="mode-number">${vsCpu ? "02" : "01"}</span><span class="mode-kicker">${vsCpu ? "TAKE ON THE HOUSE" : "AUTHENTIC SOLO"}</span>
            <h2>${vsCpu ? "VS CPU" : "QUICK PLAY"}</h2>
            <p>${vsCpu ? "Alternate complete frames against a friendly CPU bowler. Your delivery still comes only from your swipe or phone motion." : "One regulation game on the House Shot. Every throw reads the speed, direction, and curve of your real swipe or swing."}</p>
            <div class="mode-meta"><span>10 FRAMES</span><span>NO THROW BUTTON</span><span>${vsCpu ? "ALTERNATING" : "~8 MIN"}</span></div>
          </article>
          <div class="quick-config">
            <div class="mode-switch" aria-label="Play style">
              <button data-action="set-mode" data-mode="solo" class="${!vsCpu ? "active" : ""}"><b>SOLO</b><small>Just me</small></button>
              <button data-action="set-mode" data-mode="cpu" class="${vsCpu ? "active" : ""}"><b>VS CPU</b><small>Alternate frames</small></button>
            </div>
            ${state.motionAvailable ? `<button class="motion-choice ${state.motionEnabled ? "active" : ""}" data-action="toggle-motion"><span><b>Motion Controls: ${state.motionEnabled ? "On" : "Off"}</b><small>${state.motionEnabled ? "Hold the lane, swing the phone, release" : "Touch swipe controls the delivery"}</small></span><i>${state.motionEnabled ? "ON" : "OFF"}</i></button>` : ""}
            ${state.motionMessage ? `<div class="input-message">${state.motionMessage}</div>` : ""}
            <div class="config-title"><span>YOUR BALL</span><button data-action="balls">CHANGE</button></div>
            <button class="ball-choice" data-action="balls">
              <span class="ball-orb" style="--ball:${ball.color}"><i></i><i></i><i></i></span>
              <span><b>${ball.name}</b><small>${ball.weight} LB · Hook ${ball.hook}/10 · Speed ${ball.speed}/10</small></span><em>›</em>
            </button>
            <button class="primary-button" data-action="start-game"><span>${vsCpu ? "BOWL VS CPU" : "BOWL SOLO"}</span><small>${state.motionEnabled ? "Motion is on" : "Swipe controls every delivery"}</small><i>→</i></button>
          </div>
          <div class="other-modes">
            <button data-action="tv-mode"><b>TV MODE</b><small>Phone motion · solo</small><i>→</i></button>
            <button data-action="family-mode"><b>FAMILY MODE</b><small>Motion required · 2–4</small><i>→</i></button>
            <button data-action="practice"><b>PRACTICE</b><small>Free roll · no score</small><i>→</i></button>
          </div>
        </div>
      </section>`;
  }

  function startGame(practice = false, multiplayer = false) {
    state.screen = "game";
    state.practice = practice;
    state.multiplayer = multiplayer;
    const useFamily = multiplayer && state.roomPurpose === "family";
    const useTv = multiplayer && state.roomPurpose === "tv";
    const useCpu = !practice && !multiplayer && state.playMode === "cpu";
    state.vsCpu = useCpu;
    const playerCount = useFamily ? state.playerCount : useCpu ? 2 : 1;
    state.players = Array.from({ length: playerCount }, (_, index) => ({
      name: useFamily ? `PLAYER ${index + 1}` : useCpu && index === 1 ? "CPU" : "YOU",
      color: BALLS[(state.selectedBall + index) % BALLS.length].color,
    }));
    state.games = state.players.map(() => new BowlingGame());
    state.currentPlayer = 0;
    state.game = state.games[0];
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
          ${useFamily || useTv ? '<button class="hud-button controller-hud" data-action="controllers" aria-label="Phone assignments">▯</button>' : '<button class="hud-button help-hud" data-action="help" data-section="controls" aria-label="How to play">?</button>'}
        </header>

        <div class="game-main">
          <aside id="player-rail-content" class="player-rail">${playerRailMarkup()}</aside>
          <div id="lane-stage" class="lane-stage" aria-label="Bowling lane. Pull back and swipe forward to deliver the ball. Swipe direction sets the line and curvature sets hook." tabindex="0">
            <div id="lane-mount" class="lane-mount"></div>
            <div class="lane-readout top-left"><span>LANE 07</span><b>${useFamily ? "FAMILY MOTION" : useTv ? "TV MOTION" : useCpu ? "VS CPU" : "HOUSE 40'"}</b></div>
            <div class="lane-readout top-right"><span>FRAME <b id="frame-readout">1</b></span><span>BALL <b id="ball-readout">1</b></span></div>
            <div class="aim-reticle" aria-hidden="true"><i></i><span>AIM <b id="aim-board">${state.aim}</b></span></div>
            <div id="roll-callout" class="roll-callout"><b id="throw-instruction">${multiplayer ? "WAITING FOR MOTION RELEASE" : state.motionEnabled ? "HOLD · SWING · RELEASE" : "PULL BACK · SWIPE FORWARD"}</b><span>${multiplayer ? "Aim here · swing on the paired phone" : state.motionEnabled ? "Accelerometer sets speed · gyroscope sets hook" : "Speed, direction, and curvature become the delivery"}</span></div>
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
          <div class="delivery-note ${multiplayer ? "motion-only" : ""}"><i>↟</i><span><b>3 · ${multiplayer ? "PHONE MOTION" : state.motionEnabled ? "SWING THE PHONE" : "SWIPE ON THE LANE"}</b><small>${multiplayer ? "No local throw control" : state.motionEnabled ? "Hold the lane · swing · release" : "Pull back · drive forward · curve to hook"}</small></span></div>
          ${state.motionAvailable && !multiplayer ? `<button class="game-motion-toggle ${state.motionEnabled ? "active" : ""}" data-action="toggle-motion"><b>Motion Controls: ${state.motionEnabled ? "On" : "Off"}</b><span>Switch between frames</span></button>` : '<div class="physical-input-note"><b>NO TAP THROW</b><span>Every roll comes from movement</span></div>'}
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

  function renderPhoneCodeEntry() {
    state.screen = "phone-code";
    app.innerHTML = `
      <section class="sub-screen phone-code-screen screen-enter">
        ${subHeader("Pair this phone", "menu", "TV MODE · FAMILY MODE")}
        <div class="phone-code-card">
          <span class="eyebrow">PHONE CONTROLLER</span>
          <h2>ENTER THE<br><em>ROOM CODE.</em></h2>
          <p>The big screen shows a six-character code. This phone will check for both an accelerometer and gyroscope before it joins.</p>
          <label class="room-input"><span>ROOM CODE</span><input id="phone-room-code" maxlength="6" inputmode="text" autocomplete="off" placeholder="K7P2QX"><button data-action="pair-phone-code">PAIR PHONE →</button></label>
          <div id="status" class="status-line">A gyroscope is required for wrist rotation and hook.</div>
        </div>
      </section>`;
  }

  function createMotionRoom(purpose) {
    state.roomPurpose = purpose;
    state.familyMode = purpose === "family";
    state.playerCount = purpose === "family" ? Math.max(2, state.playerCount) : 1;
    state.controllers = [];
    state.roomCode = makeRoomCode();
    renderMotionLobby(purpose);
    connectHostRoom();
  }

  function renderMotionLobby(purpose = state.roomPurpose) {
    state.screen = "motion-lobby";
    const family = purpose === "family";
    const link = controllerLink(state.roomCode, purpose);
    app.innerHTML = `
      <section class="sub-screen motion-lobby-screen screen-enter">
        ${subHeader(family ? "Family Mode" : "TV Mode", "menu", "MOTION CONTROLS · GYROSCOPE REQUIRED")}
        <div class="motion-lobby-layout">
          <aside>
            <span class="eyebrow">${family ? "PASS · PLAY · CHEER" : "SOLO ON THE BIG SCREEN"}</span>
            <h2>${family ? "PAIR THE\nFAMILY." : "PHONE IN HAND.\nLANE ON TV."}</h2>
            <p>${family ? "Players can share one phone or pair several. Assign each paired phone to a player, or mark it Shared for pass-and-play." : "Keep this screen on the TV. Enter the room code on your phone, verify its gyroscope, then use the phone only for the bowling motion."}</p>
            ${family ? `<div class="family-config"><span><b>HOW MANY PLAYERS?</b><small>Assignments can change between frames</small></span><div class="player-count">${[2, 3, 4].map((count) => `<button data-action="set-players" data-players="${count}" class="${state.playerCount === count ? "active" : ""}">${count}</button>`).join("")}</div></div>` : ""}
          </aside>
          <div class="motion-room-card">
            <div class="room-heading"><span>ROOM CODE</span><b>${state.roomCode}</b><small>On the phone, choose Pair Phone and enter this code</small></div>
            <div id="paired-roster" class="paired-roster">${motionRosterMarkup()}</div>
            <div class="controller-link"><span>DIRECT PHONE LINK</span><code>${escapeHtml(link.replace(/^https?:\/\//, ""))}</code><div><button data-action="copy-controller">COPY LINK</button><button data-action="share-controller">SHARE</button></div></div>
            <div id="status" class="status-line">Waiting for a gyroscope-equipped phone.</div>
            <button id="start-motion-room" class="primary-button ${family ? "family-button" : ""}" data-action="start-room-game" ${state.controllers.length ? "" : "disabled"}><span>START ${family ? "FAMILY" : "TV"} BOWL</span><small>${state.controllers.length ? `${state.controllers.length} phone${state.controllers.length === 1 ? "" : "s"} paired` : "Pair at least one phone"}</small><i>→</i></button>
          </div>
        </div>
      </section>`;
  }

  function motionRosterMarkup() {
    if (!state.controllers.length) return '<div class="empty-controller"><i>▯</i><span><b>NO PHONES PAIRED</b><small>Gyroscope verification happens before a phone appears here.</small></span></div>';
    return state.controllers.map((controller, index) => `
      <article class="paired-controller">
        <i>${index + 1}</i><span><b>${escapeHtml(controller.name)}</b><small>GYROSCOPE VERIFIED · ${controller.local ? "LOCAL LINK" : "CONNECTED"}</small></span>
        ${state.roomPurpose === "family" ? `<div class="assignment-buttons" aria-label="Assign ${escapeHtml(controller.name)}"><button data-action="assign-controller" data-controller-id="${escapeHtml(controller.id)}" data-player="-1" class="${controller.player === -1 ? "active" : ""}">SHARED</button>${Array.from({ length: state.playerCount }, (_, player) => `<button data-action="assign-controller" data-controller-id="${escapeHtml(controller.id)}" data-player="${player}" class="${controller.player === player ? "active" : ""}">P${player + 1}</button>`).join("")}</div>` : '<em>PLAYER 1</em>'}
      </article>`).join("");
  }

  function assignController(controllerId, player) {
    const controller = state.controllers.find((item) => item.id === controllerId);
    if (!controller || (player < -1 || player >= state.playerCount)) return;
    controller.player = player;
    state.roomTransport?.send({ type: "assignment", targetControllerId: controller.id, player });
    if (state.screen === "motion-lobby") renderMotionLobby();
    else renderControllerAssignmentsLayer();
  }

  function startMotionRoomGame() {
    if (!state.controllers.length) {
      setStatus("Pair at least one gyroscope-equipped phone before starting.", "error");
      return;
    }
    state.familyMode = state.roomPurpose === "family";
    startGame(false, true);
  }

  function renderControllerAssignmentsLayer() {
    const layer = document.querySelector(".pause-layer");
    if (!layer) return;
    scene.setPaused(true);
    layer.innerHTML = `<div class="pause-card controller-assignment-card"><span class="eyebrow">PHONE ASSIGNMENTS</span><h2>${state.roomPurpose === "family" ? "WHO IS BOWLING?" : "TV CONTROLLER"}</h2><div class="paired-roster">${motionRosterMarkup()}</div><button class="primary-button" data-action="resume">BACK TO LANE <i>→</i></button></div>`;
    layer.classList.add("open");
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
            <p>Online play uses room codes. For a phone motion controller on the same network, use TV Mode or Family Mode from the main menu.</p>
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
              <div class="create-panel"><span class="step-label">HOST A LANE</span><h3>Create a private room.</h3><p>The room stays private by default and open for instant rematches.</p><button class="primary-button purple-button" data-action="create-room"><span>CREATE ROOM</span><small>6-character private code</small><i>→</i></button></div>
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
      if (message.type === "pair-request" && message.gyro === true && message.controllerId) {
        const controller = upsertPairedController(state.controllers, message, state.roomPurpose);
        state.roomTransport?.send({ type: "pair-accepted", targetControllerId: controller.id, purpose: state.roomPurpose, player: controller.player });
        state.roomTransport?.send({ type: "aim-state", targetControllerId: controller.id, position: state.board, angle: state.aim });
        if (state.screen === "motion-lobby") renderMotionLobby();
        setStatus(`${controller.name} paired with gyroscope verified.`, "success");
      }
      if (message.type === "local-input-ready") {
        setStatus("Direct local motion link ready — no input server round trip.", "success");
      }
      if (message.type === "local-input-closed") setStatus("Local input paused. Keep both devices on the same Wi-Fi.", "error");
      if (message.type === "disconnected" && message.controllerId) {
        state.controllers = state.controllers.filter((controller) => controller.id !== message.controllerId);
        if (state.screen === "motion-lobby") renderMotionLobby();
      }
      if (message.type === "swing") {
        if (state.screen !== "game") return;
        if (!canControllerThrow(state.controllers, message.controllerId, state.roomPurpose, state.currentPlayer)) {
          state.roomTransport?.send({ type: "turn-denied", targetControllerId: message.controllerId, player: state.currentPlayer });
          return;
        }
        state.lastInputLatencyMs = Number(message.releasedAt) > 0 ? Math.max(0, Date.now() - Number(message.releasedAt)) : null;
        document.documentElement.dataset.inputLatency = state.lastInputLatencyMs === null ? "unknown" : String(state.lastInputLatencyMs);
        const remoteSpeed = Number(message.speed);
        applyThrowInput({
          position: clamp(Number(message.position) || state.board, 1, 39),
          angle: clamp(Number(message.angle) || state.aim, 1, 39),
          speed: clamp(Number.isFinite(remoteSpeed) ? remoteSpeed : 0, 0, 1),
          rotation: clamp(Number(message.rotation) || 0, -1, 1),
        });
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
          ${state.motionAvailable ? settingRow("Motion Controls", "Optional for Solo and vs CPU on this phone", state.motionEnabled, "toggle-motion") : ""}
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
      controls: ["THREE PHYSICAL STEPS", "Move left or right, turn toward a lane board, then make a real delivery. A swipe carries its own speed, direction, and curvature. Motion uses swing acceleration and wrist rotation.", ["A / D moves your feet", "Arrow keys turn your aim", "Touch: pull back and swipe forward", "There is no tap or roll button"]],
      scoring: ["READ THE SCORE", "A strike earns 10 plus your next two balls. A spare earns 10 plus your next ball. In frame ten, a strike or spare earns bonus rolls.", ["Maximum score: 300", "Twelve strikes make perfect", "Pending bonuses show —", "Raw pinfall is never hidden"]],
      multiplayer: ["BOWL TOGETHER", "Create a room, share its six-character code, and start when everyone is ready. Guests join without an account.", ["2–8 bowlers", "Sprint or 10 frames", "Phone motion remote", "Instant rematch"]],
      tips: ["FIND THE POCKET", "Right-handers aim between pins 1 and 3; left-handers between 1 and 2. A controlled entry angle carries more pins than raw speed.", ["Move your feet first", "Use a smooth forward flick", "Curve only near release", "Treat spares seriously"]],
    };
    const [title, copy, bullets] = sections[section] ?? sections.basics;
    app.innerHTML = `
      <section class="sub-screen help-screen screen-enter">
        ${subHeader("How to Play", state.game ? "resume" : "menu", "AVAILABLE FROM EVERY MODE")}
        <div class="help-layout"><nav aria-label="How to play sections">${Object.entries(sections).map(([key, value], index) => `<button data-action="help-section" data-section="${key}" class="${key === section ? "active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><b>${value[0]}</b><i>→</i></button>`).join("")}</nav>
          <article><span class="eyebrow">${section.toUpperCase()}</span><h2>${title}</h2><p>${copy}</p><div class="help-points">${bullets.map((item, index) => `<div><b>${index + 1}</b><span>${item}</span></div>`).join("")}</div>${section === "controls" ? '<div class="swipe-demo"><i>●</i><span></span><b>PULL BACK · FLICK FORWARD</b></div>' : ""}<button class="primary-button" data-action="${state.game ? "resume" : "play"}">${state.game ? "BACK TO LANE" : "PLAY NOW"} <i>→</i></button></article></div>
      </section>`;
  }

  function renderGameHelp(section = "controls") {
    const layer = document.querySelector(".pause-layer");
    if (!layer) return;
    if (!state.multiplayer) scene.setPaused(true);
    const content = {
      controls: ["POSITION · ANGLE · DELIVERY", "Move your start and angle with the labelled buttons. Then pull back and swipe forward, or hold and swing when motion is enabled. Speed, direction, and wrist rotation are never automated."],
      scoring: ["READ THE SCORE", "A strike adds your next two balls. A spare adds your next one. Bonus rolls happen in frame ten."],
      multiplayer: ["ROOM PLAY", "Your turn stays live while this help card is open. Close it when you are ready to bowl."],
    }[section] ?? ["THE BASICS", "Knock down ten pins in ten frames. Strikes and spares earn bonus pinfall."];
    layer.innerHTML = `<div class="pause-card"><span class="eyebrow">HOW TO PLAY</span><h2>${content[0]}</h2><p>${content[1]}</p><button class="primary-button" data-action="resume">BACK TO LANE <i>→</i></button><button data-action="help-section" data-section="scoring">SCORING SYMBOLS</button></div>`;
    layer.classList.add("open");
  }

  function renderPauseMenu() {
    const layer = document.querySelector(".pause-layer");
    if (!layer) return;
    layer.innerHTML = `<div class="pause-card"><span class="eyebrow">LANE 07</span><h2>GAME PAUSED</h2><button class="primary-button" data-action="resume">RESUME <i>→</i></button>${state.roomPurpose === "family" || state.roomPurpose === "tv" ? '<button data-action="controllers">PHONE ASSIGNMENTS</button>' : ""}<button data-action="help" data-section="controls">HOW TO PLAY</button><button data-action="menu">EXIT TO MENU</button></div>`;
    layer.classList.add("open");
  }

  function rollBall() {
    if (state.screen !== "game" || scene.rolling || state.game?.complete) return;
    const rolled = scene.roll({
      speed: state.speed,
      rotation: state.rotation,
      angle: state.aim,
    });
    if (!rolled) return;
    document.querySelector("#roll-callout")?.classList.add("hidden");
    const result = document.querySelector("#result-callout");
    if (result) result.innerHTML = "";
    updateLiveControls();
  }

  function applyThrowInput(input) {
    if (!input || state.screen !== "game" || scene.rolling) return false;
    state.board = clamp(Number(input.position), 1, 39);
    state.aim = clamp(Number(input.angle), 1, 39);
    state.speed = clamp(Number(input.speed), 0, 1);
    state.rotation = clamp(Number(input.rotation), -1, 1);
    scene.setPosition(state.board);
    scene.setAim(state.aim);
    rollBall();
    return true;
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
      if (state.vsCpu) {
        if (state.currentPlayer === 0 && frameFinished) {
          advanceCpuTurn(1);
          return;
        }
        if (state.currentPlayer === 1 && frameFinished) {
          advanceCpuTurn(0);
          return;
        }
      }
      const fullRack = state.game.pinsStanding() === 10;
      scene.prepareNextBall({ fullRack });
      result?.classList.remove("show");
      document.querySelector("#roll-callout")?.classList.remove("hidden");
      updateScoreboard();
      if (state.vsCpu && state.currentPlayer === 1) setTimeout(bowlCpuBall, 650);
    }, 1500);
  }

  function advanceCpuTurn(playerIndex) {
    state.currentPlayer = playerIndex;
    state.game = state.games[playerIndex];
    scene.prepareNextBall({ fullRack: true });
    updateScoreboard();
    const result = document.querySelector("#result-callout");
    if (result) {
      result.innerHTML = `<b>${state.players[playerIndex].name}</b><span>${playerIndex === 1 ? "CPU is reading the lane." : "Your frame — make a real delivery."}</span>`;
      result.classList.add("show", "turn-change");
    }
    setTimeout(() => {
      result?.classList.remove("show", "turn-change");
      if (playerIndex === 1) bowlCpuBall();
      else document.querySelector("#roll-callout")?.classList.remove("hidden");
    }, 800);
  }

  function bowlCpuBall() {
    if (!state.vsCpu || state.currentPlayer !== 1 || scene.rolling || state.game?.complete) return;
    const variation = () => (crypto.getRandomValues(new Uint32Array(1))[0] / 0xffffffff) * 2 - 1;
    applyThrowInput({ position: 20, angle: clamp(20 + Math.round(variation() * 3), 1, 39), speed: clamp(0.58 + variation() * 0.18, 0.1, 1), rotation: variation() * 0.28 });
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
    state.roomTransport?.send({ type: "turn-state", player: state.currentPlayer, position: state.board, angle: state.aim });
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
    const isFamilyResult = state.familyMode && state.players.length > 1;
    const multiplayerResults = state.players.length > 1 ? `<div class="family-results">${state.players.map((player, index) => `<div class="${index === winner ? "winner" : ""}"><i style="background:${player.color}"></i><span><b>${player.name}</b><small>${index === winner ? isFamilyResult ? "FAMILY CHAMPION ★" : "WINNER ★" : "GREAT GAME"}</small></span><em>${totals[index]}</em></div>`).join("")}</div>` : `<div class="final-score"><b>${total}</b><small>FINAL SCORE</small></div>`;
    overlay.innerHTML = `<div class="pause-card end-card"><span class="eyebrow">GAME COMPLETE</span><h2>${state.players.length > 1 ? `${state.players[winner].name} WINS!` : total >= 200 ? "LANE MASTER" : total >= 130 ? "SOLID GAME" : "FIRST GAME DOWN"}</h2>${multiplayerResults}<p>${isFamilyResult ? "High fives all around. Keep everyone in the lineup for an instant rematch." : state.vsCpu ? "Friendly match complete. Adjust your line and challenge the house again." : "Every frame is now on your card. Want another line at it?"}</p><button class="primary-button" data-action="new-game">PLAY AGAIN <i>→</i></button><button data-action="menu">MAIN MENU</button></div>`;
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
    if (playerMode) playerMode.textContent = state.vsCpu ? `VS CPU · ${state.currentPlayer === 0 ? "YOUR FRAME" : "CPU FRAME"}` : state.familyMode && state.players.length > 1 ? `FAMILY BOWL · ${state.currentPlayer + 1} OF ${state.players.length}` : state.multiplayer ? `ROOM ${state.roomCode}` : state.practice ? "PRACTICE" : "HOUSE SHOT";
    const rail = document.querySelector("#player-rail-content");
    if (rail) rail.innerHTML = playerRailMarkup();
  }

  function updateLiveControls() {
    textContent("#position-board", state.board);
    textContent("#aim-board", state.aim);
    textContent("#aim-label", `BOARD ${state.aim}`);
    if (state.multiplayer) state.roomTransport?.send({ type: "aim-state", position: state.board, angle: state.aim });
  }

  function updateThrowInstruction(copy) {
    textContent("#throw-instruction", copy);
  }

  function updateMotionUi() {
    if (state.screen === "setup") {
      renderPlaySetup();
      return;
    }
    if (state.screen === "settings") {
      renderSettings();
      return;
    }
    const toggle = document.querySelector(".game-motion-toggle");
    if (!state.motionAvailable) toggle?.remove();
    else if (toggle) {
      toggle.classList.toggle("active", state.motionEnabled);
      toggle.innerHTML = `<b>Motion Controls: ${state.motionEnabled ? "On" : "Off"}</b><span>Switch between frames</span>`;
    }
    const zone = document.querySelector(".delivery-note");
    if (zone) {
      zone.innerHTML = `<i>↟</i><span><b>3 · ${state.motionEnabled ? "SWING THE PHONE" : "SWIPE ON THE LANE"}</b><small>${state.motionEnabled ? "Hold the lane · swing · release" : "Pull back · drive forward · curve to hook"}</small></span>`;
    }
    updateThrowInstruction(state.motionEnabled ? "HOLD · SWING · RELEASE" : "PULL BACK · SWIPE FORWARD");
  }

  function handleKeyboard(event) {
    if (state.screen !== "game") return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
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

function controllerLink(code, purpose = state.roomPurpose || "motion") {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("controller", code);
  url.searchParams.set("mode", purpose);
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

function isLikelyPhoneWithMotionApis() {
  return matchMedia("(pointer: coarse)").matches && typeof DeviceMotionEvent !== "undefined" && typeof DeviceOrientationEvent !== "undefined";
}

let motionSensorsVerified = false;

async function requestRequiredMotionSensors(timeoutMs = 1800) {
  if (motionSensorsVerified) return true;
  if (typeof DeviceMotionEvent === "undefined" || typeof DeviceOrientationEvent === "undefined") return false;
  try {
    if (typeof DeviceMotionEvent.requestPermission === "function" && await DeviceMotionEvent.requestPermission() !== "granted") return false;
    if (typeof DeviceOrientationEvent.requestPermission === "function" && await DeviceOrientationEvent.requestPermission() !== "granted") return false;
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener("devicemotion", inspect);
      motionSensorsVerified = value;
      resolve(value);
    };
    const inspect = (event) => {
      const acceleration = event.accelerationIncludingGravity || event.acceleration;
      const rotation = event.rotationRate;
      const hasAcceleration = acceleration && [acceleration.x, acceleration.y, acceleration.z].some(Number.isFinite);
      const hasGyroscope = rotation && [rotation.alpha, rotation.beta, rotation.gamma].some(Number.isFinite);
      if (hasAcceleration && hasGyroscope) finish(true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    window.addEventListener("devicemotion", inspect, { passive: true });
  });
}

function makeControllerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `phone-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function createRoomTransport(code, role, onMessage = () => {}, participantId = role === "host" ? "host" : makeControllerId()) {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`sport-bowling-${code}`) : null;
  let socket = null;
  let socketReady = false;
  let closed = false;
  const peers = new Map();
  const broadcastReady = new Set();
  const pendingSocketMessages = [];

  const sendSocket = (payload) => {
    if (socketReady) socket.send(JSON.stringify(payload));
    else pendingSocketMessages.push(payload);
  };

  const sendSignal = (type, value, targetControllerId) => {
    sendSocket({ type, signal: JSON.stringify(value), controllerId: participantId, targetControllerId });
  };

  const attachDataChannel = (entry, nextChannel, controllerId) => {
    entry.channel = nextChannel;
    nextChannel.addEventListener("open", () => {
      entry.ready = true;
      onMessage({ type: "local-input-ready", transport: "peer", controllerId });
    });
    nextChannel.addEventListener("close", () => {
      entry.ready = false;
      onMessage({ type: "local-input-closed", controllerId });
    });
    nextChannel.addEventListener("message", (event) => {
      try { onMessage({ ...JSON.parse(event.data), transport: "peer" }); } catch { /* ignore malformed local input */ }
    });
  };

  const ensurePeer = (controllerId) => {
    const key = role === "host" ? controllerId : "host";
    if (peers.has(key) || typeof RTCPeerConnection === "undefined") return peers.get(key);
    const peer = new RTCPeerConnection({ iceServers: [] });
    const entry = { peer, channel: null, ready: false, pendingCandidates: [], controllerId };
    peers.set(key, entry);
    peer.addEventListener("icecandidate", (event) => {
      if (event.candidate) sendSignal("rtc-candidate", event.candidate.toJSON(), role === "host" ? controllerId : "host");
    });
    peer.addEventListener("connectionstatechange", () => {
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
        entry.ready = false;
        onMessage({ type: "local-input-closed", controllerId });
      }
    });
    if (role === "controller") peer.addEventListener("datachannel", (event) => attachDataChannel(entry, event.channel, participantId));
    return entry;
  };

  const flushCandidates = async (entry) => {
    if (!entry?.peer.remoteDescription) return;
    while (entry.pendingCandidates.length) {
      try { await entry.peer.addIceCandidate(entry.pendingCandidates.shift()); } catch { /* stale candidate */ }
    }
  };

  const beginLocalLink = async (controllerId) => {
    if (role !== "host" || !controllerId) return;
    const entry = ensurePeer(controllerId);
    if (!entry || entry.channel) return;
    attachDataChannel(entry, entry.peer.createDataChannel("bowling-input", { ordered: false, maxRetransmits: 0 }), controllerId);
    const offer = await entry.peer.createOffer();
    await entry.peer.setLocalDescription(offer);
    sendSignal("rtc-offer", entry.peer.localDescription, controllerId);
  };

  const handleSocketMessage = async (message) => {
    if (message.targetControllerId && role === "controller" && message.targetControllerId !== participantId) return;
    onMessage(message);
    if (message.type === "controller-ready" && role === "host") await beginLocalLink(message.controllerId);
    if (message.type === "rtc-offer" && role === "controller" && message.targetControllerId === participantId) {
      const entry = ensurePeer(participantId);
      if (!entry) return;
      await entry.peer.setRemoteDescription(JSON.parse(message.signal));
      const answer = await entry.peer.createAnswer();
      await entry.peer.setLocalDescription(answer);
      sendSignal("rtc-answer", entry.peer.localDescription, "host");
      await flushCandidates(entry);
    }
    if (message.type === "rtc-answer" && role === "host") {
      const entry = peers.get(message.controllerId);
      if (!entry) return;
      await entry.peer.setRemoteDescription(JSON.parse(message.signal));
      await flushCandidates(entry);
    }
    if (message.type === "rtc-candidate") {
      const candidate = JSON.parse(message.signal);
      const entry = role === "host" ? ensurePeer(message.controllerId) : ensurePeer(participantId);
      if (!entry?.peer.remoteDescription) entry?.pendingCandidates.push(candidate);
      else await entry.peer.addIceCandidate(candidate);
    }
  };

  channel?.addEventListener("message", (event) => {
    if (event.data?.targetControllerId && role === "controller" && event.data.targetControllerId !== participantId) return;
    const counterpartReady =
      (role === "host" && event.data?.type === "controller-ready") ||
      (role === "controller" && event.data?.type === "host-ready");
    if (counterpartReady) {
      broadcastReady.add(role === "host" ? event.data.controllerId : "host");
      if (role === "host" && event.data?.type === "controller-ready") {
        channel.postMessage({ type: "host-ready", role, targetControllerId: event.data.controllerId });
      }
    }
    onMessage({ ...event.data, transport: "same-device" });
  });
  try {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}?role=${role}`);
    socket.addEventListener("open", () => {
      socketReady = true;
      const ready = { type: role === "controller" ? "controller-ready" : "host-ready", role, controllerId: participantId };
      socket.send(JSON.stringify(ready));
      channel?.postMessage(ready);
      while (pendingSocketMessages.length) socket.send(JSON.stringify(pendingSocketMessages.shift()));
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
      const payload = { ...message, role, controllerId: role === "controller" ? participantId : message.controllerId, at: Date.now() };
      channel?.postMessage(payload);
      const isLocalMessage = message.type === "swing" || message.type === "pin-contact";
      let delivered = false;
      if (isLocalMessage) {
        if (role === "controller") {
          const entry = peers.get("host");
          if (entry?.ready) { entry.channel.send(JSON.stringify(payload)); delivered = true; }
        } else {
          for (const [controllerId, entry] of peers) {
            if (message.targetControllerId && message.targetControllerId !== controllerId) continue;
            if (entry.ready) { entry.channel.send(JSON.stringify(payload)); delivered = true; }
          }
        }
      } else {
        sendSocket(payload);
        delivered = true;
      }
      return delivered || broadcastReady.size > 0;
    },
    close() {
      closed = true;
      channel?.close();
      for (const entry of peers.values()) {
        entry.channel?.close();
        entry.peer?.close();
      }
      socket?.close();
    },
    get closed() { return closed; },
    get localInputReady() { return [...peers.values()].some((entry) => entry.ready) || broadcastReady.size > 0; },
    participantId,
  };
}

function renderPhoneController(code, requestedMode = "motion") {
  document.body.classList.add("controller-body");
  app.innerHTML = `
    <section class="phone-controller pairing-gate">
      <header><span class="zone-mark"><i>SB</i><b>ROOM ${code}</b></span></header>
      <main>
        <span class="eyebrow">MOTION CONTROLLER</span><h1>GYROSCOPE<br><em>REQUIRED.</em></h1><p>The accelerometer measures your swing. The gyroscope measures wrist rotation and hook. Both must be present before this phone can pair.</p>
        <button class="enable-motion" id="verify-motion"><b>CHECK GYROSCOPE & PAIR</b><small>Required for TV Mode and Family Mode</small></button>
        <div class="sensor-requirements"><span><b>ACCELEROMETER</b><small>Swing speed and direction</small></span><span><b>GYROSCOPE</b><small>Wrist rotation and hook</small></span></div>
      </main>
      <footer><small id="controller-status" aria-live="polite">Pairing has not started.</small></footer>
    </section>`;

  document.querySelector("#verify-motion")?.addEventListener("click", async () => {
    const button = document.querySelector("#verify-motion");
    const status = document.querySelector("#controller-status");
    button.disabled = true;
    button.innerHTML = "<b>CHECKING SENSORS…</b><small>Move the phone gently</small>";
    const verified = await requestRequiredMotionSensors();
    if (!verified) {
      app.innerHTML = `<section class="phone-controller pairing-refused"><main><span class="eyebrow">PAIRING REFUSED</span><h1>GYROSCOPE<br><em>NOT FOUND.</em></h1><p>This phone cannot measure wrist rotation, so it cannot produce hook. TV Mode and Family Mode require a phone with both a gyroscope and accelerometer.</p><a href="${window.location.pathname}">BACK TO SPORT BOWLING</a></main></section>`;
      return;
    }
    if (status) status.textContent = "Sensors verified. Connecting to the big screen.";
    startVerifiedController(code, requestedMode);
  });
}

function startVerifiedController(code, requestedMode) {
  const controllerId = makeControllerId();
  let transport;
  let paired = false;
  let armed = false;
  let lastSwing = 0;
  let peakAcceleration = 0;
  let peakRotation = 0;
  let lateralAcceleration = 0;
  let remotePosition = 20;
  let remoteAngle = 20;
  const deviceName = navigator.userAgentData?.platform ? `${navigator.userAgentData.platform} phone` : "Motion phone";

  app.innerHTML = `<section class="phone-motion-pad"><button id="hold-swing" class="controller-hold-zone" aria-describedby="controller-status"><i aria-hidden="true">●</i><b>HOLD HERE</b><span>SWING · RELEASE</span><small id="pad-state">PAIRING WITH ROOM ${code}</small></button><span id="controller-status" class="sr-only" aria-live="polite">Pairing with the big screen.</span></section>`;
  const holdZone = document.querySelector("#hold-swing");
  const status = document.querySelector("#controller-status");
  const padState = document.querySelector("#pad-state");

  const setPadState = (message) => {
    if (status) status.textContent = message;
    if (padState) padState.textContent = message;
  };

  const onMotion = (event) => {
    if (!armed) return;
    const acceleration = event.accelerationIncludingGravity || event.acceleration;
    const rotation = event.rotationRate;
    if (!acceleration || !rotation) return;
    const magnitude = Math.hypot(acceleration.x || 0, acceleration.y || 0, acceleration.z || 0);
    peakAcceleration = Math.max(peakAcceleration, magnitude);
    if (Math.abs(rotation.gamma || 0) > Math.abs(peakRotation)) peakRotation = rotation.gamma || 0;
    if (Math.abs(acceleration.x || 0) > Math.abs(lateralAcceleration)) lateralAcceleration = acceleration.x || 0;
  };
  window.addEventListener("devicemotion", onMotion, { passive: true });

  transport = createRoomTransport(code, "controller", (message) => {
    if (message.targetControllerId && message.targetControllerId !== controllerId) return;
    if (message.type === "connected" || message.type === "host-ready" || message.type === "local-input-ready") {
      transport.send({ type: "pair-request", controllerId, deviceName, gyro: true, requestedMode });
      setPadState("WAITING FOR BIG SCREEN");
    }
    if (message.type === "pair-accepted") {
      paired = true;
      setPadState("READY · LOOK AT THE BIG SCREEN");
      navigator.vibrate?.(25);
    }
    if (message.type === "aim-state" || message.type === "turn-state") {
      remotePosition = clamp(Number(message.position) || remotePosition, 1, 39);
      remoteAngle = clamp(Number(message.angle) || remoteAngle, 1, 39);
    }
    if (message.type === "assignment") setPadState(message.player === -1 ? "SHARED PHONE · READY" : `ASSIGNED TO PLAYER ${Number(message.player) + 1}`);
    if (message.type === "turn-denied") setPadState(`PLAYER ${Number(message.player) + 1}'S TURN`);
    if (message.type === "local-input-closed") setPadState("LOCAL LINK PAUSED");
    if (message.type === "pin-contact") navigator.vibrate?.(45);
  }, controllerId);
  transport.send({ type: "pair-request", controllerId, deviceName, gyro: true, requestedMode });

  holdZone?.addEventListener("pointerdown", (event) => {
    if (!paired) {
      setPadState("WAITING FOR BIG SCREEN");
      return;
    }
    armed = true;
    peakAcceleration = 0;
    peakRotation = 0;
    lateralAcceleration = 0;
    holdZone.setPointerCapture?.(event.pointerId);
    holdZone.classList.add("holding");
    setPadState("ARMED · SWING NOW");
  });

  holdZone?.addEventListener("pointerup", () => {
    if (!armed || Date.now() - lastSwing < 700) return;
    armed = false;
    holdZone.classList.remove("holding");
    const input = motionThrow({ peakAcceleration, peakRotation, lateralAcceleration, position: remotePosition, angle: remoteAngle });
    if (!input) {
      setPadState("SWING NEEDED · TRY AGAIN");
      return;
    }
    lastSwing = Date.now();
    const delivered = transport.send({ type: "swing", ...input, releasedAt: Date.now() });
    if (!delivered) {
      setPadState("LOCAL LINK NOT READY");
      return;
    }
    navigator.vibrate?.(28);
    holdZone.classList.add("released");
    setTimeout(() => holdZone.classList.remove("released"), 260);
    setPadState("RELEASED · WATCH THE PINS");
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
