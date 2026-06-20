import type { Db } from '../../db/connection.js';
import { inTransaction } from '../../db/connection.js';
import type { AgentEventQueueService } from '../../services/agentEventQueue.js';
import { newId } from '../../services/ids.js';
import type { MarketBindingService } from '../../services/marketBindings.js';
import type { WorldEventService } from '../../services/worldEvents.js';

export interface FeishuAttendanceSubject {
  subjectId: string;
  subjectLabel: string;
  period: string;
}

export interface FeishuMonthlyAttendanceSummary {
  sourceRef: string;
  restDaysSoFar: number;
  workDaysSoFar: number;
  effectiveAt: string;
  observedAt: string;
}

export interface FeishuAttendanceClient {
  getMonthlySummary(subject: FeishuAttendanceSubject): Promise<FeishuMonthlyAttendanceSummary>;
}

export interface FeishuAttendanceSyncResult {
  status: 'success' | 'failed';
  scannedSubjects: number;
  createdEvents: number;
  queuedItems: number;
  errorMessage?: string;
}

interface ActiveAttendanceSubjectRow {
  subject_id: string;
  subject_label: string;
  period: string;
}

interface FetchedMonthlySummary {
  subject: FeishuAttendanceSubject;
  summary: FeishuMonthlyAttendanceSummary;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class FeishuAttendanceAdapter {
  constructor(
    private readonly db: Db,
    private readonly worldEvents: WorldEventService,
    private readonly bindings: MarketBindingService,
    private readonly queue: AgentEventQueueService,
    private readonly client: FeishuAttendanceClient
  ) {}

  async syncMonthlySummaries(now = nowIso()): Promise<FeishuAttendanceSyncResult> {
    const startedAt = now;
    let scannedSubjects = 0;
    let createdEvents = 0;
    let queuedItems = 0;

    try {
      const subjects = this.getActiveAttendanceSubjects();
      scannedSubjects = subjects.length;
      const fetchedSummaries: FetchedMonthlySummary[] = [];

      for (const subject of subjects) {
        const summary = await this.client.getMonthlySummary(subject);
        fetchedSummaries.push({ subject, summary });
      }

      inTransaction(this.db, () => {
        for (const { subject, summary } of fetchedSummaries) {
          const event = this.worldEvents.createEvent({
            type: 'attendance.monthly_summary_updated',
            source: 'feishu_attendance',
            sourceRef: summary.sourceRef,
            subjectType: 'person',
            subjectId: subject.subjectId,
            subjectLabel: subject.subjectLabel,
            period: subject.period,
            effectiveAt: summary.effectiveAt,
            observedAt: summary.observedAt,
            confidence: 'high',
            summary: `${subject.subjectLabel} ${subject.period} 已休息 ${summary.restDaysSoFar} 天。`,
            payload: {
              restDaysSoFar: summary.restDaysSoFar,
              workDaysSoFar: summary.workDaysSoFar,
              month: subject.period
            },
            dedupeKey: `feishu:attendance:${subject.subjectId}:${subject.period}:restDaysSoFar:${summary.restDaysSoFar}:workDaysSoFar:${summary.workDaysSoFar}`
          });
          const allEvents = this.worldEvents.listEvents({
            subjectId: subject.subjectId,
            period: subject.period,
            limit: 1
          });

          if (allEvents[0]?.id === event.id && event.createdAt >= startedAt) {
            createdEvents += 1;
            queuedItems += this.queue.enqueueForEvent(event).length;
          }
        }
        this.recordSync(startedAt, { status: 'success', scannedSubjects, createdEvents, queuedItems });
      });

      const result = { status: 'success' as const, scannedSubjects, createdEvents, queuedItems };
      return result;
    } catch (error) {
      const result = {
        status: 'failed' as const,
        scannedSubjects,
        createdEvents: 0,
        queuedItems: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown Feishu sync error'
      };
      this.recordSync(startedAt, result);
      return result;
    }
  }

  private getActiveAttendanceSubjects(): FeishuAttendanceSubject[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT subject_id, subject_label, period
         FROM market_event_bindings
         WHERE status = 'active'
           AND event_type = 'attendance.monthly_summary_updated'
           AND subject_type = 'person'
           AND period IS NOT NULL
         ORDER BY subject_id ASC, period ASC`
      )
      .all() as ActiveAttendanceSubjectRow[];

    return rows.map((row) => ({
      subjectId: row.subject_id,
      subjectLabel: row.subject_label,
      period: row.period
    }));
  }

  private recordSync(startedAt: string, result: FeishuAttendanceSyncResult): void {
    inTransaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO integration_sync_runs (
            id, provider, started_at, finished_at, status, scanned_subjects,
            created_events, queued_items, error_message
          ) VALUES (?, 'feishu_attendance', ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          newId('sync'),
          startedAt,
          nowIso(),
          result.status,
          result.scannedSubjects,
          result.createdEvents,
          result.queuedItems,
          result.errorMessage ?? null
        );
    });
  }
}
