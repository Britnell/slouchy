const NOTE_LENGTH = 0.18; // s
const ALERT_NOTES = [
    [0.15, 660, NOTE_LENGTH],
    [0.35, 520, NOTE_LENGTH],
    [0.75, 520, NOTE_LENGTH * 5],
]; // [start offset s, freq Hz, length s]
const ALERT_VOLUME = 0.15;

export function beep() {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime + 0.1; // small delay so BT doesn't cut off start
    // blip-blop: high note then two repeated lower ones
    ALERT_NOTES.forEach(([t, freq, len]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(ALERT_VOLUME, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + len);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + len);
    });
    setTimeout(() => ctx.close(), 2000);
}
