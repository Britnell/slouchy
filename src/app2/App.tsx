import { useEffect, useMemo, useState } from 'preact/hooks';
import { PostureEngine, type EngineState } from './engine';
import { useSeating } from './seating';
import CameraView from './CameraView';
import SettingsMenu from './SettingsMenu';
import { Icon } from './icons';
import Flower from './Flower';
import { unlockAudio } from '../scripts/tone';

function mmss(ms: number) {
    const sec = Math.floor(ms / 1000);
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

const BREAK_MIN = 30;

export default function App() {
    const engine = useMemo(() => new PostureEngine(), []);
    const [state, setState] = useState<EngineState>(() => engine.state);
    const [showSettings, setShowSettings] = useState(false);
    const [showDebug, setShowDebug] = useState(false);
    const [paused, setPaused] = useState(false);
    const [camDenied, setCamDenied] = useState(false); // no permission yet → start camera screen
    const running = state.phase === 'running';
    const seating = useSeating(engine, paused && running);

    useEffect(() => {
        engine.onState = setState;
        engine.preload();
        // probe camera: granted → jump straight into the app, else start screen.
        // keep the probe stream until start() has its own so the camera light doesn't blink
        (async () => {
            let probe: MediaStream | null = null;
            try {
                probe = await navigator.mediaDevices.getUserMedia({ video: true });
                await engine.start();
            } catch {
                setCamDenied(true);
            } finally {
                probe?.getTracks().forEach((t) => t.stop());
            }
        })();
        // audio needs a user gesture; auto-start skips the start button, so grab any tap
        const unlock = () => unlockAudio();
        window.addEventListener('pointerdown', unlock, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlock);
            engine.dispose();
        };
    }, [engine]);

    const breakIn = Math.max(0, BREAK_MIN - Math.floor((seating.sessionMs ?? 0) / 60_000));

    // max integral across slouch indicators (NaN params excluded), 20→80 → 0→100
    const maxIntegral = state.integral.reduce(
        (m, v) => (Number.isFinite(v) && v > m ? v : m),
        -Infinity,
    );
    const flowerSlouch = Math.min(100, Math.max(0, ((maxIntegral - 20) / 60) * 100));

    return (
        <div class="min-h-dvh w-full bg-bg">
        <div class="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-3 p-5">
            {!running ? (
                // no camera permission yet: start camera screen
                <div class="flex flex-1 flex-col items-center justify-center gap-4">
                    <h1 class="text-2xl font-bold text-primary">Slouchy</h1>
                    {state.phase === 'error' && (
                        <p class="text-center text-sm text-danger">{state.status}</p>
                    )}
                    {camDenied || state.phase === 'error' ? (
                        <button
                            class="flex w-full items-center justify-center gap-2 rounded-[14px] bg-green p-4 text-[15px] font-semibold text-bg"
                            onClick={() => {
                                unlockAudio();
                                engine.start();
                            }}
                        >
                            <Icon name="video" size={18} />
                            Start camera
                        </button>
                    ) : (
                        <span class="text-sm text-secondary">starting…</span>
                    )}
                </div>
            ) : (
                <>
                    <header class="flex w-full items-center justify-between">
                        <h1 class="text-[22px] font-bold tracking-tight text-primary">Slouchy</h1>
                        <div class="flex items-center gap-2">
                            <button
                                class="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-card-stroke bg-card"
                                title={paused ? 'Resume detection' : 'Pause detection'}
                                onClick={() => {
                                    const p = !paused;
                                    setPaused(p);
                                    engine.setPaused(p);
                                }}
                            >
                                <Icon name={paused ? 'play' : 'pause'} size={16} class="text-secondary" />
                            </button>
                            <button
                                class="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-green"
                                title="Camera setup"
                                onClick={() => setShowSettings(true)}
                            >
                                <Icon name="video" size={16} class="text-bg" />
                            </button>
                        </div>
                    </header>

                    {/* posture card */}
                    <div class="flex w-full flex-col items-center justify-between gap-3.5 rounded-2xl border border-card-stroke bg-card px-6 py-5">
                        <span class="w-full text-[15px] font-semibold text-primary">Posture</span>
                        {!state.detecting ? (
                            <span class="py-10 text-sm text-secondary">loading…</span>
                        ) : !state.seen ? (
                            <span class="text-sm text-secondary">no one detected</span>
                        ) : (
                            <>
                            <Flower slouch={flowerSlouch} />
                                <span
                                    class={`text-base font-semibold ${state.slouching ? 'text-danger' : 'text-green'}`}
                                >
                                    {state.slouching ? 'Bad — sit up straight' : 'Good'}
                                </span>
                            </>
                        )}
                    </div>

                    {/* sitting card */}
                    <div class="flex w-full flex-col items-center gap-2 rounded-2xl border border-card-stroke bg-card px-6 py-5">
                        <span class="w-full text-[15px] font-semibold text-primary">Sitting</span>
                        {!state.detecting ? (
                            <span class="py-10 text-sm text-secondary">loading…</span>
                        ) : (
                            <>
                                <span class="text-[40px] leading-none">{seating.breakDue ? '🚶' : '🪑'}</span>
                                <span
                                    class={`text-[44px] font-bold leading-none tracking-tight tabular-nums ${seating.breakDue ? 'text-danger' : 'text-primary'}`}
                                >
                                    {mmss(seating.sessionMs ?? 0)}
                                </span>
                                <span class="text-[13px] text-secondary">
                                    {seating.breakDue
                                        ? 'time for a break'
                                        : seating.sitting
                                          ? `Stand up break in ${breakIn} min`
                                          : 'not sitting'}
                                </span>
                                <span class="text-[13px] text-secondary">
                                    {Math.floor(seating.totalMs / 60_000)} min total today
                                </span>
                            </>
                        )}
                    </div>

                </>
            )}

            <SettingsMenu
                engine={engine}
                open={showSettings}
                onClose={() => setShowSettings(false)}
                showDebug={showDebug}
                onToggleDebug={() => setShowDebug((d) => !d)}
            >
                <CameraView engine={engine} show={running} />
            </SettingsMenu>
        </div>
        </div>
    );
}
