import type { EngineState } from './engine';
import { PARAMS } from './engine';

const fmt = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(1)}` : '-');
const fmtAbs = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');

// abs / sdiff / integral table, same values as the old /app debug view
export default function DebugPanel({ state }: { state: EngineState }) {
    const rows: [string, number[], (x: number) => string][] = [
        ['angles', state.abs, fmtAbs],
        ['sdiff', state.diff, fmt],
        ['integral', state.integral, fmt],
    ];
    return (
        <table>
            <thead>
                <tr>
                    <th></th>
                    {PARAMS.map((p) => (
                        <th key={p} class="px-1 py-0.5 text-xs sm:px-2 sm:py-1 sm:text-sm">{p}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map(([label, vals, f]) => (
                    <tr key={label}>
                        <td class="px-1 py-0.5 text-xs sm:px-2 sm:py-1 sm:text-sm">{label}</td>
                        {vals.map((v, i) => (
                            <td key={i} class="px-1 py-0.5 text-xs tabular-nums sm:px-2 sm:py-1 sm:text-sm" style={label === 'integral' && state.paramHigh[i] ? 'background: orange' : ''}>
                                {f(v)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
