# Posture detection — research notes

## Current approach (calibration-based)
- user clicks 'correct' once → angles + points stored as reference
- slouch = deviations of current angles/drop vs reference, fused into one smoothed score
- breaks when user shifts on chair or laptop tilts → would need recalibration

## Goal: calibration-free
Idea: no 'correct' marking. Track absolute signal values, learn baseline from trends:
slouching = slow drift of all values; sitting up = peak. "Most recent sit-up peak"
(= best attainable posture right now, even if lower than earlier peaks) = baseline.

This is a known class of problems: **adaptive baseline / self-calibrating thresholding**.
The peak idea is a **peak-hold with decay** (audio: envelope follower, slow release).

## Known problem families + standard solutions
1. **Baseline drift** (ECG/EEG): rolling **median or 90–95th percentile** over 5–10 min window.
   Slouch only degrades values → percentile of *best recent posture* beats the mean
   (mean is dragged down by slouch samples). Cheap alternative: slow EMA, fast when improving.
2. **Peak detection** (Pan–Tompkins, heartbeat): local max + **min prominence** + refractory
   period + confirmation window. Confirmed sit-up updates baseline (also downward → new peak).
3. **Change point detection**: **CUSUM** — accumulates small sustained shifts, ideal for slow
   slouch onset, noise-tolerant, cheap. Alternatives: BOCPD (bayesian online), PELT (offline).
4. **Trend vs level decomposition**: Hodrick–Prescott filter / Kalman / Savitzky–Golay —
   split signal into slow trend (baseline) + fast residual (detect on residual).
5. **Robust anomaly score**: per-signal z-score using **median + MAD** over rolling window,
   then weighted fusion like the current score. MAD ignores slouch outliers → learned
   "normal" = sitting up, not average of good+bad.

## Signal classes (invariance to camera changes)
- **intrinsic** angles (`neckBody`, `neckHead`): invariant to camera tilt + translation →
  trustworthy long-term, weight higher.
- **extrinsic** (absolute tilts `head`/`neck`/`back`, y-drop): break when camera moves.
  Fix: estimate camera in-plane rotation from ear–eye or shoulder line, subtract from
  absolute tilts. Y-drop also breaks on translation/scale → lowest weight.
- drift vs calibrated points (fake-detection guard) is calibration-only; calibration-free
  version needs a presence heuristic instead.

## Proposed pipeline
1. absolute signals: head, neck, back, neckBody, neckHead, ear/shoulder y (+ camera-tilt proxy)
2. correct extrinsic tilts by camera-tilt proxy
3. baseline per signal: rolling 90th percentile, ~5 min
4. residual → robust z-score → weighted fusion (like current score)
5. alert: CUSUM or threshold + hysteresis + min duration (SLOUCH_PERIOD stays)
6. sit-up peak detector refreshes baseline fast (percentile gives this mostly for free)

## Data collection (current step)
CSV logger in `src/scripts/logger.ts`, logs per frame: `t, atDesk, alert,` all absolute
angles, all point coords (uncalibrated, no diffs). Button `⬇ csv` in UI or
`postureLogDownload()` in console. Console reports elapsed time + sample count every 30 s.

Protocol for a good capture (~5–10 min):
- 1–2 min normal good posture
- slow slouch over ~1 min, hold, sit back up (peak!)
- repeat with different chair positions / scooting
- nudge laptop tilt mid-session
- brief stand up / leave (tests atDesk gaps)

## Search terms
adaptive baseline removal · Pan–Tompkins adaptive threshold · CUSUM change point detection ·
rolling percentile baseline · envelope follower attack/release · Hodrick–Prescott trend-cycle ·
median absolute deviation robust z-score · calibration-free / unsupervised posture recognition
