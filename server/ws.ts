// Bun WebSocket relay server
// bun run server/ws.ts (optional: --hot for reload)
const PORT = Number(process.env.WS_PORT ?? 3001);

function parse(msg: string | Buffer) {
  try { return JSON.parse(String(msg)); } catch { return null; }
}

// uid -> number of connected apps, so cameras know whether signaling will be received
const appCount = new Map<string, number>();

const server = Bun.serve<{ topic: string; role?: 'app' | 'camera' }>({
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
        ws.data.role = 'app';
        ws.subscribe(uid);
        appCount.set(uid, (appCount.get(uid) ?? 0) + 1);
        ws.send(JSON.stringify({ type: 'registered', uid }));
        server.publish(uid, JSON.stringify({ type: 'app-here' })); // announce to any waiting cameras
        console.log(`registered ${uid}`);
        return;
      }

      // camera joins an existing uid channel
      if (data.type === 'join' && typeof data.uid === 'string' && /^\d{3}$/.test(data.uid)) {
        ws.data.topic = data.uid;
        ws.data.role = 'camera';
        ws.subscribe(data.uid);
        const appOnline = (appCount.get(data.uid) ?? 0) > 0;
        ws.send(JSON.stringify({ type: 'joined', uid: data.uid, appOnline }));
        console.log(`client joined "${data.uid}" (app online: ${appOnline})`);
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
      // app gone — tell remaining cameras so they stop signaling into the void
      if (ws.data.role === 'app' && ws.data.topic) {
        const remaining = (appCount.get(ws.data.topic) ?? 1) - 1;
        if (remaining > 0) appCount.set(ws.data.topic, remaining);
        else {
          appCount.delete(ws.data.topic);
          server.publish(ws.data.topic, JSON.stringify({ type: 'app-left' }));
        }
      }
    },
  },
});

console.log(`ws relay on ws://localhost:${server.port}/ws?topic=posture`);
