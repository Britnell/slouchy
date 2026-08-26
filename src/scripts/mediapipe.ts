import {
    FilesetResolver,
    PoseLandmarker,
} from "@mediapipe/tasks-vision";

const MODELS = {
    lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
    heavy: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task",
};

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const canvasCtx = canvas.getContext("2d");
const startBtn = document.getElementById("start");
const modelSelect = document.getElementById("model-select");

let poseLandmarker = null;
let running = false;
let lastVideoTime = -1;
let result = null;
let lastTilts = null;
const LANDMARK_SMOOTHING = 0.2;
let smoothedLandmarks = null;

const tiltsEl = document.getElementById("tilts");
const correctBtn = document.getElementById("correct");
let correctTilts = { headEye: 0, headNose: 0, neck: 0, back: 0 };

correctBtn.addEventListener("click", () => {
    if (lastTilts) correctTilts = { ...lastTilts };
});

async function createLandmarker(modelKey) {
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

function displayVideoResult(result) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.landmarks) {
        for (const rawLandmarks of result.landmarks) {
            // smooth landmark positions to reduce jitter
            if (!smoothedLandmarks)
                smoothedLandmarks = rawLandmarks.map((p) => ({ ...p }));
            for (let i = 0; i < rawLandmarks.length; i++) {
                const s = smoothedLandmarks[i],
                    p = rawLandmarks[i];
                s.x += LANDMARK_SMOOTHING * (p.x - s.x);
                s.y += LANDMARK_SMOOTHING * (p.y - s.y);
                s.z += LANDMARK_SMOOTHING * (p.z - s.z);
            }
            const landmarks = smoothedLandmarks;

            // white box through shoulders + hips
            const W = canvas.width, H = canvas.height;
            const corners = [11, 12, 24, 23];
            canvasCtx.beginPath();
            corners.forEach((i, idx) => {
                const p = landmarks[i];
                if (idx === 0) canvasCtx.moveTo(p.x * W, p.y * H);
                else canvasCtx.lineTo(p.x * W, p.y * H);
            });
            canvasCtx.closePath();
            canvasCtx.strokeStyle = "#ffffff";
            canvasCtx.lineWidth = 3;
            canvasCtx.stroke();
            for (const i of corners) {
                const p = landmarks[i];
                canvasCtx.beginPath();
                canvasCtx.arc(p.x * W, p.y * H, 4, 0, 2 * Math.PI);
                canvasCtx.fillStyle = "#ffffff";
                canvasCtx.fill();
            }
            lastTilts = drawPosturePoints(landmarks);
        }
    }
    canvasCtx.restore();
}

// --- posture points (README definitions) ---
// side view: use z (negative = closer to cam) to pick front ear/eye
function drawPosturePoints(l) {
    const W = canvas.width,
        H = canvas.height;

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

    const pts = { shoulder, hip, ear, eye, nose };
    const colors = {
        shoulder: "#38bdf8",
        hip: "#f472b6",
        ear: "#22d3ee",
        eye: "#a3e635",
        nose: "#fbbf24",
    };

    // points + key tilt lines
    canvasCtx.globalAlpha = 1;
    for (const [name, p] of Object.entries(pts)) {
        canvasCtx.beginPath();
        canvasCtx.arc(p.x * W, p.y * H, 8, 0, 2 * Math.PI);
        canvasCtx.fillStyle = colors[name];
        canvasCtx.fill();
    }

    // key tilt lines
    const line = (p1, p2, color) => {
        canvasCtx.beginPath();
        canvasCtx.moveTo(p1.x * W, p1.y * H);
        canvasCtx.lineTo(p2.x * W, p2.y * H);
        canvasCtx.strokeStyle = color;
        canvasCtx.lineWidth = 4;
        canvasCtx.stroke();
    };
    line(ear, eye, "#a3e635"); // head
    line(ear, nose, "#fbbf24"); // head (nose variant)
    line(ear, shoulder, "#38bdf8"); // neck
    line(shoulder, hip, "#f472b6"); // back

    // angles, normalized to [-90, 90]:
    // head: vs horizontal (+ = eye/nose above ear, - = below)
    // neck/back: vs vertical (+ = top leans forward/right, - = back)
    const dx = (p1, p2) => p2.x - p1.x;
    const dy = (p1, p2) => p2.y - p1.y;
    const vsHoriz = (p1, p2) =>
        (Math.atan2(-dy(p1, p2), Math.abs(dx(p1, p2))) * 180) / Math.PI;
    const vsVert = (p1, p2) =>
        (Math.atan2(dx(p1, p2), Math.abs(dy(p1, p2))) * 180) / Math.PI;
    return {
        headEye: vsHoriz(ear, eye),
        headNose: vsHoriz(ear, nose),
        neck: vsVert(ear, shoulder),
        back: vsVert(shoulder, hip),
    };
}

function predict() {
    if (!running) return;
    if (video.currentTime !== lastVideoTime && poseLandmarker) {
        lastVideoTime = video.currentTime;
        const startTimeMs = performance.now();
        result = poseLandmarker.detectForVideo(video, startTimeMs);
    }
    displayVideoResult(result);
    if (lastTilts) {
        tiltsEl.replaceChildren(
            ...Object.entries(lastTilts).map(([k, v]) => {
                const span = document.createElement("span");
                span.textContent = `${k}: ${(v - correctTilts[k]).toFixed(1)}\u00b0`;
                return span;
            }),
        );
    }
    requestAnimationFrame(predict);
}

startBtn.addEventListener("click", async () => {
    if (running) {
        running = false;
        startBtn.textContent = "Start Camera";
        video.srcObject = null;
        return;
    }
    startBtn.disabled = true;
    startBtn.textContent = "Loading model...";
    if (!poseLandmarker) {
        poseLandmarker = await createLandmarker(modelSelect.value);
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    startBtn.disabled = false;
    startBtn.textContent = "Stop";
    predict();
});

modelSelect.addEventListener("change", async () => {
    if (poseLandmarker) {
        poseLandmarker.close();
        poseLandmarker = null;
    }
});
