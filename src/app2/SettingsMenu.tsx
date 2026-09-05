import { useEffect, useRef, useState } from 'preact/hooks';
import type { PostureEngine } from './engine';

const SENSITIVITIES = [
    { label: 'normal', value: 45 },
    { label: 'high', value: 40 },
    { label: 'low', value: 50 },
] as const;

export default function SettingsMenu({ engine }: { engine: PostureEngine }) {
    const ref = useRef<HTMLDialogElement>(null);
    const [open, setOpen] = useState(false);
    const [sensitivity, setSensitivity] = useState<number>(45);

    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        // esc (native) and the done button both fire 'close'
        const onClose = () => setOpen(false);
        d.addEventListener('close', onClose);
        return () => d.removeEventListener('close', onClose);
    }, []);

    useEffect(() => {
        const d = ref.current;
        if (!d) return;
        if (open && !d.open) d.showModal();
        else if (!open && d.open) d.close();
    }, [open]);

    return (
        <>
            <button
                class={`rounded-lg border px-3 py-1.5 ${open ? 'bg-slate-700 text-white' : ''}`}
                onClick={() => setOpen((o) => !o)}
            >
                ⚙ settings
            </button>

            <dialog
                ref={ref}
                // click on ::backdrop area (target === dialog itself) closes
                class="m-auto rounded-lg bg-slate-800 p-5 text-white backdrop:bg-black/50"
                onClick={(e) => {
                    if (e.target === ref.current) setOpen(false);
                }}
            >
                <div class="flex flex-col gap-3">
                    <h2 class="text-lg font-semibold">settings</h2>

                    <label class="flex flex-col gap-1 text-sm">
                        slouch sensitivity
                        <select
                            class="rounded-lg border border-slate-500 bg-slate-700 px-2 py-1.5"
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
                    </label>

                    <button
                        class="self-end rounded-lg bg-sky-500 px-4 py-1.5 font-semibold hover:bg-sky-600"
                        onClick={() => setOpen(false)}
                    >
                        done
                    </button>
                </div>
            </dialog>
        </>
    );
}
