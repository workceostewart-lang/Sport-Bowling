import * as THREE from "three";
import * as CANNON from "cannon-es";

const LANE_WIDTH = 1.054;
const HEAD_PIN_Z = -18.29;
const BALL_RADIUS = 0.108;
const PIN_SPACING = 0.3048;
const FIXED_STEP = 1 / 120;

const COLORS = {
  black: 0x08080c,
  blue: 0x1b6cf2,
  gold: 0xd4af37,
  red: 0xd7263d,
  orange: 0xff7a1a,
  silver: 0xc7cdd3,
  wood: 0xc8904d,
};

export class BowlingScene {
  constructor({ onRollComplete } = {}) {
    this.onRollComplete = onRollComplete;
    this.container = null;
    this.rolling = false;
    this.paused = false;
    this.hook = 0;
    this.rollStartedAt = 0;
    this.settleStartedAt = 0;
    this.rollStandingBefore = 10;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.startBoard = 20;
    this.aimBoard = 20;
    this.bumpersEnabled = false;
    this.bumperMeshes = [];

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.black);
    this.scene.fog = new THREE.FogExp2(COLORS.black, 0.035);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.05, 80);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.className = "bowling-canvas";
    this.renderer.domElement.setAttribute("aria-label", "A regulation bowling lane with a blue ball and ten pins");

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.laneMaterial = new CANNON.Material("lane");
    this.ballMaterial = new CANNON.Material("ball");
    this.pinMaterial = new CANNON.Material("pin");
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.laneMaterial, {
      friction: 0.055,
      restitution: 0.08,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.pinMaterial, {
      friction: 0.2,
      restitution: 0.34,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.pinMaterial, this.laneMaterial, {
      friction: 0.23,
      restitution: 0.18,
    }));

    this.pinPairs = [];
    this.trail = [];
    this.clockFrame = 0;
    this.buildEnvironment();
    this.createBall();
    this.createRack();
    this.createAimGuide();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x170d18, 2.2);
    this.scene.add(hemi);

    const deckLight = new THREE.SpotLight(0xffffff, 85, 38, Math.PI / 7, 0.55, 1.2);
    deckLight.position.set(0, 6, -14);
    deckLight.target.position.set(0, 0, HEAD_PIN_Z);
    this.scene.add(deckLight, deckLight.target);

    const rim = new THREE.PointLight(COLORS.blue, 28, 18, 1.5);
    rim.position.set(-3, 2, -13);
    this.scene.add(rim);
    const warm = new THREE.PointLight(COLORS.orange, 20, 15, 1.5);
    warm.position.set(2.5, 1.2, 1.5);
    this.scene.add(warm);

    const laneGeometry = new THREE.BoxGeometry(LANE_WIDTH, 0.12, 22.5);
    const laneMesh = new THREE.Mesh(
      laneGeometry,
      new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.34, metalness: 0.05 }),
    );
    laneMesh.position.set(0, -0.06, -8.9);
    this.scene.add(laneMesh);

    const laneBody = new CANNON.Body({ mass: 0, material: this.laneMaterial });
    laneBody.addShape(new CANNON.Box(new CANNON.Vec3(LANE_WIDTH / 2, 0.06, 11.25)));
    laneBody.position.set(0, -0.06, -8.9);
    this.world.addBody(laneBody);

    const boardMaterial = new THREE.MeshBasicMaterial({ color: 0xf2c57f, transparent: true, opacity: 0.34 });
    for (let board = 1; board < 39; board += 1) {
      const x = -LANE_WIDTH / 2 + (LANE_WIDTH / 39) * board;
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.0014, 0.002, 21.8), boardMaterial);
      line.position.set(x, 0.003, -8.6);
      this.scene.add(line);
    }

    const gutterMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1b21, metalness: 0.68, roughness: 0.25 });
    for (const side of [-1, 1]) {
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 22.5), gutterMaterial);
      gutter.position.set(side * (LANE_WIDTH / 2 + 0.13), -0.1, -8.9);
      this.scene.add(gutter);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 22.5), gutterMaterial);
      rail.position.set(side * (LANE_WIDTH / 2 + 0.28), -0.02, -8.9);
      this.scene.add(rail);

      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.07, 18.4),
        new THREE.MeshStandardMaterial({
          color: 0x17b978,
          emissive: 0x075734,
          emissiveIntensity: 1.4,
          metalness: 0.45,
          roughness: 0.3,
        }),
      );
      bumper.position.set(side * (LANE_WIDTH / 2 - 0.012), 0.045, -9.05);
      bumper.visible = false;
      this.bumpersEnabled = false;
      this.bumperMeshes.push(bumper);
      this.scene.add(bumper);
    }

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 3.5, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x11121a, roughness: 0.8 }),
    );
    backWall.position.set(0, 1.4, -20.6);
    this.scene.add(backWall);

    const header = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.38, 0.12),
      new THREE.MeshStandardMaterial({ color: COLORS.blue, emissive: 0x0d3270, emissiveIntensity: 1.2 }),
    );
    header.position.set(0, 1.75, -20.45);
    this.scene.add(header);

    this.addLaneMarkers();
  }

  addLaneMarkers() {
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x2b2522 });
    for (const z of [-3.65, -6.1]) {
      for (const board of [5, 10, 15, 20, 25, 30, 35]) {
        const x = ((board - 20) / 39) * LANE_WIDTH;
        const marker = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.08, 3), markerMaterial);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(x, 0.008, z);
        this.scene.add(marker);
      }
    }

    const foul = new THREE.Mesh(
      new THREE.BoxGeometry(LANE_WIDTH + 0.04, 0.012, 0.07),
      new THREE.MeshBasicMaterial({ color: 0x242630 }),
    );
    foul.position.set(0, 0.012, 0);
    this.scene.add(foul);
  }

  createBall() {
    this.ballBody = new CANNON.Body({ mass: 6.35, material: this.ballMaterial, linearDamping: 0.035, angularDamping: 0.04 });
    this.ballBody.addShape(new CANNON.Sphere(BALL_RADIUS));
    this.world.addBody(this.ballBody);

    const ballMaterial = new THREE.MeshPhysicalMaterial({
      color: COLORS.blue,
      roughness: 0.18,
      metalness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.09,
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 40, 24), ballMaterial);
    this.scene.add(this.ballMesh);

    const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x050509 });
    for (const offset of [[-0.032, 0.092, 0.025], [0.028, 0.096, 0.018], [0.002, 0.102, -0.03]]) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), holeMaterial);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(...offset);
      this.ballMesh.add(hole);
    }

    const trailGeometry = new THREE.SphereGeometry(0.035, 8, 6);
    for (let index = 0; index < 18; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 3 === 0 ? COLORS.gold : COLORS.orange,
        transparent: true,
        opacity: Math.max(0.04, 0.42 - index * 0.021),
      });
      const ember = new THREE.Mesh(trailGeometry, material);
      ember.visible = false;
      this.trail.push(ember);
      this.scene.add(ember);
    }
    this.resetBall();
  }

  createRack() {
    this.clearPins();
    const rowStep = Math.sqrt(3) * PIN_SPACING / 2;
    const layout = [];
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column <= row; column += 1) {
        layout.push({
          x: (column - row / 2) * PIN_SPACING,
          z: HEAD_PIN_Z - row * rowStep,
        });
      }
    }

    for (const [index, point] of layout.entries()) {
      const body = this.createPinBody(point.x, point.z);
      const mesh = this.createPinMesh(index + 1);
      this.world.addBody(body);
      this.scene.add(mesh);
      this.pinPairs.push({ body, mesh, number: index + 1 });
    }
  }

  createPinBody(x, z) {
    const body = new CANNON.Body({
      mass: 1.58,
      material: this.pinMaterial,
      linearDamping: 0.2,
      angularDamping: 0.36,
      sleepSpeedLimit: 0.08,
      sleepTimeLimit: 0.75,
    });
    body.addShape(new CANNON.Sphere(0.073), new CANNON.Vec3(0, -0.1, 0));
    body.addShape(new CANNON.Sphere(0.055), new CANNON.Vec3(0, 0.025, 0));
    body.addShape(new CANNON.Sphere(0.043), new CANNON.Vec3(0, 0.15, 0));
    body.position.set(x, 0.178, z);
    return body;
  }

  createPinMesh(number) {
    const profile = [
      [0.046, -0.178], [0.064, -0.155], [0.073, -0.1], [0.066, -0.035],
      [0.045, 0.035], [0.035, 0.09], [0.044, 0.135], [0.041, 0.173],
      [0.025, 0.202], [0, 0.212],
    ].map(([radius, y]) => new THREE.Vector2(radius, y));
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 24),
      new THREE.MeshPhysicalMaterial({ color: 0xf4f3ee, roughness: 0.24, clearcoat: 0.82 }),
    );
    group.add(body);
    for (const y of [0.105, 0.125]) {
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(0.039, 0.007, 6, 24),
        new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.38 }),
      );
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = y;
      group.add(stripe);
    }
    group.userData.pinNumber = number;
    return group;
  }

  clearPins() {
    for (const { body, mesh } of this.pinPairs) {
      this.world.removeBody(body);
      this.scene.remove(mesh);
      mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    this.pinPairs = [];
  }

  mount(container, mode = "game") {
    this.container = container;
    this.mode = mode;
    if (this.renderer.domElement.parentElement !== container) container.appendChild(this.renderer.domElement);
    this.resize();
  }

  resize() {
    if (!this.container) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    this.camera.aspect = aspect;
    if (aspect < 0.82) {
      this.camera.fov = 48;
      this.camera.position.set(0, 4.5, 8.2);
      this.camera.lookAt(0, -0.15, -10.3);
    } else if (this.mode === "menu") {
      this.camera.fov = 46;
      this.camera.position.set(2.4, 3.1, 6.2);
      this.camera.lookAt(0, -0.05, -10.2);
    } else {
      this.camera.fov = 47;
      this.camera.position.set(1.75, 3.3, 6.6);
      this.camera.lookAt(0, -0.05, -10.5);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, aspect < 0.82 ? 1.45 : 1.8));
    this.renderer.setSize(width, height, false);
  }

  setPosition(board) {
    this.startBoard = Math.max(1, Math.min(39, board));
    if (!this.rolling) this.resetBall();
    this.updateAimGuide();
  }

  setAim(board) {
    this.aimBoard = Math.max(1, Math.min(39, board));
    this.updateAimGuide();
  }

  boardToX(board) {
    return ((board - 20) / 38) * (LANE_WIDTH * 0.82);
  }

  roll({ power = 0.72, spin = 0, aim = this.aimBoard } = {}) {
    if (this.rolling) return false;
    this.setAim(aim);
    const startX = this.boardToX(this.startBoard);
    const targetX = this.boardToX(this.aimBoard);
    const velocity = 9.5 + Math.max(0.15, Math.min(1, power)) * 11.5;
    const line = Math.max(-0.9, Math.min(0.9, (targetX - startX) * 0.8));
    this.ballBody.wakeUp();
    this.ballBody.velocity.set(line, 0, -velocity);
    this.ballBody.angularVelocity.set(-velocity / BALL_RADIUS, 0, -spin * 16);
    this.hook = Math.max(-1, Math.min(1, spin));
    this.rolling = true;
    this.rollStartedAt = performance.now();
    this.settleStartedAt = 0;
    this.rollStandingBefore = this.countStandingPins();
    this.aimLine.visible = false;
    for (const ember of this.trail) ember.visible = true;
    return true;
  }

  countStandingPins() {
    const up = new CANNON.Vec3(0, 1, 0);
    return this.pinPairs.filter(({ body }) => {
      const pinUp = body.quaternion.vmult(up);
      return body.position.y > 0.13 && pinUp.y > 0.68 && body.position.z > -20.8;
    }).length;
  }

  prepareNextBall({ fullRack = false } = {}) {
    if (fullRack) {
      this.createRack();
    } else {
      for (const pair of [...this.pinPairs]) {
        const up = pair.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
        const standing = pair.body.position.y > 0.13 && up.y > 0.68 && pair.body.position.z > -20.8;
        if (!standing) {
          this.world.removeBody(pair.body);
          this.scene.remove(pair.mesh);
          this.pinPairs.splice(this.pinPairs.indexOf(pair), 1);
        } else {
          pair.body.velocity.setZero();
          pair.body.angularVelocity.setZero();
          pair.body.sleep();
        }
      }
    }
    this.resetBall();
    this.rolling = false;
    this.settleStartedAt = 0;
    this.aimLine.visible = true;
  }

  resetBall() {
    const x = this.boardToX(this.startBoard);
    this.ballBody.position.set(x, BALL_RADIUS + 0.008, 0.78);
    this.ballBody.velocity.setZero();
    this.ballBody.angularVelocity.setZero();
    this.ballBody.quaternion.set(0, 0, 0, 1);
    this.ballBody.sleep();
    this.syncBody(this.ballBody, this.ballMesh);
    for (const ember of this.trail) ember.visible = false;
  }

  createAimGuide() {
    this.aimGeometry = new THREE.BufferGeometry();
    this.aimGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(18 * 3), 3));
    this.aimLine = new THREE.Line(
      this.aimGeometry,
      new THREE.LineBasicMaterial({ color: COLORS.gold, transparent: true, opacity: 0.82 }),
    );
    this.scene.add(this.aimLine);
    this.updateAimGuide();
  }

  updateAimGuide() {
    if (!this.aimGeometry) return;
    const positions = this.aimGeometry.attributes.position.array;
    const startX = this.boardToX(this.startBoard);
    const targetX = this.boardToX(this.aimBoard);
    for (let index = 0; index < 18; index += 1) {
      const progress = index / 17;
      const hookCurve = Math.pow(progress, 3) * (targetX - startX) * 0.45;
      positions[index * 3] = THREE.MathUtils.lerp(startX, targetX, progress) + hookCurve;
      positions[index * 3 + 1] = 0.018;
      positions[index * 3 + 2] = THREE.MathUtils.lerp(2.25, HEAD_PIN_Z, progress);
    }
    this.aimGeometry.attributes.position.needsUpdate = true;
  }

  setPaused(paused) {
    this.paused = paused;
  }

  setReducedEffects(reduced) {
    this.reducedEffects = reduced;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reduced ? 1 : 1.7));
    for (const [index, ember] of this.trail.entries()) ember.visible = !reduced && this.rolling && index < 12;
  }

  setFamilyMode(enabled) {
    this.bumpersEnabled = Boolean(enabled);
    for (const bumper of this.bumperMeshes) bumper.visible = this.bumpersEnabled;
  }

  animate(time) {
    requestAnimationFrame(this.animate);
    if (!this.container || !this.container.isConnected) return;
    const delta = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;

    if (!this.paused) {
      this.accumulator += delta;
      while (this.accumulator >= FIXED_STEP) {
        if (
          this.rolling &&
          this.bumpersEnabled &&
          this.ballBody.position.z < -0.05 &&
          this.ballBody.position.z > -18.45 &&
          Math.abs(this.ballBody.position.x) > LANE_WIDTH / 2 - BALL_RADIUS * 0.72
        ) {
          const side = Math.sign(this.ballBody.position.x) || 1;
          this.ballBody.position.x = side * (LANE_WIDTH / 2 - BALL_RADIUS * 0.76);
          this.ballBody.velocity.x = -side * Math.max(0.45, Math.abs(this.ballBody.velocity.x) * 0.42);
        }
        if (this.rolling && this.ballBody.position.z < -7.4 && this.ballBody.position.z > -17.8) {
          const hookGain = THREE.MathUtils.clamp((-this.ballBody.position.z - 7.4) / 10.4, 0, 1);
          this.ballBody.applyForce(new CANNON.Vec3(this.hook * hookGain * 4.8, 0, 0));
        }
        this.world.step(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
      }
      this.checkRoll(time);
    }

    this.syncBody(this.ballBody, this.ballMesh);
    for (const { body, mesh } of this.pinPairs) this.syncBody(body, mesh);
    this.updateTrail();
    this.renderer.render(this.scene, this.camera);
  }

  updateTrail() {
    if (!this.rolling || this.reducedEffects) return;
    this.clockFrame += 1;
    if (this.clockFrame % 2 !== 0) return;
    for (let index = this.trail.length - 1; index > 0; index -= 1) {
      this.trail[index].position.copy(this.trail[index - 1].position);
    }
    this.trail[0].position.copy(this.ballMesh.position);
    this.trail[0].position.y = 0.06;
  }

  checkRoll(time) {
    if (!this.rolling) return;
    const elapsed = time - this.rollStartedAt;
    const reachedPins = this.ballBody.position.z < -19.3 || elapsed > 5100;
    if (reachedPins && !this.settleStartedAt) this.settleStartedAt = time;
    if (this.settleStartedAt && time - this.settleStartedAt > 1850) {
      const standing = this.countStandingPins();
      const knocked = Math.max(0, this.rollStandingBefore - standing);
      this.rolling = false;
      this.onRollComplete?.({ knocked, standing, speed: this.ballBody.velocity.length() });
    }
  }

  syncBody(body, mesh) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}
