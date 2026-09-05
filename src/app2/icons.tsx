import type { JSX } from 'preact';

// minimal lucide-style line icons
const PATHS: Record<string, JSX.Element> = {
    pause: (
        <>
            <rect x="14" y="4" width="4" height="16" rx="1" />
            <rect x="6" y="4" width="4" height="16" rx="1" />
        </>
    ),
    play: <polygon points="6 3 20 12 6 21 6 3" />,
    x: (
        <>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </>
    ),
    'chevron-down': <path d="m6 9 6 6 6-6" />,
    video: (
        <>
            <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
            <rect x="2" y="6" width="14" height="12" rx="2" />
        </>
    ),
    crosshair: (
        <>
            <circle cx="12" cy="12" r="10" />
            <line x1="22" x2="18" y1="12" y2="12" />
            <line x1="6" x2="2" y1="12" y2="12" />
            <line x1="12" x2="12" y1="6" y2="2" />
            <line x1="12" x2="12" y1="22" y2="18" />
        </>
    ),
};

export function Icon({
    name,
    size = 18,
    class: cls,
}: {
    name: keyof typeof PATHS;
    size?: number;
    class?: string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class={cls}
        >
            {PATHS[name]}
        </svg>
    );
}
