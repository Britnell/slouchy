import { MODELS, createLandmarker, LandmarkSmoother } from "./poseLandmarker";
import { computeTilts, computeIntrinsic, deviations, calibrate, SlouchMeter } from "./posture";
import { beep } from "./tone";

import { drawFrame, fitToVideo } from "./canvas";

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const canvasCtx = canvas.getContext("2d");
const startBtn = document.getElementById("start");
const modelSelect = document.getElementById("model-select");

fitToVideo(canvas, video);

// --- tweakables ---
const SLOUCH_THRESHOLD = 13; // deg, above this = slouching
const SLOUCH_PERIOD = 3; // seconds of slouch before alerting

let landmarker = null;
let running = false;
let lastVideoTime = -1;
let result = null;
let lastTilts = null;
let lastIntrinsic = null;

const smoother = new LandmarkSmoother();
const slouchMeter = new SlouchMeter();

const tiltsEl = document.getElementById("tilts");
const intrinsicEl = document.getElementById("intrinsic");
const errorEl = document.getElementById("error");

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
}
function clearError() {
    errorEl.classList.add("hidden");
}
const correctBtn = document.getElementById("correct");
const stored = JSON.parse(localStorage.getItem("correctPosture") ?? "null");
let correctTilts = stored?.tilts ?? { head: 0, neck: 0, back: 0 };
let correctIntrinsic = stored?.intrinsic ?? { neckHead: 0, neckBody: 0 };


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
        lastIntrinsic = computeIntrinsic(points);
    }
}



// --- slouch detection state ---
let slouchStart = null;
let slouching = false;

function onSlouchStart() {
    console.log("slouch start");
    beep();
}

function onSlouchEnd() {
    console.log("slouch end");
}

function updateSlouch(slouch, now = performance.now()) {
    if (slouch <= SLOUCH_THRESHOLD) {
        slouchStart = null;
        if (slouching) {
            slouching = false;
            onSlouchEnd();
        }
        return;
    }
    if (slouchStart === null) slouchStart = now;
    if (!slouching && now - slouchStart >= SLOUCH_PERIOD * 1000) {
        slouching = true;
        onSlouchStart();
    }
}

function updateReadout() {
    if (!lastTilts) return;
    const tilts = deviations(lastTilts, correctTilts);
    const slouch = slouchMeter.value(lastTilts, correctTilts);
    updateSlouch(slouch);
    const span = (text) => {
        const el = document.createElement("span");
        el.textContent = text;
        return el;
    };
    tiltsEl.replaceChildren(
        span(`slouch: ${slouch.toFixed(1)}\u00b0${slouching ? " SLOUCHING" : ""}`),
        ...Object.entries(tilts).map(([k, v]) => span(`${k}: ${v.toFixed(1)}\u00b0`)),
    );
    intrinsicEl.replaceChildren(
        span(`headNeck: ${(lastIntrinsic.neckHead - correctIntrinsic.neckHead).toFixed(1)}\u00b0`),
        span(`neckBody: ${(lastIntrinsic.neckBody - correctIntrinsic.neckBody).toFixed(1)}\u00b0`),
    );
}

// --------------------------------------

correctBtn?.addEventListener("click", () => {
    if (lastTilts) {
        correctTilts = calibrate(lastTilts);
        correctIntrinsic = { ...lastIntrinsic };
        localStorage.setItem(
            "correctPosture",
            JSON.stringify({ tilts: correctTilts, intrinsic: correctIntrinsic }),
        );
    }
});

startBtn?.addEventListener("click", async () => {
    if (running) {
        running = false;
        startBtn.textContent = "Start Camera";
        video.srcObject = null;
        return;
    }
    startBtn.disabled = true;
    clearError();
    startBtn.textContent = "Loading model...";
    try {
        if (!landmarker) {
            localStorage.setItem("model", modelSelect.value);
            landmarker = await createLandmarker(modelSelect.value);
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
        });
        video.srcObject = stream;
        await video.play();
    } catch (err) {
        console.error(err);
        showError(`Failed to load: ${err.message ?? err}. Try reloading the page.`);
        startBtn.disabled = false;
        startBtn.textContent = "Start Camera";
        return;
    }
    running = true;
    startBtn.disabled = false;
    startBtn.textContent = "Stop";
    loop();
});

const savedModel = localStorage.getItem("model");
modelSelect.value = savedModel && MODELS[savedModel] ? savedModel : "lite"; // default: lite
modelSelect.addEventListener("change", () => {
    localStorage.setItem("model", modelSelect.value);
    if (landmarker) {
        landmarker.close();
        landmarker = null;
    }
});

if (savedModel && MODELS[savedModel]) startBtn.click();
