// --- posture points (README definitions) ---
// side view: use z (negative = closer to cam) to pick front ear/eye
export function computeTilts(l) {
    const mid = (a, b) => ({
        x: (l[a].x + l[b].x) / 2,
        y: (l[a].y + l[b].y) / 2,
    });
    const shoulder = mid(11, 12);
    const hip = mid(23, 24);
    const frontIsL = l[7].z <= l[8].z;
    const ear = frontIsL ? l[7] : l[8];
    const eye = frontIsL ? l[2] : l[5];
    const nose = l[0];

    // angles, normalized to [-90, 90]:
    // head: vs horizontal (+ = eye/nose above ear, - = below)
    // neck/back: vs vertical (+ = top leans forward/right, - = back)
    const dx = (p1, p2) => p2.x - p1.x;
    const dy = (p1, p2) => p2.y - p1.y;
    const vsHoriz = (p1, p2) =>
        (Math.atan2(-dy(p1, p2), Math.abs(dx(p1, p2))) * 180) / Math.PI;
    const vsVert = (p1, p2) =>
        (Math.atan2(dx(p1, p2), Math.abs(dy(p1, p2))) * 180) / Math.PI;
    const min0 = (a) => Math.max(0, a);
    return {
        points: { shoulder, hip, ear, eye, nose },
        tilts: {
            head: min0(-vsHoriz(ear, eye)),
            neck: min0(vsVert(ear, shoulder)),
            back: min0(vsVert(shoulder, hip)),
        },
    };
}

// intrinsic angles, from the same smoothed midpoints. no axis, no calibration.
// neckBody: angle at shoulder between torso (shoulder->hip) and neck (shoulder->ear)
// neckHead: angle at ear between neck (ear->shoulder) and head (ear->eye)
const angleBetween = (p1, p2, p3) => {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
    return (Math.acos(Math.min(1, Math.max(-1, dot / m))) * 180) / Math.PI;
};
export function computeIntrinsic({ shoulder, hip, ear, eye }) {
    return {
        neckBody: angleBetween(hip, shoulder, ear),
        neckHead: angleBetween(shoulder, ear, eye),
    };
}

export function calibrate(tilts) {
    return { ...tilts };
}

// calibrated deviations, never negative
export function deviations(tilts, correctTilts) {
    return Object.fromEntries(
        Object.entries(tilts).map(([k, v]) => [
            k,
            Math.max(0, v - (correctTilts[k] ?? 0)),
        ]),
    );
}

const SLOUCH_SMOOTHING = 0.05;

export class SlouchMeter {
    smoothed = null;

    // tilts: raw (uncalibrated) tilts; correctTilts: calibration reference
    value(tilts, correctTilts) {
        const raw =
            tilts.neck - correctTilts.neck + 1.6 * (tilts.back - correctTilts.back);
        const slouch = Math.max(0, raw);
        this.smoothed =
            this.smoothed === null
                ? slouch
                : this.smoothed + SLOUCH_SMOOTHING * (slouch - this.smoothed);
        return this.smoothed;
    }

    reset() {
        this.smoothed = null;
    }
}
