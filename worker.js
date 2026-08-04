export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})$/i);

    if (roomMatch) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
      }
      if (!env.ROOMS) {
        return Response.json(
          { error: "Phone controller rooms are unavailable on this preview host" },
          { status: 503 },
        );
      }
      const code = roomMatch[1].toUpperCase();
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      return room.fetch(request);
    }

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, game: "sport-bowling" });
    }

    if (!env.ASSETS) {
      return Response.json({ error: "Static asset binding unavailable" }, { status: 503 });
    }
    return env.ASSETS.fetch(request);
  },
};

export class BowlingRoom {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const url = new URL(request.url);
    const role = url.searchParams.get("role") === "controller" ? "controller" : "host";
    this.state.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role, joinedAt: Date.now() });
    this.broadcast({ type: `${role}-ready`, role }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    if (typeof message !== "string" || message.length > 20000) return;
    try {
      const parsed = JSON.parse(message);
      const attachment = socket.deserializeAttachment() ?? {};
      const safeMessage = {
        type: String(parsed.type ?? "message").slice(0, 32),
        position: numberBetween(parsed.position, 1, 39),
        angle: numberBetween(parsed.angle, 1, 39),
        speed: numberBetween(parsed.speed ?? parsed.power, 0.25, 1),
        rotation: numberBetween(parsed.rotation ?? parsed.spin, -1, 1),
        releasedAt: numberBetween(parsed.releasedAt, 0, Number.MAX_SAFE_INTEGER),
        signal: typeof parsed.signal === "string" ? parsed.signal.slice(0, 16000) : "",
        role: attachment.role ?? "guest",
        at: Date.now(),
      };
      this.broadcast(safeMessage, socket);
    } catch {
      socket.send(JSON.stringify({ type: "error", message: "Invalid room message" }));
    }
  }

  webSocketClose(socket) {
    const role = socket.deserializeAttachment()?.role ?? "guest";
    this.broadcast({ type: "disconnected", role }, socket);
  }

  webSocketError(socket) {
    try { socket.close(1011, "Room connection error"); } catch { /* socket already closed */ }
  }

  broadcast(message, except) {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === except) continue;
      try { socket.send(payload); } catch { /* stale peer */ }
    }
  }
}

function numberBetween(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : 0;
}
