import {
    FilesetResolver,
    PoseLandmarker,
} from "@mediapipe/tasks-vision";

export const MODELS = {
    lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

export async function createLandmarker(modelKey) {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm",
    );
    return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: MODELS[modelKey],
            delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputSegmentationMasks: false,
    });
}

// time-based EMA: framerate-independent jitter smoothing, returns stable landmarks
export class LandmarkSmoother {
    #smoothed = null;
    #lastT: number | null = null;
    #tauS: number;

    constructor(tauS = 2) {
        this.#tauS = tauS;
    }

    smooth(rawLandmarks, nowMs = performance.now()) {
        if (!this.#smoothed) {
            this.#smoothed = rawLandmarks.map((p) => ({ ...p }));
            this.#lastT = nowMs;
            return this.#smoothed;
        }
        const dtS = (nowMs - this.#lastT!) / 1000;
        this.#lastT = nowMs;
        const alpha = 1 - Math.exp(-dtS / this.#tauS);
        for (let i = 0; i < rawLandmarks.length; i++) {
            const s = this.#smoothed[i],
                p = rawLandmarks[i];
            s.x += alpha * (p.x - s.x);
            s.y += alpha * (p.y - s.y);
            s.z += alpha * (p.z - s.z);
        }
        return this.#smoothed;
    }

    reset() {
        this.#smoothed = null;
    }
}
