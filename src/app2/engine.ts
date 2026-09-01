// app2 engine: local-camera detection + posture/slouch pipeline, no webrtc.
// merges the detection loop from scripts/camera.ts with the posture analysis
// from scripts/app.ts into one framework-agnostic class that emits state
// snapshots for the preact ui.

import { createLandmarker } from '../scripts/poseLandmarker';
import { createFaceLandmarker, headPose } from '../scripts/faceLandmarker';
import { LandmarkOneEuro, OneEuroFilter } from '../scripts/filter';
import { midpoints, angles } from '../scripts/posture';
import { drawFrame, drawPitch } from '../scripts/canvas';
import { badidi, chord } from '../scripts/tone';

export const PARAMS = ['head', 'neck', 'neckBody', 'lean', 'drop'] as const;

// tuning, carried over from the demo scripts
const FILTER_OPTS = { minCutoff: 1, beta: 0.3, dCutoff: 1 }; // 1 euro filter
const DIFF_LOOKBACK_S = 8; // diff = value now vs value this long ago
const INTEGRAL_WINDOW_S = 6; // integrate diff over this window
const SLOUCH_THRESH = 35; // integral above this = param high (positive only)
const SLOUCH_HYST_FACTOR = 0.5; // clears only below SLOUCH_THRESH * this
const PRESENCE_TIMEOUT_MS = 10000; // no frame for this long = gone
const BREAK_AFTER_MS = 30 * 60 * 1000;

export type Phase = 'loading' | 'ready' | 'running' | 'error';

export interface EngineState {
    phase: Phase;
    status: string;
    // per-param (PARAMS order), NaN when no data
    abs: number[];
    diff: number[];
    integral: number[];
    paramHigh: boolean[];
    slouching: boolean;
    seen: boolean;
    sessionMs: number | null; // null = not seated
    breakDue: boolean;
}

export class PostureEngine {
    onState: ((s: EngineState) => void) | null = null;

    private phase: Phase = 'loading';
    private status = 'loading models…';
    private landmarker: any = null;
    private faceLandmarker: any = null;

    private video: HTMLVideoElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private stream: MediaStream | null = null;
    private raf = 0;
    private lastVideoTime = -1;
    private disposed = false;

    private smoother = new LandmarkOneEuro(FILTER_OPTS);
    private pitchFilter = new OneEuroFilter(FILTER_OPTS);
    private lastPitch: number | null = null; // face-landmarker pitch, else null
    // head angle source: pitch reads differently than point-derived head, so a
    // switch looks like a slouch — reset diff/integral history on any switch
    private headSource: 'pitch' | 'head' | null = null;

    // diff/integral history (sliding samples)
    private history: { t: number; vals: number[] }[] = [];
    private abs = PARAMS.map(() => NaN);
    private diff = PARAMS.map(() => NaN);
    private integral = PARAMS.map(() => NaN);
    private paramHigh = PARAMS.map(() => false);
    private slouching = false;
    private seen = false;

    // presence / session
    private lastSeen: number | null = null;
    private sessionStart: number | null = null;
    private sessionTimer: ReturnType<typeof setInterval> | null = null;
    private breakAnnounced = false;

    paused = false;

    get state(): EngineState {
        return {
            phase: this.phase,
            status: this.status,
            abs: this.abs.slice(),
            diff: this.diff.slice(),
            integral: this.integral.slice(),
            paramHigh: this.paramHigh.slice(),
            slouching: this.slouching,
            seen: this.seen,
            sessionMs: this.sessionStart === null ? null : Date.now() - this.sessionStart,
            breakDue: this.breakAnnounced,
        };
    }

    private emit() {
        this.onState?.(this.state);
    }

    // --- model preload, before start ---

    async preload() {
        try {
            [this.landmarker, this.faceLandmarker] = await Promise.all([
                createLandmarker('lite'),
                createFaceLandmarker(),
            ]);
            if (this.disposed) return;
            if (this.phase === 'loading') {
                this.phase = 'ready';
                this.status = 'ready';
                this.emit();
            }
        } catch (err) {
            if (this.disposed) return;
            this.phase = 'error';
            this.status = `✖ ${err.message ?? err}`;
            this.emit();
        }
    }

    // --- media elements (CameraView attaches these on mount, before start) ---

    attach(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
        this.video = video;
        this.canvas = canvas;
    }

    // --- start / pause / stop ---

    async start() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = this.video;
            if (!video) throw new Error('no video element attached');
            video.srcObject = this.stream;
            await video.play();
            if (this.canvas) {
                this.canvas.width = video.videoWidth;
                this.canvas.height = video.videoHeight;
            }
            document.addEventListener('visibilitychange', this.onVisibility);
            this.phase = 'running';
            this.status = 'running';
            this.lastVideoTime = -1;
            this.raf = requestAnimationFrame(this.loop);
            this.emit();
        } catch (err) {
            this.phase = 'error';
            this.status = `✖ ${err.message ?? err}`;
            this.emit();
        }
    }

    private onVisibility = () => {
        if (!this.video) return;
        if (document.hidden) this.video.pause();
        else if (this.phase === 'running') this.video.play();
    };

    setPaused(paused: boolean) {
        this.paused = paused;
        if (paused) this.resetSession(); // freeze session timer while paused
        this.emit();
    }

    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.resetSession();
        this.stream?.getTracks().forEach((t) => t.stop());
    }

    // --- detection loop (from camera.ts, webrtc send removed) ---

    private loop = () => {
        this.raf = requestAnimationFrame(this.loop);
        const video = this.video;
        if (this.phase !== 'running' || this.paused || !video) return;
        if (video.currentTime === this.lastVideoTime || video.videoWidth === 0) return;
        this.lastVideoTime = video.currentTime;

        const now = performance.now();
        const result = this.landmarker.detectForVideo(video, now);
        const face = this.faceLandmarker.detectForVideo(video, now);
        if (face?.faceLandmarks?.[0]) {
            const pose = headPose(face);
            if (pose) this.lastPitch = -this.pitchFilter.filter(pose.pitch, now);
        }

        const raw = result?.landmarks?.[0];
        if (!raw) {
            this.onFrame(null);
            return;
        }
        const landmarks = this.smoother.smooth(raw, now);
        const points = midpoints(landmarks);

        const canvas = this.canvas;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            drawFrame(ctx, canvas, points, landmarks);
            if (this.lastPitch != null) {
                drawPitch(ctx, canvas, canvas.width * 0.06, canvas.height * 0.06, this.lastPitch);
            }
        }
        this.onFrame(points);
    };

    // --- posture analysis (from app.ts) ---

    private onFrame(points: any | null) {
        if (!points || !points.ear || !points.eye || !points.shoulder || !points.hip) {
            this.seen = false;
            this.checkGone();
            this.emit();
            return;
        }
        this.seen = true;
        this.presence();
        const ang = angles(points);

        const src = this.lastPitch != null ? 'pitch' : 'head';
        if (this.headSource !== null && src !== this.headSource) {
            this.history.length = 0;
            this.paramHigh[0] = false;
        }
        this.headSource = src;

        // absolute values: angles + lean + drop
        // neckBody inverted (180 - x): it shrinks when slouching, flip to grow
        // lean = horizontal nose offset vs neck length, in %
        const lean = points.nose
            ? (Math.abs(points.nose.x - points.shoulder.x) /
                  Math.hypot(points.ear.x - points.shoulder.x, points.ear.y - points.shoulder.y)) *
              100
            : NaN;
        // drop = mean height of all points (model can't see arching, it just
        // lowers everything, so sinking = drop)
        const dropPts = [points.ear, points.eye, points.shoulder, points.hip];
        if (points.nose) dropPts.push(points.nose);
        const drop = (dropPts.reduce((s, p) => s + p.y, 0) / dropPts.length) * 100;
        this.abs = [this.lastPitch ?? ang.head, ang.neck, 180 - ang.neckBody, lean, drop];

        this.updateDiff();

        // per-param trigger with hysteresis (negative integrals never trigger)
        PARAMS.forEach((_, i) => {
            const v = this.integral[i];
            if (Number.isFinite(v)) {
                if (!this.paramHigh[i] && v > SLOUCH_THRESH) this.paramHigh[i] = true;
                else if (this.paramHigh[i] && v < SLOUCH_THRESH * SLOUCH_HYST_FACTOR)
                    this.paramHigh[i] = false;
            }
        });

        const slouch = this.paramHigh.some(Boolean);
        if (slouch !== this.slouching) {
            this.slouching = slouch;
            if (slouch) badidi();
        }
        this.emit();
    }

    // self-diff + integral: value vs itself DIFF_LOOKBACK_S ago, then
    // trapezoidal integral of that diff over INTEGRAL_WINDOW_S
    private updateDiff() {
        const vals = this.abs;
        const now = performance.now();
        this.history.push({ t: now, vals: vals.slice() });
        const cutoff = now - (INTEGRAL_WINDOW_S + DIFF_LOOKBACK_S) * 1000;
        while (this.history.length > 1 && this.history[0].t < cutoff) this.history.shift();

        const winStart = now - INTEGRAL_WINDOW_S * 1000;
        PARAMS.forEach((_, i) => {
            if (!Number.isFinite(vals[i])) {
                this.diff[i] = NaN;
                this.integral[i] = NaN;
                return;
            }
            const past = this.sampleBefore(i, now - DIFF_LOOKBACK_S * 1000);
            this.diff[i] = past === null ? 0 : vals[i] - past;

            // NaN gaps break segments
            let integral = 0;
            let prev: { t: number; d: number } | null = null;
            for (const s of this.history) {
                if (s.t < winStart) continue;
                const p = this.sampleBefore(i, s.t - DIFF_LOOKBACK_S * 1000);
                if (p === null || !Number.isFinite(s.vals[i])) {
                    prev = null;
                    continue;
                }
                const cur = { t: s.t, d: s.vals[i] - p };
                if (prev) integral += ((prev.d + cur.d) / 2) * ((cur.t - prev.t) / 1000);
                prev = cur;
            }
            this.integral[i] = integral;
        });
    }

    // newest sample at or before cutoffT for param i (null if none/NaN)
    private sampleBefore(i: number, cutoffT: number): number | null {
        for (let j = this.history.length - 1; j >= 0; j--) {
            if (this.history[j].t <= cutoffT) {
                const v = this.history[j].vals[i];
                return Number.isFinite(v) ? v : null;
            }
        }
        return null;
    }

    // --- presence / session timer ---

    private presence() {
        const now = Date.now();
        if (this.sessionStart === null) {
            this.sessionStart = now;
            this.sessionTimer = setInterval(() => {
                this.checkGone();
                this.tickBreak();
                this.emit();
            }, 1000);
        }
        this.lastSeen = now;
    }

    private checkGone() {
        if (this.sessionStart === null) return;
        if (this.lastSeen !== null && Date.now() - this.lastSeen > PRESENCE_TIMEOUT_MS) {
            this.resetSession();
        }
    }

    private tickBreak() {
        if (this.sessionStart === null) return;
        if (Date.now() - this.sessionStart >= BREAK_AFTER_MS && !this.breakAnnounced) {
            this.breakAnnounced = true;
            chord(440);
        }
    }

    private resetSession() {
        if (this.sessionTimer) clearInterval(this.sessionTimer);
        this.sessionTimer = null;
        this.sessionStart = null;
        this.breakAnnounced = false;
        this.lastSeen = null;
    }
}
