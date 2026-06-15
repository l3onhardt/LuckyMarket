import { AppError } from '../domain/errors.js';

export type TradeSide = 'buy' | 'sell';

export interface LmsrQuoteInput {
  quantities: number[];
  liquidityParameter: number;
  outcomeIndex: number;
  shares: number;
  side: TradeSide;
}

export interface LmsrQuote {
  side: TradeSide;
  outcomeIndex: number;
  shares: number;
  pointsAmount: number;
  priceBefore: number;
  priceAfter: number;
  pricesBefore: number[];
  pricesAfter: number[];
  nextQuantities: number[];
}

function validateMarketMath(quantities: number[], liquidityParameter: number): void {
  if (quantities.length < 2) {
    throw new AppError('VALIDATION_ERROR', 'Market must have at least two outcomes');
  }
  if (!Number.isFinite(liquidityParameter) || liquidityParameter <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Liquidity parameter must be positive');
  }
  if (quantities.some((quantity) => !Number.isFinite(quantity))) {
    throw new AppError('VALIDATION_ERROR', 'Outcome quantities must be finite');
  }
}

function validateQuote(input: LmsrQuoteInput): void {
  validateMarketMath(input.quantities, input.liquidityParameter);

  if (input.side !== 'buy' && input.side !== 'sell') {
    throw new AppError('VALIDATION_ERROR', 'Trade side must be buy or sell');
  }
  if (!Number.isInteger(input.outcomeIndex) || input.outcomeIndex < 0 || input.outcomeIndex >= input.quantities.length) {
    throw new AppError('INVALID_OUTCOME', 'Invalid outcome index');
  }
  if (!Number.isInteger(input.shares) || input.shares <= 0) {
    throw new AppError('VALIDATION_ERROR', 'Shares must be a positive integer');
  }
  if (input.side === 'sell' && input.quantities[input.outcomeIndex] - input.shares < 0) {
    throw new AppError('VALIDATION_ERROR', 'AMM quantity cannot go below zero');
  }
}

export function lmsrCost(quantities: number[], liquidityParameter: number): number {
  validateMarketMath(quantities, liquidityParameter);

  const scaled = quantities.map((quantity) => quantity / liquidityParameter);
  const max = Math.max(...scaled);
  const sum = scaled.reduce((acc, value) => acc + Math.exp(value - max), 0);

  return liquidityParameter * (Math.log(sum) + max);
}

export function getLmsrPrices(quantities: number[], liquidityParameter: number): number[] {
  validateMarketMath(quantities, liquidityParameter);

  const scaled = quantities.map((quantity) => quantity / liquidityParameter);
  const max = Math.max(...scaled);
  const weights = scaled.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);

  return weights.map((weight) => (weight / total) * 100);
}

export function quoteLmsrTrade(input: LmsrQuoteInput): LmsrQuote {
  validateQuote(input);

  const pricesBefore = getLmsrPrices(input.quantities, input.liquidityParameter);
  const nextQuantities = [...input.quantities];
  nextQuantities[input.outcomeIndex] += input.side === 'buy' ? input.shares : -input.shares;
  const pricesAfter = getLmsrPrices(nextQuantities, input.liquidityParameter);

  const beforeCost = lmsrCost(input.quantities, input.liquidityParameter);
  const afterCost = lmsrCost(nextQuantities, input.liquidityParameter);
  const rawPoints = input.side === 'buy' ? afterCost - beforeCost : beforeCost - afterCost;
  const pointsAmount = input.side === 'buy' ? Math.max(1, Math.ceil(rawPoints)) : Math.floor(rawPoints);

  return {
    side: input.side,
    outcomeIndex: input.outcomeIndex,
    shares: input.shares,
    pointsAmount,
    priceBefore: pricesBefore[input.outcomeIndex],
    priceAfter: pricesAfter[input.outcomeIndex],
    pricesBefore,
    pricesAfter,
    nextQuantities
  };
}
