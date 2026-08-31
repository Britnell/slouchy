// drift-based slouch detection — v2 sketch (analysis/detection.md)
// compare a short-term low-pass ("now") to a long-term low-pass ("baseline")
// of the same 3 signals the calibrated slouch calc uses: neck, neckBody, drop.
// baseline keeps adapting forever -> moving chair / standing up just becomes
// the new baseline after ~1-2 SLOW_TCs.

export interface DriftResult {
    abs: Record<string, number>; // raw values: neck, neckBody (deg), drop (h units)
    slow: Record<string, number>; // long-term baseline, raw units
    diffs: Record<string, number>; // now - baseline, + = slouching
    fused: number; // neck + neckBody (inverted) + 100*drop drift, degrees-like
}

const FAST_TC = 2; // s, time constant of "now"
const SLOW_TC = 90; // s, time constant of "baseline"

// drop: mean y of ear+shoulder, y grows when slouching — same as posture.drop but vs baseline
export class DriftMeter {
    private last: number | null = null;
    private fast: Record<string, number> = {};
    private slow: Record<string, number> = {};

    value(ang: Record<string, number>, points: Record<string, { x: number; y: number }>): DriftResult {
        const now = performance.now();
        const dt = this.last === null ? 0 : (now - this.last) / 1000;
        this.last = now;

        const abs: Record<string, number> = {
            neck: ang.neck,
            neckBody: ang.neckBody,
            drop: (points.ear.y + points.shoulder.y) / 2,
        };

        const aFast = 1 - Math.exp(-dt / FAST_TC);
        const aSlow = 1 - Math.exp(-dt / SLOW_TC);

        const diffs: Record<string, number> = {};
        const slow: Record<string, number> = {};
        for (const k of Object.keys(abs)) {
            this.fast[k] = k in this.fast ? this.fast[k] + aFast * (abs[k] - this.fast[k]) : abs[k];
            this.slow[k] = k in this.slow ? this.slow[k] + aSlow * (abs[k] - this.slow[k]) : abs[k];
            slow[k] = this.slow[k];
            diffs[k] = this.fast[k] - this.slow[k];
        }
        // fused mirrors SlouchMeter: neck + neckBody(inverted) + 100 * drop
        const fused = diffs.neck - diffs.neckBody + 100 * diffs.drop;

        return { abs, slow, diffs, fused };
    }

    reset() {
        this.last = null;
        this.fast = {};
        this.slow = {};
    }
}
