export function throwFromPointerPath(points, {
  width = 320,
  height = 320,
  position = 20,
  angle = 20,
} = {}) {
  if (!Array.isArray(points) || points.length < 3) return null;
  const start = points[0];
  const release = points.at(-1);
  const pivotIndex = points.reduce((lowestIndex, point, index) => point.y > points[lowestIndex].y ? index : lowestIndex, 0);
  const pivot = points[pivotIndex];
  const forwardPoints = points.slice(pivotIndex);
  if (forwardPoints.length < 2) return null;

  const forwardDistance = pivot.y - release.y;
  const directForward = start.y - release.y;
  const usableForward = Math.max(forwardDistance, directForward);
  if (usableForward < Math.max(34, height * 0.1)) return null;

  const releaseWindow = forwardPoints.filter((point) => point.at >= release.at - 80);
  const velocityStart = releaseWindow[0] ?? pivot;
  const durationMs = Math.max(45, release.at - velocityStart.at);
  const releaseDistance = Math.max(1, velocityStart.y - release.y);
  const distanceSignal = clamp(usableForward / Math.max(180, height * 0.78), 0, 1);
  const velocitySignal = clamp((releaseDistance / durationMs) / 3.2, 0, 1);
  const speed = clamp(distanceSignal * 0.42 + velocitySignal * 0.58, 0, 1);

  const overallSlope = (release.x - pivot.x) / Math.max(usableForward, 1);
  const releaseSlope = (release.x - velocityStart.x) / releaseDistance;
  const directionBoards = Math.round(clamp(overallSlope / 0.62, -1, 1) * 7);
  const rotation = clamp((releaseSlope - overallSlope) / 0.52, -1, 1);

  return {
    position: clamp(Math.round(position), 1, 39),
    angle: clamp(Math.round(angle + directionBoards), 1, 39),
    speed,
    rotation,
  };
}

export function motionThrow({
  peakAcceleration = 0,
  peakRotation = 0,
  lateralAcceleration = 0,
  position = 20,
  angle = 20,
} = {}) {
  // A stationary phone reads roughly one gravity. Requiring force above that
  // prevents a press-and-release from becoming a throw.
  if (!Number.isFinite(peakAcceleration) || peakAcceleration < 12) return null;
  const speed = clamp((peakAcceleration - 9.82) / 22, 0, 1);
  const directionBoards = Math.round(clamp(lateralAcceleration / 7.5, -1, 1) * 7);
  const rotation = clamp(peakRotation / 220, -1, 1);
  return {
    position: clamp(Math.round(position), 1, 39),
    angle: clamp(Math.round(angle + directionBoards), 1, 39),
    speed,
    rotation,
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
