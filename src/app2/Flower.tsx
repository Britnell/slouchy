// Slouch indicator flower: straight green stem when posture is good,
// stem curves and head droops as slouch worsens (0-100).
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function Flower({ slouch }: { slouch: number }) {
    const t = Math.min(100, Math.max(0, slouch)) / 100;
    const ease = t * t;

    // stem: stays ~same height, but bows/hunches out and the top curls over as t grows
    const tipX = lerp(42, 62, ease);
    const tipY = lerp(24, 36, ease); // head only drops a bit
    const c1x = 42;
    const c1y = 72;
    const c2x = lerp(42, 47, ease);
    const c2y = lerp(46, 58, ease);
    const stem = `M 42 95 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tipX} ${tipY}`;

    // stem color: green -> dull brown as it wilts
    const g = Math.round(lerp(163, 122, ease));
    const r = Math.round(lerp(63, 150, ease));
    const b = Math.round(lerp(77, 90, ease));

    // head continues the stem's arrival angle, plus a little extra droop
    const stemTilt = (Math.atan2(tipX - c2x, c2y - tipY) * 180) / Math.PI;
    const headAngle = stemTilt + lerp(0, 22, ease);

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
