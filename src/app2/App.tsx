import { useEffect, useMemo, useState } from 'preact/hooks';
import { PostureEngine, type EngineState } from './engine';
import CameraView from './CameraView';
import DebugPanel from './DebugPanel';

function seatingText(s: EngineState) {
    if (s.sessionMs === null) return 'undetected';
    if (s.breakDue) return 'get up 🚶';
    const sec = Math.floor(s.sessionMs / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `seated: ${mm}:${ss}`;
}

export default function App() {
    const engine = useMemo(() => new PostureEngine(), []);
    const [state, setState] = useState<EngineState>(() => engine.state);
    const [showDebug, setShowDebug] = useState(true);
    const [showCam, setShowCam] = useState(true);
    const [paused, setPaused] = useState(false);
    const running = state.phase === 'running';

    useEffect(() => {
        engine.onState = setState;
        engine.preload();
        return () => engine.dispose();
    }, [engine]);

    return (
        <div class="flex min-h-screen flex-col gap-4 p-4">
            {!running ? (
                // ready view: models preloading/preloaded, waiting for start
                <div class="flex flex-1 flex-col items-center justify-center gap-4">
                    <h1 class="text-2xl font-bold">posture</h1>
                    <p>{state.status}</p>
                    {state.phase === 'ready' && (
                        <button
                            class="rounded-lg bg-sky-500 px-6 py-3 text-lg font-semibold text-white hover:bg-sky-600"
                            onClick={() => engine.start()}
                        >
                            start
                        </button>
                    )}
                    {state.phase === 'error' && (
                        <button
                            class="rounded-lg border px-4 py-2"
                            onClick={() => {
                                engine.preload();
                            }}
                        >
                            retry
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <div class="flex flex-wrap items-center gap-3">
                        <h1 class="text-xl font-bold">posture</h1>
                        <span class="opacity-70">{state.status}</span>
                        <span>{seatingText(state)}</span>
                        <span class={state.slouching ? 'font-bold text-orange-500' : ''}>
                            {state.slouching
                                ? 'sit up straight!'
                                : state.seen
                                  ? 'posture: good'
                                  : 'posture: ?'}
                        </span>
                    </div>

                    <div class="flex gap-2">
                        <button
                            class="rounded-lg border px-3 py-1.5"
                            onClick={() => {
                                const p = !paused;
                                setPaused(p);
                                engine.setPaused(p);
                            }}
                        >
                            {paused ? '▶ resume' : '⏸ pause'}
                        </button>
                        <button
                            class={`rounded-lg border px-3 py-1.5 ${showDebug ? 'bg-slate-700 text-white' : ''}`}
                            onClick={() => setShowDebug((d) => !d)}
                        >
                            debug
                        </button>
                        <button
                            class={`rounded-lg border px-3 py-1.5 ${showCam ? 'bg-slate-700 text-white' : ''}`}
                            onClick={() => setShowCam((c) => !c)}
                        >
                            camera
                        </button>
                    </div>

                    {showDebug && <DebugPanel state={state} />}
                </>
            )}

            {/* single stable instance: the video element must exist before
                start() and survive phase changes */}
            <CameraView engine={engine} show={running && showCam} />
        </div>
    );
}
