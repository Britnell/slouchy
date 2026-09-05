import type { EngineState } from './engine';
import { PARAMS } from './engine';

const fmt = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(1)}` : '-');
const fmtAbs = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');

// abs / sdiff / integral table, same values as the old /app debug view
export default function DebugPanel({ state }: { state: EngineState }) {
    const cols: [string, number[], (x: number) => string][] = [
        ['angle', state.abs, fmtAbs],
        ['diff', state.diff, fmt],
        ['integral', state.integral, fmt],
    ];
    return (
        <table>
            <thead>
                <tr>
                    <th></th>
                    {cols.map(([label]) => (
                        <th key={label} class="px-1 py-0.5 text-xs sm:px-2 sm:py-1 sm:text-sm">
                            {label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {PARAMS.map((p, i) => (
                    <tr key={p}>
                        <td class="px-1 py-0.5 text-xs sm:px-2 sm:py-1 sm:text-sm">{p}</td>
                        {cols.map(([label, vals, f]) => (
                            <td
                                key={label}
                                class="px-1 py-0.5 text-xs tabular-nums sm:px-2 sm:py-1 sm:text-sm"
                                style={label === 'integral' && state.paramHigh[i] ? 'background: orange' : ''}
                            >
                                {f(vals[i])}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
