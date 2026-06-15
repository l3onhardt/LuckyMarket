import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { seedDemoData } from '../db/seed.js';
import type { Db } from '../db/connection.js';
import { AgentService } from '../services/agents.js';
import { LedgerService } from '../services/ledger.js';
import { MarketService } from '../services/markets.js';
import { SchedulerService } from '../services/scheduler.js';

export interface RegisterRoutesOptions {
  db: Db;
  schedulerEnabled: boolean;
  maxAgentsPerTick: number;
}

const accountBodySchema = z.object({
  kind: z.enum(['human', 'agent']),
  handle: z.string().min(1),
  displayName: z.string().min(1),
  initialPoints: z.number().int().nonnegative().optional()
});

const marketBodySchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  closeTime: z.string().min(1),
  settlementSource: z.string().min(1),
  outcomes: z.array(z.string().min(1)).min(2),
  liquidityParameter: z.number().positive().optional()
});

const tradeSideSchema = z.enum(['buy', 'sell']);

const quoteBodySchema = z.object({
  outcomeId: z.string().min(1),
  side: tradeSideSchema,
  shares: z.number().positive()
});

const tradeBodySchema = quoteBodySchema.extend({
  accountId: z.string().min(1)
});

const settleBodySchema = z.object({
  winningOutcomeId: z.string().min(1)
});

const schedulerTickBodySchema = z
  .object({
    nowIso: z.string().datetime().optional()
  })
  .optional();

function makeServices(options: RegisterRoutesOptions) {
  const ledger = new LedgerService(options.db);
  const markets = new MarketService(options.db, ledger);
  const agents = new AgentService(options.db, ledger, markets);
  const scheduler = new SchedulerService(agents, { maxAgentsPerTick: options.maxAgentsPerTick });

  return { ledger, markets, agents, scheduler };
}

export async function registerRoutes(server: FastifyInstance, options: RegisterRoutesOptions): Promise<void> {
  const { ledger, markets, agents, scheduler } = makeServices(options);

  server.get('/health', async () => ({ ok: true, service: 'luckymarket-backend' }));

  server.get('/accounts', async () => ({ accounts: ledger.listAccounts() }));

  server.post('/accounts', async (request) => {
    const body = accountBodySchema.parse(request.body);
    return { account: ledger.createAccount(body) };
  });

  server.get<{ Params: { handle: string } }>('/accounts/handle/:handle', async (request) => ({
    account: ledger.getAccountByHandle(request.params.handle)
  }));

  server.get<{ Params: { id: string } }>('/accounts/:id', async (request) => ({
    account: ledger.getAccount(request.params.id)
  }));

  server.get<{ Params: { id: string } }>('/accounts/:id/ledger', async (request) => ({
    ledger: ledger.getLedger(request.params.id)
  }));

  server.get<{ Params: { id: string } }>('/accounts/:id/positions', async (request) => ({
    positions: markets.getPositions(request.params.id)
  }));

  server.get('/markets', async () => ({ markets: markets.listMarkets() }));

  server.post('/markets', async (request) => {
    const body = marketBodySchema.parse(request.body);
    return { market: markets.createMarket(body) };
  });

  server.get<{ Params: { id: string } }>('/markets/:id', async (request) => ({
    market: markets.getMarket(request.params.id)
  }));

  server.post<{ Params: { id: string } }>('/markets/:id/quote', async (request) => {
    const body = quoteBodySchema.parse(request.body);
    return { quote: markets.quoteTrade({ marketId: request.params.id, ...body }) };
  });

  server.post<{ Params: { id: string } }>('/markets/:id/trades', async (request) => {
    const body = tradeBodySchema.parse(request.body);
    return { trade: markets.placeTrade({ marketId: request.params.id, ...body }) };
  });

  server.post<{ Params: { id: string } }>('/markets/:id/close', async (request) => ({
    market: markets.closeMarket(request.params.id)
  }));

  server.post<{ Params: { id: string } }>('/markets/:id/settle', async (request) => {
    const body = settleBodySchema.parse(request.body);
    return { market: markets.settleMarket(request.params.id, body.winningOutcomeId) };
  });

  server.get<{ Params: { id: string } }>('/markets/:id/activity', async (request) => ({
    activity: markets.getActivity(request.params.id)
  }));

  server.get('/agents', async () => ({ agents: agents.listAgents() }));

  server.get<{ Params: { id: string } }>('/agents/:id', async (request) => ({
    agent: agents.getAgent(request.params.id)
  }));

  server.post<{ Params: { id: string } }>('/agents/:id/wake', async (request) => ({
    result: agents.wakeAgent(request.params.id)
  }));

  server.post('/scheduler/tick', async (request) => {
    const body = schedulerTickBodySchema.parse(request.body);
    return { result: scheduler.tick(body?.nowIso) };
  });

  server.post('/seed/demo', async () => ({ result: seedDemoData(options.db) }));
}
