import { MODELS, createLandmarker, LandmarkSmoother } from "./poseLandmarker";
import { computeTilts, deviations, calibrate, SlouchMeter } from "./posture";

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
const NOTE_LENGTH = 0.18; // s
const ALERT_NOTES = [
    [0.15, 660, NOTE_LENGTH],
    [0.35, 520, NOTE_LENGTH],
    [0.75, 520, NOTE_LENGTH * 5],
]; // [start offset s, freq Hz, length s]
const ALERT_VOLUME = 0.15;

let landmarker = null;
let running = false;
let lastVideoTime = -1;
let result = null;
let lastTilts = null;

const smoother = new LandmarkSmoother();
const slouchMeter = new SlouchMeter();

const tiltsEl = document.getElementById("tilts");
const errorEl = document.getElementById("error");

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("hidden");
}
function clearError() {
    errorEl.classList.add("hidden");
}
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

function beep() {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime + 0.1; // small delay so BT doesn't cut off start
    // blip-blop: high note then two repeated lower ones
    ALERT_NOTES.forEach(([t, freq, len]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(ALERT_VOLUME, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + len);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + len);
    });
    setTimeout(() => ctx.close(), 2000);
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
    const slouchEl = document.createElement("span");
    slouchEl.textContent = `slouch: ${slouch.toFixed(1)}\u00b0${slouching ? " SLOUCHING" : ""}`;
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
if (savedModel && MODELS[savedModel]) modelSelect.value = savedModel;
else modelSelect.value = "lite"; // default: lite
modelSelect.addEventListener("change", () => {
    localStorage.setItem("model", modelSelect.value);
    if (landmarker) {
        landmarker.close();
        landmarker = null;
    }
});

if (savedModel && MODELS[savedModel]) startBtn.click();
