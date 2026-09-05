// seating time tracking, on top of the engine's `seen` flag.
// - current continuous session (for the standup notification)
// - total seated time today, persisted to localStorage as
//   { date: 'DD/MM', total: ms, begin: epoch-ms-or-null }
// a session ends (and its time is folded into the total) when the user
// is not detected for GONE_MS, pauses, or the engine stops/unmounts.

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { PostureEngine } from './engine';
import { chord } from '../scripts/tone';

const KEY = 'seating';
const GONE_MS = 10_000; // not seen this long = got up
const BREAK_AFTER_MS = 30 * 60 * 1000; // standup notification

interface Stored {
    date: string; // 'DD/MM'
    total: number; // ms seated today
    begin: number | null; // epoch ms when current session began
}

interface Track {
    stored: Stored;
    sessionStart: number | null;
    lastSeen: number | null;
    breakAnnounced: boolean;
    paused: boolean;
    pausedAt: number | null; // wall time when paused, null = active
}

export interface SeatingState {
    sitting: boolean;
    sessionMs: number | null; // current continuous session, null = not seated
    totalMs: number; // seated today
    breakDue: boolean;
}

function today(): string {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function load(): Stored {
    try {
        const s = JSON.parse(localStorage.getItem(KEY) ?? '');
        if (s && typeof s.total === 'number' && s.date === today()) {
            return {
                date: s.date,
                total: s.total,
                begin: typeof s.begin === 'number' ? s.begin : null,
            };
        }
    } catch {
        // fallthrough
    }
    return { date: today(), total: 0, begin: null };
}

function shallowEq(a: SeatingState, b: SeatingState) {
    return (
        a.sitting === b.sitting &&
        a.sessionMs === b.sessionMs &&
        a.totalMs === b.totalMs &&
        a.breakDue === b.breakDue
    );
}

export function useSeating(engine: PostureEngine, paused: boolean): SeatingState {
    const [snap, setSnap] = useState<SeatingState>(() => {
        const s = load();
        return {
            sitting: s.begin !== null,
            sessionMs: s.begin !== null ? Date.now() - s.begin : null,
            totalMs: s.total,
            breakDue: false,
        };
    });

    // lazy ref init (runs once): mutable tracking state, restored from storage
    // so an in-progress session survives a reload
    const ref = useRef<Track | null>(null);
    if (ref.current === null) {
        const stored = load();
        ref.current = {
            stored,
            sessionStart: stored.begin,
            lastSeen: null,
            breakAnnounced: false,
            paused,
            pausedAt: null,
        };
    }
    const t = ref.current;

    const persist = useCallback(() => {
        t.stored = { date: today(), total: t.stored.total, begin: t.sessionStart };
        localStorage.setItem(KEY, JSON.stringify(t.stored));
    }, [t]);

    const publish = useCallback(() => {
        setSnap((prev) => {
            // paused = frozen clock, so the timer doesn't tick on
            const clock = t.pausedAt ?? Date.now();
            const next = {
                sitting: t.sessionStart !== null,
                sessionMs: t.sessionStart === null ? null : clock - t.sessionStart,
                // live total includes the in-progress session, so it ticks up too
                totalMs:
                    t.stored.total +
                    (t.sessionStart === null ? 0 : clock - t.sessionStart),
                breakDue: t.breakAnnounced,
            };
            return shallowEq(prev, next) ? prev : next; // skip no-op renders
        });
    }, [t]);

    const endSession = useCallback(() => {
        if (t.sessionStart === null) return;
        t.stored.total += (t.pausedAt ?? Date.now()) - t.sessionStart;
        t.sessionStart = null;
        t.lastSeen = null;
        t.breakAnnounced = false;
        persist();
        publish();
    }, [t, persist, publish]);

    // 1s tick: the engine only emits when frames arrive, so absence of the
    // user has to be noticed here
    useEffect(() => {
        const tick = () => {
            const now = Date.now();
            if (t.stored.date !== today()) {
                t.stored.total = 0; // new day, an ongoing session carries over
                persist();
            }
            if (t.paused) {
                // frozen: session (and indicator) hold while paused
            } else if (engine.state.phase !== 'running') {
                endSession();
            } else if (engine.state.seen) {
                t.lastSeen = now;
                if (t.sessionStart === null) {
                    t.sessionStart = now;
                    t.breakAnnounced = false;
                    persist();
                }
            } else if (t.sessionStart !== null && now - (t.lastSeen ?? 0) > GONE_MS) {
                // lastSeen null = session restored from storage but user never
                // seen since: treat as gone (sessionStart is long past)
                endSession();
            }

            if (
                !t.paused &&
                t.sessionStart !== null &&
                !t.breakAnnounced &&
                now - t.sessionStart >= BREAK_AFTER_MS
            ) {
                t.breakAnnounced = true;
                chord(440);
            }
            publish();
        };

        const iv = setInterval(tick, 1000);
        tick();
        return () => {
            clearInterval(iv);
            endSession(); // fold an in-progress session on unmount
        };
    }, [engine, t, endSession, publish]);

    // pausing freezes the session clock; it resumes seamlessly on unpause
    useEffect(() => {
        t.paused = paused;
        if (paused) {
            t.pausedAt ??= Date.now();
        } else if (t.pausedAt !== null) {
            const shift = Date.now() - t.pausedAt;
            t.pausedAt = null;
            if (t.sessionStart !== null) t.sessionStart += shift;
            if (t.lastSeen !== null) t.lastSeen += shift;
        }
    }, [paused, t]);

    return snap;
}
