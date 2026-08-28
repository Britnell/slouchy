import { AppConnection } from './webrtc-app';
import { SlouchMeter, angles, calibratePoints, deviations } from './posture';
import { speak, beep, chord } from './tone';

const status = document.getElementById('status')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function setStatus(text: string) {
    status.textContent = text;
}

const COLORS: Record<string, string> = {
    shoulder: '#f87171',
    hip: '#fbbf24',
    ear: '#34d399',
    eye: '#60a5fa',
    nose: '#e879f9'
};


const PRESENCE_TIMEOUT_MS = 10000; // no frame for this long = gone
const BREAK_AFTER_MS = 1 * 60 * 1000;


function drawPoints(data: any) {
    // points are normalized 0..1
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const [name, p] of Object.entries<any>(data)) {
        if (!p) continue;
        const x = p.x * canvas.width;
        const y = p.y * canvas.height;

        ctx.fillStyle = COLORS[name] ?? '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '12px monospace';
        ctx.fillText(name, x + 10, y + 4);
    }
}

function hasPosture(data: any): boolean {
    return Object.values<any>(data).some((p) => p && typeof p.x === 'number');
}

// --- presence / pomodoro ---
const seatingEl = document.getElementById('seating')!;

const presence = {
    lastSeen: 0 as number | null,
    sessionStart: null as number | null,
    timer: null as ReturnType<typeof setInterval> | null,

    onFrame(seen: boolean) {
        if (!seen) {
            this.checkGone();
            return;
        }
        const now = Date.now();
        if (this.sessionStart === null) {
            this.sessionStart = now;
            this.timer = setInterval(() => this.render(), 1000);
        }
        this.lastSeen = now;
        this.render();
    },

    checkGone() {
        if (this.sessionStart === null) return;
        if (this.lastSeen !== null && Date.now() - this.lastSeen > PRESENCE_TIMEOUT_MS) {
            this.reset();
        }
    },

    reset() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.sessionStart = null;
        this.breakAnnounced = false;
        this.lastSeen = null;
        this.render();
    },

    render() {
        if (this.sessionStart === null || this.lastSeen === null) {
            seatingEl.textContent = 'undetected';
            return;
        }
        if (this.lastSeen !== null && Date.now() - this.lastSeen > PRESENCE_TIMEOUT_MS) {
            this.reset();
            return;
        }
        const elapsed = Date.now() - this.sessionStart;
        if (elapsed >= BREAK_AFTER_MS) {
            if (!this.breakAnnounced) {
                this.breakAnnounced = true;
                chord(440);
            }
            seatingEl.textContent = 'get up 🚶';
            return;
        }
        const s = Math.floor(elapsed / 1000);
        const mm = String(Math.floor(s / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        seatingEl.textContent = `seated: ${mm}:${ss}`;
    }
};
presence.render();

let lastData: any = null;

// --- posture / slouch ---
const SLOUCH_PERIOD = 3; // seconds in terrible before alerting
const slouchMeter = new SlouchMeter();
const postureEl = document.createElement('div');
const tiltsEl = document.createElement('details');
tiltsEl.append(Object.assign(document.createElement('summary'), { textContent: 'details' }));
const tiltsBody = document.createElement('div');
tiltsEl.append(tiltsBody);
const correctBtn = document.createElement('button');
correctBtn.textContent = 'correct posture';
seatingEl.after(postureEl, tiltsEl, correctBtn);

const stored = JSON.parse(localStorage.getItem('correctPosture') ?? 'null');
let correctAngles = stored?.angles ?? { head: 0, neck: 0, back: 0, neckBody: 0, neckHead: 0 };
let slouchStart: number | null = null;
let alerted = false;

function updatePosture(data: any) {
    if (!data.ear || !data.eye || !data.shoulder || !data.hip) {
        postureEl.textContent = 'posture: ?';
        console.debug('[posture] missing points', data);
        return;
    }
    // data = smoothed midpoints from camera
    const ang = angles(data);
    const devs = deviations(ang, correctAngles);
    const slouch = slouchMeter.value(ang, correctAngles);

    let label: string;
    if (slouch < 5) label = 'good';
    else if (slouch < 10) label = 'ok';
    else if (slouch < 13) label = 'bad';
    else label = 'terrible';
    postureEl.textContent = `posture: ${label} (${slouch.toFixed(1)}\u00b0)`;
    const span = (text: string) => {
        const el = document.createElement('span');
        el.textContent = text;
        return el;
    };
    // neckBody is inverted: it shrinks when slouching
    const neckBodyDev = Math.max(0, correctAngles.neckBody - ang.neckBody);
    tiltsBody.replaceChildren(
        span(`neck: ${devs.neck.toFixed(1)}\u00b0`),
        span(`neckBody: ${neckBodyDev.toFixed(1)}\u00b0`),
        span(`back: ${devs.back.toFixed(1)}\u00b0`),
    );
    console.debug('[posture]', { ang, slouch, correctAngles, devs, label, slouchStart, alerted });

    const now = performance.now();
    if (slouch >= 13) {
        if (slouchStart === null) slouchStart = now;
        if (!alerted && now - slouchStart >= SLOUCH_PERIOD * 1000) {
            alerted = true;
            console.warn('[posture] ALERT: slouch for', (now - slouchStart) / 1000, 's');
            beep();
            postureEl.textContent = 'sit up straight!';
        }
    } else {
        slouchStart = null;
        alerted = false;
    }
}

correctBtn.addEventListener('click', () => {
    // calibrate from the last frame drawn
    const data = lastData;
    if (!data?.ear || !data?.eye || !data?.shoulder || !data?.hip) return;
    correctAngles = calibratePoints(data);
    localStorage.setItem('correctPosture', JSON.stringify({ angles: correctAngles }));
    slouchMeter.reset();
});

const conn = new AppConnection({
    status: setStatus,
    message: (msg) => {
        try {
            const data = JSON.parse(msg);
            lastData = data;
            drawPoints(data);
            presence.onFrame(hasPosture(data));
            updatePosture(data);
        } catch {
            // ignore non-json
        }
    },
    registered: (url) => setStatus(`camera url: ${url}`)
});
conn.start();
