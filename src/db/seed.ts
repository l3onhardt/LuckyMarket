import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import type { Account, Market } from '../domain/types.js';
import { AgentService, type AgentStrategy } from '../services/agents.js';
import { LedgerService } from '../services/ledger.js';
import { MarketService } from '../services/markets.js';
import type { Db } from './connection.js';
import { inTransaction, openDatabase } from './connection.js';

interface SeedCreatedResult {
  skipped: false;
  humans: Account[];
  agentAccounts: Account[];
  mainMarket: Market;
}

interface SeedSkippedResult {
  skipped: true;
}

export type SeedDemoDataResult = SeedCreatedResult | SeedSkippedResult;

interface AgentSeed {
  handle: string;
  displayName: string;
  role: string;
  strategy: AgentStrategy;
  memorySummary: string;
}

const focusCategories = ['attendance', 'product', 'office'];

const agentSeeds: AgentSeed[] = [
  {
    handle: 'hr-data-agent',
    displayName: 'HR Data Agent',
    role: 'HR Data',
    strategy: 'data_value',
    memorySummary: '王哥上月休息2天，月底可能调休。'
  },
  {
    handle: 'boss-view-agent',
    displayName: 'Boss View Agent',
    role: 'Boss View',
    strategy: 'data_value',
    memorySummary: '项目节点紧时连续休息概率偏低。'
  },
  {
    handle: 'engineer-reality-agent',
    displayName: 'Engineer Reality Agent',
    role: 'Engineer Reality',
    strategy: 'contrarian',
    memorySummary: '研发排期常有临时变化。'
  },
  {
    handle: 'trend-agent',
    displayName: 'Trend Agent',
    role: 'Trend Trader',
    strategy: 'trend',
    memorySummary: '追随价格趋势但会控制仓位。'
  },
  {
    handle: 'contrarian-agent',
    displayName: 'Contrarian Agent',
    role: 'Contrarian',
    strategy: 'contrarian',
    memorySummary: '专门寻找热门结果的反向机会。'
  },
  {
    handle: 'market-maker-agent',
    displayName: 'Market Maker Agent',
    role: 'Market Maker',
    strategy: 'market_maker',
    memorySummary: '负责提供轻量流动性。'
  }
];

function daysFromNowIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function seedDemoData(db: Db): SeedDemoDataResult {
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);

  if (ledger.listAccounts().length > 0) {
    return { skipped: true };
  }

  return inTransaction(db, () => {
    const humans = [
      ledger.createAccount({ kind: 'human', handle: 'admin', displayName: 'Admin', initialPoints: 5000 }),
      ledger.createAccount({ kind: 'human', handle: 'wang-ge', displayName: '王哥', initialPoints: 2000 }),
      ledger.createAccount({ kind: 'human', handle: 'xiao-li', displayName: '小李', initialPoints: 2000 }),
      ledger.createAccount({ kind: 'human', handle: 'xiao-zhao', displayName: '小赵', initialPoints: 2000 })
    ];

    const nextWakeAt = new Date(Date.now() - 60_000).toISOString();
    const agentAccounts = agentSeeds.map((seed) => {
      const account = ledger.createAccount({
        kind: 'agent',
        handle: seed.handle,
        displayName: seed.displayName,
        initialPoints: 3000
      });

      agents.createAgentProfile({
        accountId: account.id,
        role: seed.role,
        strategy: seed.strategy,
        focusCategories,
        riskAppetite: 0.5,
        maxTradePoints: 120,
        maxPositionShares: 50,
        wakeIntervalMinutes: 45,
        dailyActionBudget: 8,
        nextWakeAt,
        memorySummary: seed.memorySummary
      });

      return account;
    });

    const mainMarket = markets.createMarket({
      title: '王哥将在6月休息几天？',
      category: 'attendance',
      closeTime: daysFromNowIso(14),
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });

    markets.createMarket({
      title: '本周需求会不会改第三版？',
      category: 'product',
      closeTime: daysFromNowIso(14),
      settlementSource: '需求文档版本记录',
      outcomes: ['Yes', 'No']
    });

    markets.createMarket({
      title: '今天下午茶会不会成团？',
      category: 'office',
      closeTime: daysFromNowIso(14),
      settlementSource: '群接龙记录',
      outcomes: ['Yes', 'No']
    });

    return { skipped: false, humans, agentAccounts, mainMarket };
  });
}

async function runCli(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.databaseUrl);
  try {
    const result = seedDemoData(db);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
