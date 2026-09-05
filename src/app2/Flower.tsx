// Slouch indicator flower: straight green stem when posture is good,
// stem curves and head droops as slouch worsens (0-100).
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function Flower({ slouch }: { slouch: number }) {
    const t = Math.min(100, Math.max(0, slouch)) / 100;
    const ease = t * t;

    // stem: bottom center -> tip that swings out and drops as t grows
    const tipX = lerp(42, 74, ease);
    const tipY = lerp(24, 62, ease);
    const c2x = lerp(42, 66, ease);
    const c2y = lerp(50, 66, ease);
    const stem = `M 42 95 C 42 75, ${c2x} ${c2y}, ${tipX} ${tipY}`;

    // stem color: green -> dull brown as it wilts
    const g = Math.round(lerp(163, 122, ease));
    const r = Math.round(lerp(63, 150, ease));
    const b = Math.round(lerp(77, 90, ease));

    // head droops further over as t grows
    const headAngle = lerp(0, 75, ease);

    return (
        <svg viewBox="0 0 84 102" width="84" height="102">
            <path
                d={stem}
                fill="none"
                stroke={`rgb(${r},${g},${b})`}
                stroke-width="4"
                stroke-linecap="round"
            />
            <g transform={`translate(${tipX} ${tipY}) rotate(${headAngle})`}>
                {[0, 60, 120, 180, 240, 300].map((a) => (
                    <circle
                        key={a}
                        cx={0}
                        cy={-9}
                        r="5.5"
                        fill="#EDEEF0"
                        transform={`rotate(${a})`}
                    />
                ))}
                <circle cx={0} cy={0} r="5" fill="#E5B567" />
            </g>
        </svg>
    );
}
