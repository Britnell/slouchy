import { useEffect, useRef } from 'preact/hooks';
import type { PostureEngine } from './engine';

// video + overlay canvas, drawn by the engine's detection loop.
// always mounted (hidden via css) so the video element exists before start();
// detection keeps running with display: none.
export default function CameraView({ engine, show }: { engine: PostureEngine; show: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (videoRef.current && canvasRef.current) {
            engine.attach(videoRef.current, canvasRef.current);
        }
    }, [engine]);

    return (
        <div class="h-full w-full" style={{ display: show ? 'block' : 'none' }}>
            <div class="relative h-full w-full">
                <video ref={videoRef} playsinline muted class="h-full w-full rounded-2xl object-cover" />
                <canvas ref={canvasRef} class="absolute inset-0 h-full w-full" />
            </div>
        </div>
    );
}
