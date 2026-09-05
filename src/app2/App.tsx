import { useEffect, useMemo, useState } from 'preact/hooks';
import { PostureEngine, type EngineState } from './engine';
import { useSeating } from './seating';
import CameraView from './CameraView';
import DebugPanel from './DebugPanel';
import SettingsMenu from './SettingsMenu';

function mmss(ms: number) {
    const sec = Math.floor(ms / 1000);
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export default function App() {
    const engine = useMemo(() => new PostureEngine(), []);
    const [state, setState] = useState<EngineState>(() => engine.state);
    const [showDebug, setShowDebug] = useState(true);
    const [showCam, setShowCam] = useState(true);
    const [paused, setPaused] = useState(false);
    const running = state.phase === 'running';
    const seating = useSeating(engine, paused && running);

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
                    {/* meta row */}
                    <div class="flex flex-wrap items-center gap-3 text-sm opacity-80">
                        <span>{state.status}</span>
                    </div>

                    {/* today's total, right-aligned above seating */}
                    <div class="self-end rounded-lg bg-slate-300/60 px-2 py-1 text-sm tabular-nums">
                        🪑 {Math.floor(seating.totalMs / 60_000)} min total ☀️
                    </div>

                    {/* seating hero: emoji + label, counter below */}
                    <div class="flex flex-col">
                        <span
                            class={`text-4xl font-bold ${seating.breakDue ? 'text-orange-500' : ''}`}
                        >
                            {seating.breakDue ? '🚶' : seating.sitting ? '🪑' : '🚶'}
                        </span>
                        <span class="text-sm opacity-70">
                            {seating.breakDue ? 'get up!' : seating.sitting ? 'sitting' : 'not at desk'}
                        </span>
                        {seating.sitting && !seating.breakDue && (
                            <span class="text-4xl font-bold tabular-nums">
                                {mmss(seating.sessionMs ?? 0)}
                            </span>
                        )}
                    </div>

                    {/* posture: emoji above label */}
                    <div class="flex flex-col">
                        <span class="text-3xl">
                            {state.slouching ? '🥀' : state.seen ? '🌻' : '❓'}
                        </span>
                        <span
                            class={`text-sm ${state.slouching ? 'font-semibold text-orange-500' : 'opacity-70'}`}
                        >
                            {state.slouching ? 'bad' : state.seen ? 'good' : '?'}
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
                        <SettingsMenu engine={engine} />
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
