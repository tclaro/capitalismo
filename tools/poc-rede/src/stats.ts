export interface LatencyStats {
  n: number;
  min: number;
  avg: number;
  p95: number;
  max: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function summarize(samples: number[]): LatencyStats | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, x) => acc + x, 0);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
  return {
    n: sorted.length,
    min: round1(sorted[0]!),
    avg: round1(sum / sorted.length),
    p95: round1(p95),
    max: round1(sorted[sorted.length - 1]!),
  };
}

export function formatLatency(s: LatencyStats | null | undefined): string {
  if (!s) return "—";
  return `média ${s.avg} ms · p95 ${s.p95} ms · máx ${s.max} ms (${s.n} amostras)`;
}
