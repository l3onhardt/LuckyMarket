import { describe, expect, test } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { createTestDb } from './helpers.js';

function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function yesterday(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}

describe('MarketService trading', () => {
  test('creates a market and quotes all outcome prices', () => {
    const db = createTestDb();
    const markets = new MarketService(db, new LedgerService(db));

    const market = markets.createMarket({
      title: 'Wang Ge rest days in June',
      category: 'attendance',
      closeTime: tomorrow(),
      settlementSource: 'Company attendance records',
      outcomes: ['0-1 days', '2-3 days', '4-5 days', '6+ days'],
      liquidityParameter: 100
    });

    const detail = markets.getMarket(market.id);
    expect(detail.outcomes).toHaveLength(4);
    expect(detail.prices.reduce((sum, item) => sum + item.price, 0)).toBeCloseTo(100, 6);
  });

  test('buy trade debits points, creates records, and moves price up', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'wang-ge',
      displayName: 'Wang Ge',
      initialPoints: 1000
    });
    const market = markets.createMarket({
      title: 'Wang Ge rest days in June',
      category: 'attendance',
      closeTime: tomorrow(),
      settlementSource: 'Company attendance records',
      outcomes: ['0-1 days', '2-3 days', '4-5 days', '6+ days'],
      liquidityParameter: 100
    });
    const outcome = markets.getMarket(market.id).outcomes[1];

    const quote = markets.quoteTrade({ marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 10 });
    const trade = markets.placeTrade({
      accountId: account.id,
      marketId: market.id,
      outcomeId: outcome.id,
      side: 'buy',
      shares: 10
    });

    expect(trade.pointsAmount).toBe(quote.pointsAmount);
    expect(ledger.getBalance(account.id)).toBe(1000 - quote.pointsAmount);
    expect(markets.getPositions(account.id)).toEqual([
      expect.objectContaining({ marketId: market.id, outcomeId: outcome.id, shares: 10 })
    ]);
    expect(markets.getMarket(market.id).prices.find((item) => item.outcomeId === outcome.id)?.price).toBeGreaterThan(
      quote.priceBefore
    );
    expect(markets.getActivity(market.id)).toHaveLength(1);

    const snapshotCount = db
      .prepare('SELECT COUNT(*) AS count FROM market_price_snapshots WHERE market_id = ?')
      .get(market.id) as { count: number };
    expect(snapshotCount.count).toBe(4);
  });

  test('rejects fractional shares for quotes and trades', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'fractional-trader',
      displayName: 'Fractional Trader',
      initialPoints: 1000
    });
    const market = markets.createMarket({
      title: 'Will fractional trading sneak in?',
      category: 'quality',
      closeTime: tomorrow(),
      settlementSource: 'Code review',
      outcomes: ['Yes', 'No'],
      liquidityParameter: 100
    });
    const outcome = markets.getMarket(market.id).outcomes[0];

    expect(() =>
      markets.quoteTrade({ marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 1.5 })
    ).toThrow(AppError);
    expect(() =>
      markets.placeTrade({
        accountId: account.id,
        marketId: market.id,
        outcomeId: outcome.id,
        side: 'buy',
        shares: 1.5
      })
    ).toThrow(AppError);
    expect(markets.getPositions(account.id)).toEqual([]);
  });

  test('sell trade credits points when positive and lowers position', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'xiao-li',
      displayName: 'Xiao Li',
      initialPoints: 1000
    });
    const market = markets.createMarket({
      title: 'Will requirements change a third time?',
      category: 'product',
      closeTime: tomorrow(),
      settlementSource: 'Product requirements document',
      outcomes: ['Yes', 'No'],
      liquidityParameter: 100
    });
    const outcome = markets.getMarket(market.id).outcomes[0];

    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 10 });
    const balanceAfterBuy = ledger.getBalance(account.id);
    const sellQuote = markets.quoteTrade({ marketId: market.id, outcomeId: outcome.id, side: 'sell', shares: 4 });
    const sell = markets.placeTrade({
      accountId: account.id,
      marketId: market.id,
      outcomeId: outcome.id,
      side: 'sell',
      shares: 4
    });

    expect(sell.pointsAmount).toBe(sellQuote.pointsAmount);
    expect(sell.pointsAmount).toBeGreaterThan(0);
    expect(ledger.getBalance(account.id)).toBe(balanceAfterBuy + sell.pointsAmount);
    expect(markets.getPositions(account.id)[0]).toMatchObject({ outcomeId: outcome.id, shares: 6 });
  });

  test('rejects selling more shares than the account position', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'xiao-zhao',
      displayName: 'Xiao Zhao',
      initialPoints: 1000
    });
    const market = markets.createMarket({
      title: 'Will launch ship this Friday?',
      category: 'delivery',
      closeTime: tomorrow(),
      settlementSource: 'Release notes',
      outcomes: ['Yes', 'No']
    });
    const outcome = markets.getMarket(market.id).outcomes[0];

    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 3 });

    expect(() =>
      markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'sell', shares: 4 })
    ).toThrow(AppError);
    expect(markets.getPositions(account.id)[0]).toMatchObject({ shares: 3 });
  });

  test('rejects trades on closed and past-close markets', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'closed-trader',
      displayName: 'Closed Trader',
      initialPoints: 1000
    });
    const closedMarket = markets.createMarket({
      title: 'Closed status market',
      category: 'ops',
      closeTime: tomorrow(),
      settlementSource: 'Ops record',
      outcomes: ['Yes', 'No']
    });
    const pastCloseMarket = markets.createMarket({
      title: 'Past close market',
      category: 'ops',
      closeTime: yesterday(),
      settlementSource: 'Ops record',
      outcomes: ['Yes', 'No']
    });
    db.prepare("UPDATE markets SET status = 'closed' WHERE id = ?").run(closedMarket.id);

    expect(() =>
      markets.placeTrade({
        accountId: account.id,
        marketId: closedMarket.id,
        outcomeId: markets.getMarket(closedMarket.id).outcomes[0].id,
        side: 'buy',
        shares: 1
      })
    ).toThrow(AppError);
    expect(() =>
      markets.placeTrade({
        accountId: account.id,
        marketId: pastCloseMarket.id,
        outcomeId: markets.getMarket(pastCloseMarket.id).outcomes[0].id,
        side: 'buy',
        shares: 1
      })
    ).toThrow(AppError);
  });
});
