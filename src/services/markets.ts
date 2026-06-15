import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import { AppError, notFound } from '../domain/errors.js';
import type { Market, MarketOutcome, MarketStatus } from '../domain/types.js';
import { newId } from './ids.js';
import { LedgerService } from './ledger.js';
import { getLmsrPrices, quoteLmsrTrade, type TradeSide } from './marketMath.js';

export interface CreateMarketInput {
  title: string;
  category: string;
  closeTime: string;
  settlementSource: string;
  outcomes: string[];
  liquidityParameter?: number;
}

export interface TradeInput {
  accountId: string;
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  shares: number;
}

export interface MarketPrice {
  outcomeId: string;
  price: number;
}

export interface MarketDetail extends Market {
  outcomes: MarketOutcome[];
  prices: MarketPrice[];
}

export interface TradeQuote {
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  shares: number;
  pointsAmount: number;
  priceBefore: number;
  priceAfter: number;
  pricesBefore: MarketPrice[];
  pricesAfter: MarketPrice[];
}

export interface TradeRecord {
  id: string;
  marketId: string;
  outcomeId: string;
  accountId: string;
  side: TradeSide;
  shares: number;
  pointsAmount: number;
  priceBefore: number;
  priceAfter: number;
  createdAt: string;
}

export interface PositionRecord {
  accountId: string;
  marketId: string;
  outcomeId: string;
  shares: number;
  updatedAt: string;
}

export interface ActivityRecord {
  id: string;
  marketId: string | null;
  accountId: string | null;
  type: string;
  message: string;
  payload: unknown;
  createdAt: string;
}

export interface PriceSnapshotRecord {
  outcomeId: string;
  price: number;
  createdAt: string;
}

interface MarketRow {
  id: string;
  title: string;
  category: string;
  status: MarketStatus;
  close_time: string;
  settlement_source: string;
  winning_outcome_id: string | null;
  liquidity_parameter: number;
  created_at: string;
}

interface MarketOutcomeRow {
  id: string;
  market_id: string;
  label: string;
  sort_order: number;
  pool_quantity: number;
}

interface TradeRow {
  id: string;
  market_id: string;
  outcome_id: string;
  account_id: string;
  side: TradeSide;
  shares: number;
  points_amount: number;
  price_before: number;
  price_after: number;
  created_at: string;
}

interface PositionRow {
  account_id: string;
  market_id: string;
  outcome_id: string;
  shares: number;
  updated_at: string;
}

interface SettlementPositionRow {
  account_id: string;
  shares: number;
}

interface ActivityRow {
  id: string;
  market_id: string | null;
  account_id: string | null;
  type: string;
  message: string;
  payload_json: string;
  created_at: string;
}

interface PriceSnapshotRow {
  id: string;
  market_id: string;
  outcome_id: string;
  price: number;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapMarket(row: MarketRow): Market {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    closeTime: row.close_time,
    settlementSource: row.settlement_source,
    winningOutcomeId: row.winning_outcome_id,
    liquidityParameter: row.liquidity_parameter,
    createdAt: row.created_at
  };
}

function mapOutcome(row: MarketOutcomeRow): MarketOutcome {
  return {
    id: row.id,
    marketId: row.market_id,
    label: row.label,
    sortOrder: row.sort_order,
    poolQuantity: row.pool_quantity
  };
}

function mapTrade(row: TradeRow): TradeRecord {
  return {
    id: row.id,
    marketId: row.market_id,
    outcomeId: row.outcome_id,
    accountId: row.account_id,
    side: row.side,
    shares: row.shares,
    pointsAmount: row.points_amount,
    priceBefore: row.price_before,
    priceAfter: row.price_after,
    createdAt: row.created_at
  };
}

function mapPosition(row: PositionRow): PositionRecord {
  return {
    accountId: row.account_id,
    marketId: row.market_id,
    outcomeId: row.outcome_id,
    shares: row.shares,
    updatedAt: row.updated_at
  };
}

function mapActivity(row: ActivityRow): ActivityRecord {
  return {
    id: row.id,
    marketId: row.market_id,
    accountId: row.account_id,
    type: row.type,
    message: row.message,
    payload: JSON.parse(row.payload_json) as unknown,
    createdAt: row.created_at
  };
}

function mapSnapshot(row: PriceSnapshotRow): PriceSnapshotRecord {
  return {
    outcomeId: row.outcome_id,
    price: row.price,
    createdAt: row.created_at
  };
}

function validateCreateMarket(input: CreateMarketInput): void {
  if (!input.title.trim()) {
    throw new AppError('VALIDATION_ERROR', 'Market title is required');
  }
  if (!input.category.trim()) {
    throw new AppError('VALIDATION_ERROR', 'Market category is required');
  }
  if (!input.settlementSource.trim()) {
    throw new AppError('VALIDATION_ERROR', 'Settlement source is required');
  }
  if (Number.isNaN(Date.parse(input.closeTime))) {
    throw new AppError('VALIDATION_ERROR', 'Close time must be a valid ISO timestamp');
  }
  if (input.outcomes.length < 2) {
    throw new AppError('VALIDATION_ERROR', 'Market must have at least two outcomes');
  }
  if (input.outcomes.some((outcome) => !outcome.trim())) {
    throw new AppError('VALIDATION_ERROR', 'Outcome labels are required');
  }
  if (input.liquidityParameter !== undefined && input.liquidityParameter <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Liquidity parameter must be positive');
  }
}

function pricesForOutcomes(outcomes: MarketOutcome[], liquidityParameter: number): MarketPrice[] {
  const prices = getLmsrPrices(
    outcomes.map((outcome) => outcome.poolQuantity),
    liquidityParameter
  );

  return outcomes.map((outcome, index) => ({ outcomeId: outcome.id, price: prices[index] }));
}

export class MarketService {
  constructor(private readonly db: Db, private readonly ledger: LedgerService) {}

  createMarket(input: CreateMarketInput): Market {
    validateCreateMarket(input);

    return inTransaction(this.db, () => {
      const id = newId('mkt');
      const createdAt = nowIso();
      const liquidityParameter = input.liquidityParameter ?? 100;
      this.db
        .prepare(
          `INSERT INTO markets (
            id, title, category, status, close_time, settlement_source,
            winning_outcome_id, liquidity_parameter, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.title,
          input.category,
          'open',
          input.closeTime,
          input.settlementSource,
          null,
          liquidityParameter,
          createdAt
        );

      const insertOutcome = this.db.prepare(
        `INSERT INTO market_outcomes (
          id, market_id, label, sort_order, pool_quantity
        ) VALUES (?, ?, ?, ?, ?)`
      );
      input.outcomes.forEach((label, index) => {
        insertOutcome.run(newId('out'), id, label, index, 0);
      });

      return this.getMarketRow(id);
    });
  }

  getMarket(marketId: string): MarketDetail {
    const market = this.getMarketRow(marketId);
    const outcomes = this.getOutcomeRows(marketId);

    return {
      ...market,
      outcomes,
      prices: pricesForOutcomes(outcomes, market.liquidityParameter)
    };
  }

  listMarkets(): MarketDetail[] {
    const rows = this.db
      .prepare('SELECT * FROM markets ORDER BY created_at DESC, id DESC')
      .all() as MarketRow[];

    return rows.map((row) => this.getMarket(row.id));
  }

  closeMarket(marketId: string): MarketDetail {
    return inTransaction(this.db, () => {
      const market = this.getMarketRow(marketId);
      if (market.status === 'settled') {
        throw new AppError('MARKET_ALREADY_SETTLED', `Market is already settled: ${marketId}`);
      }
      if (market.status !== 'closed') {
        this.db.prepare("UPDATE markets SET status = 'closed' WHERE id = ?").run(marketId);
      }

      return this.getMarket(marketId);
    });
  }

  settleMarket(marketId: string, winningOutcomeId: string): MarketDetail {
    return inTransaction(this.db, () => {
      const market = this.getMarketRow(marketId);
      if (market.status === 'settled') {
        throw new AppError('MARKET_ALREADY_SETTLED', `Market is already settled: ${marketId}`);
      }

      const winningOutcome = this.getOutcomeRows(marketId).find((outcome) => outcome.id === winningOutcomeId);
      if (!winningOutcome) {
        throw new AppError('INVALID_OUTCOME', `Outcome ${winningOutcomeId} does not belong to market ${marketId}`);
      }

      const settledAt = nowIso();
      this.db
        .prepare("UPDATE markets SET status = 'settled', winning_outcome_id = ? WHERE id = ?")
        .run(winningOutcomeId, marketId);

      const rows = this.db
        .prepare(
          `SELECT account_id, shares FROM positions
           WHERE market_id = ? AND outcome_id = ? AND shares > 0
           ORDER BY account_id ASC`
        )
        .all(marketId, winningOutcomeId) as SettlementPositionRow[];

      rows.forEach((row) => {
        const payout = row.shares * 100;
        if (payout > 0) {
          this.ledger.settlementPayout(
            row.account_id,
            payout,
            marketId,
            `Settlement payout for ${market.title}: ${winningOutcome.label}`
          );
        }
      });

      this.insertSettlementActivity(marketId, winningOutcomeId, winningOutcome.label, rows.length, settledAt);

      return this.getMarket(marketId);
    });
  }

  quoteTrade(input: Omit<TradeInput, 'accountId'>): TradeQuote {
    const market = this.getMarketRow(input.marketId);
    this.assertMarketOpenForTrade(market);
    const outcomes = this.getOutcomeRows(input.marketId);
    const outcomeIndex = outcomes.findIndex((outcome) => outcome.id === input.outcomeId);
    if (outcomeIndex === -1) {
      throw new AppError('INVALID_OUTCOME', `Outcome ${input.outcomeId} does not belong to market ${input.marketId}`);
    }

    const quote = quoteLmsrTrade({
      quantities: outcomes.map((outcome) => outcome.poolQuantity),
      liquidityParameter: market.liquidityParameter,
      outcomeIndex,
      shares: input.shares,
      side: input.side
    });

    return {
      marketId: input.marketId,
      outcomeId: input.outcomeId,
      side: quote.side,
      shares: quote.shares,
      pointsAmount: quote.pointsAmount,
      priceBefore: quote.priceBefore,
      priceAfter: quote.priceAfter,
      pricesBefore: outcomes.map((outcome, index) => ({ outcomeId: outcome.id, price: quote.pricesBefore[index] })),
      pricesAfter: outcomes.map((outcome, index) => ({ outcomeId: outcome.id, price: quote.pricesAfter[index] }))
    };
  }

  placeTrade(input: TradeInput): TradeRecord {
    return inTransaction(this.db, () => {
      this.ledger.getAccount(input.accountId);
      const market = this.getMarketRow(input.marketId);
      this.assertMarketOpenForTrade(market);
      const outcomes = this.getOutcomeRows(input.marketId);
      const outcomeIndex = outcomes.findIndex((outcome) => outcome.id === input.outcomeId);
      if (outcomeIndex === -1) {
        throw new AppError('INVALID_OUTCOME', `Outcome ${input.outcomeId} does not belong to market ${input.marketId}`);
      }

      if (input.side === 'sell') {
        const existingShares = this.getPositionShares(input.accountId, input.marketId, input.outcomeId);
        if (existingShares < input.shares) {
          throw new AppError('VALIDATION_ERROR', `Cannot sell ${input.shares} shares from position of ${existingShares}`);
        }
      }

      const quote = quoteLmsrTrade({
        quantities: outcomes.map((outcome) => outcome.poolQuantity),
        liquidityParameter: market.liquidityParameter,
        outcomeIndex,
        shares: input.shares,
        side: input.side
      });
      const tradeId = newId('trd');
      const createdAt = nowIso();
      const memo = `${input.side} ${input.shares} shares in ${market.title}`;

      if (input.side === 'buy') {
        this.ledger.tradeDebit(input.accountId, quote.pointsAmount, tradeId, memo);
      } else if (quote.pointsAmount > 0) {
        this.ledger.tradeCredit(input.accountId, quote.pointsAmount, tradeId, memo);
      }

      this.db
        .prepare(
          `INSERT INTO trades (
            id, market_id, outcome_id, account_id, side, shares, points_amount,
            price_before, price_after, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          tradeId,
          input.marketId,
          input.outcomeId,
          input.accountId,
          input.side,
          input.shares,
          quote.pointsAmount,
          quote.priceBefore,
          quote.priceAfter,
          createdAt
        );

      this.updatePoolQuantities(outcomes, quote.nextQuantities);
      this.upsertPosition(input, createdAt);
      this.insertSnapshots(input.marketId, outcomes, quote.pricesAfter, createdAt);
      this.insertTradeActivity(input, tradeId, quote.pointsAmount, createdAt);

      return this.getTradeRow(tradeId);
    });
  }

  getPositions(accountId: string): PositionRecord[] {
    this.ledger.getAccount(accountId);
    const rows = this.db
      .prepare(
        `SELECT * FROM positions
         WHERE account_id = ? AND shares != 0
         ORDER BY updated_at DESC, market_id ASC, outcome_id ASC`
      )
      .all(accountId) as PositionRow[];

    return rows.map(mapPosition);
  }

  getActivity(marketId: string): ActivityRecord[] {
    this.getMarketRow(marketId);
    const rows = this.db
      .prepare('SELECT * FROM activities WHERE market_id = ? ORDER BY created_at DESC, id DESC')
      .all(marketId) as ActivityRow[];

    return rows.map(mapActivity);
  }

  getPriceHistory(marketId: string): PriceSnapshotRecord[] {
    this.getMarketRow(marketId); // 不存在则抛 notFound
    const rows = this.db
      .prepare('SELECT * FROM market_price_snapshots WHERE market_id = ? ORDER BY created_at ASC, id ASC')
      .all(marketId) as PriceSnapshotRow[];

    return rows.map(mapSnapshot);
  }

  private getMarketRow(marketId: string): Market {
    const row = this.db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId) as MarketRow | undefined;
    if (!row) {
      throw notFound(`Market not found: ${marketId}`);
    }

    return mapMarket(row);
  }

  private getOutcomeRows(marketId: string): MarketOutcome[] {
    const rows = this.db
      .prepare('SELECT * FROM market_outcomes WHERE market_id = ? ORDER BY sort_order ASC, id ASC')
      .all(marketId) as MarketOutcomeRow[];

    return rows.map(mapOutcome);
  }

  private getTradeRow(tradeId: string): TradeRecord {
    const row = this.db.prepare('SELECT * FROM trades WHERE id = ?').get(tradeId) as TradeRow | undefined;
    if (!row) {
      throw notFound(`Trade not found: ${tradeId}`);
    }

    return mapTrade(row);
  }

  private assertMarketOpenForTrade(market: Market): void {
    if (market.status !== 'open' || Date.parse(market.closeTime) <= Date.now()) {
      throw new AppError('MARKET_CLOSED', `Market is not open for trading: ${market.id}`);
    }
  }

  private getPositionShares(accountId: string, marketId: string, outcomeId: string): number {
    const row = this.db
      .prepare('SELECT shares FROM positions WHERE account_id = ? AND market_id = ? AND outcome_id = ?')
      .get(accountId, marketId, outcomeId) as { shares: number } | undefined;

    return row?.shares ?? 0;
  }

  private updatePoolQuantities(outcomes: MarketOutcome[], nextQuantities: number[]): void {
    const update = this.db.prepare('UPDATE market_outcomes SET pool_quantity = ? WHERE id = ?');
    outcomes.forEach((outcome, index) => {
      update.run(nextQuantities[index], outcome.id);
    });
  }

  private upsertPosition(input: TradeInput, updatedAt: string): void {
    const currentShares = this.getPositionShares(input.accountId, input.marketId, input.outcomeId);
    const nextShares = input.side === 'buy' ? currentShares + input.shares : currentShares - input.shares;

    this.db
      .prepare(
        `INSERT INTO positions (
          account_id, market_id, outcome_id, shares, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(account_id, market_id, outcome_id)
        DO UPDATE SET shares = excluded.shares, updated_at = excluded.updated_at`
      )
      .run(input.accountId, input.marketId, input.outcomeId, nextShares, updatedAt);
  }

  private insertSnapshots(marketId: string, outcomes: MarketOutcome[], prices: number[], createdAt: string): void {
    const insert = this.db.prepare(
      `INSERT INTO market_price_snapshots (
        id, market_id, outcome_id, price, created_at
      ) VALUES (?, ?, ?, ?, ?)`
    );

    outcomes.forEach((outcome, index) => {
      insert.run(newId('snap'), marketId, outcome.id, prices[index], createdAt);
    });
  }

  private insertTradeActivity(input: TradeInput, tradeId: string, pointsAmount: number, createdAt: string): void {
    const message = `${input.accountId} ${input.side} ${input.shares} shares`;
    this.db
      .prepare(
        `INSERT INTO activities (
          id, market_id, account_id, type, message, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId('act'),
        input.marketId,
        input.accountId,
        'trade',
        message,
        JSON.stringify({
          tradeId,
          outcomeId: input.outcomeId,
          side: input.side,
          shares: input.shares,
          pointsAmount
        }),
        createdAt
      );
  }

  private insertSettlementActivity(
    marketId: string,
    winningOutcomeId: string,
    winningOutcomeLabel: string,
    paidPositionCount: number,
    createdAt: string
  ): void {
    this.db
      .prepare(
        `INSERT INTO activities (
          id, market_id, account_id, type, message, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        newId('act'),
        marketId,
        null,
        'settlement',
        `Market settled: ${winningOutcomeLabel}`,
        JSON.stringify({
          winningOutcomeId,
          winningOutcomeLabel,
          paidPositionCount
        }),
        createdAt
      );
  }
}
