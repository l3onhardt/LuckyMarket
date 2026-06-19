import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import { AppError, notFound } from '../domain/errors.js';
import type { Account, MarketOutcome } from '../domain/types.js';
import { newId } from './ids.js';
import type { LedgerService } from './ledger.js';
import type { MarketDetail, PositionRecord, TradeQuote, TradeRecord } from './markets.js';
import { MarketService } from './markets.js';

export type AgentStrategy = 'data_value' | 'trend' | 'contrarian' | 'market_maker';
export type AgentActionType = 'agent_trade' | 'agent_signal' | 'agent_skip';

export interface CreateAgentProfileInput {
  accountId: string;
  role: string;
  strategy: AgentStrategy;
  focusCategories: string[];
  riskAppetite: number;
  maxTradePoints: number;
  maxPositionShares: number;
  wakeIntervalMinutes: number;
  dailyActionBudget: number;
  nextWakeAt: string;
  memorySummary: string;
}

export interface AgentProfile {
  accountId: string;
  role: string;
  strategy: AgentStrategy;
  focusCategories: string[];
  riskAppetite: number;
  maxTradePoints: number;
  maxPositionShares: number;
  wakeIntervalMinutes: number;
  dailyActionBudget: number;
  actionsUsedToday: number;
  nextWakeAt: string;
  lastWakeAt: string | null;
}

export interface AgentMemory {
  accountId: string;
  summary: string;
  updatedAt: string;
}

export interface AgentContextPacket {
  agent: AgentProfile;
  memory: Pick<AgentMemory, 'summary' | 'updatedAt'>;
  balance: number;
  openMarkets: MarketDetail[];
  positions: PositionRecord[];
}

export interface WakeAgentResult {
  status: 'acted' | 'signaled' | 'skipped';
  actionType: AgentActionType;
  wakeRunId: string;
  marketId: string | null;
  reason?: string;
  trade?: TradeRecord;
  signal?: string;
}

export interface AgentWakeContext {
  worldEventId?: string;
  marketId?: string;
  bindingId?: string;
  queueItemId?: string;
  reason?: string;
}

interface AgentProfileRow {
  account_id: string;
  role: string;
  strategy: AgentStrategy;
  focus_categories_json: string;
  risk_appetite: number;
  max_trade_points: number;
  max_position_shares: number;
  wake_interval_minutes: number;
  daily_action_budget: number;
  actions_used_today: number;
  next_wake_at: string;
  last_wake_at: string | null;
}

interface AgentMemoryRow {
  account_id: string;
  summary: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function utcDateKey(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

function resetDailyActionsIfNeeded(agent: AgentProfile, now: string): AgentProfile {
  if (agent.lastWakeAt === null || utcDateKey(agent.lastWakeAt) !== utcDateKey(now)) {
    return { ...agent, actionsUsedToday: 0 };
  }

  return agent;
}

function mapProfile(row: AgentProfileRow): AgentProfile {
  return {
    accountId: row.account_id,
    role: row.role,
    strategy: row.strategy,
    focusCategories: JSON.parse(row.focus_categories_json) as string[],
    riskAppetite: row.risk_appetite,
    maxTradePoints: row.max_trade_points,
    maxPositionShares: row.max_position_shares,
    wakeIntervalMinutes: row.wake_interval_minutes,
    dailyActionBudget: row.daily_action_budget,
    actionsUsedToday: row.actions_used_today,
    nextWakeAt: row.next_wake_at,
    lastWakeAt: row.last_wake_at
  };
}

function mapMemory(row: AgentMemoryRow): AgentMemory {
  return {
    accountId: row.account_id,
    summary: row.summary,
    updatedAt: row.updated_at
  };
}

function validateProfileInput(input: CreateAgentProfileInput, account: Account): void {
  if (account.kind !== 'agent') {
    throw new AppError('VALIDATION_ERROR', 'Agent profile account must have kind agent');
  }
  if (!input.role.trim()) {
    throw new AppError('VALIDATION_ERROR', 'Agent role is required');
  }
  if (input.focusCategories.length === 0 || input.focusCategories.some((category) => !category.trim())) {
    throw new AppError('VALIDATION_ERROR', 'Agent focus categories are required');
  }
  if (input.maxTradePoints <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Agent max trade points must be positive');
  }
  if (input.maxPositionShares <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Agent max position shares must be positive');
  }
  if (input.wakeIntervalMinutes <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Agent wake interval must be positive');
  }
  if (input.dailyActionBudget < 0) {
    throw new AppError('VALIDATION_ERROR', 'Agent daily action budget cannot be negative');
  }
  if (Number.isNaN(Date.parse(input.nextWakeAt))) {
    throw new AppError('VALIDATION_ERROR', 'Agent next wake time must be a valid ISO timestamp');
  }
}

export class AgentService {
  constructor(
    private readonly db: Db,
    private readonly ledger: LedgerService,
    private readonly markets: MarketService
  ) {}

  createAgentProfile(input: CreateAgentProfileInput): AgentProfile {
    const account = this.ledger.getAccount(input.accountId);
    validateProfileInput(input, account);

    return inTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO agent_profiles (
            account_id, role, strategy, focus_categories_json, risk_appetite,
            max_trade_points, max_position_shares, wake_interval_minutes,
            daily_action_budget, actions_used_today, next_wake_at, last_wake_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.accountId,
          input.role,
          input.strategy,
          JSON.stringify(input.focusCategories),
          input.riskAppetite,
          input.maxTradePoints,
          input.maxPositionShares,
          input.wakeIntervalMinutes,
          input.dailyActionBudget,
          0,
          input.nextWakeAt,
          null
        );

      this.db
        .prepare(
          `INSERT INTO agent_memories (
            account_id, summary, updated_at
          ) VALUES (?, ?, ?)`
        )
        .run(input.accountId, input.memorySummary, nowIso());

      return this.getAgent(input.accountId);
    });
  }

  getAgent(accountId: string): AgentProfile {
    const row = this.db
      .prepare('SELECT * FROM agent_profiles WHERE account_id = ?')
      .get(accountId) as AgentProfileRow | undefined;
    if (!row) {
      throw notFound(`Agent profile not found: ${accountId}`);
    }

    return mapProfile(row);
  }

  listAgents(): AgentProfile[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_profiles ORDER BY next_wake_at ASC, account_id ASC')
      .all() as AgentProfileRow[];

    return rows.map(mapProfile);
  }

  getDueAgents(nowIsoValue: string, limit: number): AgentProfile[] {
    const cappedLimit = Math.max(0, Math.floor(limit));
    const rows = this.db
      .prepare(
        `SELECT * FROM agent_profiles
         WHERE next_wake_at <= ?
         ORDER BY next_wake_at ASC, account_id ASC
         LIMIT ?`
      )
      .all(nowIsoValue, cappedLimit) as AgentProfileRow[];

    return rows.map(mapProfile);
  }

  buildContextPacket(accountId: string): AgentContextPacket {
    const agent = this.getAgent(accountId);
    const memory = this.getMemory(accountId);
    const focusCategories = new Set(agent.focusCategories);
    const now = Date.now();
    const openMarkets = this.markets
      .listMarkets()
      .filter(
        (market) => market.status === 'open' && Date.parse(market.closeTime) > now && focusCategories.has(market.category)
      );

    return {
      agent,
      memory: {
        summary: memory.summary,
        updatedAt: memory.updatedAt
      },
      balance: this.ledger.getBalance(accountId),
      openMarkets,
      positions: this.markets.getPositions(accountId)
    };
  }

  wakeAgent(accountId: string, wakeContext?: AgentWakeContext): WakeAgentResult {
    return inTransaction(this.db, () => {
      const context = this.buildContextPacket(accountId);
      const startedAt = nowIso();
      const agent = resetDailyActionsIfNeeded(context.agent, startedAt);
      const dailyContext: AgentContextPacket = { ...context, agent };
      const contextPacket = wakeContext ? { ...dailyContext, wakeContext } : dailyContext;

      if (dailyContext.agent.actionsUsedToday >= dailyContext.agent.dailyActionBudget) {
        const result = this.recordWakeResult(
          contextPacket,
          startedAt,
          'skipped',
          'agent_skip',
          null,
          'Daily action budget exhausted',
          { reason: 'daily_action_budget_exhausted' },
          false
        );
        return { ...result, reason: 'daily_action_budget_exhausted' };
      }

      const market = dailyContext.openMarkets[0];
      if (!market) {
        return this.recordWakeResult(
          contextPacket,
          startedAt,
          'signaled',
          'agent_signal',
          null,
          'No matching open market for agent focus',
          { reason: 'no_matching_market' },
          true
        );
      }

      const decision = this.chooseOutcome(dailyContext.agent, market);
      const edge = decision.fairProbability - decision.price;
      if (edge >= 3) {
        const trade = this.placeBoundedBuy(dailyContext, market, decision.outcome);
        if (trade) {
          const result = this.recordWakeResult(
            contextPacket,
            startedAt,
            'acted',
            'agent_trade',
            market.id,
            `Agent bought ${trade.shares} shares`,
            {
              tradeId: trade.id,
              outcomeId: trade.outcomeId,
              shares: trade.shares,
              pointsAmount: trade.pointsAmount,
              edge
            },
            true
          );
          return { ...result, trade };
        }
      }

      const signal = edge < 3 ? 'No sufficient pricing edge' : 'No affordable positive-integer trade';
      const result = this.recordWakeResult(
        contextPacket,
        startedAt,
        'signaled',
        'agent_signal',
        market.id,
        signal,
        {
          marketId: market.id,
          outcomeId: decision.outcome.id,
          fairProbability: decision.fairProbability,
          marketPrice: decision.price,
          edge
        },
        true
      );
      return { ...result, signal };
    });
  }

  private getMemory(accountId: string): AgentMemory {
    const row = this.db
      .prepare('SELECT * FROM agent_memories WHERE account_id = ?')
      .get(accountId) as AgentMemoryRow | undefined;
    if (!row) {
      throw notFound(`Agent memory not found: ${accountId}`);
    }

    return mapMemory(row);
  }

  private chooseOutcome(
    agent: AgentProfile,
    market: MarketDetail
  ): { outcome: MarketOutcome; price: number; fairProbability: number } {
    const pricedOutcomes = market.outcomes.map((outcome) => ({
      outcome,
      price: market.prices.find((item) => item.outcomeId === outcome.id)?.price ?? 0
    }));

    if (agent.strategy === 'data_value' && market.category === 'attendance' && pricedOutcomes[1]) {
      return { ...pricedOutcomes[1], fairProbability: 58 };
    }
    if (agent.strategy === 'trend') {
      const picked = pricedOutcomes.reduce((best, item) => (item.price > best.price ? item : best));
      return { ...picked, fairProbability: Math.min(99, picked.price + 4) };
    }
    if (agent.strategy === 'contrarian') {
      const picked = pricedOutcomes.reduce((best, item) => (item.price < best.price ? item : best));
      return { ...picked, fairProbability: Math.min(99, picked.price + 4) };
    }

    const equalProbability = 100 / pricedOutcomes.length;
    const picked = pricedOutcomes.reduce((best, item) =>
      Math.abs(item.price - equalProbability) < Math.abs(best.price - equalProbability) ? item : best
    );
    const fairProbability = agent.strategy === 'market_maker' ? equalProbability : Math.min(99, picked.price + 4);
    return { ...picked, fairProbability };
  }

  private placeBoundedBuy(
    context: AgentContextPacket,
    market: MarketDetail,
    outcome: MarketOutcome
  ): TradeRecord | null {
    const existingShares =
      context.positions.find((position) => position.marketId === market.id && position.outcomeId === outcome.id)
        ?.shares ?? 0;
    const remainingPositionShares = Math.floor(context.agent.maxPositionShares - existingShares);
    const maxAffordablePoints = Math.min(context.agent.maxTradePoints, context.balance);
    const estimatedPrice = market.prices.find((price) => price.outcomeId === outcome.id)?.price ?? 100;
    const startingShares = Math.min(
      remainingPositionShares,
      Math.max(1, Math.floor(maxAffordablePoints / Math.max(estimatedPrice, 1)))
    );

    for (let shares = startingShares; shares >= 1; shares -= 1) {
      const quote = this.markets.quoteTrade({
        marketId: market.id,
        outcomeId: outcome.id,
        side: 'buy',
        shares
      }) as TradeQuote;
      if (quote.pointsAmount <= maxAffordablePoints) {
        return this.markets.placeTrade({
          accountId: context.agent.accountId,
          marketId: market.id,
          outcomeId: outcome.id,
          side: 'buy',
          shares
        });
      }
    }

    return null;
  }

  private recordWakeResult(
    context: AgentContextPacket | (AgentContextPacket & { wakeContext?: AgentWakeContext }),
    startedAt: string,
    status: WakeAgentResult['status'],
    actionType: AgentActionType,
    marketId: string | null,
    message: string,
    payload: Record<string, unknown>,
    countAgainstBudget: boolean
  ): WakeAgentResult {
    const finishedAt = nowIso();
    const wakeRunId = newId('wake');
    const actionId = newId('aact');

    this.db
      .prepare(
        `INSERT INTO agent_wake_runs (
          id, account_id, started_at, finished_at, status, context_json
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(wakeRunId, context.agent.accountId, startedAt, finishedAt, status, JSON.stringify(context));

    this.db
      .prepare(
        `INSERT INTO agent_actions (
          id, wake_run_id, account_id, market_id, type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(actionId, wakeRunId, context.agent.accountId, marketId, actionType, JSON.stringify(payload), finishedAt);

    this.insertActivity(context.agent.accountId, marketId, actionType, message, { wakeRunId, actionId, ...payload }, finishedAt);
    this.advanceWake(context.agent, finishedAt, countAgainstBudget);

    return {
      status,
      actionType,
      wakeRunId,
      marketId
    };
  }

  private insertActivity(
    accountId: string,
    marketId: string | null,
    type: AgentActionType,
    message: string,
    payload: Record<string, unknown>,
    createdAt: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO activities (
          id, market_id, account_id, type, message, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(newId('act'), marketId, accountId, type, message, JSON.stringify(payload), createdAt);
  }

  private advanceWake(agent: AgentProfile, lastWakeAt: string, countAgainstBudget: boolean): void {
    const nextWakeAt = new Date(Date.parse(lastWakeAt) + agent.wakeIntervalMinutes * 60_000).toISOString();
    const nextActionsUsed = agent.actionsUsedToday + (countAgainstBudget ? 1 : 0);
    this.db
      .prepare(
        `UPDATE agent_profiles
         SET actions_used_today = ?, last_wake_at = ?, next_wake_at = ?
         WHERE account_id = ?`
      )
      .run(nextActionsUsed, lastWakeAt, nextWakeAt, agent.accountId);
  }
}
