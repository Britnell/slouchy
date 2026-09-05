
const ALERT_VOLUME = 0.15;

let ctx: AudioContext | undefined;

/** call from a user gesture (e.g. start button tap) to unlock audio on mobile */
export function unlockAudio() {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
}

/** notes: [start offset s, freq Hz, length s][] */
export function play(notes: [number, number, number][], volume = ALERT_VOLUME) {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime + 0.1; // small delay so BT doesn't cut off start
    notes.forEach(([t, freq, len]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + len);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + t);
        osc.stop(now + t + len);
    });
}

// semitone offsets of a minor 7 chord: root, minor 3rd, 5th, minor 7th
const CHORD_SEMITONES = [0, 3, 7, 10];

/** notes ascending: root, m3, 5, m7 */
export function chord(root: number, gap = 0.12, len = NOTE_LENGTH) {
    play(
        CHORD_SEMITONES.map(
            (semi, i) => [i * gap, root * Math.pow(2, semi / 12), len] as [number, number, number]
        )
    );
}

export function badidi() {
    // blip-blop: high note then two repeated lower ones
    const NOTE_LENGTH = 0.18; // s
    const ALERT_NOTES = [
        [0.15, 660, NOTE_LENGTH],
        [0.35, 520, NOTE_LENGTH],
        [0.75, 520, NOTE_LENGTH * 5],
    ]  // [start offset s, freq Hz, length s]
    play(ALERT_NOTES);
}

export function bebep() {
    // two quick same notes, short break, then the same note again (long)
    const NOTE_LENGTH = 0.18; // s
    const FREQ = 480; // a lil lower than badidi's
    const ALERT_NOTES = [
        [0.15, FREQ, NOTE_LENGTH],
        [0.35, FREQ, NOTE_LENGTH],
        [0.75, FREQ, NOTE_LENGTH * 5],
    ]  // [start offset s, freq Hz, length s]
    play(ALERT_NOTES);
}


// voices load async in most browsers; force them to load
speechSynthesis.getVoices();
speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();

export function speak(text: string) {
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices()
  console.log(voices)
    const goodnews = voices.find((v) => v.name.toLowerCase() === 'goodnews');
    if (goodnews) u.voice = goodnews;
    speechSynthesis.speak(u);
}
