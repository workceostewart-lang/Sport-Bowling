export function throwFromPointerPath(points, { width = 320, height = 320, assist = true } = {}) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const start = points[0];
  const release = points.at(-1);
  const pivot = points.reduce((lowest, point) => point.y > lowest.y ? point : lowest, start);
  const forwardDistance = pivot.y - release.y;
  const directForward = start.y - release.y;
  const usableForward = Math.max(forwardDistance, directForward);
  if (usableForward < Math.max(28, height * 0.08)) return null;

  const releaseWindow = points.filter((point) => point.at >= release.at - 140);
  const velocityStart = releaseWindow[0] ?? pivot;
  const durationMs = Math.max(55, release.at - velocityStart.at);
  const releaseDistance = Math.max(usableForward, velocityStart.y - release.y);
  const lateralDistance = release.x - pivot.x;
  const distanceSignal = clamp(usableForward / Math.max(160, height * 0.72), 0, 1);
  const velocitySignal = clamp((releaseDistance / durationMs) / 2.8, 0, 1);
  const speed = clamp(0.24 + distanceSignal * 0.44 + velocitySignal * 0.48, assist ? 0.42 : 0.25, 1);
  const rotation = clamp(lateralDistance / Math.max(90, width * 0.28), -1, 1);

  return { speed, rotation };
}

export function motionThrow({ peakAcceleration = 0, peakRotation = 0, assist = true } = {}) {
  const speed = clamp((peakAcceleration - 10) / 19, assist ? 0.42 : 0.25, 1);
  const rotation = clamp(peakRotation / 220, -1, 1);
  return { speed, rotation };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
