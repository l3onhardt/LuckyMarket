import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import { AppError } from '../domain/errors.js';
import type { WorldEvent, WorldEventConfidence } from '../domain/types.js';
import { newId } from './ids.js';

export interface CreateWorldEventInput {
  type: string;
  source: string;
  sourceRef?: string | null;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  period?: string | null;
  effectiveAt: string;
  observedAt: string;
  confidence: WorldEventConfidence;
  summary: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

export interface ListWorldEventsFilter {
  type?: string;
  source?: string;
  subjectId?: string;
  period?: string;
  limit?: number;
}

interface WorldEventRow {
  id: string;
  type: string;
  source: string;
  source_ref: string | null;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  period: string | null;
  effective_at: string;
  observed_at: string;
  confidence: WorldEventConfidence;
  summary: string;
  payload_json: string;
  dedupe_key: string;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function tableExists(db: Db, tableName: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { 1: number } | undefined;
  return Boolean(row);
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new AppError('VALIDATION_ERROR', `${field} is required`);
  }
}

function assertIso(value: string, field: string): void {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || new Date(value).toISOString() !== value) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a valid ISO timestamp`);
  }
}

function assertPlainObject(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a plain object`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a plain object`);
  }
}

function mapWorldEvent(row: WorldEventRow): WorldEvent {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    sourceRef: row.source_ref,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel: row.subject_label,
    period: row.period,
    effectiveAt: row.effective_at,
    observedAt: row.observed_at,
    confidence: row.confidence,
    summary: row.summary,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    dedupeKey: row.dedupe_key,
    createdAt: row.created_at
  };
}

export class WorldEventService {
  constructor(private readonly db: Db) {}

  createEvent(input: CreateWorldEventInput): WorldEvent {
    this.validateInput(input);
    return inTransaction(this.db, () => {
      const existing = this.getByDedupeKey(input.dedupeKey);
      if (existing) {
        return existing;
      }

      const id = newId('wev');
      const createdAt = nowIso();
      this.db
        .prepare(
          `INSERT INTO world_events (
            id, type, source, source_ref, subject_type, subject_id, subject_label,
            period, effective_at, observed_at, confidence, summary, payload_json,
            dedupe_key, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.type,
          input.source,
          input.sourceRef ?? null,
          input.subjectType,
          input.subjectId,
          input.subjectLabel,
          input.period ?? null,
          input.effectiveAt,
          input.observedAt,
          input.confidence,
          input.summary,
          JSON.stringify(input.payload),
          input.dedupeKey,
          createdAt
        );

      return this.getEvent(id);
    });
  }

  getEvent(id: string): WorldEvent {
    const row = this.db.prepare('SELECT * FROM world_events WHERE id = ?').get(id) as WorldEventRow | undefined;
    if (!row) {
      throw new AppError('NOT_FOUND', `World event not found: ${id}`, 404);
    }
    return mapWorldEvent(row);
  }

  listEvents(filter: ListWorldEventsFilter = {}): WorldEvent[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filter.type) {
      clauses.push('type = ?');
      values.push(filter.type);
    }
    if (filter.source) {
      clauses.push('source = ?');
      values.push(filter.source);
    }
    if (filter.subjectId) {
      clauses.push('subject_id = ?');
      values.push(filter.subjectId);
    }
    if (filter.period) {
      clauses.push('period = ?');
      values.push(filter.period);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limitClause =
      filter.limit === undefined ? '' : ' LIMIT ?';
    if (filter.limit !== undefined) {
      const limit = Math.max(1, Math.min(Math.floor(filter.limit), 500));
      values.push(limit);
    }
    const rows = this.db
      .prepare(`SELECT * FROM world_events ${where} ORDER BY observed_at DESC, id DESC${limitClause}`)
      .all(...values) as WorldEventRow[];
    return rows.map(mapWorldEvent);
  }

  listEventsForMarket(marketId: string): WorldEvent[] {
    if (!tableExists(this.db, 'market_event_bindings')) {
      return [];
    }
    const rows = this.db
      .prepare(
        `SELECT DISTINCT world_events.*
         FROM world_events
         INNER JOIN market_event_bindings ON
           market_event_bindings.event_type = world_events.type
           AND market_event_bindings.subject_type = world_events.subject_type
           AND market_event_bindings.subject_id = world_events.subject_id
           AND (market_event_bindings.period IS NULL OR market_event_bindings.period = world_events.period)
         WHERE market_event_bindings.market_id = ?
           AND market_event_bindings.status = 'active'
         ORDER BY world_events.observed_at DESC, world_events.id DESC`
      )
      .all(marketId) as WorldEventRow[];
    return rows.map(mapWorldEvent);
  }

  private getByDedupeKey(dedupeKey: string): WorldEvent | null {
    const row = this.db
      .prepare('SELECT * FROM world_events WHERE dedupe_key = ?')
      .get(dedupeKey) as WorldEventRow | undefined;
    return row ? mapWorldEvent(row) : null;
  }

  private validateInput(input: CreateWorldEventInput): void {
    assertNonEmpty(input.type, 'type');
    assertNonEmpty(input.source, 'source');
    assertNonEmpty(input.subjectType, 'subjectType');
    assertNonEmpty(input.subjectId, 'subjectId');
    assertNonEmpty(input.subjectLabel, 'subjectLabel');
    assertNonEmpty(input.summary, 'summary');
    assertNonEmpty(input.dedupeKey, 'dedupeKey');
    assertIso(input.effectiveAt, 'effectiveAt');
    assertIso(input.observedAt, 'observedAt');
    assertPlainObject(input.payload, 'payload');
  }
}
