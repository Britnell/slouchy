// --- research logger: absolute (uncalibrated) values as in-memory CSV ---
// collects raw signal values per frame (no diffs vs calibration) for offline
// analysis of calibration-free baseline algorithms. see detection.md.
// download: 'csv' button in the UI, or postureLogDownload() in the console.

const COLUMNS = ['t', 'neck', 'neckBody', 'drop'];

const REPORT_EVERY_MS = 30000;

export class PostureLogger {
    private start = performance.now();
    private lastReport = this.start;
    private rows: string[] = [];

    // the 3 slouch params, absolute (uncalibrated):
    // neck + neckBody from angles(), drop = (earY + shoulderY) / 2
    // (the absolute basis of posture.ts drop(), which diffs it vs calibration)
    log(p: any, ang: any) {
        const t = (performance.now() - this.start) / 1000;
        const f = (v: number | undefined) => (typeof v === 'number' ? v.toFixed(4) : '');
        const dropY =
            typeof p?.ear?.y === 'number' && typeof p?.shoulder?.y === 'number'
                ? (p.ear.y + p.shoulder.y) / 2
                : undefined;
        this.rows.push([
            t.toFixed(3),
            f(ang?.neck),
            f(ang?.neckBody),
            f(dropY),
        ].join(','));

        const now = performance.now();
        if (now - this.lastReport >= REPORT_EVERY_MS) {
            this.lastReport = now;
            const s = Math.floor((now - this.start) / 1000);
            const mm = String(Math.floor(s / 60)).padStart(2, '0');
            const ss = String(s % 60).padStart(2, '0');
            console.info(`[posture-log] ${mm}:${ss} elapsed, ${this.rows.length} samples`);
        }
    }

    csv(): string {
        return COLUMNS.join(',') + '\n' + this.rows.join('\n');
    }

    download() {
        const blob = new Blob([this.csv()], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `posture-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        console.info(`[posture-log] downloaded ${this.rows.length} samples`);
    }
}
