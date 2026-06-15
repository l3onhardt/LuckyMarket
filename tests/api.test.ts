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
      expect(healthResponse.json()).toEqual({ ok: true, service: 'luckymarket-backend' });

      const marketsResponse = await server.inject({ method: 'GET', url: '/markets' });
      expect(marketsResponse.statusCode).toBe(200);
      expect(marketsResponse.json<{ markets: unknown[] }>().markets.length).toBeGreaterThanOrEqual(3);
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
});
