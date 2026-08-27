// Bun WebSocket relay server
// bun run server/ws.ts (optional: --hot for reload)
const PORT = Number(process.env.WS_PORT ?? 3001);

function parse(msg: string | Buffer) {
  try { return JSON.parse(String(msg)); } catch { return null; }
}

const server = Bun.serve<{ topic: string }>({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { topic: url.searchParams.get("topic") ?? "demo" } })) return;
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
      const data = parse(message);
      if (!data) return;

      // app registration: get a unique id + private channel
      if (data.type === 'connect') {
        const uid = '123';
        ws.data.topic = uid;
        ws.subscribe(uid);
        ws.send(JSON.stringify({ type: 'registered', uid }));
        console.log(`registered ${uid}`);
        return;
      }

      // camera joins an existing uid channel
      if (data.type === 'join' && typeof data.uid === 'string' && /^\d{3}$/.test(data.uid)) {
        ws.data.topic = data.uid;
        ws.subscribe(data.uid);
        ws.send(JSON.stringify({ type: 'joined', uid: data.uid }));
        console.log(`client joined "${data.uid}"`);
        return;
      }

      // leave current topic channel
      if (data.type === 'leave') {
        console.log(`client left "${ws.data.topic}"`);
        ws.unsubscribe(ws.data.topic);
        ws.data.topic = 'demo';
        ws.subscribe('demo');
        ws.send(JSON.stringify({ type: 'left' }));
        return;
      }

      // broadcast to everyone else on the topic
      server.publish(ws.data.topic, message);
    },
    close(ws) {
      console.log(`client left "${ws.data.topic}"`);
    },
  },
});

console.log(`ws relay on ws://localhost:${server.port}/ws?topic=posture`);
