import { createLandmarker } from './poseLandmarker';
import { LandmarkOneEuro } from './filter';
import { midpoints } from './posture';
import { drawFrame, fitToVideo } from './canvas';
import { CameraConnection } from './webrtc-camera';

const uid = new URLSearchParams(location.search).get('uid');
const SEND_INTERVAL_MS = 400; // send throttle only; smoothing runs per detected frame
// 1 euro filter tuning: minCutoff = jitter suppression when slow, beta = responsiveness when fast
const FILTER_OPTS = { minCutoff: 1, beta: 0.3, dCutoff: 1 };
const status = document.getElementById('status')!;
const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const canvasCtx = canvas.getContext('2d');

fitToVideo(canvas, video);

function setStatus(text: string) {
    status.textContent = text;
}

let peerUp = false;
let detectionStarted = false;
let paused = false;

const pauseBtn = document.createElement('button');
pauseBtn.textContent = '⏸ pause detection';
pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ resume detection' : '⏸ pause detection';
});
status.after(pauseBtn);

if (!uid) {
    setStatus('✖ no uid — open this page via the url logged on /app');
} else {
    const conn = new CameraConnection(uid, {
        status: setStatus,
        message: () => {},
        connected: () => {
            peerUp = true;
            setStatus('connected');
            if (!detectionStarted) {
                detectionStarted = true;
                startDetection(conn, SEND_INTERVAL_MS).catch((err) =>
                    setStatus(`✖ ${err.message ?? err}`),
                );
            }
        },
        disconnected: () => {
            peerUp = false;
            setStatus('✖ connection lost, waiting to reconnect...');
        },
    });
    conn.start();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) video.pause();
        else if (peerUp) video.play();
    });
}

const r4 = (v) => Math.round(v * 10000) / 10000;
const pt = ({ x, y }) => ({ x: r4(x), y: r4(y) });

async function startDetection(conn: CameraConnection, sendIntervalMs: number) {
    const landmarker = await createLandmarker('lite');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();

    const smoother = new LandmarkOneEuro(FILTER_OPTS);
    let lastVideoTime = -1;
    let lastSent = 0;

    (function loop() {
        if (peerUp && !paused && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const now = performance.now();
            const result = landmarker.detectForVideo(video, now);
            const raw = result?.landmarks?.[0];
            if (raw) {
                const landmarks = smoother.smooth(raw, now);
                const points = midpoints(landmarks);
                drawFrame(canvasCtx, canvas, points, landmarks);
                if (now - lastSent >= sendIntervalMs) {
                    lastSent = now;
                    conn.send(
                        JSON.stringify({
                            shoulder: pt(points.shoulder),
                            hip: pt(points.hip),
                            ear: pt(points.ear),
                            eye: pt(points.eye),
                            nose: pt(points.nose),
                        }),
                    );
                }
            }
        }
        requestAnimationFrame(loop);
    })();
}
