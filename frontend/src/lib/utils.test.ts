import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercent, calculatePrices, formatDate } from './utils';

describe('formatNumber', () => {
  it('formats numbers with Chinese locale', () => {
    expect(formatNumber(1234.56)).toBe('1,234.56');
    expect(formatNumber(1000000)).toBe('1,000,000.00');
  });

  it('respects decimal places', () => {
    expect(formatNumber(123.456, 0)).toBe('123');
    expect(formatNumber(123.456, 3)).toBe('123.456');
  });

  it('rounds correctly with 0 decimals', () => {
    expect(formatNumber(123.9, 0)).toBe('124');
    expect(formatNumber(123.4, 0)).toBe('123');
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

  it('rejects negative quantities', () => {
    expect(() => calculatePrices([100, -50])).toThrow('Pool quantities must be non-negative');
    expect(() => calculatePrices([-10, 50])).toThrow('Pool quantities must be non-negative');
  });
});

describe('formatDate', () => {
  it('formats dates less than 1 minute as "刚刚"', () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
    expect(formatDate(recent)).toBe('刚刚');
  });

  it('formats dates 1-59 minutes as "X分钟前"', () => {
    const now = new Date();
    const oneMinute = new Date(now.getTime() - 1 * 60 * 1000);
    const thirtyMinutes = new Date(now.getTime() - 30 * 60 * 1000);
    const fiftyNineMinutes = new Date(now.getTime() - 59 * 60 * 1000);

    expect(formatDate(oneMinute)).toBe('1分钟前');
    expect(formatDate(thirtyMinutes)).toBe('30分钟前');
    expect(formatDate(fiftyNineMinutes)).toBe('59分钟前');
  });

  it('formats dates 1-23 hours as "X小时前"', () => {
    const now = new Date();
    const oneHour = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const twelveHours = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const twentyThreeHours = new Date(now.getTime() - 23 * 60 * 60 * 1000);

    expect(formatDate(oneHour)).toBe('1小时前');
    expect(formatDate(twelveHours)).toBe('12小时前');
    expect(formatDate(twentyThreeHours)).toBe('23小时前');
  });

  it('formats dates 1-6 days as "X天前"', () => {
    const now = new Date();
    const oneDay = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    const threeDays = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const sixDays = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);

    expect(formatDate(oneDay)).toBe('1天前');
    expect(formatDate(threeDays)).toBe('3天前');
    expect(formatDate(sixDays)).toBe('6天前');
  });

  it('formats dates 7+ days with full date', () => {
    const now = new Date();
    const eightDays = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
    const result = formatDate(eightDays);

    // Should be Chinese locale date format (e.g., "2026/6/7")
    expect(result).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
  });

  it('handles future dates gracefully', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    const result = formatDate(future);

    // Should show full date for future dates
    expect(result).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
  });

  it('handles invalid dates gracefully', () => {
    expect(formatDate('invalid-date')).toBe('无效日期');
    expect(formatDate(new Date('not a date'))).toBe('无效日期');
  });
});
