import * as THREE from "three";
import * as CANNON from "cannon-es";

const LANE_WIDTH = 1.054;
const HEAD_PIN_Z = -18.29;
const BALL_RADIUS = 0.108;
const PIN_SPACING = 0.3048;
const FIXED_STEP = 1 / 120;
const LANE_FRICTION = 0.055;

const COLORS = {
  black: 0x10120d,
  blue: 0x1b6cf2,
  gold: 0xd4af37,
  red: 0xd7263d,
  orange: 0xff7a1a,
  silver: 0xc7cdd3,
  lane: 0xd9d64f,
  gutter: 0xb5b744,
  environment: 0xf2efb5,
};

export class BowlingScene {
  constructor({ onRollComplete, onPinImpact } = {}) {
    this.onRollComplete = onRollComplete;
    this.onPinImpact = onPinImpact;
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
    this.impactCameraTriggered = false;
    this.cameraCutUntil = 0;
    this.baseCameraPosition = new THREE.Vector3();
    this.baseCameraTarget = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.environment);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.05, 80);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.domElement.className = "bowling-canvas";
    this.renderer.domElement.setAttribute("aria-label", "A regulation bowling lane with a blue ball and ten pins");

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.allowSleep = true;
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.laneMaterial = new CANNON.Material("lane");
    this.ballMaterial = new CANNON.Material("ball");
    this.pinMaterial = new CANNON.Material("pin");
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.laneMaterial, {
      friction: LANE_FRICTION,
      restitution: 0.08,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.ballMaterial, this.pinMaterial, {
      friction: 0.2,
      restitution: 0.44,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.pinMaterial, this.laneMaterial, {
      friction: 0.23,
      restitution: 0.22,
    }));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.pinMaterial, this.pinMaterial, {
      friction: 0.16,
      restitution: 0.42,
    }));

    this.pinPairs = [];
    this.trailPoints = Array.from({ length: 18 }, () => new THREE.Vector3());
    this.trailRibbons = [];
    this.clockFrame = 0;
    this.buildEnvironment();
    this.createBall();
    this.createRack();
    this.createAimGuide();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildEnvironment() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 3));

    const laneGeometry = new THREE.BoxGeometry(LANE_WIDTH, 0.12, 22.5);
    const laneMesh = new THREE.Mesh(
      laneGeometry,
      new THREE.MeshBasicMaterial({ color: COLORS.lane }),
    );
    laneMesh.position.set(0, -0.06, -8.9);
    this.scene.add(laneMesh);

    const laneBody = new CANNON.Body({ mass: 0, material: this.laneMaterial });
    laneBody.addShape(new CANNON.Box(new CANNON.Vec3(LANE_WIDTH / 2, 0.06, 11.25)));
    laneBody.position.set(0, -0.06, -8.9);
    this.world.addBody(laneBody);

    const boardMaterial = new THREE.MeshBasicMaterial({ color: 0xb9b73e });
    for (let board = 1; board < 39; board += 1) {
      const x = -LANE_WIDTH / 2 + (LANE_WIDTH / 39) * board;
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.0014, 0.002, 21.8), boardMaterial);
      line.position.set(x, 0.003, -8.6);
      this.scene.add(line);
    }

    const gutterMaterial = new THREE.MeshBasicMaterial({ color: COLORS.gutter });
    for (const side of [-1, 1]) {
      const gutter = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 22.5), gutterMaterial);
      gutter.position.set(side * (LANE_WIDTH / 2 + 0.13), -0.1, -8.9);
      this.scene.add(gutter);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 22.5), gutterMaterial);
      rail.position.set(side * (LANE_WIDTH / 2 + 0.28), -0.02, -8.9);
      this.scene.add(rail);

      const gutterBody = new CANNON.Body({ mass: 0, material: this.laneMaterial });
      gutterBody.addShape(new CANNON.Box(new CANNON.Vec3(0.125, 0.04, 11.25)));
      gutterBody.position.set(side * (LANE_WIDTH / 2 + 0.13), -0.1, -8.9);
      this.world.addBody(gutterBody);

      const railBody = new CANNON.Body({ mass: 0, material: this.laneMaterial });
      railBody.addShape(new CANNON.Box(new CANNON.Vec3(0.028, 0.18, 11.25)));
      railBody.position.set(side * (LANE_WIDTH / 2 + 0.28), 0.05, -8.9);
      this.world.addBody(railBody);

    }

    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(4.6, 3.5, 0.2),
      new THREE.MeshBasicMaterial({ color: COLORS.environment }),
    );
    backWall.position.set(0, 1.4, -20.6);
    this.scene.add(backWall);

    const header = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.38, 0.12),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    header.position.set(0, 1.75, -20.45);
    this.scene.add(header);

    const rearBody = new CANNON.Body({ mass: 0, material: this.laneMaterial });
    rearBody.addShape(new CANNON.Box(new CANNON.Vec3(2.3, 1.75, 0.1)));
    rearBody.position.copy(backWall.position);
    this.world.addBody(rearBody);

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

    const sphereGeometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 20);
    this.ballMesh = new THREE.Group();
    const outline = new THREE.Mesh(
      sphereGeometry,
      new THREE.MeshBasicMaterial({ color: COLORS.black, side: THREE.BackSide }),
    );
    outline.scale.setScalar(1.075);
    const fill = new THREE.Mesh(sphereGeometry, new THREE.MeshBasicMaterial({ color: COLORS.blue }));
    this.ballMesh.add(outline, fill);
    this.scene.add(this.ballMesh);

    const holeMaterial = new THREE.MeshBasicMaterial({ color: 0x050509 });
    for (const offset of [[-0.032, 0.092, 0.025], [0.028, 0.096, 0.018], [0.002, 0.102, -0.03]]) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), holeMaterial);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(...offset);
      this.ballMesh.add(hole);
    }

    this.ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(BALL_RADIUS * 1.08, 24),
      new THREE.MeshBasicMaterial({ color: COLORS.black, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = 0.006;
    this.scene.add(this.ballShadow);

    this.trailRibbons.push(
      this.createTrailRibbon(0.105, COLORS.black, 0.011),
      this.createTrailRibbon(0.068, COLORS.orange, 0.014),
      this.createTrailRibbon(0.028, 0xffd23f, 0.017),
    );
    this.resetBall();
  }

  createTrailRibbon(width, color, y) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(this.trailPoints.length * 2 * 3), 3));
    const indices = [];
    for (let index = 0; index < this.trailPoints.length - 1; index += 1) {
      const offset = index * 2;
      indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
    }
    geometry.setIndex(indices);
    const ribbon = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    ribbon.userData.width = width;
    ribbon.userData.y = y;
    ribbon.visible = false;
    ribbon.frustumCulled = false;
    this.scene.add(ribbon);
    return ribbon;
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
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.075, 20),
        new THREE.MeshBasicMaterial({ color: COLORS.black, transparent: true, opacity: 0.14, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(point.x, 0.006, point.z);
      this.world.addBody(body);
      this.scene.add(mesh, shadow);
      this.pinPairs.push({ body, mesh, shadow, number: index + 1 });
    }
  }

  createPinBody(x, z) {
    const body = new CANNON.Body({
      mass: 1.46,
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
    const geometry = new THREE.LatheGeometry(profile, 24);
    const outline = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: COLORS.black, side: THREE.BackSide }),
    );
    outline.scale.setScalar(1.065);
    const body = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    group.add(outline, body);
    for (const y of [0.105, 0.125]) {
      const stripeOutline = new THREE.Mesh(
        new THREE.TorusGeometry(0.039, 0.011, 6, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.black }),
      );
      const stripe = new THREE.Mesh(
        new THREE.TorusGeometry(0.039, 0.006, 6, 24),
        new THREE.MeshBasicMaterial({ color: COLORS.red }),
      );
      stripeOutline.rotation.x = stripe.rotation.x = Math.PI / 2;
      stripeOutline.position.y = stripe.position.y = y;
      group.add(stripeOutline, stripe);
    }
    group.userData.pinNumber = number;
    return group;
  }

  clearPins() {
    for (const { body, mesh, shadow } of this.pinPairs) {
      this.world.removeBody(body);
      this.scene.remove(mesh);
      this.scene.remove(shadow);
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
      this.camera.fov = 43;
      this.baseCameraPosition.set(0, 1.62, 5.35);
      this.baseCameraTarget.set(0, 0.08, -11.6);
    } else if (this.mode === "menu") {
      this.camera.fov = 44;
      this.baseCameraPosition.set(0.7, 1.52, 4.85);
      this.baseCameraTarget.set(0, 0.08, -11.1);
    } else {
      this.camera.fov = 44;
      this.baseCameraPosition.set(0, 1.42, 4.55);
      this.baseCameraTarget.set(0, 0.08, -11.25);
    }
    this.camera.position.copy(this.baseCameraPosition);
    this.camera.lookAt(this.baseCameraTarget);
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

  roll({ speed = 0.64, rotation = 0, angle = this.aimBoard } = {}) {
    if (this.rolling) return false;
    this.setAim(angle);
    const startX = this.boardToX(this.startBoard);
    const targetX = this.boardToX(this.aimBoard);
    const velocity = Math.max(0, Math.min(1, speed)) * 17.5;
    const line = Math.max(-0.9, Math.min(0.9, (targetX - startX) * 0.8));
    this.ballBody.wakeUp();
    this.ballBody.velocity.set(line, 0, -velocity);
    this.ballBody.angularVelocity.set(-velocity / BALL_RADIUS, 0, -rotation * 18);
    this.hook = Math.max(-1, Math.min(1, rotation));
    this.rolling = true;
    this.rollStartedAt = performance.now();
    this.settleStartedAt = 0;
    this.rollStandingBefore = this.countStandingPins();
    this.aimLine.visible = false;
    this.impactCameraTriggered = false;
    this.cameraCutUntil = 0;
    for (const ribbon of this.trailRibbons) ribbon.visible = !this.reducedEffects;
    return true;
  }

  countStandingPins() {
    return this.standingPinNumbers().length;
  }

  standingPinNumbers() {
    const up = new CANNON.Vec3(0, 1, 0);
    return this.pinPairs.filter(({ body }) => {
      const pinUp = body.quaternion.vmult(up);
      return body.position.y > 0.13 && pinUp.y > 0.68 && body.position.z > -20.8;
    }).map(({ number }) => number);
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
          this.scene.remove(pair.shadow);
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
    this.impactCameraTriggered = false;
    this.cameraCutUntil = 0;
  }

  resetBall() {
    const x = this.boardToX(this.startBoard);
    this.ballBody.position.set(x, BALL_RADIUS + 0.008, 0.78);
    this.ballBody.velocity.setZero();
    this.ballBody.angularVelocity.setZero();
    this.ballBody.quaternion.set(0, 0, 0, 1);
    this.ballBody.sleep();
    this.syncBody(this.ballBody, this.ballMesh);
    this.ballShadow.position.set(x, 0.006, 0.78);
    for (const point of this.trailPoints) point.set(x, 0.014, 0.78);
    for (const ribbon of this.trailRibbons) ribbon.visible = false;
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
    for (const ribbon of this.trailRibbons) ribbon.visible = !reduced && this.rolling;
  }

  animate(time) {
    requestAnimationFrame(this.animate);
    if (!this.container || !this.container.isConnected) return;
    const delta = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;

    if (!this.paused) {
      this.accumulator += delta;
      while (this.accumulator >= FIXED_STEP) {
        if (this.rolling && this.ballBody.position.z < -3 && this.ballBody.position.z > -18.4) {
          const traction = THREE.MathUtils.clamp((-this.ballBody.position.z - 3) / 15.4, 0.12, 1);
          const lateralRollSpeed = -this.ballBody.angularVelocity.z * BALL_RADIUS;
          const slip = lateralRollSpeed - this.ballBody.velocity.x;
          const forceX = slip * this.ballBody.mass * LANE_FRICTION * 54 * traction;
          this.ballBody.applyForce(new CANNON.Vec3(forceX, 0, 0));
          this.ballBody.torque.z += forceX * BALL_RADIUS;
        }
        this.world.step(FIXED_STEP);
        this.accumulator -= FIXED_STEP;
      }
      this.checkRoll(time);
    }

    this.syncBody(this.ballBody, this.ballMesh);
    for (const { body, mesh } of this.pinPairs) this.syncBody(body, mesh);
    this.updateTrail();
    this.updateContactShadows();
    this.updateCamera(time);
    this.renderer.render(this.scene, this.camera);
  }

  updateTrail() {
    if (!this.rolling || this.reducedEffects) return;
    this.clockFrame += 1;
    if (this.clockFrame % 2 !== 0) return;
    for (let index = this.trailPoints.length - 1; index > 0; index -= 1) {
      this.trailPoints[index].copy(this.trailPoints[index - 1]);
    }
    this.trailPoints[0].copy(this.ballMesh.position);
    this.trailPoints[0].y = 0.014;
    for (const ribbon of this.trailRibbons) {
      const positions = ribbon.geometry.attributes.position.array;
      const halfWidth = ribbon.userData.width / 2;
      for (let index = 0; index < this.trailPoints.length; index += 1) {
        const previous = this.trailPoints[Math.max(0, index - 1)];
        const next = this.trailPoints[Math.min(this.trailPoints.length - 1, index + 1)];
        const dx = next.x - previous.x;
        const dz = next.z - previous.z;
        const length = Math.hypot(dx, dz) || 1;
        const offsetX = (-dz / length) * halfWidth;
        const offsetZ = (dx / length) * halfWidth;
        positions[index * 6] = this.trailPoints[index].x + offsetX;
        positions[index * 6 + 1] = ribbon.userData.y;
        positions[index * 6 + 2] = this.trailPoints[index].z + offsetZ;
        positions[index * 6 + 3] = this.trailPoints[index].x - offsetX;
        positions[index * 6 + 4] = ribbon.userData.y;
        positions[index * 6 + 5] = this.trailPoints[index].z - offsetZ;
      }
      ribbon.geometry.attributes.position.needsUpdate = true;
    }
  }

  updateContactShadows() {
    this.ballShadow.position.x = this.ballBody.position.x;
    this.ballShadow.position.z = this.ballBody.position.z;
    this.ballShadow.material.opacity = THREE.MathUtils.clamp(0.2 - this.ballBody.position.y * 0.18, 0.03, 0.16);
    for (const { body, shadow } of this.pinPairs) {
      shadow.position.x = body.position.x;
      shadow.position.z = body.position.z;
      shadow.material.opacity = THREE.MathUtils.clamp(0.18 - body.position.y * 0.2, 0.025, 0.14);
    }
  }

  updateCamera(time) {
    const desiredPosition = this.baseCameraPosition.clone();
    const desiredTarget = this.baseCameraTarget.clone();
    if (this.rolling && !this.impactCameraTriggered) {
      const push = THREE.MathUtils.clamp((-this.ballBody.position.z - 12) / 5.2, 0, 1);
      desiredPosition.z -= push * 1.15;
      desiredPosition.y -= push * 0.1;
      if (this.ballBody.position.z < -17.25) {
        this.impactCameraTriggered = true;
        this.cameraCutUntil = time + 850;
        this.onPinImpact?.();
      }
    }
    if (this.cameraCutUntil > time) {
      const portrait = this.camera.aspect < 0.82;
      desiredPosition.set(portrait ? 1.1 : 2.05, portrait ? 0.95 : 1.08, -16.2);
      desiredTarget.set(0, 0.16, HEAD_PIN_Z - 0.35);
      this.camera.position.copy(desiredPosition);
    } else {
      this.camera.position.lerp(desiredPosition, 0.12);
    }
    this.camera.lookAt(desiredTarget);
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
      this.onRollComplete?.({ knocked, standing, standingPins: this.standingPinNumbers(), speed: this.ballBody.velocity.length() });
    }
  }

  syncBody(body, mesh) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
}
