import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { seedDemoData } from '../db/seed.js';
import type { Db } from '../db/connection.js';
import { AgentService } from '../services/agents.js';
import { AgentEventQueueService } from '../services/agentEventQueue.js';
import { LedgerService } from '../services/ledger.js';
import { MarketBindingService } from '../services/marketBindings.js';
import { MarketService } from '../services/markets.js';
import { SchedulerService } from '../services/scheduler.js';
import { WorldEventService } from '../services/worldEvents.js';

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

const confidenceSchema = z.enum(['low', 'medium', 'high']);

const worldEventBodySchema = z.object({
  type: z.string().min(1),
  source: z.string().min(1),
  sourceRef: z.string().min(1).optional().nullable(),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  subjectLabel: z.string().min(1),
  period: z.string().min(1).optional().nullable(),
  effectiveAt: z.string().datetime(),
  observedAt: z.string().datetime(),
  confidence: confidenceSchema,
  summary: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  dedupeKey: z.string().min(1)
});

const bindingBodySchema = z.object({
  eventType: z.string().min(1),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  subjectLabel: z.string().min(1),
  period: z.string().min(1).optional().nullable(),
  metricKeys: z.array(z.string().min(1)).min(1),
  status: z.enum(['suggested', 'active', 'disabled']),
  suggestedBy: z.string().min(1),
  confirmedBy: z.string().min(1).optional().nullable()
});

const schedulerTickBodySchema = z
  .object({
    nowIso: z.string().datetime().optional()
  })
  .optional();

const eventQueueTickBodySchema = z
  .object({
    limit: z.number().int().positive().max(20).optional()
  })
  .optional();

const worldEventsQuerySchema = z.object({
  type: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  period: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).optional()
});

function makeServices(options: RegisterRoutesOptions) {
  const ledger = new LedgerService(options.db);
  const markets = new MarketService(options.db, ledger);
  const agents = new AgentService(options.db, ledger, markets);
  const scheduler = new SchedulerService(agents, { maxAgentsPerTick: options.maxAgentsPerTick });
  const worldEvents = new WorldEventService(options.db);
  const bindings = new MarketBindingService(options.db, markets);
  const eventQueue = new AgentEventQueueService(options.db, agents, bindings);

  return { ledger, markets, agents, scheduler, worldEvents, bindings, eventQueue };
}

export async function registerRoutes(server: FastifyInstance, options: RegisterRoutesOptions): Promise<void> {
  const { ledger, markets, agents, scheduler, worldEvents, bindings, eventQueue } = makeServices(options);

  server.get('/health', async () => ({ ok: true, service: 'luckymarket' }));

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

  server.get<{ Params: { id: string } }>('/markets/:id/price-history', async (request) => ({
    history: markets.getPriceHistory(request.params.id)
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

  server.post('/world-events', async (request) => {
    const body = worldEventBodySchema.parse(request.body);
    const event = worldEvents.createEvent(body);
    const queuedItems = eventQueue.enqueueForEvent(event);
    return { event, queuedItems };
  });

  server.get('/world-events', async (request) => {
    const query = worldEventsQuerySchema.parse(request.query);
    return {
      events: worldEvents.listEvents({
        type: query.type,
        source: query.source,
        subjectId: query.subjectId,
        period: query.period,
        limit: query.limit
      })
    };
  });

  server.get<{ Params: { id: string } }>('/markets/:id/world-events', async (request) => {
    markets.getMarket(request.params.id);
    return { events: worldEvents.listEventsForMarket(request.params.id) };
  });

  server.post<{ Params: { id: string } }>('/markets/:id/bindings/suggest', async (request) => ({
    suggestions: bindings.suggestBindings(request.params.id)
  }));

  server.post<{ Params: { id: string } }>('/markets/:id/bindings', async (request) => {
    const body = bindingBodySchema.parse(request.body);
    return { binding: bindings.createBinding({ marketId: request.params.id, ...body }) };
  });

  server.get<{ Params: { id: string } }>('/markets/:id/bindings', async (request) => ({
    bindings: bindings.listBindingsForMarket(request.params.id)
  }));

  server.get('/agent-event-queue', async () => ({
    items: eventQueue.listQueued()
  }));

  server.post('/scheduler/event-queue/tick', async (request) => {
    const body = eventQueueTickBodySchema.parse(request.body);
    return { result: eventQueue.tick(body?.limit) };
  });

  server.post('/seed/demo', async () => ({ result: seedDemoData(options.db) }));
}
