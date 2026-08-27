// Bun WebSocket relay server
// bun run server/ws.ts (optional: --hot for reload)
const PORT = Number(process.env.WS_PORT ?? 3001);

const server = Bun.serve<{ topic: string }>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { topic: url.searchParams.get("topic") ?? "posture" } })) return;
      return new Response("upgrade failed", { status: 400 });
    }
    return new Response("ok");
  },
  websocket: {
    open(ws) {
      ws.subscribe(ws.data.topic);
      ws.send(JSON.stringify({ type: 'welcome', topic: ws.data.topic, online: server.subscriberCount(ws.data.topic) }));
      console.log(`client joined "${ws.data.topic}"`);
    },
    message(ws, message) {
      // broadcast to everyone else on the topic (e.g. landmarks from phone)
      server.publish(ws.data.topic, message);
    },
    close(ws) {
      console.log(`client left "${ws.data.topic}"`);
    },
  },
});

console.log(`ws relay on ws://localhost:${server.port}/ws?topic=posture`);
