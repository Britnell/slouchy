// app2 engine: local-camera detection + posture/slouch pipeline, no webrtc.
// merges the detection loop from scripts/camera.ts with the posture analysis
// from scripts/app.ts into one framework-agnostic class that emits state
// snapshots for the preact ui.

import { createLandmarker } from '../scripts/poseLandmarker';
import { createFaceLandmarker, headPose } from '../scripts/faceLandmarker';
import { LandmarkOneEuro, OneEuroFilter } from '../scripts/filter';
import { midpoints, angles } from '../scripts/posture';
import { drawFrame, drawPitch } from '../scripts/canvas';
import { bebep } from '../scripts/tone';

export const PARAMS = ['head', 'neck', 'neckBody', 'lean', 'drop', 'pitch', 'yaw'] as const;

// tuning, carried over from the demo scripts
const FILTER_OPTS = { minCutoff: 1, beta: 0.3, dCutoff: 1 }; // 1 euro filter
const DIFF_LOOKBACK_S = 8; // diff = value now vs value this long ago
const INTEGRAL_WINDOW_S = 6; // integrate diff over this window
const SLOUCH_HYST_FACTOR = 0.5; // clears only below SLOUCH_THRESH * this
const FRONTAL_YAW_DEG = 35; // |yaw| under this = user facing screen (frontal view)
// which params can trigger slouch per view: side-view geometry metrics are
// meaningless from the front, and pitch needs to see the face from the front
const SIDE_ONLY = new Set(['head', 'neck', 'neckBody', 'lean']);
const FRONTAL_ONLY = new Set(['pitch']);

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
    // false until the detection loop is actually running (models + camera ready)
    detecting: boolean;
}

export class PostureEngine {
    onState: ((s: EngineState) => void) | null = null;

    private phase: Phase = 'loading';
    private status = 'loading models…';
    private landmarker: any = null;
    private faceLandmarker: any = null;
    private preloadPromise: Promise<void> | null = null;

    private video: HTMLVideoElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private stream: MediaStream | null = null;
    private raf = 0;
    private lastVideoTime = -1;
    private disposed = false;

    private smoother = new LandmarkOneEuro(FILTER_OPTS);
    private pitchFilter = new OneEuroFilter(FILTER_OPTS);
    private yawFilter = new OneEuroFilter(FILTER_OPTS);
    private lastPitch: number | null = null; // face-landmarker pitch, else null
    private lastYaw: number | null = null; // face-landmarker yaw, 0 = facing screen

    // diff/integral history (sliding samples)
    private history: { t: number; vals: number[] }[] = [];
    private abs = PARAMS.map(() => NaN);
    private diff = PARAMS.map(() => NaN);
    private integral = PARAMS.map(() => NaN);
    private paramHigh = PARAMS.map(() => false);
    private slouching = false;
    private seen = false;
    private detecting = false;

    // integral above this = param high (positive only). settable via settings
    slouchThresh = 45;
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
            detecting: this.detecting,
        };
    }

    private emit() {
        this.onState?.(this.state);
    }

    // --- model preload, before start ---

    async preload() {
        this.preloadPromise ??= this.doPreload();
        return this.preloadPromise;
    }

    private async doPreload() {
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
            // switch to the main view immediately; heavy stuff happens below
            this.phase = 'running';
            this.status = 'loading models…';
            this.emit();
            await this.preload(); // no-op if already done
            if (this.disposed || this.phase === 'error') return;
            this.status = 'starting camera…';
            this.emit();
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
            this.detecting = true;
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
        this.emit();
    }

    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        document.removeEventListener('visibilitychange', this.onVisibility);
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
            if (pose) {
                this.lastPitch = -this.pitchFilter.filter(pose.pitch, now);
                this.lastYaw = this.yawFilter.filter(pose.yaw, now);
            }
        } else {
            this.lastPitch = null;
            this.lastYaw = null;
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
            this.emit();
            return;
        }
        this.seen = true;
        const ang = angles(points);

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
        this.abs = [ang.head, ang.neck, 180 - ang.neckBody, lean, drop, this.lastPitch ?? NaN, this.lastYaw ?? NaN];

        this.updateDiff();

        // per-param trigger with hysteresis (negative integrals never trigger).
        // frontal view (yaw ≈ 0, facing screen): only pitch + drop trigger.
        // side view: side-view geometry metrics (head/neck/neckBody/lean) only.
        // ignored params can't trigger but still clear an existing high state.
        const frontal = Math.abs(this.lastYaw ?? 0) < FRONTAL_YAW_DEG;
        PARAMS.forEach((p, i) => {
            const ignored = p === 'yaw' || (frontal ? SIDE_ONLY.has(p) : FRONTAL_ONLY.has(p));
            const v = this.integral[i];
            if (ignored || !Number.isFinite(v)) {
                if (this.paramHigh[i] && v < this.slouchThresh * SLOUCH_HYST_FACTOR)
                    this.paramHigh[i] = false;
                return;
            }
            if (!this.paramHigh[i] && v > this.slouchThresh) this.paramHigh[i] = true;
            else if (this.paramHigh[i] && v < this.slouchThresh * SLOUCH_HYST_FACTOR)
                this.paramHigh[i] = false;
        });

        const slouch = this.paramHigh.some(Boolean);
        if (slouch !== this.slouching) {
            this.slouching = slouch;
            if (slouch) bebep();
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
}
