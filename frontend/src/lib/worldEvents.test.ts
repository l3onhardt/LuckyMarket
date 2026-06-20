import { describe, expect, test } from 'vitest';
import { describeWorldEvent, describeWorldEventActivity, hasActiveWorldEventBinding } from './worldEvents';

describe('world event display helpers', () => {
  test('formats attendance world event summary', () => {
    expect(
      describeWorldEvent({
        id: 'wev_1',
        type: 'attendance.monthly_summary_updated',
        source: 'feishu_attendance',
        sourceRef: null,
        subjectType: 'person',
        subjectId: 'wang-ge',
        subjectLabel: '王哥',
        period: '2026-06',
        effectiveAt: '2026-06-18T12:00:00.000Z',
        observedAt: '2026-06-18T12:05:00.000Z',
        confidence: 'high',
        summary: '王哥 2026-06 已休息 6 天。',
        payload: { restDaysSoFar: 6 },
        dedupeKey: 'x',
        createdAt: '2026-06-18T12:05:00.000Z',
      })
    ).toBe('王哥 2026-06 已休息 6 天。');
  });

  test('formats agent activity with event reason', () => {
    expect(
      describeWorldEventActivity({
        worldEventSummary: '王哥 2026-06 已休息 6 天。',
        outcomeLabel: '6天以上',
        priceBefore: 25,
        priceAfter: 42,
      })
    ).toContain('王哥 2026-06 已休息 6 天。');
  });

  test('does not format ordinary agent trade activity as event driven', () => {
    expect(describeWorldEventActivity({ tradeId: 'trade_1', shares: 2 })).toBeNull();
  });

  test('detects only active market event bindings', () => {
    expect(
      hasActiveWorldEventBinding([
        {
          id: 'meb_1',
          marketId: 'mkt_1',
          eventType: 'attendance.monthly_summary_updated',
          subjectType: 'person',
          subjectId: 'wang-ge',
          subjectLabel: '王哥',
          period: '2026-06',
          metricKeys: ['restDaysSoFar'],
          status: 'suggested',
          suggestedBy: 'rule',
          confirmedBy: null,
          createdAt: '2026-06-18T12:05:00.000Z',
          updatedAt: '2026-06-18T12:05:00.000Z',
        },
      ])
    ).toBe(false);
  });
});
