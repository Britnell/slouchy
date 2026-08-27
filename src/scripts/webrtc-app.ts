import Peer from 'simple-peer';

const RECONNECT_DELAY_MS = 1000;

export type AppEvents = {
    status: (text: string) => void;
    message: (msg: string) => void;
    registered: (url: string) => void;
};

export class AppConnection {
    private ws: WebSocket | null = null;
    private peer: Peer | null = null;
    private myId = crypto.randomUUID();
    private intentionalClose = false;
    private signalingDone = false; // ws no longer needed once rtc is up
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private events: AppEvents) {}

    start() {
        this.intentionalClose = false;
        this.signalingDone = false;
        this.clearReconnectTimer();
        const ws = new WebSocket(
            `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
        );
        this.ws = ws;

        ws.addEventListener('open', () => {
            this.events.status('ws connected');
            ws.send(JSON.stringify({ type: 'connect' }));
        });

        ws.addEventListener('message', (e) => {
            const data = JSON.parse(e.data);

            if (data.type === 'registered') {
                this.events.registered(`${location.origin}/camera?uid=${data.uid}`);
                return;
            }

            if (data.type === 'signal') {
                if (data.from === this.myId) return; // own echo
                this.events.status(`← signal ${data.signal.type}`);
                this.peer ??= this.makePeer();
                this.peer.signal(data.signal);
                return;
            }
        });

        ws.addEventListener('close', () => {
            this.ws = null;
            if (this.intentionalClose || this.signalingDone) return;
            this.events.status('✖ ws closed, reconnecting...');
            this.scheduleReconnect();
        });
    }

    stop() {
        this.intentionalClose = true;
        this.clearReconnectTimer();
        this.peer?.destroy();
        this.peer = null;
        this.ws?.close();
        this.ws = null;
    }

    send(msg: string) {
        this.peer?.send(msg);
    }

    private scheduleReconnect() {
        this.clearReconnectTimer();
        this.peer?.destroy();
        this.peer = null;
        this.reconnectTimer = setTimeout(() => this.start(), RECONNECT_DELAY_MS);
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private makePeer() {
        const p = new Peer({ initiator: false });

        p.on('signal', (s: any) => {
            this.events.status(`→ signal ${s.type}`);
            this.ws?.send(JSON.stringify({ type: 'signal', from: this.myId, signal: s }));
        });
        p.on('connect', () => {
            this.events.status('✔ rtc connected');
            // rtc is up — signaling no longer needed
            this.signalingDone = true;
            this.ws?.close();
            this.ws = null;
        });
        p.on('data', (d) => this.events.message(d.toString()));
        p.on('close', () => {
            this.peer = null;
            if (this.intentionalClose) return;
            this.signalingDone = false;
            this.events.status('✖ webrtc closed, reconnecting...');
            this.scheduleReconnect();
        });
        p.on('error', (e: any) => this.events.status(`✖ peer error: ${e.message}`));

        return p;
    }
}
