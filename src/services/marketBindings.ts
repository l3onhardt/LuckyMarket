import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import { AppError } from '../domain/errors.js';
import type {
  MarketEventBinding,
  MarketEventBindingStatus,
  WorldEvent,
  WorldEventConfidence
} from '../domain/types.js';
import { newId } from './ids.js';
import type { MarketService } from './markets.js';

export interface CreateMarketBindingInput {
  marketId: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  period?: string | null;
  metricKeys: string[];
  status: MarketEventBindingStatus;
  suggestedBy: string;
  confirmedBy?: string | null;
}

export interface MarketBindingSuggestion {
  eventType: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  period: string | null;
  metricKeys: string[];
  confidence: WorldEventConfidence;
  explanation: string;
}

interface MarketEventBindingRow {
  id: string;
  market_id: string;
  event_type: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  period: string | null;
  metric_keys_json: string;
  status: MarketEventBindingStatus;
  suggested_by: string;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapBinding(row: MarketEventBindingRow): MarketEventBinding {
  return {
    id: row.id,
    marketId: row.market_id,
    eventType: row.event_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel: row.subject_label,
    period: row.period,
    metricKeys: JSON.parse(row.metric_keys_json) as string[],
    status: row.status,
    suggestedBy: row.suggested_by,
    confirmedBy: row.confirmed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new AppError('VALIDATION_ERROR', `${field} is required`);
  }
}

function assertMetricKeys(metricKeys: string[]): void {
  if (!Array.isArray(metricKeys) || metricKeys.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'metricKeys must contain at least one value');
  }
  if (metricKeys.some((metricKey) => !metricKey.trim())) {
    throw new AppError('VALIDATION_ERROR', 'metricKeys cannot contain empty values');
  }
}

function assertStatus(status: string): asserts status is MarketEventBindingStatus {
  if (status !== 'suggested' && status !== 'active' && status !== 'disabled') {
    throw new AppError('VALIDATION_ERROR', 'status must be suggested, active, or disabled');
  }
}

function monthFromCloseTime(closeTime: string): string | null {
  const parsed = new Date(closeTime);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 7);
}

function inferAttendanceSubject(title: string): { subjectId: string; subjectLabel: string } | null {
  if (title.includes('王哥') || /wang\s*ge/i.test(title)) {
    return { subjectId: 'wang-ge', subjectLabel: '王哥' };
  }
  return null;
}

export class MarketBindingService {
  constructor(
    private readonly db: Db,
    private readonly markets: MarketService
  ) {}

  createBinding(input: CreateMarketBindingInput): MarketEventBinding {
    this.validateInput(input);
    this.markets.getMarket(input.marketId);

    return inTransaction(this.db, () => {
      const id = newId('meb');
      const createdAt = nowIso();
      const updatedAt = createdAt;

      this.db
        .prepare(
          `INSERT INTO market_event_bindings (
            id, market_id, event_type, subject_type, subject_id, subject_label,
            period, metric_keys_json, status, suggested_by, confirmed_by,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.marketId,
          input.eventType,
          input.subjectType,
          input.subjectId,
          input.subjectLabel,
          input.period ?? null,
          JSON.stringify(input.metricKeys),
          input.status,
          input.suggestedBy,
          input.confirmedBy ?? null,
          createdAt,
          updatedAt
        );

      return this.getBinding(id);
    });
  }

  listBindingsForMarket(marketId: string): MarketEventBinding[] {
    this.markets.getMarket(marketId);
    const rows = this.db
      .prepare(
        `SELECT * FROM market_event_bindings
         WHERE market_id = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(marketId) as MarketEventBindingRow[];

    return rows.map(mapBinding);
  }

  findMatchingBindings(event: WorldEvent): MarketEventBinding[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM market_event_bindings
         WHERE event_type = ?
           AND subject_type = ?
           AND subject_id = ?
           AND status = 'active'
           AND (period IS NULL OR period = ?)
         ORDER BY created_at ASC, id ASC`
      )
      .all(event.type, event.subjectType, event.subjectId, event.period) as MarketEventBindingRow[];

    return rows.map(mapBinding);
  }

  suggestBindings(marketId: string): MarketBindingSuggestion[] {
    const market = this.markets.getMarket(marketId);
    const period = monthFromCloseTime(market.closeTime);
    const subject = inferAttendanceSubject(market.title);
    const lowerTitle = market.title.toLowerCase();
    const lowerSource = market.settlementSource.toLowerCase();
    const isAttendanceMarket =
      market.category === 'attendance' ||
      market.title.includes('休息') ||
      market.title.includes('考勤') ||
      lowerTitle.includes('attendance') ||
      market.settlementSource.includes('考勤') ||
      lowerSource.includes('attendance');

    if (!isAttendanceMarket || !subject) {
      return [];
    }

    return [
      {
        eventType: 'attendance.monthly_summary_updated',
        subjectType: 'person',
        subjectId: subject.subjectId,
        subjectLabel: subject.subjectLabel,
        period,
        metricKeys: ['restDaysSoFar'],
        confidence: 'medium',
        explanation: `${subject.subjectLabel} 的月度考勤汇总事件可为该市场提供休息天数证据，仍需管理员确认绑定。`
      }
    ];
  }

  private getBinding(id: string): MarketEventBinding {
    const row = this.db
      .prepare('SELECT * FROM market_event_bindings WHERE id = ?')
      .get(id) as MarketEventBindingRow | undefined;
    if (!row) {
      throw new AppError('NOT_FOUND', `Market event binding not found: ${id}`, 404);
    }
    return mapBinding(row);
  }

  private validateInput(input: CreateMarketBindingInput): void {
    assertNonEmpty(input.marketId, 'marketId');
    assertNonEmpty(input.eventType, 'eventType');
    assertNonEmpty(input.subjectType, 'subjectType');
    assertNonEmpty(input.subjectId, 'subjectId');
    assertNonEmpty(input.subjectLabel, 'subjectLabel');
    assertNonEmpty(input.suggestedBy, 'suggestedBy');
    assertMetricKeys(input.metricKeys);
    assertStatus(input.status);
  }
}
