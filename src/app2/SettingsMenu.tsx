import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { PostureEngine } from './engine';
import { Icon } from './icons';
import DebugPanel from './DebugPanel';

const SENSITIVITIES = [
    { label: 'Low', value: 50 },
    { label: 'Normal', value: 45 },
    { label: 'High', value: 40 },
] as const;

interface Props {
    engine: PostureEngine;
    open: boolean;
    onClose: () => void;
    showDebug: boolean;
    onToggleDebug: () => void;
    children: ComponentChildren; // camera preview
}

// fullscreen settings page: camera preview + seating position + sensitivity
export default function SettingsMenu({ engine, open, onClose, showDebug, onToggleDebug, children }: Props) {
    const ref = useRef<HTMLDialogElement>(null);
    const [sensitivity, setSensitivity] = useState<number>(45);
    const [seatSet, setSeatSet] = useState(engine.seatingSet);
    const [posJustSet, setPosJustSet] = useState(false);

    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        // esc (native) and the done/close buttons both fire 'close'
        d.addEventListener('close', onClose);
        return () => d.removeEventListener('close', onClose);
    }, [onClose]);

    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        if (open && !d.open) d.showModal();
        else if (!open && d.open) d.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            class="m-0 h-dvh w-screen max-w-none bg-[#101214] p-5 text-[#EDEEF0] backdrop:bg-[#101214]"
        >
            <div class="mx-auto flex h-full w-full max-w-sm flex-col gap-4">
                {/* header */}
                <div class="flex items-center justify-between">
                    <h2 class="text-[17px] font-semibold">Slouchy</h2>
                    <button class="text-[#9AA0A8]" onClick={onClose} aria-label="close">
                        <Icon name="x" size={20} />
                    </button>
                </div>
                <div class="flex items-center justify-between">
                    <h2 class="text-[17px] font-semibold">Camera setup</h2>
                </div>

                {/* camera preview (video/canvas stay mounted even when closed) */}
                <div class="h-[300px] shrink-0 overflow-hidden rounded-2xl border border-[#282D34] bg-[#1E2228]">
                    {children}
                </div>

                {/* set seating position */}
                <button
                    class="flex w-full items-center justify-center gap-2 rounded-[14px] bg-[#47a3ff] p-4 text-[15px] font-semibold text-[#101214]"
                    onClick={() => {
                        if (engine.setSeatingPosition()) {
                            setSeatSet(true);
                            setPosJustSet(true);
                            setTimeout(() => setPosJustSet(false), 10_000);
                        }
                    }}
                >
                    {posJustSet ? 'Position set' : seatSet ? 'Update seating position' : 'Set seating position'}
                    <Icon name="crosshair" size={16} />
                </button>

                {/* sensitivity */}
                <div class="flex items-center justify-between py-2.5">
                    <span class="text-[15px]">Slouch sensitivity</span>
                    <label class="flex items-center gap-1.5 rounded-[10px] border border-[#282D34] bg-[#171A1E] px-3 py-2">
                        <select
                            class="bg-transparent text-[13px] font-medium text-[#EDEEF0] outline-none"
                            value={sensitivity}
                            onChange={(e) => {
                                const v = Number((e.target as HTMLSelectElement).value);
                                setSensitivity(v);
                                engine.slouchThresh = v;
                            }}
                        >
                            {SENSITIVITIES.map((s) => (
                                <option value={s.value}>{s.label}</option>
                            ))}
                        </select>
                        <Icon name="chevron-down" size={14} class="text-[#9AA0A8]" />
                    </label>
                </div>

                {showDebug && <DebugPanel state={engine.state} />}

                <button
                    class={`self-start rounded-lg border border-[#282D34] px-3 py-1.5 text-xs text-[#9AA0A8] ${showDebug ? 'bg-[#171A1E] text-[#EDEEF0]' : ''}`}
                    onClick={onToggleDebug}
                >
                    debug
                </button>

                {/* done */}
                <button
                    class="w-full rounded-[14px] border border-[#282D34] bg-[#171A1E] p-4 text-[15px] font-semibold"
                    onClick={onClose}
                >
                    Done
                </button>
            </div>
        </dialog>
    );
}
