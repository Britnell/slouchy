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
const ALERT_NOTES = [
    [0.15, 520],
    [0.4, 390],
]; // [start offset s, freq Hz]
const ALERT_VOLUME = 0.15;
const NOTE_LENGTH = 0.18; // s

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

function beep() {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    // blip-blop: two descending notes, delayed start so BT doesn't cut it off
    ALERT_NOTES.forEach(([t, freq]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(now + t);
        osc.stop(now + t + NOTE_LENGTH);
    });
    gain.gain.value = ALERT_VOLUME;
    setTimeout(() => ctx.close(), 1000);
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
