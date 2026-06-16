import { describe, expect, test } from 'vitest';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { createTestDb } from './helpers.js';

function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

describe('MarketService.getPriceHistory', () => {
  test('returns empty array for a market with no trades', () => {
    const db = createTestDb();
    const markets = new MarketService(db, new LedgerService(db));
    const market = markets.createMarket({
      title: 'No trades yet',
      category: 'product',
      closeTime: tomorrow(),
      settlementSource: 'src',
      outcomes: ['Yes', 'No'],
    });
    expect(markets.getPriceHistory(market.id)).toEqual([]);
  });

  test('returns one snapshot per outcome per trade, ascending by time', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({ kind: 'human', handle: 'h', displayName: 'H', initialPoints: 1000 });
    const market = markets.createMarket({
      title: 'M',
      category: 'product',
      closeTime: tomorrow(),
      settlementSource: 'src',
      outcomes: ['Yes', 'No'],
    });
    const outcome = markets.getMarket(market.id).outcomes[0];
    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 5 });

    const history = markets.getPriceHistory(market.id);
    expect(history.length).toBe(2); // 2 outcomes x 1 trade
    expect(history[0]).toHaveProperty('outcomeId');
    expect(history[0]).toHaveProperty('price');
    expect(history[0]).toHaveProperty('createdAt');
  });

  test('throws for unknown market', () => {
    const db = createTestDb();
    const markets = new MarketService(db, new LedgerService(db));
    expect(() => markets.getPriceHistory('mkt_nope')).toThrow();
  });
});
