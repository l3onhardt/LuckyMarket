import type { PriceSnapshot } from '@/types';

export type ChartRow = { t: string } & Record<string, number | string>;

/** 把 (outcome,timestamp) 快照透视成每时间点一行，键为 outcomeId */
export function toChartSeries(snapshots: PriceSnapshot[]): ChartRow[] {
  const byTime = new Map<string, ChartRow>();
  for (const s of snapshots) {
    const row = byTime.get(s.createdAt) ?? { t: s.createdAt };
    row[s.outcomeId] = s.price;
    byTime.set(s.createdAt, row);
  }
  return [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
}
