import { describe, expect, test } from 'vitest';
import { buildServer } from '../src/http/server.js';
import { createTestDb, seedDemoDataForTest } from './helpers.js';

describe('HTTP API', () => {
  test('returns health and seeded market list', async () => {
    const db = createTestDb();
    await seedDemoDataForTest(db);
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    try {
      const healthResponse = await server.inject({ method: 'GET', url: '/health' });
      expect(healthResponse.statusCode).toBe(200);
      expect(healthResponse.json()).toEqual({ ok: true, service: 'luckymarket' });

      const marketsResponse = await server.inject({ method: 'GET', url: '/markets' });
      expect(marketsResponse.statusCode).toBe(200);
      expect(marketsResponse.json<{ markets: unknown[] }>().markets.length).toBeGreaterThanOrEqual(3);
    } finally {
      await server.close();
      db.close();
    }
  });

  test('seed demo endpoint makes the default admin account available', async () => {
    const db = createTestDb();
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    try {
      const seedResponse = await server.inject({ method: 'POST', url: '/seed/demo' });
      expect(seedResponse.statusCode).toBe(200);

      const adminResponse = await server.inject({ method: 'GET', url: '/accounts/handle/admin' });
      expect(adminResponse.statusCode).toBe(200);
      expect(adminResponse.json<{ account: { handle: string; kind: string } }>().account).toMatchObject({
        handle: 'admin',
        kind: 'human'
      });
    } finally {
      await server.close();
      db.close();
    }
  });

  test('quotes and places a trade through API', async () => {
    const db = createTestDb();
    await seedDemoDataForTest(db);
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    try {
      const marketsResponse = await server.inject({ method: 'GET', url: '/markets' });
      const market = marketsResponse.json<{ markets: Array<{ id: string; outcomes: Array<{ id: string }> }> }>()
        .markets[0];
      const outcomeId = market.outcomes[0].id;

      const accountResponse = await server.inject({ method: 'GET', url: '/accounts/handle/wang-ge' });
      const accountId = accountResponse.json<{ account: { id: string } }>().account.id;

      const quoteResponse = await server.inject({
        method: 'POST',
        url: `/markets/${market.id}/quote`,
        payload: { outcomeId, side: 'buy', shares: 2 }
      });
      expect(quoteResponse.statusCode).toBe(200);
      expect(quoteResponse.json<{ quote: { pointsAmount: number } }>().quote.pointsAmount).toBeGreaterThan(0);

      const tradeResponse = await server.inject({
        method: 'POST',
        url: `/markets/${market.id}/trades`,
        payload: { accountId, outcomeId, side: 'buy', shares: 2 }
      });
      expect(tradeResponse.statusCode).toBe(200);
      expect(tradeResponse.json<{ trade: { shares: number } }>().trade.shares).toBe(2);
    } finally {
      await server.close();
      db.close();
    }
  });

  test('rejects fractional account initialPoints without creating ledger state', async () => {
    const db = createTestDb();
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/accounts',
        payload: {
          kind: 'human',
          handle: 'fractional-api-human',
          displayName: 'Fractional API Human',
          initialPoints: 12.5
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
      expect(db.prepare('SELECT * FROM accounts').all()).toEqual([]);
      expect(db.prepare('SELECT * FROM ledger_entries').all()).toEqual([]);
    } finally {
      await server.close();
      db.close();
    }
  });

  test('scheduler tick endpoint wakes bounded agents', async () => {
    const db = createTestDb();
    await seedDemoDataForTest(db);
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    try {
      const response = await server.inject({ method: 'POST', url: '/scheduler/tick' });

      expect(response.statusCode).toBe(200);
      expect(response.json<{ result: { wokenAgents: unknown[] } }>().result.wokenAgents.length).toBeLessThanOrEqual(2);
    } finally {
      await server.close();
      db.close();
    }
  });

  test('scheduler tick rejects invalid nowIso without waking agents', async () => {
    const db = createTestDb();
    await seedDemoDataForTest(db);
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/scheduler/tick',
        payload: { nowIso: 'not-a-date' }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
      expect(db.prepare('SELECT * FROM agent_wake_runs').all()).toHaveLength(0);
    } finally {
      await server.close();
      db.close();
    }
  });

  test('returns price history after a trade', async () => {
    const db = createTestDb();
    await seedDemoDataForTest(db);
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });
    try {
      const market = (await server.inject({ method: 'GET', url: '/markets' }))
        .json<{ markets: Array<{ id: string; outcomes: Array<{ id: string }> }> }>().markets[0];
      const accountId = (await server.inject({ method: 'GET', url: '/accounts/handle/wang-ge' }))
        .json<{ account: { id: string } }>().account.id;
      await server.inject({
        method: 'POST',
        url: `/markets/${market.id}/trades`,
        payload: { accountId, outcomeId: market.outcomes[0].id, side: 'buy', shares: 2 }
      });

      const res = await server.inject({ method: 'GET', url: `/markets/${market.id}/price-history` });
      expect(res.statusCode).toBe(200);
      const history = res.json<{ history: Array<{ outcomeId: string; price: number; createdAt: string }> }>().history;
      expect(history.length).toBeGreaterThanOrEqual(market.outcomes.length);
    } finally {
      await server.close();
      db.close();
    }
  });

  test('creates world event, confirms binding, and processes event queue through API', async () => {
    const db = createTestDb();
    await seedDemoDataForTest(db);
    const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });
    try {
      const market = (await server.inject({ method: 'GET', url: '/markets' }))
        .json<{ markets: Array<{ id: string; title: string }> }>()
        .markets.find((item) => item.title.includes('王哥'))!;

      const suggestions = await server.inject({ method: 'POST', url: `/markets/${market.id}/bindings/suggest` });
      expect(suggestions.statusCode).toBe(200);
      const suggestion = suggestions
        .json<{ suggestions: Array<{ eventType: string; subjectId: string }> }>()
        .suggestions[0];
      expect(suggestion).toMatchObject({ eventType: 'attendance.monthly_summary_updated', subjectId: 'wang-ge' });

      const binding = await server.inject({
        method: 'POST',
        url: `/markets/${market.id}/bindings`,
        payload: {
          eventType: 'attendance.monthly_summary_updated',
          subjectType: 'person',
          subjectId: 'wang-ge',
          subjectLabel: '王哥',
          period: '2026-06',
          metricKeys: ['restDaysSoFar'],
          status: 'active',
          suggestedBy: 'rule',
          confirmedBy: 'admin'
        }
      });
      expect(binding.statusCode).toBe(200);

      const eventResponse = await server.inject({
        method: 'POST',
        url: '/world-events',
        payload: {
          type: 'attendance.monthly_summary_updated',
          source: 'manual_admin',
          subjectType: 'person',
          subjectId: 'wang-ge',
          subjectLabel: '王哥',
          period: '2026-06',
          effectiveAt: '2026-06-18T12:00:00.000Z',
          observedAt: '2026-06-18T12:05:00.000Z',
          confidence: 'high',
          summary: '王哥 2026-06 已休息 6 天。',
          payload: { restDaysSoFar: 6 },
          dedupeKey: 'manual-api:wang-ge:6'
        }
      });
      expect(eventResponse.statusCode).toBe(200);
      expect(eventResponse.json<{ queuedItems: unknown[] }>().queuedItems.length).toBeGreaterThan(0);

      const eventList = await server.inject({ method: 'GET', url: '/world-events?subjectId=wang-ge&period=2026-06' });
      expect(eventList.statusCode).toBe(200);
      expect(eventList.json<{ events: Array<{ subjectId: string; period: string }> }>().events).toEqual([
        expect.objectContaining({ subjectId: 'wang-ge', period: '2026-06' })
      ]);

      const queueList = await server.inject({ method: 'GET', url: '/agent-event-queue' });
      expect(queueList.statusCode).toBe(200);
      expect(queueList.json<{ items: unknown[] }>().items.length).toBeGreaterThan(0);

      const tick = await server.inject({ method: 'POST', url: '/scheduler/event-queue/tick', payload: { limit: 1 } });
      expect(tick.statusCode).toBe(200);
      expect(tick.json<{ result: { processedQueueItems: unknown[] } }>().result.processedQueueItems).toHaveLength(1);

      const marketEvents = await server.inject({ method: 'GET', url: `/markets/${market.id}/world-events` });
      expect(marketEvents.statusCode).toBe(200);
      expect(marketEvents.json<{ events: Array<{ summary: string }> }>().events[0].summary).toContain('已休息 6 天');
    } finally {
      await server.close();
      db.close();
    }
  });
});
