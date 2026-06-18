import { describe, expect, test } from 'vitest';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

describe('WorldEventService', () => {
  test('creates an append-only manual world event', () => {
    const db = createTestDb();
    const events = new WorldEventService(db);

    const event = events.createEvent({
      type: 'attendance.monthly_summary_updated',
      source: 'manual_admin',
      sourceRef: 'admin-note-1',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'high',
      summary: '王哥 2026-06 已休息 6 天。',
      payload: { restDaysSoFar: 6, workDaysSoFar: 8 },
      dedupeKey: 'manual:attendance:wang-ge:2026-06:restDaysSoFar:6'
    });

    expect(event).toMatchObject({
      type: 'attendance.monthly_summary_updated',
      source: 'manual_admin',
      sourceRef: 'admin-note-1',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      confidence: 'high',
      summary: '王哥 2026-06 已休息 6 天。',
      payload: { restDaysSoFar: 6, workDaysSoFar: 8 },
      dedupeKey: 'manual:attendance:wang-ge:2026-06:restDaysSoFar:6'
    });
    expect(event.id).toMatch(/^wev_/);
    expect(events.listEvents()).toEqual([event]);

    db.close();
  });

  test('deduplicates identical source metric snapshots', () => {
    const db = createTestDb();
    const events = new WorldEventService(db);
    const input = {
      type: 'attendance.monthly_summary_updated',
      source: 'feishu_attendance',
      sourceRef: 'feishu-user-stat-1',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'high' as const,
      summary: '王哥 2026-06 已休息 6 天。',
      payload: { restDaysSoFar: 6 },
      dedupeKey: 'feishu:attendance:wang-ge:2026-06:restDaysSoFar:6'
    };

    const first = events.createEvent(input);
    const second = events.createEvent(input);

    expect(second).toEqual(first);
    expect(events.listEvents()).toHaveLength(1);

    db.close();
  });

  test('filters events by subject and type', () => {
    const db = createTestDb();
    const events = new WorldEventService(db);
    events.createEvent({
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
      dedupeKey: 'manual:wang-ge'
    });
    events.createEvent({
      type: 'attendance.monthly_summary_updated',
      source: 'manual_admin',
      subjectType: 'person',
      subjectId: 'xiao-li',
      subjectLabel: '小李',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'medium',
      summary: '小李 2026-06 已休息 1 天。',
      payload: { restDaysSoFar: 1 },
      dedupeKey: 'manual:xiao-li'
    });

    expect(events.listEvents({ type: 'attendance.monthly_summary_updated', subjectId: 'wang-ge' })).toHaveLength(1);
    expect(events.listEvents({ subjectId: 'xiao-li' })[0].subjectLabel).toBe('小李');

    db.close();
  });
});
