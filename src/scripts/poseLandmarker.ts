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

const LANDMARK_SMOOTHING = 0.05;

// smooth landmark positions to reduce jitter, returns stable landmarks
export class LandmarkSmoother {
    #smoothed = null;

    smooth(rawLandmarks) {
        if (!this.#smoothed)
            this.#smoothed = rawLandmarks.map((p) => ({ ...p }));
        for (let i = 0; i < rawLandmarks.length; i++) {
            const s = this.#smoothed[i],
                p = rawLandmarks[i];
            s.x += LANDMARK_SMOOTHING * (p.x - s.x);
            s.y += LANDMARK_SMOOTHING * (p.y - s.y);
            s.z += LANDMARK_SMOOTHING * (p.z - s.z);
        }
        return this.#smoothed;
    }

    reset() {
        this.#smoothed = null;
    }
}
