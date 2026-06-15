import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercent, calculatePrices } from './utils';

describe('formatNumber', () => {
  it('formats numbers with Chinese locale', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
    expect(formatNumber(1000000)).toBe('1,000,000.00');
  });

  it('respects decimal places', () => {
    expect(formatNumber(123.456, 0)).toBe('123');
    expect(formatNumber(123.456, 3)).toBe('123.456');
  });
});

describe('formatPercent', () => {
  it('formats decimals as percentages', () => {
    expect(formatPercent(0.5)).toBe('50.0%');
    expect(formatPercent(0.123)).toBe('12.3%');
    expect(formatPercent(1)).toBe('100.0%');
  });

  it('respects decimal places', () => {
    expect(formatPercent(0.12345, 2)).toBe('12.35%');
    expect(formatPercent(0.12345, 0)).toBe('12%');
  });
});

describe('calculatePrices', () => {
  it('calculates prices from quantities', () => {
    const prices = calculatePrices([100, 100]);
    expect(prices).toEqual([0.5, 0.5]);
  });

  it('handles unequal quantities', () => {
    const prices = calculatePrices([75, 25]);
    expect(prices).toEqual([0.75, 0.25]);
  });

  it('handles zero total', () => {
    const prices = calculatePrices([0, 0]);
    expect(prices).toEqual([0, 0]);
  });
});
