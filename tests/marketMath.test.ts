import { describe, expect, test } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import { getLmsrPrices, quoteLmsrTrade } from '../src/services/marketMath.js';

describe('marketMath', () => {
  test('returns equal prices for equal outcome quantities', () => {
    const prices = getLmsrPrices([0, 0, 0, 0], 100);

    expect(prices).toHaveLength(4);
    prices.forEach((price) => expect(price).toBeCloseTo(25, 6));
    expect(prices.reduce((sum, price) => sum + price, 0)).toBeCloseTo(100, 6);
  });

  test('buy quote has positive cost and raises selected outcome price', () => {
    const quote = quoteLmsrTrade({
      quantities: [0, 0, 0, 0],
      liquidityParameter: 100,
      outcomeIndex: 1,
      shares: 10,
      side: 'buy'
    });

    expect(quote.pointsAmount).toBeGreaterThan(0);
    expect(quote.priceBefore).toBeCloseTo(25, 6);
    expect(quote.priceAfter).toBeGreaterThan(25);
    expect(quote.nextQuantities[1]).toBe(10);
  });

  test('sell quote lowers selected outcome price and returns points', () => {
    const quote = quoteLmsrTrade({
      quantities: [0, 20, 0, 0],
      liquidityParameter: 100,
      outcomeIndex: 1,
      shares: 5,
      side: 'sell'
    });

    expect(quote.pointsAmount).toBeGreaterThan(0);
    expect(quote.priceAfter).toBeLessThan(quote.priceBefore);
    expect(quote.nextQuantities[1]).toBe(15);
  });

  test('buy then sell same shares does not return more points than buy cost', () => {
    const buyQuote = quoteLmsrTrade({
      quantities: [0, 0, 0, 0],
      liquidityParameter: 100,
      outcomeIndex: 1,
      shares: 10,
      side: 'buy'
    });
    const sellQuote = quoteLmsrTrade({
      quantities: buyQuote.nextQuantities,
      liquidityParameter: 100,
      outcomeIndex: 1,
      shares: 10,
      side: 'sell'
    });

    expect(sellQuote.pointsAmount).toBeLessThanOrEqual(buyQuote.pointsAmount);
  });

  test('buy then split-sell in one-share fragments does not return more points than buy cost', () => {
    const buyQuote = quoteLmsrTrade({
      quantities: [0, 0, 0, 0],
      liquidityParameter: 100,
      outcomeIndex: 1,
      shares: 10,
      side: 'buy'
    });
    let quantities = buyQuote.nextQuantities;
    let totalSellProceeds = 0;

    for (let share = 0; share < 10; share += 1) {
      const sellQuote = quoteLmsrTrade({
        quantities,
        liquidityParameter: 100,
        outcomeIndex: 1,
        shares: 1,
        side: 'sell'
      });
      quantities = sellQuote.nextQuantities;
      totalSellProceeds += sellQuote.pointsAmount;
    }

    expect(totalSellProceeds).toBeLessThanOrEqual(buyQuote.pointsAmount);
  });

  test('rejects invalid runtime trade side with validation error', () => {
    expect(() =>
      quoteLmsrTrade({
        quantities: [0, 0],
        liquidityParameter: 100,
        outcomeIndex: 0,
        shares: 1,
        side: 'hold' as 'buy'
      })
    ).toThrow(AppError);

    try {
      quoteLmsrTrade({
        quantities: [0, 0],
        liquidityParameter: 100,
        outcomeIndex: 0,
        shares: 1,
        side: 'hold' as 'buy'
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION_ERROR');
    }
  });

  test('rejects invalid outcome index with AppError code', () => {
    expect(() =>
      quoteLmsrTrade({
        quantities: [0, 0],
        liquidityParameter: 100,
        outcomeIndex: 2,
        shares: 1,
        side: 'buy'
      })
    ).toThrow(AppError);

    try {
      quoteLmsrTrade({
        quantities: [0, 0],
        liquidityParameter: 100,
        outcomeIndex: 2,
        shares: 1,
        side: 'buy'
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('INVALID_OUTCOME');
    }
  });

  test('rejects invalid shares and liquidity with validation errors', () => {
    expect(() =>
      quoteLmsrTrade({
        quantities: [0, 0],
        liquidityParameter: 100,
        outcomeIndex: 0,
        shares: 0,
        side: 'buy'
      })
    ).toThrow(AppError);

    expect(() => getLmsrPrices([0, 0], 0)).toThrow(AppError);
  });

  test('rejects fractional shares with validation error', () => {
    expect(() =>
      quoteLmsrTrade({
        quantities: [0, 0],
        liquidityParameter: 100,
        outcomeIndex: 0,
        shares: 1.5,
        side: 'buy'
      })
    ).toThrow(AppError);

    try {
      quoteLmsrTrade({
        quantities: [0, 0],
        liquidityParameter: 100,
        outcomeIndex: 0,
        shares: 1.5,
        side: 'buy'
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION_ERROR');
      expect((error as AppError).message).toContain('positive integer');
    }
  });
});
