import { describe, expect, test, vi } from 'vitest';
import { AgentService } from '../src/services/agents.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { SchedulerService } from '../src/services/scheduler.js';
import { createTestDb } from './helpers.js';

function futureIso(minutes = 60): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function pastIso(minutes = 60): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function setupServices() {
  const db = createTestDb();
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);

  return { db, ledger, markets, agents };
}

describe('AgentService', () => {
  test('creates an agent profile with memory and due wake time', () => {
    const { ledger, agents } = setupServices();
    const account = ledger.createAccount({
      kind: 'agent',
      handle: 'attendance-data-agent',
      displayName: 'Attendance Data Agent',
      initialPoints: 250
    });
    const nextWakeAt = '2026-06-15T09:00:00.000Z';

    const profile = agents.createAgentProfile({
      accountId: account.id,
      role: 'Attendance research agent',
      strategy: 'data_value',
      focusCategories: ['attendance', 'hr'],
      riskAppetite: 0.4,
      maxTradePoints: 80,
      maxPositionShares: 5,
      wakeIntervalMinutes: 30,
      dailyActionBudget: 2,
      nextWakeAt,
      memorySummary: 'Trusts badge swipes more than anecdotes.'
    });

    expect(profile).toMatchObject({
      accountId: account.id,
      role: 'Attendance research agent',
      strategy: 'data_value',
      focusCategories: ['attendance', 'hr'],
      riskAppetite: 0.4,
      maxTradePoints: 80,
      maxPositionShares: 5,
      wakeIntervalMinutes: 30,
      dailyActionBudget: 2,
      actionsUsedToday: 0,
      nextWakeAt,
      lastWakeAt: null
    });
    expect(agents.getAgent(account.id)).toEqual(profile);
    expect(agents.getDueAgents(nextWakeAt, 10)).toEqual([profile]);
    expect(agents.buildContextPacket(account.id)).toMatchObject({
      agent: profile,
      memory: { summary: 'Trusts badge swipes more than anecdotes.' },
      balance: 250,
      openMarkets: [],
      positions: []
    });
  });

  test('wakes a due agent and records a bounded action', () => {
    const { db, ledger, markets, agents } = setupServices();
    const account = ledger.createAccount({
      kind: 'agent',
      handle: 'attendance-trader',
      displayName: 'Attendance Trader',
      initialPoints: 120
    });
    const market = markets.createMarket({
      title: 'Will Wang Ge miss attendance next week?',
      category: 'attendance',
      closeTime: futureIso(240),
      settlementSource: 'Attendance export',
      outcomes: ['No', 'Yes'],
      liquidityParameter: 100
    });
    agents.createAgentProfile({
      accountId: account.id,
      role: 'Attendance signal agent',
      strategy: 'data_value',
      focusCategories: ['attendance'],
      riskAppetite: 0.5,
      maxTradePoints: 30,
      maxPositionShares: 2,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 3,
      nextWakeAt: '2026-06-15T08:00:00.000Z',
      memorySummary: 'Attendance markets often underprice confirmed data.'
    });

    const result = agents.wakeAgent(account.id);

    expect(result).toMatchObject({ status: 'acted', actionType: 'agent_trade', marketId: market.id });
    expect(result.trade?.shares).toBeGreaterThan(0);
    expect(result.trade?.shares).toBeLessThanOrEqual(2);
    expect(result.trade?.pointsAmount).toBeLessThanOrEqual(30);
    expect(ledger.getBalance(account.id)).toBe(120 - result.trade!.pointsAmount);
    expect(markets.getPositions(account.id)).toEqual([
      expect.objectContaining({
        marketId: market.id,
        outcomeId: markets.getMarket(market.id).outcomes[1].id,
        shares: result.trade!.shares
      })
    ]);
    expect(agents.getAgent(account.id)).toMatchObject({
      actionsUsedToday: 1,
      nextWakeAt: expect.any(String),
      lastWakeAt: expect.any(String)
    });

    const wakeRuns = db.prepare('SELECT * FROM agent_wake_runs WHERE account_id = ?').all(account.id);
    const actions = db.prepare('SELECT * FROM agent_actions WHERE account_id = ?').all(account.id);
    const activities = db
      .prepare("SELECT * FROM activities WHERE account_id = ? AND type = 'agent_trade'")
      .all(account.id);
    expect(wakeRuns).toHaveLength(1);
    expect(actions).toHaveLength(1);
    expect(activities).toHaveLength(1);
  });

  test('does not wake an agent beyond daily action budget', () => {
    const { db, ledger, markets, agents } = setupServices();
    const account = ledger.createAccount({
      kind: 'agent',
      handle: 'budget-limited-agent',
      displayName: 'Budget Limited Agent',
      initialPoints: 120
    });
    markets.createMarket({
      title: 'Will a product requirement change this week?',
      category: 'product',
      closeTime: futureIso(240),
      settlementSource: 'Product notes',
      outcomes: ['Yes', 'No']
    });
    agents.createAgentProfile({
      accountId: account.id,
      role: 'Product trend agent',
      strategy: 'trend',
      focusCategories: ['product'],
      riskAppetite: 0.3,
      maxTradePoints: 30,
      maxPositionShares: 2,
      wakeIntervalMinutes: 60,
      dailyActionBudget: 0,
      nextWakeAt: '2026-06-15T08:00:00.000Z',
      memorySummary: 'Avoids over-trading.'
    });

    const result = agents.wakeAgent(account.id);

    expect(result).toMatchObject({ status: 'skipped', actionType: 'agent_skip', reason: 'daily_action_budget_exhausted' });
    expect(agents.getAgent(account.id)).toMatchObject({ actionsUsedToday: 0 });
    expect(markets.getPositions(account.id)).toEqual([]);
    expect(db.prepare('SELECT * FROM agent_wake_runs WHERE account_id = ?').all(account.id)).toHaveLength(1);
    expect(db.prepare('SELECT * FROM agent_actions WHERE account_id = ? AND type = ?').all(account.id, 'agent_skip')).toHaveLength(
      1
    );
    expect(
      db.prepare("SELECT * FROM activities WHERE account_id = ? AND type = 'agent_skip'").all(account.id)
    ).toHaveLength(1);
  });

  test('resets exhausted daily action budget when last wake was yesterday UTC', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:01:00.000Z'));
    const { db, ledger, markets, agents } = setupServices();

    try {
      const account = ledger.createAccount({
        kind: 'agent',
        handle: 'yesterday-budget-agent',
        displayName: 'Yesterday Budget Agent',
        initialPoints: 120
      });
      markets.createMarket({
        title: 'Will an ops incident happen today?',
        category: 'ops',
        closeTime: futureIso(240),
        settlementSource: 'Incident log',
        outcomes: ['Yes', 'No']
      });
      agents.createAgentProfile({
        accountId: account.id,
        role: 'Ops trend agent',
        strategy: 'trend',
        focusCategories: ['ops'],
        riskAppetite: 0.3,
        maxTradePoints: 30,
        maxPositionShares: 2,
        wakeIntervalMinutes: 60,
        dailyActionBudget: 1,
        nextWakeAt: '2026-06-15T08:00:00.000Z',
        memorySummary: 'Can act once per UTC day.'
      });
      db.prepare(
        `UPDATE agent_profiles
         SET actions_used_today = ?, last_wake_at = ?
         WHERE account_id = ?`
      ).run(1, '2026-06-14T23:59:00.000Z', account.id);

      const result = agents.wakeAgent(account.id);

      expect(result.status).not.toBe('skipped');
      expect(agents.getAgent(account.id)).toMatchObject({
        actionsUsedToday: 1,
        lastWakeAt: '2026-06-15T00:01:00.000Z'
      });
      expect(db.prepare('SELECT * FROM agent_wake_runs WHERE account_id = ?').all(account.id)).toHaveLength(1);
      expect(db.prepare('SELECT * FROM agent_actions WHERE account_id = ? AND type != ?').all(account.id, 'agent_skip')).toHaveLength(
        1
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test('wakes an agent without trading against an expired open market', () => {
    const { db, ledger, markets, agents } = setupServices();
    const account = ledger.createAccount({
      kind: 'agent',
      handle: 'stale-attendance-agent',
      displayName: 'Stale Attendance Agent',
      initialPoints: 120
    });
    const market = markets.createMarket({
      title: 'Will Wang Ge miss attendance yesterday?',
      category: 'attendance',
      closeTime: pastIso(30),
      settlementSource: 'Attendance export',
      outcomes: ['No', 'Yes'],
      liquidityParameter: 100
    });
    agents.createAgentProfile({
      accountId: account.id,
      role: 'Attendance signal agent',
      strategy: 'data_value',
      focusCategories: ['attendance'],
      riskAppetite: 0.5,
      maxTradePoints: 30,
      maxPositionShares: 2,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 3,
      nextWakeAt: '2026-06-15T08:00:00.000Z',
      memorySummary: 'Attendance markets often underprice confirmed data.'
    });

    expect(() => agents.wakeAgent(account.id)).not.toThrow();

    const wakeRuns = db.prepare('SELECT * FROM agent_wake_runs WHERE account_id = ?').all(account.id) as {
      context_json: string;
    }[];
    const actions = db.prepare('SELECT * FROM agent_actions WHERE account_id = ?').all(account.id) as {
      type: string;
      market_id: string | null;
    }[];
    const activities = db
      .prepare("SELECT * FROM activities WHERE account_id = ? AND type IN ('agent_signal', 'agent_skip')")
      .all(account.id);
    const profile = agents.getAgent(account.id);
    const context = JSON.parse(wakeRuns[0].context_json) as { openMarkets: unknown[] };

    expect(wakeRuns).toHaveLength(1);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'agent_signal', market_id: null });
    expect(activities).toHaveLength(1);
    expect(markets.getMarket(market.id)).toMatchObject({ status: 'open' });
    expect(context.openMarkets).toEqual([]);
    expect(markets.getPositions(account.id)).toEqual([]);
    expect(profile.lastWakeAt).toEqual(expect.any(String));
    expect(profile.nextWakeAt).not.toBe('2026-06-15T08:00:00.000Z');
  });

  test('scheduler wakes configured due agents and reports the exact skipped backlog', () => {
    const { db, ledger, agents } = setupServices();
    const dueAt = '2026-06-15T08:00:00.000Z';
    const now = '2026-06-15T09:00:00.000Z';

    for (let index = 1; index <= 5; index += 1) {
      const account = ledger.createAccount({
        kind: 'agent',
        handle: `scheduler-agent-${index}`,
        displayName: `Scheduler Agent ${index}`,
        initialPoints: 100
      });
      agents.createAgentProfile({
        accountId: account.id,
        role: `Scheduler test agent ${index}`,
        strategy: 'trend',
        focusCategories: ['ops'],
        riskAppetite: 0.5,
        maxTradePoints: 20,
        maxPositionShares: 2,
        wakeIntervalMinutes: 30,
        dailyActionBudget: 3,
        nextWakeAt: dueAt,
        memorySummary: 'Records a signal when no matching market exists.'
      });
    }

    const expectedWokenAgents = agents.listAgents().slice(0, 2).map((agent) => agent.accountId);
    const scheduler = new SchedulerService(agents, { maxAgentsPerTick: 2 });
    const result = scheduler.tick(now);

    expect(result).toEqual({
      now,
      wokenAgents: expectedWokenAgents,
      skippedDueAgents: 3
    });
    expect(result.wokenAgents).toHaveLength(2);
    expect(db.prepare('SELECT * FROM agent_wake_runs').all()).toHaveLength(2);
    expect(db.prepare("SELECT * FROM agent_actions WHERE type = 'agent_signal'").all()).toHaveLength(2);
  });
});
