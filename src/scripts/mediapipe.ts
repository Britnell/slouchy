import { MODELS, createLandmarker, LandmarkSmoother } from "./poseLandmarker";
import { computeTilts, deviations, calibrate, SlouchMeter } from "./posture";

import { drawFrame, fitToVideo } from "./canvas";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const canvasCtx = canvas.getContext("2d");
const startBtn = document.getElementById("start");
const modelSelect = document.getElementById("model-select");

fitToVideo(canvas, video);

let landmarker = null;
let running = false;
let lastVideoTime = -1;
let result = null;
let lastTilts = null;

const smoother = new LandmarkSmoother();
const slouchMeter = new SlouchMeter();

const tiltsEl = document.getElementById("tilts");
const correctBtn = document.getElementById("correct");
let correctTilts = JSON.parse(localStorage.getItem("correctTilts") ?? "null") ?? { head: 0, neck: 0, back: 0 };


function loop() {
    if (!running) return;
    if (video.currentTime !== lastVideoTime && landmarker) {
        lastVideoTime = video.currentTime;
        const startTimeMs = performance.now();
        result = landmarker.detectForVideo(video, startTimeMs);
    }
    displayVideoResult(result);
    updateReadout();
    requestAnimationFrame(loop);
}

function displayVideoResult(result) {
    if (!result?.landmarks) return;
    for (const rawLandmarks of result.landmarks) {
        const landmarks = smoother.smooth(rawLandmarks);
        const { points, tilts } = computeTilts(landmarks);
        drawFrame(canvasCtx, canvas, points, landmarks);
        lastTilts = tilts;
    }
}

function updateReadout() {
    if (!lastTilts) return;
    const tilts = deviations(lastTilts, correctTilts);
    const slouch = slouchMeter.value(lastTilts, correctTilts);
    const slouchEl = document.createElement("span");
    slouchEl.textContent = `slouch: ${slouch.toFixed(1)}\u00b0`;
    tiltsEl.replaceChildren(
        slouchEl,
        ...Object.entries(tilts).map(([k, v]) => {
            const span = document.createElement("span");
            span.textContent = `${k}: ${v.toFixed(1)}\u00b0`;
            return span;
        }),
    );
}

// --------------------------------------

correctBtn?.addEventListener("click", () => {
    if (lastTilts) {
        correctTilts = calibrate(lastTilts);
        localStorage.setItem("correctTilts", JSON.stringify(correctTilts));
    }
});

startBtn.addEventListener("click", async () => {
    if (running) {
        running = false;
        startBtn.textContent = "Start Camera";
        video.srcObject = null;
        return;
    }
    startBtn.disabled = true;
    startBtn.textContent = "Loading model...";
    if (!landmarker) {
        landmarker = await createLandmarker(modelSelect.value);
    }
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
    });
    video.srcObject = stream;
    await video.play();
    running = true;
    startBtn.disabled = false;
    startBtn.textContent = "Stop";
    loop();
});

const savedModel = localStorage.getItem("model");
if (savedModel && MODELS[savedModel]) modelSelect.value = savedModel;
modelSelect.addEventListener("change", () => {
    localStorage.setItem("model", modelSelect.value);
    if (landmarker) {
        landmarker.close();
        landmarker = null;
    }
});

startBtn.click();
