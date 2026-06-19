import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppError } from '../src/domain/errors.js';
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  test('uses a deliberately narrow deterministic attendance suggestion rule set', () => {
    const { db } = setup();
    const isolatedDb = createTestDb();
    const isolatedLedger = new LedgerService(isolatedDb);
    const isolatedMarkets = new MarketService(isolatedDb, isolatedLedger);
    const isolatedBindings = new MarketBindingService(isolatedDb, isolatedMarkets);
    const otherAttendanceMarket = isolatedMarkets.createMarket({
      title: '小李将在6月休息几天？',
      category: 'attendance',
      closeTime: '2026-06-30T10:00:00.000Z',
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });

    expect(isolatedBindings.suggestBindings(otherAttendanceMarket.id)).toEqual([]);

    db.close();
    isolatedDb.close();
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

  test('allows suggested or disabled bindings without admin confirmation', () => {
    const { db, market, bindings } = setup();

    const suggested = bindings.createBinding({
      marketId: market.id,
      eventType: 'attendance.monthly_summary_updated',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-05',
      metricKeys: ['restDaysSoFar'],
      status: 'suggested',
      suggestedBy: 'rule'
    });
    const disabled = bindings.createBinding({
      marketId: market.id,
      eventType: 'attendance.monthly_summary_updated',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-07',
      metricKeys: ['restDaysSoFar'],
      status: 'disabled',
      suggestedBy: 'admin'
    });

    expect(suggested.confirmedBy).toBeNull();
    expect(disabled.confirmedBy).toBeNull();

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
    expect(worldEvents.listEventsForMarket(market.id)).toEqual([related]);

    db.close();
  });

  test('rejects duplicate bindings for the same identity including null period', () => {
    const { db, market, bindings } = setup();
    const nullPeriodInput = {
      marketId: market.id,
      eventType: 'attendance.monthly_summary_updated',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: null,
      metricKeys: ['restDaysSoFar'],
      status: 'active' as const,
      suggestedBy: 'rule',
      confirmedBy: 'admin'
    };

    const nullPeriodBinding = bindings.createBinding(nullPeriodInput);
    const nullPeriodDuplicateError = (() => {
      try {
        bindings.createBinding(nullPeriodInput);
        return null;
      } catch (error) {
        return error;
      }
    })();

    const periodInput = {
      ...nullPeriodInput,
      period: '2026-06'
    };

    const periodBinding = bindings.createBinding(periodInput);
    const periodDuplicateError = (() => {
      try {
        bindings.createBinding(periodInput);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(nullPeriodDuplicateError).toBeInstanceOf(AppError);
    expect((nullPeriodDuplicateError as AppError).message).toContain('already exists');
    expect(periodDuplicateError).toBeInstanceOf(AppError);
    expect((periodDuplicateError as AppError).message).toContain('already exists');
    expect(bindings.listBindingsForMarket(market.id)).toEqual(
      expect.arrayContaining([nullPeriodBinding, periodBinding])
    );

    db.close();
  });

  test('database unique index rejects duplicate logical bindings for null and non-null periods', () => {
    const { db, market } = setup();
    const insert = db.prepare(
      `INSERT INTO market_event_bindings (
        id, market_id, event_type, subject_type, subject_id, subject_label,
        period, metric_keys_json, status, suggested_by, confirmed_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const commonValues = [
      market.id,
      'attendance.monthly_summary_updated',
      'person',
      'wang-ge',
      '王哥',
      '["restDaysSoFar"]',
      'active',
      'rule',
      'admin',
      '2026-06-18T12:00:00.000Z',
      '2026-06-18T12:00:00.000Z'
    ] as const;

    insert.run('meb_null_1', ...commonValues.slice(0, 5), null, ...commonValues.slice(5));
    insert.run('meb_period_1', ...commonValues.slice(0, 5), '2026-06', ...commonValues.slice(5));

    expect(() =>
      insert.run('meb_null_2', ...commonValues.slice(0, 5), null, ...commonValues.slice(5))
    ).toThrow(/UNIQUE|constraint/i);
    expect(() =>
      insert.run('meb_period_2', ...commonValues.slice(0, 5), '2026-06', ...commonValues.slice(5))
    ).toThrow(/UNIQUE|constraint/i);

    db.close();
  });

  test('allows persisted suggestions to be confirmed as active bindings later', () => {
    const { db, market, bindings } = setup();
    const input = {
      marketId: market.id,
      eventType: 'attendance.monthly_summary_updated',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      metricKeys: ['restDaysSoFar'],
      suggestedBy: 'rule'
    };

    const suggested = bindings.createBinding({
      ...input,
      status: 'suggested'
    });
    const active = bindings.createBinding({
      ...input,
      status: 'active',
      confirmedBy: 'admin'
    });

    expect(suggested.status).toBe('suggested');
    expect(active.status).toBe('active');
    expect(bindings.findMatchingBindings({
      id: 'wev_test',
      type: 'attendance.monthly_summary_updated',
      source: 'manual_admin',
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
      dedupeKey: 'test:event',
      createdAt: '2026-06-18T12:05:00.000Z'
    })).toEqual([active]);

    db.close();
  });

  test('database check rejects active bindings without confirmation', () => {
    const { db, market } = setup();
    const insert = db.prepare(
      `INSERT INTO market_event_bindings (
        id, market_id, event_type, subject_type, subject_id, subject_label,
        period, metric_keys_json, status, suggested_by, confirmed_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    expect(() =>
      insert.run(
        'meb_active_without_confirmation',
        market.id,
        'attendance.monthly_summary_updated',
        'person',
        'wang-ge',
        '王哥',
        '2026-06',
        '["restDaysSoFar"]',
        'active',
        'rule',
        null,
        '2026-06-18T12:00:00.000Z',
        '2026-06-18T12:00:00.000Z'
      )
    ).toThrow(/CHECK|constraint/i);

    db.close();
  });

  test('rejects non-string metric keys with validation error', () => {
    const { db, market, bindings } = setup();

    const metricKeysError = (() => {
      try {
        bindings.createBinding({
          marketId: market.id,
          eventType: 'attendance.monthly_summary_updated',
          subjectType: 'person',
          subjectId: 'wang-ge',
          subjectLabel: '王哥',
          period: '2026-06',
          metricKeys: [123 as unknown as string],
          status: 'active',
          suggestedBy: 'rule',
          confirmedBy: 'admin'
        });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(metricKeysError).toBeInstanceOf(AppError);
    expect((metricKeysError as AppError).code).toBe('VALIDATION_ERROR');
    expect((metricKeysError as AppError).message).toMatch(/metricKeys/i);

    db.close();
  });

  test('throws a validation error when stored metric keys are corrupted', () => {
    const { db, market, bindings } = setup();
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

    db.prepare('UPDATE market_event_bindings SET metric_keys_json = ? WHERE id = ?').run(
      '["restDaysSoFar", ""]',
      binding.id
    );

    const readError = (() => {
      try {
        bindings.listBindingsForMarket(market.id);
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(readError).toBeInstanceOf(AppError);
    expect((readError as AppError).message).toMatch(/metric keys/i);

    db.close();
  });

  test('lists newest bindings first', () => {
    const { db, market, bindings } = setup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-18T10:00:00.000Z'));

    const first = bindings.createBinding({
      marketId: market.id,
      eventType: 'attendance.monthly_summary_updated',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-05',
      metricKeys: ['restDaysSoFar'],
      status: 'disabled',
      suggestedBy: 'rule'
    });

    vi.setSystemTime(new Date('2026-06-18T10:00:01.000Z'));
    const second = bindings.createBinding({
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

    expect(bindings.listBindingsForMarket(market.id)).toEqual([second, first]);

    db.close();
  });
});
