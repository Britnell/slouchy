import { CameraConnection } from './webrtc-camera';

const uid = new URLSearchParams(location.search).get('uid');
const status = document.getElementById('status')!;

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
            let count = 0;
            setInterval(() => conn.send(`tick ${++count}`), 1000);
        }
    });
    conn.start();
}
