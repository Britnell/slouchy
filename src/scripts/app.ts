import { AppConnection } from './webrtc-app';

const status = document.getElementById('status')!;

function setStatus(text: string) {
    status.textContent = text;
}

const conn = new AppConnection({
    status: setStatus,
    message: (msg) => console.log('←', msg),
    registered: (url) => setStatus(`camera url: ${url}`)
});
conn.start();
