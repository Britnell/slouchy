# /// script
# requires-python = ">=3.11"
# dependencies = ["pandas", "matplotlib"]
# ///
# offline analysis of posture logger csv (see detection.md)
#   uv run analyze.py [csv] [--show]
# outputs pngs next to the csv + stats to stdout. no ground truth needed for
# the first pass: we look at what slouch does to each signal, then test the
# calibration-free detector (rolling percentile baseline -> robust z -> cusum).

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
import matplotlib.pyplot as plt

# --- config ---
HZ = 10                      # resample rate
BASELINE_WIN = 300           # s, trailing window for percentile baseline
BASELINE_PCT = 90            # percentile: 'best recent posture'
CUSUM_K = 2.0                # slack (in robust z units)
ALERT_ON_S = 3.0             # sustained-bad duration before an alarm counts

# degradation direction per signal: +1 = value grows when slouching,
# -1 = value shrinks when slouching. the 3 slouch params from posture.ts:
# drop = (earY + shoulderY) / 2, absolute basis of calibrated drop(), y-down.
DIRECTIONS = {
    'neck': +1,        # absolute tilt vs vertical, leans forward -> up
    'neckBody': -1,    # intrinsic, rounds -> shrinks
    'drop': +1,        # y-down coords: dropping -> up
}
# weights for fusion (0 = excluded)
WEIGHTS = {
    'neck': 1.0,
    'neckBody': 1.0,
    'drop': 1.0,
}

def robust_z(x: pd.Series, win_s: float) -> pd.Series:
    med = x.rolling(int(win_s * HZ), min_periods=1).median()
    mad = (x - med).abs().rolling(int(win_s * HZ), min_periods=1).median()
    return (x - med) / (1.4826 * mad + 1e-9)

def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    show = '--show' in sys.argv
    csv = Path(args[0] if args else 'analysis/x.csv')
    outdir = csv.parent / (csv.stem + '_out')
    outdir.mkdir(exist_ok=True)

    # t + signals only
    df = pd.read_csv(csv)
    t = df['t'].astype(float)

    # --- resample to fixed rate via linear interpolation (no index matching) ---
    grid = np.arange(t.iloc[0], t.iloc[-1], 1 / HZ)
    r = pd.DataFrame(index=grid)
    for c in DIRECTIONS:
        if c not in df.columns:
            continue
        v = pd.to_numeric(df[c], errors='coerce')
        # bridge <=3 s gaps by forward fill before interpolating
        vi = pd.Series(v.values, index=t.values).ffill(limit=90).bfill(limit=90)
        ok = vi.notna().values
        r[c] = np.interp(grid, t.values[ok], vi.values[ok])
    signals = [c for c in DIRECTIONS if c in r.columns]
    win = int(BASELINE_WIN * HZ)
    n = len(r)

    print(f'{csv}: {len(df)} rows, {(t.iloc[-1] - t.iloc[0]) / 60:.1f} min, '
          f'{HZ} Hz resampled -> {n} samples')
    print('sanity (first resampled neck values):',
          np.round(r['neck'].head(3).values, 2), 'csv row1:', df['neck'].iloc[0])

    # --- per-signal sanity stats ---
    print(f'\n{"signal":<10} {"noise":>7} {"range":>7} {"slouchSwing":>11} {"corrNeck":>9}')
    degrad = {}
    for c in signals:
        s = r[c]
        base = s.rolling(win, min_periods=1).quantile(BASELINE_PCT / 100)
        d = DIRECTIONS[c] * (s - base)          # >0 = degraded vs best recent
        degrad[c] = d
        swing = d.quantile(0.95)                 # typical full-slouch excursion
        corr = d.corr(degrad['neck']) if c != 'neck' else 1.0
        print(f'{c:<10} {s.diff().std() * np.sqrt(HZ):7.2f} '
              f'{s.max() - s.min():7.1f} {swing:11.2f} {corr:9.2f}')

    print('\ncamera-tilt check skipped: coords no longer logged')

    # --- fusion: robust z of degradation, weighted ---
    z = pd.DataFrame({c: robust_z(degrad[c], BASELINE_WIN) for c in signals})
    w = np.array([WEIGHTS[c] for c in signals])
    fused = (z * w).sum(axis=1) / w.sum()

    # --- cusum (one-sided) + sustained alert ---
    exc = (fused - CUSUM_K).clip(lower=0).fillna(0)
    cusum = exc.cumsum() - exc.cumsum().where(exc == 0).ffill().fillna(0)  # reset on recovery
    bad = (fused > CUSUM_K).astype(float).where(fused.notna())
    alarm = bad.rolling(int(ALERT_ON_S * HZ), min_periods=1).mean() >= 0.999

    n_alarms = int(alarm.fillna(False).astype(bool).diff().clip(lower=0).sum())
    print(f'\nfused z: median {fused.median():+.2f}, p95 {fused.quantile(0.95):+.2f}, '
          f'alarms {n_alarms} ({alarm.fillna(False).mean() * 100:.0f}% of time)')

    # --- plots ---
    matplotlib.use('TkAgg' if show else 'Agg')
    fig, axes = plt.subplots(4, 1, figsize=(16, 14), sharex=True)
    x = np.arange(n)
    minutes = x / (60 * HZ)

    ax = axes[0]
    for c in signals:
        ax.plot(minutes, r[c], label=c, lw=0.8)
    ax.set_title('absolute signals')
    ax.legend(ncol=6, fontsize=8)

    ax = axes[1]
    for c in signals:
        base = r[c].rolling(win, min_periods=1).quantile(BASELINE_PCT / 100)
        ax.plot(minutes, base, lw=0.8, label=f'{c} base')
    ax.set_title(f'rolling p{BASELINE_PCT} baseline, {BASELINE_WIN}s window')
    ax.legend(ncol=6, fontsize=8)

    ax = axes[2]
    for c in signals:
        ax.plot(minutes, degrad[c], lw=0.8, label=c)
    ax.set_title('degradation vs baseline (deg / y units, >0 = worse)')
    ax.legend(ncol=6, fontsize=8)

    ax = axes[3]
    ax.plot(minutes, fused, lw=0.8, label='fused z', color='k')
    ax.plot(minutes, cusum, lw=0.8, label='cusum', color='tab:orange')
    ax.axhline(CUSUM_K, color='gray', ls=':', lw=0.8)
    alarmed = alarm.fillna(False).values
    ax.fill_between(minutes, 0, np.nanmax(fused), where=alarmed, alpha=0.15, color='red')
    ax.set_title('fused robust-z + cusum (red = alarm)')
    ax.legend(fontsize=8)

    for ax in axes:
        ax.set_xlabel('minutes')

    png = outdir / 'overview.png'
    fig.tight_layout()
    fig.savefig(png, dpi=120)
    print(f'\nwrote {png}')
    if show:
        plt.show()

if __name__ == '__main__':
    main()
