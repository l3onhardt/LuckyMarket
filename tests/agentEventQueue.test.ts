import { describe, expect, test } from 'vitest';
import { AgentService } from '../src/services/agents.js';
import { AgentEventQueueService } from '../src/services/agentEventQueue.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketBindingService } from '../src/services/marketBindings.js';
import { MarketService } from '../src/services/markets.js';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

function setup() {
  const db = createTestDb();
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);
  const worldEvents = new WorldEventService(db);
  const bindings = new MarketBindingService(db, markets);
  const queue = new AgentEventQueueService(db, agents, bindings);

  const market = markets.createMarket({
    title: '王哥将在6月休息几天？',
    category: 'attendance',
    closeTime: '2026-06-30T10:00:00.000Z',
    settlementSource: '公司考勤记录',
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
    liquidityParameter: 100
  });
  const otherMarket = markets.createMarket({
    title: '小李将在6月休息几天？',
    category: 'attendance',
    closeTime: '2026-06-30T10:00:00.000Z',
    settlementSource: '公司考勤记录',
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
    liquidityParameter: 100
  });

  const hr = ledger.createAccount({
    kind: 'agent',
    handle: 'hr-data-agent',
    displayName: 'HR Data Agent',
    initialPoints: 500
  });
  const mm = ledger.createAccount({
    kind: 'agent',
    handle: 'market-maker-agent',
    displayName: 'Market Maker Agent',
    initialPoints: 500
  });
  const trend = ledger.createAccount({
    kind: 'agent',
    handle: 'trend-agent',
    displayName: 'Trend Agent',
    initialPoints: 500
  });

  [hr, mm, trend].forEach((account, index) => {
    agents.createAgentProfile({
      accountId: account.id,
      role: index === 0 ? 'HR Data' : index === 1 ? 'Market Maker' : 'Trend Trader',
      strategy: index === 0 ? 'data_value' : index === 1 ? 'market_maker' : 'trend',
      focusCategories: ['attendance'],
      riskAppetite: 0.5,
      maxTradePoints: 120,
      maxPositionShares: 20,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8,
      nextWakeAt: '2026-06-30T00:00:00.000Z',
      memorySummary: 'Test agent.'
    });
  });

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
    confirmedBy: 'admin'
  });

  const event = worldEvents.createEvent({
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

  return { db, market, otherMarket, event, queue };
}

describe('AgentEventQueueService', () => {
  test('enqueues HR Data and Market Maker agents for matching attendance event', () => {
    const { db, market, event, queue } = setup();

    const items = queue.enqueueForEvent(event);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.reason)).toEqual(['attendance_data_reaction', 'liquidity_response']);
    expect(items.every((item) => item.marketId === market.id)).toBe(true);
    expect(queue.enqueueForEvent(event)).toEqual([]);

    db.close();
  });

  test('does not route unsupported event types to attendance agents', () => {
    const { db, market, queue } = setup();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const bindings = new MarketBindingService(db, markets);
    const worldEvents = new WorldEventService(db);
    bindings.createBinding({
      marketId: market.id,
      eventType: 'weather.daily_summary_updated',
      subjectType: 'city',
      subjectId: 'shenzhen',
      subjectLabel: '深圳',
      period: '2026-06',
      metricKeys: ['rainHours'],
      status: 'active',
      suggestedBy: 'manual',
      confirmedBy: 'admin'
    });
    const event = worldEvents.createEvent({
      type: 'weather.daily_summary_updated',
      source: 'manual_admin',
      subjectType: 'city',
      subjectId: 'shenzhen',
      subjectLabel: '深圳',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'medium',
      summary: '深圳今日降雨 2 小时。',
      payload: { rainHours: 2 },
      dedupeKey: 'manual:weather:shenzhen:2026-06-18'
    });

    expect(queue.enqueueForEvent(event)).toEqual([]);

    db.close();
  });

  test('event queue tick wakes bounded queued agents and marks items processed', () => {
    const { db, market, otherMarket, event, queue } = setup();
    queue.enqueueForEvent(event);

    const result = queue.tick(1);

    expect(result.processedQueueItems).toHaveLength(1);
    expect(result.remainingQueuedItems).toBe(1);
    expect(db.prepare("SELECT * FROM agent_event_queue WHERE status = 'processed'").all()).toHaveLength(1);
    const processedQueueItem = db
      .prepare("SELECT * FROM agent_event_queue WHERE status = 'processed'")
      .get() as { id: string; binding_id: string; reason: string };
    const wakeRun = db.prepare('SELECT * FROM agent_wake_runs').get() as { context_json: string };
    const wakeContext = JSON.parse(wakeRun.context_json) as {
      wakeContext: {
        worldEventId: string;
        marketId: string;
        bindingId: string;
        queueItemId: string;
        reason: string;
      };
    };
    const action = db.prepare('SELECT * FROM agent_actions').get() as { market_id: string | null };
    expect(wakeContext.wakeContext).toMatchObject({
      worldEventId: event.id,
      marketId: market.id,
      bindingId: processedQueueItem.binding_id,
      queueItemId: processedQueueItem.id,
      reason: processedQueueItem.reason
    });
    expect(action.market_id).toBe(market.id);
    expect(action.market_id).not.toBe(otherMarket.id);

    db.close();
  });

  test('event queue tick records failure reasons for failed wakes', () => {
    const { db, market, event, queue } = setup();
    const createdAt = '2026-06-18T12:10:00.000Z';
    db.prepare(
      `INSERT INTO accounts (
        id, kind, handle, display_name, status, created_at, last_active_at
      ) VALUES (?, 'agent', ?, ?, 'active', ?, NULL)`
    ).run('acct_missing_profile', 'missing-profile-agent', 'Missing Profile Agent', createdAt);
    db.prepare(
      `INSERT INTO agent_event_queue (
        id, world_event_id, market_id, binding_id, account_id, reason,
        status, created_at, processed_at, failure_reason, wake_run_id
      )
      SELECT ?, ?, ?, id, ?, ?, 'queued', ?, NULL, NULL, NULL
      FROM market_event_bindings
      WHERE market_id = ?
      LIMIT 1`
    ).run(
      'aeq_missing_agent',
      event.id,
      market.id,
      'acct_missing_profile',
      'attendance_data_reaction',
      createdAt,
      market.id
    );

    const result = queue.tick(1);
    const failed = db
      .prepare("SELECT * FROM agent_event_queue WHERE id = 'aeq_missing_agent'")
      .get() as { status: string; failure_reason: string | null; processed_at: string | null };

    expect(result.failedQueueItems).toEqual(['aeq_missing_agent']);
    expect(failed.status).toBe('failed');
    expect(failed.failure_reason).toContain('Agent profile not found');
    expect(failed.processed_at).not.toBeNull();

    db.close();
  });
});
