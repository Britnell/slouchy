import Peer from 'simple-peer';

export type CameraEvents = {
    status: (text: string) => void;
    message: (msg: string) => void;
};

export class CameraConnection {
    private ws: WebSocket | null = null;
    private peer: Peer | null = null;
    private myId = crypto.randomUUID();
    private intentionalClose = false;

    constructor(
        private uid: string,
        private events: CameraEvents
    ) {}

    start() {
        const ws = new WebSocket(
            `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
        );
        this.ws = ws;

        ws.addEventListener('open', () => {
            this.events.status('ws connected');
            ws.send(JSON.stringify({ type: 'join', uid: this.uid }));
        });

        ws.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);

            if (data.type === 'joined') {
                this.events.status(`joined channel #${data.uid}`);
                this.peer = this.makePeer(); // only now — offer would be lost before ws is open
                return;
            }

            if (data.type === 'signal') {
                if (data.from === this.myId) return; // own echo
                this.events.status(`← signal ${data.signal.type}`);
                this.peer?.signal(data.signal);
                return;
            }
        });

        ws.addEventListener('close', () => {
            if (!this.intentionalClose) this.events.status('✖ ws closed');
        });
    }

    stop() {
        this.peer?.destroy();
        this.peer = null;
        this.ws?.close();
        this.ws = null;
    }

    send(msg: string) {
        this.peer?.send(msg);
    }

    private makePeer() {
        let count = 0;
        const p = new Peer({ initiator: true });

        p.on('signal', (s: any) => {
            this.events.status(`→ signal ${s.type}`);
            this.ws?.send(JSON.stringify({ type: 'signal', from: this.myId, signal: s }));
        });
        p.on('connect', () => {
            this.events.status('✔ rtc connected');
            this.ws?.send(JSON.stringify({ type: 'leave' }));
            setInterval(() => {
                const msg = JSON.stringify({ count: ++count });
                this.send(msg);
                this.events.message(`→ ${msg}`);
            }, 1000);
        });
        p.on('data', (d) => this.events.message(`← ${d.toString()}`));
        p.on('close', () => this.events.status('✖ webrtc closed'));
        p.on('error', (e: any) => this.events.status(`✖ peer error: ${e.message}`));

        return p;
    }
}
