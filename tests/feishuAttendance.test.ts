import { describe, expect, test } from 'vitest';
import { FeishuAttendanceAdapter, type FeishuAttendanceClient } from '../src/integrations/feishu/attendance.js';
import { AgentEventQueueService } from '../src/services/agentEventQueue.js';
import { AgentService } from '../src/services/agents.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketBindingService } from '../src/services/marketBindings.js';
import { MarketService } from '../src/services/markets.js';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

function setup(client: FeishuAttendanceClient) {
  const db = createTestDb();
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);
  const worldEvents = new WorldEventService(db);
  const bindings = new MarketBindingService(db, markets);
  const queue = new AgentEventQueueService(db, agents, bindings);
  const market = markets.createMarket({
    title: '王哥将在6月休息几天？',
    category: 'attendance',
    closeTime: '2026-06-30T10:00:00.000Z',
    settlementSource: '公司考勤记录',
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上']
  });
  bindings.createBinding({
    marketId: market.id,
    eventType: 'attendance.monthly_summary_updated',
    subjectType: 'person',
    subjectId: 'wang-ge',
    subjectLabel: '王哥',
    period: '2026-06',
    metricKeys: ['restDaysSoFar'],
    status: 'active',
    suggestedBy: 'rule',
    confirmedBy: 'admin'
  });
  const adapter = new FeishuAttendanceAdapter(db, worldEvents, bindings, queue, client);
  return { db, adapter, worldEvents };
}

function createActiveAttendanceBinding(db: ReturnType<typeof createTestDb>, subjectId: string, subjectLabel: string) {
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const bindings = new MarketBindingService(db, markets);
  const market = markets.createMarket({
    title: `${subjectLabel}将在6月休息几天？`,
    category: 'attendance',
    closeTime: '2026-06-30T10:00:00.000Z',
    settlementSource: '公司考勤记录',
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上']
  });

  bindings.createBinding({
    marketId: market.id,
    eventType: 'attendance.monthly_summary_updated',
    subjectType: 'person',
    subjectId,
    subjectLabel,
    period: '2026-06',
    metricKeys: ['restDaysSoFar'],
    status: 'active',
    suggestedBy: 'rule',
    confirmedBy: 'admin'
  });
}

describe('FeishuAttendanceAdapter', () => {
  test('syncs only subjects from active bindings into world events', async () => {
    const client: FeishuAttendanceClient = {
      async getMonthlySummary(subject) {
        expect(subject.subjectId).toBe('wang-ge');
        return {
          sourceRef: 'feishu-stat-wang-ge-2026-06',
          restDaysSoFar: 6,
          workDaysSoFar: 8,
          effectiveAt: '2026-06-18T12:00:00.000Z',
          observedAt: '2026-06-18T12:05:00.000Z'
        };
      }
    };
    const { db, adapter, worldEvents } = setup(client);

    const result = await adapter.syncMonthlySummaries('2026-06-18T12:10:00.000Z');

    expect(result).toMatchObject({ status: 'success', scannedSubjects: 1, createdEvents: 1, queuedItems: 0 });
    expect(worldEvents.listEvents()[0]).toMatchObject({
      source: 'feishu_attendance',
      subjectId: 'wang-ge',
      period: '2026-06',
      payload: { restDaysSoFar: 6, workDaysSoFar: 8 }
    });
    expect(db.prepare("SELECT * FROM integration_sync_runs WHERE provider = 'feishu_attendance'").all()).toHaveLength(1);
    expect(
      db.prepare("SELECT started_at FROM integration_sync_runs WHERE provider = 'feishu_attendance'").get()
    ).toEqual({ started_at: '2026-06-18T12:10:00.000Z' });

    db.close();
  });

  test('records failed sync without creating partial events', async () => {
    let calls = 0;
    const client: FeishuAttendanceClient = {
      async getMonthlySummary(subject) {
        calls += 1;
        if (subject.subjectId === 'wang-ge') {
          return {
            sourceRef: 'feishu-stat-wang-ge-2026-06',
            restDaysSoFar: 6,
            workDaysSoFar: 8,
            effectiveAt: '2026-06-18T12:00:00.000Z',
            observedAt: '2026-06-18T12:05:00.000Z'
          };
        }
        throw new Error('Feishu unavailable');
      }
    };
    const { db, adapter, worldEvents } = setup(client);
    createActiveAttendanceBinding(db, 'xiao-li', '小李');

    const result = await adapter.syncMonthlySummaries('2026-06-18T12:10:00.000Z');

    expect(result.status).toBe('failed');
    expect(calls).toBe(2);
    expect(worldEvents.listEvents()).toEqual([]);
    expect(db.prepare("SELECT status FROM integration_sync_runs WHERE provider = 'feishu_attendance'").get()).toEqual({
      status: 'failed'
    });

    db.close();
  });

  test('rolls back world events if persistence fails after summaries are fetched', async () => {
    const client: FeishuAttendanceClient = {
      async getMonthlySummary(subject) {
        return {
          sourceRef: `feishu-stat-${subject.subjectId}-2026-06`,
          restDaysSoFar: subject.subjectId === 'wang-ge' ? 6 : 1,
          workDaysSoFar: 8,
          effectiveAt: '2026-06-18T12:00:00.000Z',
          observedAt: subject.subjectId === 'wang-ge' ? '2026-06-18T12:05:00.000Z' : 'not-an-iso-timestamp'
        };
      }
    };
    const { db, adapter, worldEvents } = setup(client);
    createActiveAttendanceBinding(db, 'xiao-li', '小李');

    const result = await adapter.syncMonthlySummaries('2026-06-18T12:10:00.000Z');

    expect(result).toMatchObject({ status: 'failed', scannedSubjects: 2, createdEvents: 0, queuedItems: 0 });
    expect(worldEvents.listEvents()).toEqual([]);
    expect(db.prepare("SELECT status FROM integration_sync_runs WHERE provider = 'feishu_attendance'").get()).toEqual({
      status: 'failed'
    });

    db.close();
  });
});
