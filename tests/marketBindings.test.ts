import { describe, expect, test } from 'vitest';
import { LedgerService } from '../src/services/ledger.js';
import { MarketBindingService } from '../src/services/marketBindings.js';
import { MarketService } from '../src/services/markets.js';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

function setup() {
  const db = createTestDb();
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const worldEvents = new WorldEventService(db);
  const bindings = new MarketBindingService(db, markets);
  const market = markets.createMarket({
    title: '王哥将在6月休息几天？',
    category: 'attendance',
    closeTime: '2026-06-30T10:00:00.000Z',
    settlementSource: '公司考勤记录',
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
    liquidityParameter: 100
  });

  return { db, market, worldEvents, bindings };
}

describe('MarketBindingService', () => {
  test('suggests an attendance binding for Wang Ge monthly rest market', () => {
    const { db, market, bindings } = setup();

    const suggestions = bindings.suggestBindings(market.id);

    expect(suggestions).toEqual([
      expect.objectContaining({
        eventType: 'attendance.monthly_summary_updated',
        subjectType: 'person',
        subjectId: 'wang-ge',
        subjectLabel: '王哥',
        period: '2026-06',
        metricKeys: ['restDaysSoFar'],
        confidence: 'medium'
      })
    ]);
    expect(suggestions[0].explanation).toContain('考勤');

    db.close();
  });

  test('rejects active bindings without admin confirmation', () => {
    const { db, market, bindings } = setup();

    expect(() =>
      bindings.createBinding({
        marketId: market.id,
        eventType: 'attendance.monthly_summary_updated',
        subjectType: 'person',
        subjectId: 'wang-ge',
        subjectLabel: '王哥',
        period: '2026-06',
        metricKeys: ['restDaysSoFar'],
        status: 'active',
        suggestedBy: 'rule'
      })
    ).toThrowError('confirmedBy is required');

    expect(() =>
      bindings.createBinding({
        marketId: market.id,
        eventType: 'attendance.monthly_summary_updated',
        subjectType: 'person',
        subjectId: 'wang-ge',
        subjectLabel: '王哥',
        period: '2026-06',
        metricKeys: ['restDaysSoFar'],
        status: 'active',
        suggestedBy: 'rule',
        confirmedBy: null
      })
    ).toThrowError('confirmedBy is required');

    db.close();
  });

  test('creates confirmed binding and matches related event only', () => {
    const { db, market, worldEvents, bindings } = setup();
    const binding = bindings.createBinding({
      marketId: market.id,
      eventType: 'attendance.monthly_summary_updated',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      metricKeys: ['restDaysSoFar'],
      status: 'active',
      suggestedBy: 'rule',
      confirmedBy: 'admin'
    });
    const related = worldEvents.createEvent({
      type: 'attendance.monthly_summary_updated',
      source: 'manual_admin',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'high',
      summary: '王哥 2026-06 已休息 6 天。',
      payload: { restDaysSoFar: 6 },
      dedupeKey: 'manual:wang-ge:6'
    });
    const unrelated = worldEvents.createEvent({
      type: 'attendance.monthly_summary_updated',
      source: 'manual_admin',
      subjectType: 'person',
      subjectId: 'xiao-li',
      subjectLabel: '小李',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'high',
      summary: '小李 2026-06 已休息 1 天。',
      payload: { restDaysSoFar: 1 },
      dedupeKey: 'manual:xiao-li:1'
    });

    expect(binding.id).toMatch(/^meb_/);
    expect(bindings.listBindingsForMarket(market.id)).toEqual([binding]);
    expect(bindings.findMatchingBindings(related)).toEqual([binding]);
    expect(bindings.findMatchingBindings(unrelated)).toEqual([]);

    db.close();
  });
});
