// canvas drawing for posture visualization

export function fitToVideo(canvas, video) {
    video.addEventListener("loadedmetadata", () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    });
}

export function clearCanvas(canvasCtx, canvas) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    canvasCtx.restore();
}

export function drawFrame(canvasCtx, canvas, points, landmarks) {
    clearCanvas(canvasCtx, canvas);
    drawBox(canvasCtx, canvas, landmarks);
    drawPosturePoints(canvasCtx, canvas, points);
}

// pitch gauge: rectangle rotated by head nod
// (pitch from face landmarker; nod down rotates it down)
export function drawPitch(canvasCtx, canvas, cx, cy, pitch) {
    if (!Number.isFinite(pitch)) return;
    const w = canvas.width * 0.12,
        h = canvas.width * 0.02;
    canvasCtx.save();
    canvasCtx.translate(cx, cy);
    canvasCtx.rotate((pitch * Math.PI) / 180);
    canvasCtx.fillStyle = "#4ade80";
    canvasCtx.fillRect(-w / 2, -h / 2, w, h);
    canvasCtx.restore();
}

// white box through shoulders + hips
export function drawBox(canvasCtx, canvas, landmarks) {
    const W = canvas.width, H = canvas.height;
    const corners = [11, 12, 24, 23];
    canvasCtx.beginPath();
    corners.forEach((i, idx) => {
        const p = landmarks[i];
        if (idx === 0) canvasCtx.moveTo(p.x * W, p.y * H);
        else canvasCtx.lineTo(p.x * W, p.y * H);
    });
    canvasCtx.closePath();
    canvasCtx.strokeStyle = "#ffffff";
    canvasCtx.lineWidth = 3;
    canvasCtx.stroke();
    for (const i of corners) {
        const p = landmarks[i];
        canvasCtx.beginPath();
        canvasCtx.arc(p.x * W, p.y * H, 4, 0, 2 * Math.PI);
        canvasCtx.fillStyle = "#ffffff";
        canvasCtx.fill();
    }
}

export function drawPosturePoints(canvasCtx, canvas, pts) {
    const W = canvas.width,
        H = canvas.height;
    const colors = {
        shoulder: "#38bdf8",
        hip: "#f472b6",
        ear: "#22d3ee",
        nose: "#fbbf24",
    };

    canvasCtx.globalAlpha = 1;
    for (const [name, p] of Object.entries(pts)) {
        if (name === "eye") continue; // not drawn: eye unused
        canvasCtx.beginPath();
        canvasCtx.arc(p.x * W, p.y * H, 8, 0, 2 * Math.PI);
        canvasCtx.fillStyle = colors[name];
        canvasCtx.fill();
    }

    // key tilt lines
    const line = (p1, p2, color) => {
        canvasCtx.beginPath();
        canvasCtx.moveTo(p1.x * W, p1.y * H);
        canvasCtx.lineTo(p2.x * W, p2.y * H);
        canvasCtx.strokeStyle = color;
        canvasCtx.lineWidth = 4;
        canvasCtx.stroke();
    };
    line(pts.ear, pts.nose, "#fbbf24"); // head (nose variant)
    line(pts.ear, pts.shoulder, "#38bdf8"); // neck
    line(pts.shoulder, pts.hip, "#f472b6"); // back
}
