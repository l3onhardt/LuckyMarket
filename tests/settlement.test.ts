import { describe, expect, test } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { createTestDb } from './helpers.js';

function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function setupMarket(outcomes = ['Yes', 'No']) {
  const db = createTestDb();
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const account = ledger.createAccount({
    kind: 'human',
    handle: `trader-${Math.random().toString(36).slice(2)}`,
    displayName: 'Trader',
    initialPoints: 1000
  });
  const market = markets.createMarket({
    title: 'Will the launch ship this week?',
    category: 'delivery',
    closeTime: tomorrow(),
    settlementSource: 'Release notes',
    outcomes,
    liquidityParameter: 100
  });

  return { db, ledger, markets, account, market: markets.getMarket(market.id) };
}

describe('MarketService settlement', () => {
  test('closeMarket changes status and prevents further trades', () => {
    const { markets, account, market } = setupMarket();
    const outcome = market.outcomes[0];

    const closed = markets.closeMarket(market.id);

    expect(closed.status).toBe('closed');
    expect(() =>
      markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 1 })
    ).toThrow(AppError);
  });

  test('settleMarket pays winning positions at 100 points per share', () => {
    const { ledger, markets, account, market } = setupMarket(['0-1 days', '2-3 days', '4+ days']);
    const winning = market.outcomes[1];
    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: winning.id, side: 'buy', shares: 3 });
    const beforeSettlement = ledger.getBalance(account.id);

    const settled = markets.settleMarket(market.id, winning.id);

    expect(settled.status).toBe('settled');
    expect(settled.winningOutcomeId).toBe(winning.id);
    expect(ledger.getBalance(account.id)).toBe(beforeSettlement + 300);
    expect(ledger.getLedger(account.id).filter((entry) => entry.type === 'settlement_payout')).toEqual([
      expect.objectContaining({ amount: 300 })
    ]);
  });

  test('losing positions pay nothing', () => {
    const { ledger, markets, account, market } = setupMarket();
    const winning = market.outcomes[0];
    const losing = market.outcomes[1];
    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: losing.id, side: 'buy', shares: 4 });
    const beforeSettlement = ledger.getBalance(account.id);

    markets.settleMarket(market.id, winning.id);

    expect(ledger.getBalance(account.id)).toBe(beforeSettlement);
    expect(ledger.getLedger(account.id).filter((entry) => entry.type === 'settlement_payout')).toHaveLength(0);
  });

  test('rejects duplicate settlement', () => {
    const { markets, market } = setupMarket();
    const outcome = market.outcomes[0];

    markets.settleMarket(market.id, outcome.id);

    expect(() => markets.settleMarket(market.id, outcome.id)).toThrow(AppError);
    expect(() => markets.settleMarket(market.id, outcome.id)).toThrow('already settled');
    try {
      markets.settleMarket(market.id, outcome.id);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('MARKET_ALREADY_SETTLED');
    }
  });

  test('rejects settlement outcome outside the market', () => {
    const { markets, market } = setupMarket();
    const otherMarket = markets.createMarket({
      title: 'Will the retro happen this month?',
      category: 'team',
      closeTime: tomorrow(),
      settlementSource: 'Team calendar',
      outcomes: ['Yes', 'No'],
      liquidityParameter: 100
    });
    const outsideOutcome = markets.getMarket(otherMarket.id).outcomes[0];

    expect(() => markets.settleMarket(market.id, outsideOutcome.id)).toThrow(AppError);
    expect(() => markets.settleMarket(market.id, outsideOutcome.id)).toThrow('does not belong');
    try {
      markets.settleMarket(market.id, outsideOutcome.id);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_OUTCOME');
    }
  });

  test('settlement writes activity and ledger entries', () => {
    const { ledger, markets, account, market } = setupMarket();
    const winning = market.outcomes[0];
    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: winning.id, side: 'buy', shares: 2 });

    markets.closeMarket(market.id);
    markets.settleMarket(market.id, winning.id);

    const payoutEntries = ledger.getLedger(account.id).filter((entry) => entry.type === 'settlement_payout');
    expect(payoutEntries).toEqual([
      expect.objectContaining({
        accountId: account.id,
        amount: 200,
        referenceType: 'market',
        referenceId: market.id
      })
    ]);
    expect(markets.getActivity(market.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          marketId: market.id,
          type: 'settlement'
        })
      ])
    );
  });
});
