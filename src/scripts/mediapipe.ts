import { MODELS, createLandmarker, LandmarkSmoother } from "./poseLandmarker";
import { midpoints, angles, deviations, SlouchMeter, drop } from "./posture";
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
let lastAngles = null;
let lastPoints = null;

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
// calibration = just the point positions; angles are derived from them
const stored = JSON.parse(localStorage.getItem("correctPosture") ?? "null");
let correctPoints = stored?.points ?? null;
let correctAngles = correctPoints ? angles(correctPoints) : { head: 0, neck: 0, back: 0, neckBody: 0, neckHead: 0 };


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
        const points = midpoints(landmarks);
        drawFrame(canvasCtx, canvas, points, landmarks);
        lastPoints = points;
        lastAngles = angles(points);
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
    if (!lastAngles) return;
    const devs = deviations(lastAngles, correctAngles);
    const neckBodyDev = Math.max(0, correctAngles.neckBody - lastAngles.neckBody);
    const slouch = slouchMeter.value(lastAngles, correctAngles, lastPoints, correctPoints);
    updateSlouch(slouch);
    const span = (text) => {
        const el = document.createElement("span");
        el.textContent = text;
        return el;
    };
    tiltsEl.replaceChildren(
        span(`slouch: ${slouch.toFixed(1)}\u00b0${slouching ? " SLOUCHING" : ""}`),
        ...Object.entries(devs).map(([k, v]) => span(`${k}: ${v.toFixed(1)}\u00b0`)),
    );
    const dropVal = drop(lastPoints, correctPoints);
    intrinsicEl.replaceChildren(
        span(`headNeck: ${(lastAngles.neckHead - correctAngles.neckHead).toFixed(1)}\u00b0`),
        span(`neckBody: ${neckBodyDev.toFixed(1)}\u00b0`),
        ...(dropVal === null ? [] : [span(`drop: ${(dropVal * 100).toFixed(1)} h`)]),
    );
}

// --------------------------------------

correctBtn?.addEventListener("click", () => {
    if (lastAngles && lastPoints) {
        correctPoints = { ...lastPoints };
        correctAngles = angles(correctPoints);
        localStorage.setItem("correctPosture", JSON.stringify({ points: correctPoints }));
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
