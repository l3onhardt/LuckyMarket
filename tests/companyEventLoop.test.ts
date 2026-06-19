import { describe, expect, test } from 'vitest';
import { AgentEventQueueService } from '../src/services/agentEventQueue.js';
import { AgentService } from '../src/services/agents.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketBindingService } from '../src/services/marketBindings.js';
import { MarketService } from '../src/services/markets.js';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

describe('company event market loop', () => {
  test('attendance event drives HR Data Agent to buy the already-satisfied 6 days plus outcome', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const agents = new AgentService(db, ledger, markets);
    const worldEvents = new WorldEventService(db);
    const bindings = new MarketBindingService(db, markets);
    const queue = new AgentEventQueueService(db, agents, bindings);
    const account = ledger.createAccount({
      kind: 'agent',
      handle: 'hr-data-agent',
      displayName: 'HR Data Agent',
      initialPoints: 500
    });
    agents.createAgentProfile({
      accountId: account.id,
      role: 'HR Data',
      strategy: 'data_value',
      focusCategories: ['attendance'],
      riskAppetite: 0.8,
      maxTradePoints: 160,
      maxPositionShares: 30,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8,
      nextWakeAt: '2026-06-30T00:00:00.000Z',
      memorySummary: 'Trusts Feishu attendance summaries.'
    });
    const mm = ledger.createAccount({
      kind: 'agent',
      handle: 'market-maker-agent',
      displayName: 'Market Maker Agent',
      initialPoints: 500
    });
    agents.createAgentProfile({
      accountId: mm.id,
      role: 'Market Maker',
      strategy: 'market_maker',
      focusCategories: ['attendance'],
      riskAppetite: 0.3,
      maxTradePoints: 80,
      maxPositionShares: 20,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8,
      nextWakeAt: '2026-06-30T00:00:00.000Z',
      memorySummary: 'Provides light liquidity.'
    });
    const market = markets.createMarket({
      title: '王哥将在6月休息几天？',
      category: 'attendance',
      closeTime: '2026-06-30T10:00:00.000Z',
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });
    const sixPlusOutcome = markets.getMarket(market.id).outcomes[3];
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
      source: 'feishu_attendance',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'high',
      summary: '王哥 2026-06 已休息 6 天。',
      payload: { restDaysSoFar: 6 },
      dedupeKey: 'feishu:wang-ge:2026-06:restDaysSoFar:6'
    });

    queue.enqueueForEvent(event);
    const result = queue.tick(1);
    const updatedMarket = markets.getMarket(market.id);
    const sixPlusPrice = updatedMarket.prices.find((price) => price.outcomeId === sixPlusOutcome.id)?.price ?? 0;

    expect(result.processedQueueItems).toHaveLength(1);
    expect(markets.getPositions(account.id)).toEqual([
      expect.objectContaining({ marketId: market.id, outcomeId: sixPlusOutcome.id })
    ]);
    expect(sixPlusPrice).toBeGreaterThan(25);
    expect(markets.getActivity(market.id).some((activity) => activity.message.includes('王哥 2026-06 已休息 6 天'))).toBe(
      true
    );

    db.close();
  });
});
