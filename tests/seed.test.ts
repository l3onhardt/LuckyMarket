import { describe, expect, test } from 'vitest';
import { AgentService } from '../src/services/agents.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { createTestDb } from './helpers.js';

describe('seedDemoData', () => {
  test('creates demo accounts, agent profiles, and markets once', async () => {
    const { seedDemoData } = await import('../src/db/seed.js');
    const db = createTestDb();

    const result = seedDemoData(db);

    expect(result.skipped).toBe(false);
    if (result.skipped) {
      throw new Error('Expected seed data to be created');
    }
    expect(result.humans.map((account) => account.handle)).toEqual(['admin', 'wang-ge', 'xiao-li', 'xiao-zhao']);
    expect(result.humans.find((account) => account.handle === 'admin')?.displayName).toBe('Admin');
    expect(result.agentAccounts.map((account) => account.handle)).toEqual([
      'hr-data-agent',
      'boss-view-agent',
      'engineer-reality-agent',
      'trend-agent',
      'contrarian-agent',
      'market-maker-agent'
    ]);
    expect(result.mainMarket.title).toBe('王哥将在6月休息几天？');

    const ledger = new LedgerService(db);
    expect(ledger.getBalance(ledger.getAccountByHandle('admin').id)).toBe(5000);
    expect(ledger.getBalance(ledger.getAccountByHandle('wang-ge').id)).toBe(2000);
    expect(ledger.getBalance(ledger.getAccountByHandle('hr-data-agent').id)).toBe(3000);

    const markets = new MarketService(db, ledger);
    expect(markets.listMarkets().map((market) => market.title).sort()).toEqual([
      '今天下午茶会不会成团？',
      '本周需求会不会改第三版？',
      '王哥将在6月休息几天？'
    ]);
    expect(markets.getMarket(result.mainMarket.id).outcomes.map((outcome) => outcome.label)).toEqual([
      '0-1天',
      '2-3天',
      '4-5天',
      '6天以上'
    ]);

    const agents = new AgentService(db, ledger, markets);
    const hrAgent = agents.getAgent(ledger.getAccountByHandle('hr-data-agent').id);
    expect(hrAgent).toMatchObject({
      role: 'HR Data',
      strategy: 'data_value',
      focusCategories: ['attendance', 'product', 'office'],
      riskAppetite: 0.5,
      maxTradePoints: 120,
      maxPositionShares: 50,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8
    });
    expect(Date.parse(hrAgent.nextWakeAt)).toBeLessThan(Date.now());
    expect(agents.buildContextPacket(hrAgent.accountId).memory.summary).toBe('王哥上月休息2天，月底可能调休。');

    const skipped = seedDemoData(db);
    expect(skipped).toEqual({ skipped: true });
    expect(ledger.listAccounts()).toHaveLength(10);
  });

  test('rolls back all demo rows when a later account insert fails', async () => {
    const { seedDemoData } = await import('../src/db/seed.js');
    const db = createTestDb();

    db.exec(`
      CREATE TEMP TRIGGER fail_xiao_li_seed
      BEFORE INSERT ON accounts
      WHEN NEW.handle = 'xiao-li'
      BEGIN
        SELECT RAISE(ABORT, 'forced xiao-li seed failure');
      END;
    `);

    expect(() => seedDemoData(db)).toThrow(/forced xiao-li seed failure/);

    expect(db.prepare('SELECT COUNT(*) AS count FROM accounts').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM markets').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM agent_profiles').get()).toEqual({ count: 0 });
  });
});
