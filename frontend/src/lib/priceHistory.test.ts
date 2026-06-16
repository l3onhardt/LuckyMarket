import { describe, it, expect } from 'vitest';
import { toChartSeries } from './priceHistory';
import type { PriceSnapshot } from '@/types';

const snaps: PriceSnapshot[] = [
  { outcomeId: 'a', price: 60, createdAt: '2026-06-16T00:00:00.000Z' },
  { outcomeId: 'b', price: 40, createdAt: '2026-06-16T00:00:00.000Z' },
  { outcomeId: 'a', price: 70, createdAt: '2026-06-16T01:00:00.000Z' },
  { outcomeId: 'b', price: 30, createdAt: '2026-06-16T01:00:00.000Z' },
];

describe('toChartSeries', () => {
  it('pivots snapshots into one row per timestamp keyed by outcomeId', () => {
    const rows = toChartSeries(snaps);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ t: '2026-06-16T00:00:00.000Z', a: 60, b: 40 });
    expect(rows[1]).toMatchObject({ t: '2026-06-16T01:00:00.000Z', a: 70, b: 30 });
  });

  it('returns empty array for empty input', () => {
    expect(toChartSeries([])).toEqual([]);
  });
});
