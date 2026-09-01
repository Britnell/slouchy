import { AppConnection } from './webrtc-app';
import { angles } from './posture';
import { PostureLogger } from './logger';
import { speak, badidi, chord } from './tone';

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


//
const DIFF_LOOKBACK_S = 8; // diff = value now vs value this long ago
const INTEGRAL_WINDOW_S = 6; // integrate diff over this window
//
const SLOUCH_THRESH = 35; // integral above this = param high (positive only, negative = straightening up)
const SLOUCH_HYST_FACTOR = 0.5; // hysteresis: param clears only below SLOUCH_THRESH * this
//
const PRESENCE_TIMEOUT_MS = 10000; // no frame for this long = gone
const BREAK_AFTER_MS = 30 * 60 * 1000;


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

let appPaused = false;

// --- posture / slouch ---
const postureEl = document.createElement('div');
const tiltsEl = document.createElement('p');
// absolute values table: angles + lean + cumulative drop vs calibration
const ABS_LABELS = ['head', 'neck', 'neckBody', 'lean', 'drop'] as const;
const absTable = document.createElement('table');
const absHeadRow = document.createElement('tr');
const absValRow = document.createElement('tr');
const headCorner = document.createElement('th');
absHeadRow.append(headCorner);
const valLabel = document.createElement('td');
valLabel.textContent = 'angles';
absValRow.append(valLabel);
const absCells = ABS_LABELS.map((name) => {
    const th = document.createElement('th');
    th.textContent = name;
    absHeadRow.append(th);
    const td = document.createElement('td');
    absValRow.append(td);
    return td;
});
absTable.append(absHeadRow, absValRow);
tiltsEl.append(absTable);
const correctBtn = document.createElement('button');
correctBtn.textContent = 'correct posture';
seatingEl.after(postureEl, tiltsEl, correctBtn);

// --- self-diff + integral: value vs itself DIFF_LOOKBACK_S ago, then trapezoidal
// integral of that diff over INTEGRAL_WINDOW_S (sliding sample history) ---

// readable fixed-width numbers: sign + 1 decimal
const fmt = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;

const diffRow = document.createElement('tr');
const diffLabel = document.createElement('td');
diffRow.append(diffLabel);
const diffCells = ABS_LABELS.map(() => {
    const td = document.createElement('td');
    diffRow.append(td);
    return td;
});
const intRow = document.createElement('tr');
const intLabel = document.createElement('td');
intRow.append(intLabel);
const intCells = ABS_LABELS.map(() => {
    const td = document.createElement('td');
    intRow.append(td);
    return td;
});
absValRow.after(diffRow);
diffRow.after(intRow);

diffLabel.textContent = 'sdiff';
intLabel.textContent = 'integral';

// sliding window of recent samples (kept long enough for lookback + integral)
const history: { t: number; vals: number[] }[] = [];

// newest sample at or before cutoffT, for label index i (null if none/NaN)
function sampleBefore(i: number, cutoffT: number): number | null {
    for (let j = history.length - 1; j >= 0; j--) {
        if (history[j].t <= cutoffT) {
            const v = history[j].vals[i];
            return Number.isFinite(v) ? v : null;
        }
    }
    return null;
}

// per-param slouch trigger state (hysteresis, see SLOUCH_THRESH)
const paramHigh = ABS_LABELS.map(() => false);

function updateDiff(vals: number[]): number[] {
    const now = performance.now();
    history.push({ t: now, vals: vals.slice() });
    const cutoff = now - (INTEGRAL_WINDOW_S + DIFF_LOOKBACK_S) * 1000;
    while (history.length > 1 && history[0].t < cutoff) history.shift();

    const winStart = now - INTEGRAL_WINDOW_S * 1000;
    const integrals: number[] = [];
    ABS_LABELS.forEach((key, i) => {
        if (!Number.isFinite(vals[i])) {
            diffCells[i].textContent = '-';
            intCells[i].textContent = '-';
            integrals[i] = NaN;
            return;
        }
        const past = sampleBefore(i, now - DIFF_LOOKBACK_S * 1000);
        const d = past === null ? 0 : vals[i] - past;
        diffCells[i].textContent = fmt(d);

        // trapezoidal integral of the diff series over the window (NaN gaps break segments)
        let integral = 0;
        let prev: { t: number; d: number } | null = null;
        for (const s of history) {
            if (s.t < winStart) continue;
            const p = sampleBefore(i, s.t - DIFF_LOOKBACK_S * 1000);
            if (p === null || !Number.isFinite(s.vals[i])) {
                prev = null;
                continue;
            }
            const cur = { t: s.t, d: s.vals[i] - p };
            if (prev) integral += ((prev.d + cur.d) / 2) * ((cur.t - prev.t) / 1000);
            prev = cur;
        }
        intCells[i].textContent = fmt(integral);
        integrals[i] = integral;
    });
    return integrals;
}

const pauseBtn = document.createElement('button');
pauseBtn.textContent = '⏸ pause';
pauseBtn.addEventListener('click', () => {
    appPaused = !appPaused;
    pauseBtn.textContent = appPaused ? '▶ resume' : '⏸ pause';
    if (appPaused) presence.reset(); // freeze session timer while paused
});
correctBtn.after(pauseBtn);

// --- research logger (see detection.md) ---
const LOG_ENABLED = false;
const LOG_DISTANCE = false; // log per-frame drift from calibrated position
const postureLog = new PostureLogger();
if (LOG_ENABLED) {
    (window as any).postureLogDownload = () => postureLog.download();
    const logBtn = document.createElement('button');
    logBtn.textContent = '⬇ csv';
    logBtn.addEventListener('click', () => postureLog.download());
    pauseBtn.after(logBtn);
}

// calibration = just the point positions; angles are derived from them
let correctPoints: Record<string, { x: number; y: number }> | null =
    JSON.parse(localStorage.getItem('correctPosture') ?? 'null')?.points ?? null;
let slouching = false;

// sum of per-point distances from calibrated position (no longer gates frames;
// logged when LOG_DISTANCE is on)
function driftSum(data: any): number | null {
    if (!correctPoints) return null;
    let sum = 0;
    for (const [k, a] of Object.entries<any>(correctPoints)) {
        const b = data[k];
        if (!b) return null;
        sum += Math.hypot(a.x - b.x, a.y - b.y);
    }
    return sum;
}

// drop: cumulative y sink vs calibration across all points (model can't see arching,
// it just lowers everything, so sinking = drop).
let lastDrop: number | null = null;
function dropValue(data: any): number | null {
    if (!correctPoints) {
        lastDrop = null;
        return null;
    }
    let dySum = 0;
    let dxSum = 0;
    let n = 0;
    const dys: Record<string, number> = {};
    for (const [k, a] of Object.entries<any>(correctPoints)) {
        const b = data[k];
        if (!b) {
            return lastDrop;
        }
        dys[k] = +((b.y - a.y) * 100).toFixed(1);
        dySum += b.y - a.y;
        dxSum += Math.abs(b.x - a.x);
        n++;
    }
    const drop = (dySum / n) * 100; // + = all points moved down
    const dx = (dxSum / n) * 100;
    lastDrop = drop;
    return drop;
}

function updatePosture(data: any) {
    if (!data.ear || !data.eye || !data.shoulder || !data.hip) {
        postureEl.textContent = 'posture: ?';
        return;
    }
    // data = smoothed midpoints from camera
    const ang = angles(data);
    if (LOG_ENABLED) postureLog.log(data, ang);

    // absolute values: angles + lean + calibrated drop
    const lean = data.nose ? Math.abs(data.nose.x - data.shoulder.x) * 100 : NaN;
    const absNums = [ang.head, ang.neck, ang.neckBody, lean, dropValue(data) ?? NaN];
    absCells.forEach(
        (td, i) => (td.textContent = Number.isFinite(absNums[i]) ? absNums[i].toFixed(1) : '-')
    );
    const integrals = updateDiff(absNums);

    // per-param trigger with hysteresis: fires above SLOUCH_THRESH, clears only
    // below SLOUCH_THRESH * SLOUCH_HYST_FACTOR. negative integrals never trigger.
    ABS_LABELS.forEach((key, i) => {
        const v = integrals[i];
        if (Number.isFinite(v)) {
            if (!paramHigh[i] && v > SLOUCH_THRESH) paramHigh[i] = true;
            else if (paramHigh[i] && v < SLOUCH_THRESH * SLOUCH_HYST_FACTOR) paramHigh[i] = false;
        }
        intCells[i].style.backgroundColor = paramHigh[i] ? 'orange' : '';
    });

    const slouch = paramHigh.some(Boolean);
    if (slouch !== slouching) {
        slouching = slouch;
        if (slouch) {
            badidi();
            postureEl.textContent = 'sit up straight!';
        } else {
            postureEl.textContent = 'posture: good';
        }
    }
}

correctBtn.addEventListener('click', () => {
    // calibrate from the last frame drawn (kept fresh even for out-of-position frames,
    // so a stale calibration after moving the camera can always be replaced)
    const data = lastData;
    if (!data?.ear || !data?.eye || !data?.shoulder || !data?.hip) return;
    correctPoints = data;
    localStorage.setItem('correctPosture', JSON.stringify({ points: correctPoints }));
    // reset detector: drop baseline jumps on recalibration
    history.length = 0;
    paramHigh.fill(false);
    slouching = false;
});

const conn = new AppConnection({
    status: setStatus,
    message: (msg) => {
        if (appPaused) return; // ignore packets while paused
        try {
            const data = JSON.parse(msg);
            lastData = data; // always keep latest frame so calibration stays possible
            drawPoints(data);
            if (LOG_DISTANCE) console.log('[distance] drift:', driftSum(data)?.toFixed(3));
            presence.onFrame(hasPosture(data));
            updatePosture(data);
        } catch {
            // ignore non-json
        }
    },
    registered: (url) => setStatus(`camera url: ${url}`)
});
conn.start();
