import { AppConnection } from './webrtc-app';

const status = document.getElementById('status')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function setStatus(text: string) {
    status.textContent = text;
}

const COLORS: Record<string, string> = {
    shoulder: '#f87171',
    hip: '#fbbf24',
    ear: '#34d399',
    eye: '#60a5fa',
    nose: '#e879f9'
};

function drawPoints(data: any) {
    // points are normalized 0..1
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const [name, p] of Object.entries<any>(data)) {
        if (!p) continue;
        const x = p.x * canvas.width;
        const y = p.y * canvas.height;

        ctx.fillStyle = COLORS[name] ?? '#fff';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '12px monospace';
        ctx.fillText(name, x + 10, y + 4);
    }
}

const conn = new AppConnection({
    status: setStatus,
    message: (msg) => {
        try {
            drawPoints(JSON.parse(msg));
        } catch {
            // ignore non-json
        }
    },
    registered: (url) => setStatus(`camera url: ${url}`)
});
conn.start();
