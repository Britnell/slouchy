// One Euro Filter — adaptive low-pass filter: strong smoothing when slow
// (kills jitter), weak smoothing when fast (low lag).
// ref: https://gery.casiez.net/1euro/

class LowPassFilter {
    #y = null; // raw last input
    #s = null; // filtered value

    filter(value, alpha) {
        this.#s = this.#s === null ? value : alpha * value + (1 - alpha) * this.#s;
        this.#y = value;
        return this.#s;
    }

    get lastValue() {
        return this.#y;
    }

    reset() {
        this.#y = null;
        this.#s = null;
    }
}

export class OneEuroFilter {
    #xfilt = new LowPassFilter();
    #dxfilt = new LowPassFilter();
    #lastT: number | null = null;
    #minCutoff: number;
    #beta: number;
    #dCutoff: number;

    constructor({ minCutoff = 1, beta = 0.3, dCutoff = 1 } = {}) {
        this.#minCutoff = minCutoff;
        this.#beta = beta;
        this.#dCutoff = dCutoff;
    }

    #alpha(cutoff: number, dtS: number) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dtS);
    }

    filter(value: number, nowMs: number) {
        if (this.#lastT !== null && nowMs > this.#lastT) {
            const dtS = (nowMs - this.#lastT) / 1000;
            this.#lastT = nowMs;
            const dx = (value - this.#xfilt.lastValue) / dtS;
            const edx = this.#dxfilt.filter(dx, this.#alpha(this.#dCutoff, dtS));
            const cutoff = this.#minCutoff + this.#beta * Math.abs(edx);
            return this.#xfilt.filter(value, this.#alpha(cutoff, dtS));
        }
        this.#lastT = nowMs;
        return this.#xfilt.filter(value, 1);
    }

    reset() {
        this.#xfilt.reset();
        this.#dxfilt.reset();
        this.#lastT = null;
    }
}

// per-landmark x/y/z one euro filters, same interface as LandmarkSmoother
export class LandmarkOneEuro {
    #filters: OneEuroFilter[][] | null = null;

    constructor(
        private opts: { minCutoff?: number; beta?: number; dCutoff?: number } = {},
    ) {}

    smooth(rawLandmarks: { x: number; y: number; z: number }[], nowMs = performance.now()) {
        if (!this.#filters) {
            this.#filters = rawLandmarks.map(() =>
                Array.from({ length: 3 }, () => new OneEuroFilter(this.opts)),
            );
        }
        return rawLandmarks.map((p, i) => {
            const [fx, fy, fz] = this.#filters![i];
            return {
                ...p,
                x: fx.filter(p.x, nowMs),
                y: fy.filter(p.y, nowMs),
                z: fz.filter(p.z, nowMs),
            };
        });
    }

    reset() {
        this.#filters = null;
    }
}
