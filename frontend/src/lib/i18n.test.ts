import { describe, it, expect } from 'vitest';
import { strategyLabel, marketStatusLabel, categoryLabel } from './i18n';

describe('i18n labels', () => {
  it('maps known strategy enums to Chinese', () => {
    expect(strategyLabel('data_value')).toBe('数据价值');
    expect(strategyLabel('trend')).toBe('趋势');
    expect(strategyLabel('contrarian')).toBe('反向');
    expect(strategyLabel('market_maker')).toBe('做市');
  });

  it('falls back to raw strategy when unknown', () => {
    expect(strategyLabel('something_new')).toBe('something_new');
  });

  it('maps market status to Chinese', () => {
    expect(marketStatusLabel('open')).toBe('开放交易');
    expect(marketStatusLabel('closed')).toBe('已关闭');
    expect(marketStatusLabel('settled')).toBe('已结算');
  });

  it('maps known english categories, passes through others', () => {
    expect(categoryLabel('product')).toBe('产品');
    expect(categoryLabel('科技')).toBe('科技');
  });
});
