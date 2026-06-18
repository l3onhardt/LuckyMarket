# Company Event Market Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real company-event loop where Feishu Attendance or manual admin events become auditable world events, match confirmed market bindings, wake relevant agents, and move market prices through normal trades.

**Architecture:** Add focused services around the existing modular monolith: `WorldEventService`, `MarketBindingService`, `AgentEventQueueService`, and a Feishu attendance adapter. Existing `MarketService` remains the only path for quotes, trades, prices, snapshots, and activity; existing `AgentService` remains the only path for agent wake runs and actions.

**Tech Stack:** TypeScript, Fastify, SQLite via `better-sqlite3`, Zod, Vitest, React, Vite, TanStack Query.

## Global Constraints

- World events are evidence, not odds commands.
- AI may interpret and route events, but it must not directly set prices.
- Price movement must happen through trades, liquidity, and user behavior.
- Every automated action must be traceable to a source event, market binding, agent decision, and trade or signal.
- Feishu Attendance is the first adapter, not the architecture.
- First version will not include fully automatic market creation.
- First version will not include fully automatic binding without admin confirmation.
- First version will not include AI directly changing market probability or outcome prices.
- First version will not add a second external adapter.
- Attendance data is sensitive internal company data: sync only subjects referenced by confirmed market bindings and store only metrics needed by markets.
- LLM use is optional; the event loop must work without model provider configuration.

---

## File Structure

Create backend services:

- `src/services/worldEvents.ts`: normalized append-only world event creation, listing, dedupe, and activity insertion.
- `src/services/marketBindings.ts`: confirmed market binding creation, listing, matching, and deterministic no-LLM suggestions.
- `src/services/agentEventQueue.ts`: event-to-agent queue creation, dedupe, capped dispatch, and event queue ticking.
- `src/integrations/feishu/attendance.ts`: Feishu attendance adapter interface, fake/test sync path, and real-client boundary.
- `src/integrations/feishu/client.ts`: tenant token and attendance summary HTTP boundary, isolated from core tests.

Modify backend files:

- `src/db/schema.ts`: add `world_events`, `market_event_bindings`, `agent_event_queue`, `integration_sync_runs`.
- `src/domain/types.ts`: add shared world-event and binding types.
- `src/domain/errors.ts`: existing `VALIDATION_ERROR` and `NOT_FOUND` codes are sufficient for this first pass; add no new error codes unless implementation discovers a compile-time need.
- `src/config.ts`: add Feishu app credentials; do not add LLM config in this first pass.
- `src/services/agents.ts`: include matched events in context and use attendance event metrics for data-value decisions.
- `src/services/scheduler.ts`: process event queue ticks separately from normal due-agent ticks.
- `src/http/routes.ts`: add world event, binding, queue, and Feishu sync endpoints.

Create or modify tests:

- `tests/worldEvents.test.ts`
- `tests/marketBindings.test.ts`
- `tests/agentEventQueue.test.ts`
- `tests/feishuAttendance.test.ts`
- `tests/companyEventLoop.test.ts`
- Modify `tests/api.test.ts`
- Modify `tests/agents.test.ts`

Modify frontend:

- `frontend/src/types/index.ts`: add world-event, binding, queue, and causal activity payload types.
- `frontend/src/lib/api-client.ts`: add binding and market world-event API calls.
- `frontend/src/hooks/useMarkets.ts`: add market world-event and binding queries.
- `frontend/src/pages/MarketDetail.tsx`: add a compact event impact section and clearer activity rendering.
- `frontend/src/pages/Admin.tsx`: add simple binding confirmation and manual event controls only if it stays compact; otherwise create `frontend/src/components/admin/MarketBindingPanel.tsx`.

---

### Task 1: World Event Persistence

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/domain/types.ts`
- Create: `src/services/worldEvents.ts`
- Create: `tests/worldEvents.test.ts`

**Interfaces:**
- Produces:
  - `type WorldEventConfidence = 'low' | 'medium' | 'high'`
  - `interface WorldEvent`
  - `interface CreateWorldEventInput`
  - `class WorldEventService`
  - `WorldEventService.createEvent(input: CreateWorldEventInput): WorldEvent`
  - `WorldEventService.listEvents(filter?: ListWorldEventsFilter): WorldEvent[]`
  - `WorldEventService.listEventsForMarket(marketId: string): WorldEvent[]`
- Consumes:
  - `Db` from `src/db/connection.ts`
  - `newId` from `src/services/ids.ts`

- [ ] **Step 1: Write failing world event tests**

Create `tests/worldEvents.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/worldEvents.test.ts`

Expected: FAIL because `src/services/worldEvents.ts` does not exist.

- [ ] **Step 3: Add schema and shared types**

Modify `src/db/schema.ts` by adding this SQL inside `createSchema(db).exec(...)` after `company_facts`:

```sql
    CREATE TABLE IF NOT EXISTS world_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      source_ref TEXT,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_label TEXT NOT NULL,
      period TEXT,
      effective_at TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
      summary TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
```

Modify `src/domain/types.ts` by appending:

```ts
export type WorldEventConfidence = 'low' | 'medium' | 'high';

export interface WorldEvent {
  id: string;
  type: string;
  source: string;
  sourceRef: string | null;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  period: string | null;
  effectiveAt: string;
  observedAt: string;
  confidence: WorldEventConfidence;
  summary: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  createdAt: string;
}
```

- [ ] **Step 4: Implement `WorldEventService`**

Create `src/services/worldEvents.ts`:

```ts
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

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new AppError('VALIDATION_ERROR', `${field} is required`);
  }
}

function assertIso(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a valid ISO timestamp`);
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
    const limit = Math.max(1, Math.min(Math.floor(filter.limit ?? 100), 500));
    values.push(limit);
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM world_events ${where} ORDER BY observed_at DESC, id DESC LIMIT ?`)
      .all(...values) as WorldEventRow[];
    return rows.map(mapWorldEvent);
  }

  listEventsForMarket(marketId: string): WorldEvent[] {
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
  }
}
```

- [ ] **Step 5: Run world event tests**

Run: `npm test -- tests/worldEvents.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/domain/types.ts src/services/worldEvents.ts tests/worldEvents.test.ts
git commit -m "feat: add world event persistence"
```

---

### Task 2: Market Bindings And Suggestions

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/domain/types.ts`
- Create: `src/services/marketBindings.ts`
- Create: `tests/marketBindings.test.ts`

**Interfaces:**
- Consumes:
  - `WorldEvent` from Task 1
  - `MarketService.getMarket(marketId)`
- Produces:
  - `interface MarketEventBinding`
  - `interface CreateMarketBindingInput`
  - `interface MarketBindingSuggestion`
  - `class MarketBindingService`
  - `MarketBindingService.createBinding(input: CreateMarketBindingInput): MarketEventBinding`
  - `MarketBindingService.listBindingsForMarket(marketId: string): MarketEventBinding[]`
  - `MarketBindingService.findMatchingBindings(event: WorldEvent): MarketEventBinding[]`
  - `MarketBindingService.suggestBindings(marketId: string): MarketBindingSuggestion[]`

- [ ] **Step 1: Write failing binding tests**

Create `tests/marketBindings.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { LedgerService } from '../src/services/ledger.js';
import { MarketBindingService } from '../src/services/marketBindings.js';
import { MarketService } from '../src/services/markets.js';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

function setup() {
  const db = createTestDb();
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const worldEvents = new WorldEventService(db);
  const bindings = new MarketBindingService(db, markets);
  const market = markets.createMarket({
    title: '王哥将在6月休息几天？',
    category: 'attendance',
    closeTime: '2026-06-30T10:00:00.000Z',
    settlementSource: '公司考勤记录',
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
    liquidityParameter: 100
  });
  return { db, market, worldEvents, bindings };
}

describe('MarketBindingService', () => {
  test('suggests an attendance binding for Wang Ge monthly rest market', () => {
    const { db, market, bindings } = setup();

    const suggestions = bindings.suggestBindings(market.id);

    expect(suggestions).toEqual([
      expect.objectContaining({
        eventType: 'attendance.monthly_summary_updated',
        subjectType: 'person',
        subjectId: 'wang-ge',
        subjectLabel: '王哥',
        period: '2026-06',
        metricKeys: ['restDaysSoFar'],
        confidence: 'medium'
      })
    ]);
    expect(suggestions[0].explanation).toContain('考勤');

    db.close();
  });

  test('creates confirmed binding and matches related event only', () => {
    const { db, market, worldEvents, bindings } = setup();
    const binding = bindings.createBinding({
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
    const related = worldEvents.createEvent({
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
      dedupeKey: 'manual:wang-ge:6'
    });
    const unrelated = worldEvents.createEvent({
      type: 'attendance.monthly_summary_updated',
      source: 'manual_admin',
      subjectType: 'person',
      subjectId: 'xiao-li',
      subjectLabel: '小李',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'high',
      summary: '小李 2026-06 已休息 1 天。',
      payload: { restDaysSoFar: 1 },
      dedupeKey: 'manual:xiao-li:1'
    });

    expect(binding.id).toMatch(/^meb_/);
    expect(bindings.listBindingsForMarket(market.id)).toEqual([binding]);
    expect(bindings.findMatchingBindings(related)).toEqual([binding]);
    expect(bindings.findMatchingBindings(unrelated)).toEqual([]);

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/marketBindings.test.ts`

Expected: FAIL because `src/services/marketBindings.ts` does not exist.

- [ ] **Step 3: Add schema and types**

Modify `src/db/schema.ts` by adding:

```sql
    CREATE TABLE IF NOT EXISTS market_event_bindings (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL REFERENCES markets(id),
      event_type TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      subject_label TEXT NOT NULL,
      period TEXT,
      metric_keys_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('suggested', 'active', 'disabled')),
      suggested_by TEXT NOT NULL,
      confirmed_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
```

Modify `src/domain/types.ts` by appending:

```ts
export type MarketEventBindingStatus = 'suggested' | 'active' | 'disabled';

export interface MarketEventBinding {
  id: string;
  marketId: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  period: string | null;
  metricKeys: string[];
  status: MarketEventBindingStatus;
  suggestedBy: string;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 4: Implement `MarketBindingService`**

Create `src/services/marketBindings.ts`:

```ts
import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import { AppError } from '../domain/errors.js';
import type { MarketEventBinding, MarketEventBindingStatus, WorldEvent, WorldEventConfidence } from '../domain/types.js';
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

function monthFromCloseTime(closeTime: string): string | null {
  const parsed = new Date(closeTime);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 7);
}

function inferSubject(title: string): { subjectId: string; subjectLabel: string } | null {
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
    this.markets.getMarket(input.marketId);
    if (input.metricKeys.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'metricKeys are required');
    }

    return inTransaction(this.db, () => {
      const id = newId('meb');
      const createdAt = nowIso();
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
          createdAt
        );
      return this.getBinding(id);
    });
  }

  getBinding(id: string): MarketEventBinding {
    const row = this.db
      .prepare('SELECT * FROM market_event_bindings WHERE id = ?')
      .get(id) as MarketEventBindingRow | undefined;
    if (!row) {
      throw new AppError('NOT_FOUND', `Market event binding not found: ${id}`, 404);
    }
    return mapBinding(row);
  }

  listBindingsForMarket(marketId: string): MarketEventBinding[] {
    this.markets.getMarket(marketId);
    const rows = this.db
      .prepare('SELECT * FROM market_event_bindings WHERE market_id = ? ORDER BY created_at DESC, id DESC')
      .all(marketId) as MarketEventBindingRow[];
    return rows.map(mapBinding);
  }

  findMatchingBindings(event: WorldEvent): MarketEventBinding[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM market_event_bindings
         WHERE status = 'active'
           AND event_type = ?
           AND subject_type = ?
           AND subject_id = ?
           AND (period IS NULL OR period = ?)
         ORDER BY created_at ASC, id ASC`
      )
      .all(event.type, event.subjectType, event.subjectId, event.period) as MarketEventBindingRow[];
    return rows.map(mapBinding);
  }

  suggestBindings(marketId: string): MarketBindingSuggestion[] {
    const market = this.markets.getMarket(marketId);
    const subject = inferSubject(market.title);
    const asksAttendance = market.category === 'attendance' || market.title.includes('休息') || market.settlementSource.includes('考勤');
    if (!subject || !asksAttendance) {
      return [];
    }

    return [
      {
        eventType: 'attendance.monthly_summary_updated',
        subjectType: 'person',
        subjectId: subject.subjectId,
        subjectLabel: subject.subjectLabel,
        period: monthFromCloseTime(market.closeTime),
        metricKeys: ['restDaysSoFar'],
        confidence: 'medium',
        explanation: `${market.title} 依赖 ${subject.subjectLabel} 的月度考勤休息天数，建议绑定飞书考勤月度汇总事件。`
      }
    ];
  }
}
```

- [ ] **Step 5: Run binding tests**

Run: `npm test -- tests/marketBindings.test.ts tests/worldEvents.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/domain/types.ts src/services/marketBindings.ts tests/marketBindings.test.ts
git commit -m "feat: add market event bindings"
```

---

### Task 3: Agent Event Queue

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/domain/types.ts`
- Create: `src/services/agentEventQueue.ts`
- Create: `tests/agentEventQueue.test.ts`

**Interfaces:**
- Consumes:
  - `WorldEventService`
  - `MarketBindingService`
  - `AgentService`
  - `MarketEventBinding`
- Produces:
  - `interface AgentEventQueueItem`
  - `AgentEventQueueService.enqueueForEvent(event: WorldEvent): AgentEventQueueItem[]`
  - `AgentEventQueueService.tick(limit?: number): AgentEventQueueTickResult`

- [ ] **Step 1: Write failing queue tests**

Create `tests/agentEventQueue.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { AgentEventQueueService } from '../src/services/agentEventQueue.js';
import { AgentService } from '../src/services/agents.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketBindingService } from '../src/services/marketBindings.js';
import { MarketService } from '../src/services/markets.js';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

function setup() {
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
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
    liquidityParameter: 100
  });
  const hr = ledger.createAccount({ kind: 'agent', handle: 'hr-data-agent', displayName: 'HR Data Agent', initialPoints: 500 });
  const mm = ledger.createAccount({ kind: 'agent', handle: 'market-maker-agent', displayName: 'Market Maker Agent', initialPoints: 500 });
  const trend = ledger.createAccount({ kind: 'agent', handle: 'trend-agent', displayName: 'Trend Agent', initialPoints: 500 });
  [hr, mm, trend].forEach((account, index) => {
    agents.createAgentProfile({
      accountId: account.id,
      role: index === 0 ? 'HR Data' : index === 1 ? 'Market Maker' : 'Trend Trader',
      strategy: index === 0 ? 'data_value' : index === 1 ? 'market_maker' : 'trend',
      focusCategories: ['attendance'],
      riskAppetite: 0.5,
      maxTradePoints: 120,
      maxPositionShares: 20,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8,
      nextWakeAt: '2026-06-30T00:00:00.000Z',
      memorySummary: 'Test agent.'
    });
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
  const event = worldEvents.createEvent({
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
    dedupeKey: 'manual:wang-ge:6'
  });
  return { db, market, event, queue };
}

describe('AgentEventQueueService', () => {
  test('enqueues HR Data and Market Maker agents for matching attendance event', () => {
    const { db, market, event, queue } = setup();

    const items = queue.enqueueForEvent(event);

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.reason)).toEqual(['attendance_data_reaction', 'liquidity_response']);
    expect(items.every((item) => item.marketId === market.id)).toBe(true);
    expect(queue.enqueueForEvent(event)).toEqual([]);

    db.close();
  });

  test('event queue tick wakes bounded queued agents and marks items processed', () => {
    const { db, event, queue } = setup();
    queue.enqueueForEvent(event);

    const result = queue.tick(1);

    expect(result.processedQueueItems).toHaveLength(1);
    expect(result.remainingQueuedItems).toBe(1);
    expect(db.prepare("SELECT * FROM agent_event_queue WHERE status = 'processed'").all()).toHaveLength(1);
    expect(db.prepare('SELECT * FROM agent_wake_runs').all()).toHaveLength(1);

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/agentEventQueue.test.ts`

Expected: FAIL because `src/services/agentEventQueue.ts` does not exist.

- [ ] **Step 3: Add schema and types**

Modify `src/db/schema.ts` by adding:

```sql
    CREATE TABLE IF NOT EXISTS agent_event_queue (
      id TEXT PRIMARY KEY,
      world_event_id TEXT NOT NULL REFERENCES world_events(id),
      market_id TEXT NOT NULL REFERENCES markets(id),
      binding_id TEXT NOT NULL REFERENCES market_event_bindings(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      reason TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'processed', 'failed')),
      created_at TEXT NOT NULL,
      processed_at TEXT,
      wake_run_id TEXT,
      UNIQUE (world_event_id, market_id, account_id, reason)
    );
```

Modify `src/domain/types.ts` by appending:

```ts
export type AgentEventQueueStatus = 'queued' | 'processed' | 'failed';

export interface AgentEventQueueItem {
  id: string;
  worldEventId: string;
  marketId: string;
  bindingId: string;
  accountId: string;
  reason: string;
  status: AgentEventQueueStatus;
  createdAt: string;
  processedAt: string | null;
  wakeRunId: string | null;
}
```

- [ ] **Step 4: Implement queue service**

Create `src/services/agentEventQueue.ts`:

```ts
import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import type { AgentEventQueueItem, AgentEventQueueStatus, MarketEventBinding, WorldEvent } from '../domain/types.js';
import type { AgentProfile, AgentService } from './agents.js';
import { newId } from './ids.js';
import type { MarketBindingService } from './marketBindings.js';

export interface AgentEventQueueTickResult {
  processedQueueItems: string[];
  failedQueueItems: string[];
  remainingQueuedItems: number;
}

interface AgentEventQueueRow {
  id: string;
  world_event_id: string;
  market_id: string;
  binding_id: string;
  account_id: string;
  reason: string;
  status: AgentEventQueueStatus;
  created_at: string;
  processed_at: string | null;
  wake_run_id: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapQueueItem(row: AgentEventQueueRow): AgentEventQueueItem {
  return {
    id: row.id,
    worldEventId: row.world_event_id,
    marketId: row.market_id,
    bindingId: row.binding_id,
    accountId: row.account_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    wakeRunId: row.wake_run_id
  };
}

export class AgentEventQueueService {
  constructor(
    private readonly db: Db,
    private readonly agents: AgentService,
    private readonly bindings: MarketBindingService
  ) {}

  enqueueForEvent(event: WorldEvent): AgentEventQueueItem[] {
    return inTransaction(this.db, () => {
      const matchingBindings = this.bindings.findMatchingBindings(event);
      const created: AgentEventQueueItem[] = [];
      for (const binding of matchingBindings) {
        for (const target of this.pickAgentsForBinding(binding)) {
          const inserted = this.insertQueueItem(event, binding, target.agent.accountId, target.reason);
          if (inserted) {
            created.push(inserted);
          }
        }
      }
      return created;
    });
  }

  listQueued(limit = 50): AgentEventQueueItem[] {
    const capped = Math.max(1, Math.min(Math.floor(limit), 100));
    const rows = this.db
      .prepare("SELECT * FROM agent_event_queue WHERE status = 'queued' ORDER BY created_at ASC, id ASC LIMIT ?")
      .all(capped) as AgentEventQueueRow[];
    return rows.map(mapQueueItem);
  }

  tick(limit = 3): AgentEventQueueTickResult {
    const queued = this.listQueued(limit);
    const processedQueueItems: string[] = [];
    const failedQueueItems: string[] = [];
    for (const item of queued) {
      try {
        const wake = this.agents.wakeAgent(item.accountId, { worldEventId: item.worldEventId, marketId: item.marketId });
        this.markProcessed(item.id, wake.wakeRunId);
        processedQueueItems.push(item.id);
      } catch {
        this.markFailed(item.id);
        failedQueueItems.push(item.id);
      }
    }
    const remainingQueuedItems = (
      this.db.prepare("SELECT COUNT(*) AS count FROM agent_event_queue WHERE status = 'queued'").get() as { count: number }
    ).count;
    return { processedQueueItems, failedQueueItems, remainingQueuedItems };
  }

  private markProcessed(queueItemId: string, wakeRunId: string): void {
    this.db
      .prepare("UPDATE agent_event_queue SET status = 'processed', processed_at = ?, wake_run_id = ? WHERE id = ?")
      .run(nowIso(), wakeRunId, queueItemId);
  }

  private markFailed(queueItemId: string): void {
    this.db
      .prepare("UPDATE agent_event_queue SET status = 'failed', processed_at = ? WHERE id = ?")
      .run(nowIso(), queueItemId);
  }

  private pickAgentsForBinding(binding: MarketEventBinding): Array<{ agent: AgentProfile; reason: string }> {
    const agents = this.agents.listAgents();
    const picked: Array<{ agent: AgentProfile; reason: string }> = [];
    const hr = agents.find((agent) => agent.role === 'HR Data' && agent.focusCategories.includes('attendance'));
    const marketMaker = agents.find((agent) => agent.strategy === 'market_maker' && agent.focusCategories.includes(binding.eventType.split('.')[0]));
    if (hr && binding.eventType === 'attendance.monthly_summary_updated') {
      picked.push({ agent: hr, reason: 'attendance_data_reaction' });
    }
    if (marketMaker) {
      picked.push({ agent: marketMaker, reason: 'liquidity_response' });
    }
    return picked.slice(0, 2);
  }

  private insertQueueItem(
    event: WorldEvent,
    binding: MarketEventBinding,
    accountId: string,
    reason: string
  ): AgentEventQueueItem | null {
    const id = newId('aeq');
    const createdAt = nowIso();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_event_queue (
          id, world_event_id, market_id, binding_id, account_id, reason, status,
          created_at, processed_at, wake_run_id
        ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NULL, NULL)`
      )
      .run(id, event.id, binding.marketId, binding.id, accountId, reason, createdAt);
    if (result.changes === 0) {
      return null;
    }
    const row = this.db.prepare('SELECT * FROM agent_event_queue WHERE id = ?').get(id) as AgentEventQueueRow;
    return mapQueueItem(row);
  }
}
```

- [ ] **Step 5: Adjust `AgentService.wakeAgent` signature minimally**

Modify `src/services/agents.ts`:

```ts
export interface WakeAgentOptions {
  worldEventId?: string;
  marketId?: string;
}
```

Change:

```ts
wakeAgent(accountId: string): WakeAgentResult {
```

to:

```ts
wakeAgent(accountId: string, _options: WakeAgentOptions = {}): WakeAgentResult {
```

This keeps behavior unchanged for now and lets queue tests compile. Later tasks use the options.

- [ ] **Step 6: Run queue tests**

Run: `npm test -- tests/agentEventQueue.test.ts tests/marketBindings.test.ts tests/agents.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/domain/types.ts src/services/agentEventQueue.ts src/services/agents.ts tests/agentEventQueue.test.ts
git commit -m "feat: add agent event queue"
```

---

### Task 4: Agent Event Context And Attendance Decisioning

**Files:**
- Modify: `src/services/agents.ts`
- Modify: `tests/agents.test.ts`
- Create: `tests/companyEventLoop.test.ts`

**Interfaces:**
- Consumes:
  - `agent_event_queue.world_event_id`
  - `world_events.payload_json.restDaysSoFar`
  - `wakeAgent(accountId, { worldEventId, marketId })`
- Produces:
  - `AgentContextPacket.matchedWorldEvents`
  - Data-value attendance agents prefer already-satisfied numeric bucket outcomes.

- [ ] **Step 1: Write failing company loop test**

Create `tests/companyEventLoop.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { AgentEventQueueService } from '../src/services/agentEventQueue.js';
import { AgentService } from '../src/services/agents.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketBindingService } from '../src/services/marketBindings.js';
import { MarketService } from '../src/services/markets.js';
import { WorldEventService } from '../src/services/worldEvents.js';
import { createTestDb } from './helpers.js';

describe('company event market loop', () => {
  test('attendance event drives HR Data Agent to buy the already-satisfied 6 days plus outcome', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const agents = new AgentService(db, ledger, markets);
    const worldEvents = new WorldEventService(db);
    const bindings = new MarketBindingService(db, markets);
    const queue = new AgentEventQueueService(db, agents, bindings);
    const account = ledger.createAccount({ kind: 'agent', handle: 'hr-data-agent', displayName: 'HR Data Agent', initialPoints: 500 });
    agents.createAgentProfile({
      accountId: account.id,
      role: 'HR Data',
      strategy: 'data_value',
      focusCategories: ['attendance'],
      riskAppetite: 0.8,
      maxTradePoints: 160,
      maxPositionShares: 30,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8,
      nextWakeAt: '2026-06-30T00:00:00.000Z',
      memorySummary: 'Trusts Feishu attendance summaries.'
    });
    const mm = ledger.createAccount({ kind: 'agent', handle: 'market-maker-agent', displayName: 'Market Maker Agent', initialPoints: 500 });
    agents.createAgentProfile({
      accountId: mm.id,
      role: 'Market Maker',
      strategy: 'market_maker',
      focusCategories: ['attendance'],
      riskAppetite: 0.3,
      maxTradePoints: 80,
      maxPositionShares: 20,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8,
      nextWakeAt: '2026-06-30T00:00:00.000Z',
      memorySummary: 'Provides light liquidity.'
    });
    const market = markets.createMarket({
      title: '王哥将在6月休息几天？',
      category: 'attendance',
      closeTime: '2026-06-30T10:00:00.000Z',
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });
    const sixPlusOutcome = market.outcomes[3];
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
    const event = worldEvents.createEvent({
      type: 'attendance.monthly_summary_updated',
      source: 'feishu_attendance',
      subjectType: 'person',
      subjectId: 'wang-ge',
      subjectLabel: '王哥',
      period: '2026-06',
      effectiveAt: '2026-06-18T12:00:00.000Z',
      observedAt: '2026-06-18T12:05:00.000Z',
      confidence: 'high',
      summary: '王哥 2026-06 已休息 6 天。',
      payload: { restDaysSoFar: 6 },
      dedupeKey: 'feishu:wang-ge:2026-06:restDaysSoFar:6'
    });

    queue.enqueueForEvent(event);
    const result = queue.tick(1);
    const updatedMarket = markets.getMarket(market.id);
    const sixPlusPrice = updatedMarket.prices.find((price) => price.outcomeId === sixPlusOutcome.id)?.price ?? 0;

    expect(result.processedQueueItems).toHaveLength(1);
    expect(markets.getPositions(account.id)).toEqual([
      expect.objectContaining({ marketId: market.id, outcomeId: sixPlusOutcome.id })
    ]);
    expect(sixPlusPrice).toBeGreaterThan(25);
    expect(markets.getActivity(market.id).some((activity) => activity.message.includes('王哥 2026-06 已休息 6 天'))).toBe(true);

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/companyEventLoop.test.ts`

Expected: FAIL because `AgentService` ignores `worldEventId` and still uses hardcoded second outcome for attendance.

- [ ] **Step 3: Extend `AgentContextPacket`**

Modify `src/services/agents.ts`:

```ts
import { AppError } from '../domain/errors.js';
import type { WorldEvent } from '../domain/types.js';
```

Change `AgentContextPacket` to include:

```ts
  matchedWorldEvents: WorldEvent[];
```

Add a private loader:

```ts
  private getWorldEvent(eventId: string): WorldEvent {
    const row = this.db.prepare('SELECT * FROM world_events WHERE id = ?').get(eventId) as
      | {
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
          confidence: WorldEvent['confidence'];
          summary: string;
          payload_json: string;
          dedupe_key: string;
          created_at: string;
        }
      | undefined;
    if (!row) {
      throw new AppError('NOT_FOUND', `World event not found: ${eventId}`, 404);
    }
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
```

Change `buildContextPacket(accountId: string)` to:

```ts
  buildContextPacket(accountId: string, options: WakeAgentOptions = {}): AgentContextPacket {
```

Add to returned packet:

```ts
      matchedWorldEvents: options.worldEventId ? [this.getWorldEvent(options.worldEventId)] : []
```

Change `wakeAgent` context creation:

```ts
      const context = this.buildContextPacket(accountId, options);
```

- [ ] **Step 4: Add event-aware market selection and outcome choice**

In `wakeAgent`, replace:

```ts
      const market = dailyContext.openMarkets[0];
```

with:

```ts
      const market = options.marketId
        ? dailyContext.openMarkets.find((item) => item.id === options.marketId)
        : dailyContext.openMarkets[0];
```

Replace `chooseOutcome` attendance branch with:

```ts
    const attendanceEvent = agent.strategy === 'data_value' && market.category === 'attendance'
      ? this.latestAttendanceEventForMarket(market.id)
      : null;
    if (attendanceEvent) {
      const restDays = Number(attendanceEvent.payload.restDaysSoFar);
      const bucket = this.pickOutcomeForRestDays(pricedOutcomes, restDays);
      if (bucket) {
        const fairProbability = restDays >= 6 ? 92 : Math.min(88, bucket.price + 35);
        return { ...bucket, fairProbability };
      }
    }
    if (agent.strategy === 'data_value' && market.category === 'attendance' && pricedOutcomes[1]) {
      return { ...pricedOutcomes[1], fairProbability: 58 };
    }
```

Add helpers:

```ts
  private latestAttendanceEventForMarket(marketId: string): WorldEvent | null {
    const row = this.db
      .prepare(
        `SELECT world_events.*
         FROM world_events
         INNER JOIN market_event_bindings ON
           market_event_bindings.event_type = world_events.type
           AND market_event_bindings.subject_type = world_events.subject_type
           AND market_event_bindings.subject_id = world_events.subject_id
           AND (market_event_bindings.period IS NULL OR market_event_bindings.period = world_events.period)
         WHERE market_event_bindings.market_id = ?
           AND market_event_bindings.status = 'active'
           AND world_events.type = 'attendance.monthly_summary_updated'
         ORDER BY world_events.observed_at DESC, world_events.id DESC
         LIMIT 1`
      )
      .get(marketId) as
      | {
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
          confidence: WorldEvent['confidence'];
          summary: string;
          payload_json: string;
          dedupe_key: string;
          created_at: string;
        }
      | undefined;
    if (!row) return null;
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

  private pickOutcomeForRestDays(
    pricedOutcomes: Array<{ outcome: MarketOutcome; price: number }>,
    restDays: number
  ): { outcome: MarketOutcome; price: number } | null {
    if (!Number.isFinite(restDays)) return null;
    const matching = pricedOutcomes.find((item) => {
      const label = item.outcome.label;
      const range = /^(\d+)-(\d+)天$/.exec(label);
      if (range) {
        return restDays >= Number(range[1]) && restDays <= Number(range[2]);
      }
      const plus = /^(\d+)天以上$/.exec(label);
      if (plus) {
        return restDays >= Number(plus[1]);
      }
      return false;
    });
    return matching ?? null;
  }
```

- [ ] **Step 5: Add event summary into agent activity**

In the `agent_trade` payload inside `wakeAgent`, add:

```ts
              worldEventId: dailyContext.matchedWorldEvents[0]?.id,
              worldEventSummary: dailyContext.matchedWorldEvents[0]?.summary,
```

Change the trade message from:

```ts
            `Agent bought ${trade.shares} shares`,
```

to:

```ts
            dailyContext.matchedWorldEvents[0]
              ? `Agent bought ${trade.shares} shares after event: ${dailyContext.matchedWorldEvents[0].summary}`
              : `Agent bought ${trade.shares} shares`,
```

- [ ] **Step 6: Run company loop tests**

Run: `npm test -- tests/companyEventLoop.test.ts tests/agents.test.ts tests/agentEventQueue.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/agents.ts tests/companyEventLoop.test.ts tests/agents.test.ts
git commit -m "feat: make agents react to attendance events"
```

---

### Task 5: HTTP API For Events, Bindings, And Queue

**Files:**
- Modify: `src/http/routes.ts`
- Modify: `tests/api.test.ts`

**Interfaces:**
- Consumes:
  - `WorldEventService`
  - `MarketBindingService`
  - `AgentEventQueueService`
- Produces endpoints:
  - `POST /world-events`
  - `GET /world-events`
  - `GET /markets/:id/world-events`
  - `POST /markets/:id/bindings/suggest`
  - `POST /markets/:id/bindings`
  - `GET /markets/:id/bindings`
  - `GET /agent-event-queue`
  - `POST /scheduler/event-queue/tick`

- [ ] **Step 1: Write failing API tests**

Append to `tests/api.test.ts`:

```ts
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
      const suggestion = suggestions.json<{ suggestions: Array<{ eventType: string; subjectId: string }> }>().suggestions[0];
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api.test.ts`

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Add services and schemas in routes**

Modify imports in `src/http/routes.ts`:

```ts
import { AgentEventQueueService } from '../services/agentEventQueue.js';
import { MarketBindingService } from '../services/marketBindings.js';
import { WorldEventService } from '../services/worldEvents.js';
```

Add schemas:

```ts
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
  payload: z.record(z.unknown()),
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

const eventQueueTickBodySchema = z.object({ limit: z.number().int().positive().max(20).optional() }).optional();
```

Update `makeServices` return:

```ts
  const worldEvents = new WorldEventService(options.db);
  const bindings = new MarketBindingService(options.db, markets);
  const eventQueue = new AgentEventQueueService(options.db, agents, bindings);
  return { ledger, markets, agents, scheduler, worldEvents, bindings, eventQueue };
```

- [ ] **Step 4: Add endpoint implementations**

In `registerRoutes`, destructure the new services:

```ts
  const { ledger, markets, agents, scheduler, worldEvents, bindings, eventQueue } = makeServices(options);
```

Add routes before `/seed/demo`:

```ts
  server.post('/world-events', async (request) => {
    const body = worldEventBodySchema.parse(request.body);
    const event = worldEvents.createEvent(body);
    const queuedItems = eventQueue.enqueueForEvent(event);
    return { event, queuedItems };
  });

  server.get('/world-events', async (request) => {
    const query = request.query as { type?: string; source?: string; subjectId?: string; period?: string; limit?: string };
    return {
      events: worldEvents.listEvents({
        type: query.type,
        source: query.source,
        subjectId: query.subjectId,
        period: query.period,
        limit: query.limit ? Number(query.limit) : undefined
      })
    };
  });

  server.get<{ Params: { id: string } }>('/markets/:id/world-events', async (request) => ({
    events: worldEvents.listEventsForMarket(request.params.id)
  }));

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
```

- [ ] **Step 5: Run API tests**

Run: `npm test -- tests/api.test.ts tests/companyEventLoop.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/http/routes.ts tests/api.test.ts
git commit -m "feat: expose company event loop api"
```

---

### Task 6: Feishu Attendance Adapter Boundary

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/config.ts`
- Create: `src/integrations/feishu/attendance.ts`
- Create: `src/integrations/feishu/client.ts`
- Create: `tests/feishuAttendance.test.ts`
- Modify: `src/http/routes.ts`
- Modify: `tests/api.test.ts`

**Interfaces:**
- Consumes:
  - confirmed active `market_event_bindings`
  - `WorldEventService.createEvent`
  - `AgentEventQueueService.enqueueForEvent`
- Produces:
  - `FeishuAttendanceAdapter.syncMonthlySummaries(nowIso?: string): FeishuAttendanceSyncResult`
  - `POST /integrations/feishu/attendance/sync`
  - `integration_sync_runs` rows

- [ ] **Step 1: Write failing Feishu adapter tests**

Create `tests/feishuAttendance.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { AgentEventQueueService } from '../src/services/agentEventQueue.js';
import { AgentService } from '../src/services/agents.js';
import { FeishuAttendanceAdapter, type FeishuAttendanceClient } from '../src/integrations/feishu/attendance.js';
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

    db.close();
  });

  test('records failed sync without creating partial events', async () => {
    const client: FeishuAttendanceClient = {
      async getMonthlySummary() {
        throw new Error('Feishu unavailable');
      }
    };
    const { db, adapter, worldEvents } = setup(client);

    const result = await adapter.syncMonthlySummaries('2026-06-18T12:10:00.000Z');

    expect(result.status).toBe('failed');
    expect(worldEvents.listEvents()).toEqual([]);
    expect(db.prepare("SELECT status FROM integration_sync_runs WHERE provider = 'feishu_attendance'").get()).toEqual({
      status: 'failed'
    });

    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/feishuAttendance.test.ts`

Expected: FAIL because integration files do not exist.

- [ ] **Step 3: Add schema and config**

Modify `src/db/schema.ts` by adding:

```sql
    CREATE TABLE IF NOT EXISTS integration_sync_runs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      scanned_subjects INTEGER NOT NULL,
      created_events INTEGER NOT NULL,
      queued_items INTEGER NOT NULL,
      error_message TEXT
    );
```

Modify `src/config.ts`:

```ts
export interface AppConfig {
  port: number;
  databaseUrl: string;
  schedulerEnabled: boolean;
  maxAgentsPerTick: number;
  feishuAppId: string | null;
  feishuAppSecret: string | null;
}

export function loadConfig(env = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? 'data/luckymarket.sqlite',
    schedulerEnabled: env.SCHEDULER_ENABLED !== 'false',
    maxAgentsPerTick: Number(env.MAX_AGENTS_PER_TICK ?? 3),
    feishuAppId: env.FEISHU_APP_ID ?? null,
    feishuAppSecret: env.FEISHU_APP_SECRET ?? null
  };
}
```

- [ ] **Step 4: Implement Feishu adapter**

Create `src/integrations/feishu/attendance.ts`:

```ts
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
    const startedAt = nowIso();
    let scannedSubjects = 0;
    let createdEvents = 0;
    let queuedItems = 0;
    try {
      const subjects = this.getActiveAttendanceSubjects();
      scannedSubjects = subjects.length;
      for (const subject of subjects) {
        const summary = await this.client.getMonthlySummary(subject);
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
        const allEvents = this.worldEvents.listEvents({ subjectId: subject.subjectId, period: subject.period, limit: 1 });
        if (allEvents[0]?.id === event.id && event.createdAt >= startedAt) {
          createdEvents += 1;
          queuedItems += this.queue.enqueueForEvent(event).length;
        }
      }
      const result = { status: 'success' as const, scannedSubjects, createdEvents, queuedItems };
      this.recordSync(startedAt, result);
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
      .all() as Array<{ subject_id: string; subject_label: string; period: string }>;
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
```

- [ ] **Step 5: Add real Feishu client boundary**

Create `src/integrations/feishu/client.ts`:

```ts
import { AppError } from '../../domain/errors.js';
import type { FeishuAttendanceClient, FeishuAttendanceSubject, FeishuMonthlyAttendanceSummary } from './attendance.js';

interface FeishuTenantTokenResponse {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
}

export class FeishuHttpAttendanceClient implements FeishuAttendanceClient {
  constructor(
    private readonly appId: string | null,
    private readonly appSecret: string | null,
    private readonly baseUrl = 'https://open.feishu.cn'
  ) {}

  async getMonthlySummary(_subject: FeishuAttendanceSubject): Promise<FeishuMonthlyAttendanceSummary> {
    if (!this.appId || !this.appSecret) {
      throw new AppError('VALIDATION_ERROR', 'FEISHU_APP_ID and FEISHU_APP_SECRET are required for Feishu sync');
    }

    await this.getTenantAccessToken();
    throw new AppError(
      'VALIDATION_ERROR',
      'Feishu attendance monthly summary mapping must be configured against the tenant attendance datasource before real sync'
    );
  }

  private async getTenantAccessToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: this.appId, app_secret: this.appSecret })
    });
    if (!response.ok) {
      throw new AppError('VALIDATION_ERROR', `Feishu tenant token request failed with HTTP ${response.status}`);
    }
    const body = (await response.json()) as FeishuTenantTokenResponse;
    if (body.code !== 0 || !body.tenant_access_token) {
      throw new AppError('VALIDATION_ERROR', `Feishu tenant token request failed: ${body.msg ?? body.code}`);
    }
    return body.tenant_access_token;
  }
}
```

This client intentionally stops after token validation until exact tenant attendance datasource mapping is configured. The event loop is still verifiable through fake client tests and manual world events.

- [ ] **Step 6: Wire sync endpoint**

Modify `src/http/routes.ts` imports:

```ts
import { FeishuAttendanceAdapter } from '../integrations/feishu/attendance.js';
import { FeishuHttpAttendanceClient } from '../integrations/feishu/client.js';
```

Extend `RegisterRoutesOptions`:

```ts
  feishuAppId?: string | null;
  feishuAppSecret?: string | null;
```

In `makeServices`, add:

```ts
  const feishuAttendance = new FeishuAttendanceAdapter(
    options.db,
    worldEvents,
    bindings,
    eventQueue,
    new FeishuHttpAttendanceClient(options.feishuAppId ?? null, options.feishuAppSecret ?? null)
  );
  return { ledger, markets, agents, scheduler, worldEvents, bindings, eventQueue, feishuAttendance };
```

In `registerRoutes`, destructure `feishuAttendance` and add:

```ts
  server.post('/integrations/feishu/attendance/sync', async () => ({
    result: await feishuAttendance.syncMonthlySummaries()
  }));
```

Modify `src/http/server.ts` `BuildServerOptions` to include optional Feishu config and pass through automatically by spreading options into `registerRoutes`.

Modify `src/index.ts` server build call:

```ts
    feishuAppId: config.feishuAppId,
    feishuAppSecret: config.feishuAppSecret
```

- [ ] **Step 7: Run Feishu tests**

Run: `npm test -- tests/feishuAttendance.test.ts tests/api.test.ts`

Expected: PASS. The API sync endpoint without Feishu credentials may return a failed sync result, not crash the server.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts src/config.ts src/http/routes.ts src/http/server.ts src/index.ts src/integrations/feishu tests/feishuAttendance.test.ts tests/api.test.ts
git commit -m "feat: add feishu attendance sync boundary"
```

---

### Task 7: Scheduler Event Queue Tick

**Files:**
- Modify: `src/services/scheduler.ts`
- Modify: `src/index.ts`
- Modify: `tests/agentEventQueue.test.ts`

**Interfaces:**
- Consumes:
  - `AgentEventQueueService.tick(limit)`
- Produces:
  - Scheduler can run event queue ticks from API and background process without conflating them with normal due-agent ticks.

- [ ] **Step 1: Write failing scheduler queue test**

Append to `tests/agentEventQueue.test.ts`:

```ts
  test('scheduler event queue tick is separate from normal due-agent tick', () => {
    const { db, event, queue } = setup();
    queue.enqueueForEvent(event);

    const first = queue.tick(2);
    const second = queue.tick(2);

    expect(first.processedQueueItems).toHaveLength(2);
    expect(second.processedQueueItems).toHaveLength(0);
    expect(second.remainingQueuedItems).toBe(0);

    db.close();
  });
```

- [ ] **Step 2: Run test**

Run: `npm test -- tests/agentEventQueue.test.ts`

Expected: PASS already if Task 3 is solid. If it fails, fix queue idempotency before editing scheduler.

- [ ] **Step 3: Add background event queue interval**

Modify `src/index.ts`:

```ts
import { AgentEventQueueService } from './services/agentEventQueue.js';
import { MarketBindingService } from './services/marketBindings.js';
```

Add:

```ts
const EVENT_QUEUE_INTERVAL_MS = 30_000;

function startEventQueueScheduler(db: Db, maxAgentsPerTick: number): NodeJS.Timeout {
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);
  const bindings = new MarketBindingService(db, markets);
  const queue = new AgentEventQueueService(db, agents, bindings);

  const runTick = (): void => {
    try {
      queue.tick(maxAgentsPerTick);
    } catch (error) {
      console.error('Event queue tick failed', error);
    }
  };

  return setInterval(runTick, EVENT_QUEUE_INTERVAL_MS);
}
```

In `main`, add:

```ts
  const eventQueueInterval = config.schedulerEnabled
    ? startEventQueueScheduler(db, config.maxAgentsPerTick)
    : undefined;
```

In shutdown:

```ts
    if (eventQueueInterval) {
      clearInterval(eventQueueInterval);
    }
```

- [ ] **Step 4: Run backend tests and build**

Run:

```bash
npm test -- tests/agentEventQueue.test.ts tests/api.test.ts
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/services/scheduler.ts tests/agentEventQueue.test.ts
git commit -m "feat: schedule event queue processing"
```

---

### Task 8: Frontend Event Impact View

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api-client.ts`
- Modify: `frontend/src/hooks/useMarkets.ts`
- Modify: `frontend/src/pages/MarketDetail.tsx`
- Create: `frontend/src/lib/worldEvents.test.ts`
- Optional create: `frontend/src/lib/worldEvents.ts`

**Interfaces:**
- Consumes:
  - `GET /markets/:id/world-events`
  - `GET /markets/:id/bindings`
  - existing `Activity.payload`
- Produces:
  - Market detail shows recent world events and clearer event-caused agent activity.

- [ ] **Step 1: Add frontend helper test**

Create `frontend/src/lib/worldEvents.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { describeWorldEvent, describeWorldEventActivity } from './worldEvents';

describe('world event display helpers', () => {
  test('formats attendance world event summary', () => {
    expect(
      describeWorldEvent({
        id: 'wev_1',
        type: 'attendance.monthly_summary_updated',
        source: 'feishu_attendance',
        sourceRef: null,
        subjectType: 'person',
        subjectId: 'wang-ge',
        subjectLabel: '王哥',
        period: '2026-06',
        effectiveAt: '2026-06-18T12:00:00.000Z',
        observedAt: '2026-06-18T12:05:00.000Z',
        confidence: 'high',
        summary: '王哥 2026-06 已休息 6 天。',
        payload: { restDaysSoFar: 6 },
        dedupeKey: 'x',
        createdAt: '2026-06-18T12:05:00.000Z'
      })
    ).toBe('王哥 2026-06 已休息 6 天。');
  });

  test('formats agent activity with event reason', () => {
    expect(
      describeWorldEventActivity({
        worldEventSummary: '王哥 2026-06 已休息 6 天。',
        outcomeLabel: '6天以上',
        priceBefore: 25,
        priceAfter: 42
      })
    ).toContain('王哥 2026-06 已休息 6 天。');
  });
});
```

- [ ] **Step 2: Run frontend test to verify it fails**

Run: `cd frontend && npm run test -- src/lib/worldEvents.test.ts --run`

Expected: FAIL because `frontend/src/lib/worldEvents.ts` does not exist.

- [ ] **Step 3: Add frontend types and helpers**

Modify `frontend/src/types/index.ts` by appending:

```ts
export type WorldEventConfidence = 'low' | 'medium' | 'high';

export interface WorldEvent {
  id: string;
  type: string;
  source: string;
  sourceRef: string | null;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  period: string | null;
  effectiveAt: string;
  observedAt: string;
  confidence: WorldEventConfidence;
  summary: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  createdAt: string;
}

export interface MarketEventBinding {
  id: string;
  marketId: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  subjectLabel: string;
  period: string | null;
  metricKeys: string[];
  status: 'suggested' | 'active' | 'disabled';
  suggestedBy: string;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Create `frontend/src/lib/worldEvents.ts`:

```ts
import type { WorldEvent } from '@/types';
import { formatProbability } from './utils';

export interface EventDrivenActivityPayload {
  worldEventSummary?: string;
  outcomeLabel?: string;
  priceBefore?: number;
  priceAfter?: number;
}

export function describeWorldEvent(event: WorldEvent): string {
  return event.summary;
}

export function describeWorldEventActivity(payload: EventDrivenActivityPayload): string {
  const event = payload.worldEventSummary ?? '公司事件';
  const outcome = payload.outcomeLabel ? `，买入 ${payload.outcomeLabel}` : '';
  const price =
    typeof payload.priceBefore === 'number' && typeof payload.priceAfter === 'number'
      ? `，价格 ${formatProbability(payload.priceBefore)} -> ${formatProbability(payload.priceAfter)}`
      : '';
  return `${event}${outcome}${price}`;
}
```

- [ ] **Step 4: Add API client calls**

Modify `frontend/src/lib/api-client.ts` imports:

```ts
  MarketEventBinding,
  WorldEvent,
```

Add:

```ts
export async function getMarketWorldEvents(marketId: string): Promise<WorldEvent[]> {
  const response = await apiClient.get<{ events: WorldEvent[] }>(`/markets/${marketId}/world-events`);
  return response.data.events;
}

export async function getMarketBindings(marketId: string): Promise<MarketEventBinding[]> {
  const response = await apiClient.get<{ bindings: MarketEventBinding[] }>(`/markets/${marketId}/bindings`);
  return response.data.bindings;
}
```

Modify `frontend/src/hooks/useMarkets.ts` by importing those functions and adding:

```ts
export function useMarketWorldEvents(marketId?: string) {
  return useQuery({
    queryKey: ['market-world-events', marketId],
    queryFn: () => getMarketWorldEvents(marketId!),
    enabled: Boolean(marketId),
  });
}

export function useMarketBindings(marketId?: string) {
  return useQuery({
    queryKey: ['market-bindings', marketId],
    queryFn: () => getMarketBindings(marketId!),
    enabled: Boolean(marketId),
  });
}
```

- [ ] **Step 5: Update market detail UI**

Modify `frontend/src/pages/MarketDetail.tsx` imports:

```ts
import { Activity, DatabaseZap, Link2 } from 'lucide-react';
import { useMarketBindings, useMarketWorldEvents } from '@/hooks/useMarkets';
import { describeWorldEvent, describeWorldEventActivity } from '@/lib/worldEvents';
```

Add queries:

```ts
  const worldEventsQuery = useMarketWorldEvents(id);
  const bindingsQuery = useMarketBindings(id);
```

After price chart section, add:

```tsx
          <div className="fluid-glass-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
              <DatabaseZap size={20} />
              公司事件影响
            </h2>
            <div className="space-y-3">
              {worldEventsQuery.data?.length ? (
                worldEventsQuery.data.slice(0, 4).map((event) => (
                  <div key={event.id} className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3">
                    <div className="text-sm font-medium text-emerald-100">{describeWorldEvent(event)}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {event.source === 'feishu_attendance' ? '飞书考勤' : '人工事件'} · {event.confidence}
                    </div>
                  </div>
                ))
              ) : bindingsQuery.data?.length ? (
                <div className="text-sm text-slate-400">已绑定公司事件，等待下一次同步。</div>
              ) : (
                <div className="text-sm text-slate-400">这个市场还没有绑定公司事件。</div>
              )}
            </div>
          </div>
```

Inside activity rendering, replace message line with:

```tsx
                      <span className="text-sm font-medium text-slate-200">
                        {item.type === 'agent_trade' && item.payload && typeof item.payload === 'object'
                          ? describeWorldEventActivity(item.payload as Record<string, unknown>)
                          : item.message}
                      </span>
```

Keep existing layout stable.

- [ ] **Step 6: Run frontend tests and build**

Run:

```bash
cd frontend
npm run test -- src/lib/worldEvents.test.ts --run
npm run build
```

Expected: PASS and build exits 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api-client.ts frontend/src/hooks/useMarkets.ts frontend/src/pages/MarketDetail.tsx frontend/src/lib/worldEvents.ts frontend/src/lib/worldEvents.test.ts
git commit -m "feat(frontend): show company event impact"
```

---

### Task 9: End-To-End Verification And Docs

**Files:**
- Modify: `README.md`
- Modify: `frontend/README.md`
- Modify: `docs/superpowers/specs/2026-06-16-company-event-market-loop-design.md` only if implementation intentionally differs from the approved design.

**Interfaces:**
- Consumes every previous task.
- Produces verified local deployment instructions and proof commands.

- [ ] **Step 1: Add README runtime notes**

Modify `README.md` Environment section to add:

```md
- `FEISHU_APP_ID`: Feishu app id for attendance sync.
- `FEISHU_APP_SECRET`: Feishu app secret for attendance sync.

Company event loop:

- Create or confirm market bindings before syncing external company data.
- `POST /world-events` creates a manual world event and queues matching agent reactions.
- `POST /integrations/feishu/attendance/sync` runs Feishu Attendance sync for active attendance bindings.
- `POST /scheduler/event-queue/tick` processes queued event-driven agent wakes.
- Event-driven prices still move only through normal trades.
```

- [ ] **Step 2: Run full backend verification**

Run:

```bash
npm test
npm run build
```

Expected: all tests pass and TypeScript build exits 0.

- [ ] **Step 3: Run full frontend verification**

Run:

```bash
cd frontend
npm run test -- --run
npm run build
```

Expected: all frontend tests pass and Vite build exits 0.

- [ ] **Step 4: Run local API smoke loop**

If services are already running, stop only LuckyMarket-owned screen sessions:

```bash
screen -S luckymarket-backend -X quit >/dev/null 2>&1 || true
screen -S luckymarket-frontend -X quit >/dev/null 2>&1 || true
```

Build and start:

```bash
npm run build
cd frontend && npm run build && cd ..
screen -dmS luckymarket-backend zsh -lc 'cd /Users/piggy/github/luckymarket && npm start >> luckymarket-backend.dev.log 2>&1'
screen -dmS luckymarket-frontend zsh -lc 'cd /Users/piggy/github/luckymarket/frontend && npm run preview -- --host 0.0.0.0 --port 4173 >> luckymarket-frontend.dev.log 2>&1'
sleep 2
curl -fsS http://localhost:4000/health
curl -fsSI http://localhost:4173/ | sed -n '1,5p'
```

Expected:

- Health returns `{"ok":true,"service":"luckymarket"}`.
- Frontend returns `HTTP/1.1 200 OK`.

- [ ] **Step 5: Commit docs and verification updates**

```bash
git add README.md frontend/README.md docs/superpowers/specs/2026-06-16-company-event-market-loop-design.md
git commit -m "docs: document company event loop runtime"
```

If no doc files changed, skip the commit and record that no docs update was necessary.

---

## Self-Review

Spec coverage:

- World events: Task 1.
- Feishu Attendance as first adapter: Task 6.
- Manual admin event fallback: Task 5 via `POST /world-events`.
- Semi-automatic market binding: Task 2 and Task 5.
- Event-to-agent queue: Task 3 and Task 7.
- Agent event context and attendance decisioning: Task 4.
- Price movement through normal trades: Task 4 uses `MarketService.placeTrade`.
- Explainability on market page: Task 8.
- Privacy constraint to sync only active binding subjects: Task 6.
- Failure handling for sync: Task 6.
- Verification and docs: Task 9.

Known intentional limits:

- Real Feishu attendance monthly metric mapping is isolated behind `FeishuHttpAttendanceClient` and requires tenant-specific configuration before production sync. The closed loop remains testable with fake client and manual events.
- LLM-backed binding suggestions are not implemented in this first plan because the approved design requires the loop to work without model provider configuration. Deterministic suggestions cover the Wang Ge attendance case.

Placeholder scan:

- No placeholder markers or undefined task placeholders are intentionally present.

Type consistency:

- `WorldEvent`, `MarketEventBinding`, and `AgentEventQueueItem` are defined in `src/domain/types.ts` before downstream tasks consume them.
- `wakeAgent(accountId, options)` is introduced in Task 3 and used by Task 4.
- Frontend `WorldEvent` and `MarketEventBinding` mirror backend JSON shape.
