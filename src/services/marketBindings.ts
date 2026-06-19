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

interface ExistingBindingIdentityRow {
  id: string;
}

interface AttendanceSuggestionRule {
  matches: (market: { title: string; category: string; settlementSource: string }) => boolean;
  build: (market: { closeTime: string }) => MarketBindingSuggestion;
}

function nowIso(): string {
  return new Date().toISOString();
}

function decodeMetricKeys(metricKeysJson: string): string[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(metricKeysJson);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Stored market binding metric keys must be valid JSON');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Stored market binding metric keys must be a non-empty string array'
    );
  }

  if (parsed.some((metricKey) => typeof metricKey !== 'string' || !metricKey.trim())) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Stored market binding metric keys must be a non-empty string array without blank entries'
    );
  }

  return parsed;
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
    metricKeys: decodeMetricKeys(row.metric_keys_json),
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
  if (metricKeys.some((metricKey) => typeof metricKey !== 'string')) {
    throw new AppError('VALIDATION_ERROR', 'metricKeys must contain only string values');
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

const ATTENDANCE_SUGGESTION_RULES: readonly AttendanceSuggestionRule[] = [
  {
    matches: (market) =>
      market.category === 'attendance' &&
      /(?:王哥|wang\s*ge)/i.test(market.title) &&
      /(?:休息|考勤|attendance)/i.test(`${market.title} ${market.settlementSource}`),
    build: (market) => ({
      eventType: 'attendance.monthly_summary_updated',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: monthFromCloseTime(market.closeTime),
      metricKeys: ['restDaysSoFar'],
      confidence: 'medium',
      explanation:
        'Deterministic v1 rule: 王哥考勤市场可绑定到月度考勤汇总的休息天数证据，仍需管理员确认。'
    })
  }
];

export class MarketBindingService {
  constructor(
    private readonly db: Db,
    private readonly markets: MarketService
  ) {}

  createBinding(input: CreateMarketBindingInput): MarketEventBinding {
    this.validateInput(input);
    this.markets.getMarket(input.marketId);

    return inTransaction(this.db, () => {
      this.assertNoDuplicateBinding(input);

      const id = newId('meb');
      const createdAt = nowIso();
      const updatedAt = createdAt;

      try {
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
      } catch (error) {
        if (this.isLogicalIdentityUniqueConstraint(error)) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Market event binding already exists for this market, event, subject, and period'
          );
        }
        throw error;
      }

      return this.getBinding(id);
    });
  }

  listBindingsForMarket(marketId: string): MarketEventBinding[] {
    this.markets.getMarket(marketId);
    const rows = this.db
      .prepare(
        `SELECT * FROM market_event_bindings
         WHERE market_id = ?
         ORDER BY created_at DESC, id DESC`
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
    // v1 intentionally exposes a tiny deterministic rule table instead of
    // pretending to infer bindings generically.
    return ATTENDANCE_SUGGESTION_RULES.filter((rule) => rule.matches(market)).map((rule) =>
      rule.build(market)
    );
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

  private assertNoDuplicateBinding(input: CreateMarketBindingInput): void {
    if (input.status !== 'active') {
      return;
    }

    const existing = this.db
      .prepare(
        `SELECT id
         FROM market_event_bindings
         WHERE market_id = ?
           AND event_type = ?
           AND subject_type = ?
           AND subject_id = ?
           AND status = 'active'
           AND ((period IS NULL AND ? IS NULL) OR period = ?)
         LIMIT 1`
      )
      .get(
        input.marketId,
        input.eventType,
        input.subjectType,
        input.subjectId,
        input.period ?? null,
        input.period ?? null
      ) as ExistingBindingIdentityRow | undefined;

    if (existing) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Market event binding already exists for this market, event, subject, and period'
      );
    }
  }

  private isLogicalIdentityUniqueConstraint(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.includes('market_event_bindings_active_identity_idx')
    );
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
    if (input.status === 'active') {
      assertNonEmpty(input.confirmedBy ?? '', 'confirmedBy');
    }
  }
}
