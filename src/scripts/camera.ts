import { createLandmarker, LandmarkSmoother } from './poseLandmarker';
import { computeTilts } from './posture';
import { CameraConnection } from './webrtc-camera';

const uid = new URLSearchParams(location.search).get('uid');
const status = document.getElementById('status')!;
const video = document.getElementById('video') as HTMLVideoElement;

function setStatus(text: string) {
    status.textContent = text;
}

if (!uid) {
    setStatus('✖ no uid — open this page via the url logged on /app');
} else {
    const conn = new CameraConnection(uid, {
        status: setStatus,
        message: () => {},
        connected: () => {
            setStatus('connected');
            startDetection(conn).catch((err) =>
                setStatus(`✖ ${err.message ?? err}`),
            );
        },
    });
    conn.start();
}

const r4 = (v) => Math.round(v * 10000) / 10000;
const pt = ({ x, y }) => ({ x: r4(x), y: r4(y) });

async function startDetection(conn: CameraConnection) {
    const landmarker = await createLandmarker('lite');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();

    const smoother = new LandmarkSmoother();
    let lastVideoTime = -1;

    (function loop() {
        if (video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const result = landmarker.detectForVideo(video, performance.now());
            const raw = result?.landmarks?.[0];
            if (raw) {
                const landmarks = smoother.smooth(raw);
                const { points } = computeTilts(landmarks);
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
        requestAnimationFrame(loop);
    })();
}
