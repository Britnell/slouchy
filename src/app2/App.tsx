import { useEffect, useMemo, useState } from 'preact/hooks';
import { PostureEngine, type EngineState } from './engine';
import { useSeating } from './seating';
import CameraView from './CameraView';
import SettingsMenu from './SettingsMenu';
import { Icon } from './icons';
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
    const running = state.phase === 'running';
    const seating = useSeating(engine, paused && running);

    useEffect(() => {
        engine.onState = setState;
        engine.preload();
        return () => engine.dispose();
    }, [engine]);

    const breakIn = Math.max(0, BREAK_MIN - Math.floor((seating.sessionMs ?? 0) / 60_000));

    return (
        <div class="mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-3 bg-[#101214] p-5">
            {!running ? (
                // ready view: models preloading/preloaded, waiting for start
                <div class="flex flex-1 flex-col items-center justify-center gap-4">
                    <h1 class="text-2xl font-bold text-[#EDEEF0]">posture</h1>
                    {state.phase === 'error' && <p class="text-[#E5B567]">{state.status}</p>}
                    {state.phase === 'loading' && <p class="text-sm text-[#9AA0A8]">loading…</p>}
                    {(state.phase === 'loading' || state.phase === 'ready') && (
                        <button
                            class="rounded-[14px] bg-[#47a3ff] px-6 py-3 text-[15px] font-semibold text-[#101214]"
                            onClick={() => {
                                unlockAudio();
                                engine.start();
                            }}
                        >
                            Start
                        </button>
                    )}
                    {state.phase === 'error' && (
                        <button
                            class="rounded-[14px] border border-[#282D34] px-4 py-2 text-[#EDEEF0]"
                            onClick={() => engine.preload()}
                        >
                            retry
                        </button>
                    )}
                </div>
            ) : (
                <>
                    <h1 class="text-center text-[22px] font-bold tracking-tight text-[#EDEEF0]">Posture App</h1>

                    {/* posture card */}
                    <div class="flex w-full flex-col items-center justify-between gap-3.5 rounded-2xl border border-[#282D34] bg-[#171A1E] px-6 py-5">
                        <span class="w-full text-[15px] font-semibold text-[#EDEEF0]">Posture</span>
                        {!state.detecting ? (
                            <span class="text-sm text-[#9AA0A8]">loading model…</span>
                        ) : !state.seen ? (
                            <span class="text-sm text-[#9AA0A8]">no one detected</span>
                        ) : (
                            <>
                                {/* flower placeholder: custom posture indicator */}
                                <div class="grid h-[102px] w-[84px] place-items-center rounded-xl border border-dashed border-[#282D34] text-xs text-[#9AA0A8]">
                                    flower
                                </div>
                                <span
                                    class={`text-base font-semibold ${state.slouching ? 'text-[#E5B567]' : 'text-[#47a3ff]'}`}
                                >
                                    {state.slouching ? 'Bad — sit up straight' : 'Good'}
                                </span>
                            </>
                        )}
                    </div>

                    {/* sitting card */}
                    <div class="flex w-full flex-col items-center gap-2 rounded-2xl border border-[#282D34] bg-[#171A1E] px-6 py-5">
                        <span class="w-full text-[15px] font-semibold text-[#EDEEF0]">Sitting</span>
                        <span class="text-[40px] leading-none">{seating.breakDue ? '🚶' : '🪑'}</span>
                        <span
                            class={`text-[44px] font-bold leading-none tracking-tight tabular-nums ${seating.breakDue ? 'text-[#E5B567]' : 'text-[#EDEEF0]'}`}
                        >
                            {mmss(seating.sessionMs ?? 0)}
                        </span>
                        <span class="text-[13px] text-[#9AA0A8]">
                            {seating.breakDue
                                ? 'time for a break'
                                : seating.sitting
                                  ? `Stand up break in ${breakIn} min`
                                  : 'not sitting'}
                        </span>
                        <span class="text-[13px] text-[#9AA0A8]">
                            {Math.floor(seating.totalMs / 60_000)} min total today
                        </span>
                    </div>

                    {/* pause detection */}
                    <button
                        class="flex w-full items-center justify-center gap-2 rounded-[14px] border border-[#282D34] bg-[#171A1E] p-4 text-[15px] font-semibold text-[#EDEEF0]"
                        onClick={() => {
                            const p = !paused;
                            setPaused(p);
                            engine.setPaused(p);
                        }}
                    >
                        {paused ? 'Resume detection' : 'Pause detection'}
                        <Icon name={paused ? 'play' : 'pause'} size={16} class="text-[#9AA0A8]" />
                    </button>

                    {/* camera setup */}
                    <button
                        class="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#47a3ff] p-4 text-[15px] font-semibold text-[#101214]"
                        onClick={() => setShowSettings(true)}
                    >
                        <Icon name="video" size={18} />
                        Camera setup
                    </button>
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
    );
}
