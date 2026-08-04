export function upsertPairedController(controllers, message, purpose) {
  const existing = controllers.find((controller) => controller.id === message.controllerId);
  if (existing) {
    existing.name = message.deviceName || existing.name;
    existing.local = message.transport === "same-device" || message.transport === "peer" || existing.local;
    return existing;
  }
  const controller = {
    id: message.controllerId,
    name: message.deviceName || `Phone ${controllers.length + 1}`,
    player: purpose === "family" ? -1 : 0,
    local: message.transport === "same-device" || message.transport === "peer",
  };
  controllers.push(controller);
  return controller;
}

export function canControllerThrow(controllers, controllerId, purpose, currentPlayer) {
  const controller = controllers.find((item) => item.id === controllerId);
  if (!controller) return false;
  if (purpose !== "family") return true;
  return controller.player === -1 || controller.player === currentPlayer;
}

export function normalizeAssignments(controllers, playerCount) {
  for (const controller of controllers) {
    if (controller.player >= playerCount) controller.player = -1;
  }
  return controllers;
}
