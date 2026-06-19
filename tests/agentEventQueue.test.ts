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

  return { db, market, event, queue };
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

  test('event queue tick wakes bounded queued agents and marks items processed', () => {
    const { db, event, queue } = setup();
    queue.enqueueForEvent(event);

    const result = queue.tick(1);

    expect(result.processedQueueItems).toHaveLength(1);
    expect(result.remainingQueuedItems).toBe(1);
    expect(db.prepare("SELECT * FROM agent_event_queue WHERE status = 'processed'").all()).toHaveLength(1);
    expect(db.prepare('SELECT * FROM agent_wake_runs').all()).toHaveLength(1);

    db.close();
  });
});
