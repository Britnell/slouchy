// --- posture pipeline ---
// landmarks (smoothed, from pose detector)
//   -> midpoints: shoulder, hip, ear, eye, nose
//   -> angles: absolute tilts + intrinsic angles
//   -> deviations vs calibrated correct posture
//   -> SlouchMeter: combines deviations into a single smoothed slouch value

// step 1: midpoints from smoothed landmarks
export function midpoints(l) {
    const mid = (a, b) => ({
        x: (l[a].x + l[b].x) / 2,
        y: (l[a].y + l[b].y) / 2,
    });
    const frontIsL = l[7].z <= l[8].z;
    return {
        shoulder: mid(11, 12),
        hip: mid(23, 24),
        ear: frontIsL ? l[7] : l[8],
        eye: frontIsL ? l[2] : l[5],
        nose: l[0],
    };
}

// step 2: all angles from midpoints, signed and unclamped
// (+ = forward/down, - = back). clamping to >= 0 happens only after diffing
// vs calibrated posture (deviations()), so 'better than good' (leaning back)
// reads as 0 deviation — never at the source, that loses the negative range.
// absolute tilts vs axes, normalized to [-90, 90]:
//   head: vs horizontal (+ = eye/nose above ear, - = below)
//   neck/back: vs vertical (+ = top leans forward, - = back)
// intrinsic angles, no axis, no calibration:
//   neckBody: at shoulder between torso (shoulder->hip) and neck (shoulder->ear)
//   neckHead: at ear between neck (ear->shoulder) and head (ear->eye)
export function angles(p) {
    const dx = (p1, p2) => p2.x - p1.x;
    const dy = (p1, p2) => p2.y - p1.y;
    const vsHoriz = (p1, p2) =>
        (Math.atan2(-dy(p1, p2), Math.abs(dx(p1, p2))) * 180) / Math.PI;
    const vsVert = (p1, p2) =>
        (Math.atan2(dx(p1, p2), Math.abs(dy(p1, p2))) * 180) / Math.PI;
    const angleBetween = (p1, p2, p3) => {
        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
        return (Math.acos(Math.min(1, Math.max(-1, dot / m))) * 180) / Math.PI;
    };
    return {
        head: -vsHoriz(p.ear, p.eye),
        neck: vsVert(p.ear, p.shoulder),
        back: vsVert(p.shoulder, p.hip),
        neckBody: angleBetween(p.hip, p.shoulder, p.ear),
        neckHead: angleBetween(p.shoulder, p.ear, p.eye),
    };
}

// step 3: measure everything from smoothed landmarks
export function measure(l) {
    const points = midpoints(l);
    return { points, angles: angles(points) };
}

// 'drop': how far the upper body has dropped vs the calibrated correct posture:
// the y-drops of ear and shoulder added together, no average. Slouching with a
// rounded back makes the whole upper body sit lower in front of the camera
// (y grows in normalized coords). correctPoints may be null -> returns null.
export function drop(points, correctPoints) {
  if (!correctPoints) return null;
  const sum = points.ear.y - correctPoints.ear.y + points.shoulder.y - correctPoints.shoulder.y;
    return Math.max(0,sum / 2);
}

// step 4: deviations from calibrated correct posture, never negative
export function deviations(angles, correct) {
    return Object.fromEntries(
        Object.entries(angles).map(([k, v]) => [
            k,
            Math.max(0, v - (correct[k] ?? 0)),
        ]),
    );
}

const SLOUCH_SMOOTHING = 0.05;
const DROP_WEIGHT = 100; // deg of slouch per unit of normalized y-drop

// step 5: single slouch value, smoothed over time
export class SlouchMeter {
    smoothed = null;

    // picks which deviations feed the score: neck tilt + neckBody + drop
    // neckBody is an intrinsic angle: it *shrinks* when slouching, so its deviation is inverted
    value(ang, correct, points, correctPoints) {
        const devs = deviations(ang, correct);
        const neckBodyDev = Math.max(0, correct.neckBody - ang.neckBody);
        const dropVal = drop(points, correctPoints) ?? 0;
        const raw = devs.neck + 1.0 * neckBodyDev + DROP_WEIGHT * dropVal;
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
