// calibration-free slouch detection — v1 (see analysis/detection.md)
// rolling window per signal -> percentile baseline ("best recent posture")
// -> one-sided residual -> weighted fusion into a degrees-like value.
//
// degradation space: d = sign * raw, chosen so d only *grows* while slouching.
// baseline = low percentile of d over the window: slouch drags the low tail
// barely at all (slouch samples land high), sitting up pulls it down
// immediately -> sit-up peak refresh comes for free.

export interface AdaptiveResult {
    ready: boolean; // false during warm-up
    ageMs: number; // span of window so far
    fused: number; // smoothed, degrees-like scale (comparable to SlouchMeter)
    residuals: Record<string, number>; // degradation vs baseline, unweighted
    baselines: Record<string, number>; // in degradation space
}

const WINDOW_MS = 5 * 60 * 1000;
const SAMPLE_EVERY_MS = 250;
const WARMUP_MS = 60 * 1000;
const P = 0.1; // ~best 10% of recent frames = best attainable posture right now

// weight = degrees-of-slouch per unit of degradation. fused mirrors the
// calibrated SlouchMeter exactly: neck + neckBody + 100 × mean y-drop.
// head/back/neckHead are only sampled for observation (weight 0).
// intrinsic angles get the most trust, y the least.
const CONF: Record<string, { sign: number; weight: number }> = {
    head: { sign: -1, weight: 0 }, // extrinsic tilt
    neck: { sign: 1, weight: 1 }, // extrinsic
    back: { sign: 1, weight: 0 }, // extrinsic
    neckBody: { sign: -1, weight: 1 }, // intrinsic, shrinks when slouching
    neckHead: { sign: -1, weight: 0 }, // intrinsic, shrinks when slouching
    earY: { sign: 1, weight: 50 }, // y grows when slouching; 50+50 = 100 on the mean
    shoulderY: { sign: 1, weight: 50 },
};

const SMOOTHING = 0.05; // same as SlouchMeter

function quantile(sorted: number[], p: number): number {
    return sorted[Math.floor(p * (sorted.length - 1))];
}

export class AdaptiveMeter {
    private ts: number[] = [];
    private vals: Record<string, number[]> = {};
    private bases: Record<string, number> | null = null;
    private smoothed: number | null = null;

    value(ang: Record<string, number>, points: Record<string, { x: number; y: number }>): AdaptiveResult {
        const now = performance.now();
        const raw: Record<string, number> = {
            head: ang.head,
            neck: ang.neck,
            back: ang.back,
            neckBody: ang.neckBody,
            neckHead: ang.neckHead,
            earY: points.ear.y,
            shoulderY: points.shoulder.y,
        };

        if (now - (this.ts.at(-1) ?? -Infinity) >= SAMPLE_EVERY_MS) {
            this.ts.push(now);
            for (const [k, c] of Object.entries(CONF)) {
                (this.vals[k] ??= []).push(c.sign * raw[k]);
            }
            const cutoff = now - WINDOW_MS;
            let drop = 0;
            while (drop < this.ts.length && this.ts[drop] < cutoff) drop++;
            if (drop > 0) {
                this.ts.splice(0, drop);
                for (const k of Object.keys(this.vals)) this.vals[k].splice(0, drop);
            }
            // recompute baselines only on sample ticks (sorting every frame is silly)
            this.bases = {};
            for (const k of Object.keys(CONF)) {
                this.bases[k] = quantile([...this.vals[k]].sort((a, b) => a - b), P);
            }
        }

        const ageMs = now - (this.ts[0] ?? now);
        const ready = this.bases !== null && ageMs >= WARMUP_MS;

        const residuals: Record<string, number> = {};
        const baselines: Record<string, number> = {};
        let fused = 0;
        if (ready) {
            for (const [k, c] of Object.entries(CONF)) {
                const d = c.sign * raw[k];
                const b = this.bases![k];
                baselines[k] = b;
                const r = Math.max(0, d - b);
                residuals[k] = r;
                fused += c.weight * r;
            }
            this.smoothed =
                this.smoothed === null
                    ? fused
                    : this.smoothed + SMOOTHING * (fused - this.smoothed);
        }
        return { ready, ageMs, fused: this.smoothed ?? 0, residuals, baselines };
    }

    reset() {
        this.ts = [];
        this.vals = {};
        this.bases = null;
        this.smoothed = null;
    }
}
