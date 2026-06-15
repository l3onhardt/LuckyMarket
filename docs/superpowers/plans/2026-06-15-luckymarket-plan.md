# LuckyMarket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable backend for a company-internal Polymarket-style prediction market with platform-only points, real trades, settlement, human users, and low-cost AI agent market participation.

**Architecture:** Implement a TypeScript modular monolith with Fastify HTTP routes, SQLite persistence, isolated market/ledger/agent services, and an in-process scheduler. V1 uses an AMM for always-available liquidity while recording trades, positions, price snapshots, and activity feeds so a future order book can be added without changing frontend concepts.

**Tech Stack:** Node.js, TypeScript, Fastify, better-sqlite3, Zod, Vitest, tsx.

---

## Source Spec

Approved design spec:

- `docs/superpowers/specs/2026-06-15-luckymarket-design.md`

## File Structure

Create these files:

- `package.json`: scripts, dependencies, package metadata.
- `tsconfig.json`: strict TypeScript config.
- `vitest.config.ts`: Vitest config.
- `README.md`: project setup and API handoff notes.
- `src/config.ts`: reads `PORT`, `DATABASE_URL`, scheduler settings.
- `src/domain/errors.ts`: `AppError`, error codes, HTTP mapping.
- `src/domain/types.ts`: domain enums and DTO shapes.
- `src/db/connection.ts`: database factory and transaction helper.
- `src/db/schema.ts`: SQLite schema.
- `src/db/seed.ts`: idempotent demo seed.
- `src/services/ids.ts`: stable ID generation helper.
- `src/services/ledger.ts`: accounts, append-only ledger, balances.
- `src/services/marketMath.ts`: LMSR-style AMM quote and price functions.
- `src/services/markets.ts`: market creation, quote, trade, positions, settlement, snapshots.
- `src/services/agents.ts`: agent profiles, context packets, decision engine, wake runner.
- `src/services/scheduler.ts`: low-concurrency tick orchestration.
- `src/http/routes.ts`: API route registration.
- `src/http/server.ts`: Fastify server factory.
- `src/index.ts`: runtime entrypoint.
- `tests/helpers.ts`: test database and seed helpers.
- `tests/marketMath.test.ts`
- `tests/ledger.test.ts`
- `tests/markets.test.ts`
- `tests/settlement.test.ts`
- `tests/agents.test.ts`
- `tests/api.test.ts`

## Implementation Tasks

### Task 1: Scaffold The TypeScript Backend

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/config.ts`
- Create: `src/domain/errors.ts`
- Create: `src/domain/types.ts`

- [ ] **Step 1: Create package and tool config**

Create `package.json`:

```json
{
  "name": "luckymarket",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "seed": "tsx src/db/seed.ts"
  },
  "dependencies": {
    "@fastify/cors": "^11.0.0",
    "better-sqlite3": "^11.10.0",
    "fastify": "^5.3.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^24.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    clearMocks: true
  }
});
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 3: Create domain basics**

Create `src/domain/errors.ts`:

```ts
export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'MARKET_CLOSED'
  | 'MARKET_NOT_SETTLED'
  | 'MARKET_ALREADY_SETTLED'
  | 'INVALID_OUTCOME'
  | 'AGENT_BUDGET_EXCEEDED'
  | 'EXPOSURE_LIMIT_EXCEEDED';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(message: string): AppError {
  return new AppError('NOT_FOUND', message, 404);
}
```

Create `src/domain/types.ts`:

```ts
export type AccountKind = 'human' | 'agent' | 'system';
export type AccountStatus = 'active' | 'disabled';
export type MarketStatus = 'open' | 'closed' | 'settled';
export type LedgerEntryType =
  | 'initial_grant'
  | 'admin_grant'
  | 'trade_debit'
  | 'trade_credit'
  | 'settlement_payout'
  | 'market_creation_deposit'
  | 'agent_budget_grant';

export interface Account {
  id: string;
  kind: AccountKind;
  handle: string;
  displayName: string;
  status: AccountStatus;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface MarketOutcome {
  id: string;
  marketId: string;
  label: string;
  sortOrder: number;
  poolQuantity: number;
}

export interface Market {
  id: string;
  title: string;
  category: string;
  status: MarketStatus;
  closeTime: string;
  settlementSource: string;
  winningOutcomeId: string | null;
  liquidityParameter: number;
  createdAt: string;
}
```

Create `src/config.ts`:

```ts
export interface AppConfig {
  port: number;
  databaseUrl: string;
  schedulerEnabled: boolean;
  maxAgentsPerTick: number;
}

export function loadConfig(env = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL ?? 'data/luckymarket.sqlite',
    schedulerEnabled: env.SCHEDULER_ENABLED !== 'false',
    maxAgentsPerTick: Number(env.MAX_AGENTS_PER_TICK ?? 3)
  };
}
```

- [ ] **Step 4: Verify scaffold**

Run:

```bash
npm test
npm run build
```

Expected: both commands complete. Vitest may report no tests yet or pass with no test files depending on version; build should pass.

### Task 2: Database Schema And Test Helpers

**Files:**
- Create: `src/db/connection.ts`
- Create: `src/db/schema.ts`
- Create: `src/services/ids.ts`
- Create: `tests/helpers.ts`

- [ ] **Step 1: Write test helper scaffold**

Create `tests/helpers.ts`:

```ts
import Database from 'better-sqlite3';
import { createSchema } from '../src/db/schema.js';
import type { Db } from '../src/db/connection.js';

export function createTestDb(): Db {
  const db = new Database(':memory:');
  createSchema(db);
  return db;
}
```

- [ ] **Step 2: Implement DB types and schema**

Create `src/db/connection.ts`:

```ts
import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createSchema } from './schema.js';

export type Db = Database.Database;

export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

export function inTransaction<T>(db: Db, fn: () => T): T {
  return db.transaction(fn)();
}
```

Create `src/services/ids.ts`:

```ts
import { randomUUID } from 'node:crypto';

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
}
```

Create `src/db/schema.ts` with all tables from the spec:

```ts
import type { Db } from './connection.js';

export function createSchema(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('human', 'agent', 'system')),
      handle TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      last_active_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      memo TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'settled')),
      close_time TEXT NOT NULL,
      settlement_source TEXT NOT NULL,
      winning_outcome_id TEXT,
      liquidity_parameter REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_outcomes (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      pool_quantity REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL REFERENCES markets(id),
      outcome_id TEXT NOT NULL REFERENCES market_outcomes(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      shares REAL NOT NULL,
      points_amount INTEGER NOT NULL,
      price_before REAL NOT NULL,
      price_after REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS positions (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      market_id TEXT NOT NULL REFERENCES markets(id),
      outcome_id TEXT NOT NULL REFERENCES market_outcomes(id),
      shares REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (account_id, market_id, outcome_id)
    );

    CREATE TABLE IF NOT EXISTS market_price_snapshots (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL REFERENCES markets(id),
      outcome_id TEXT NOT NULL REFERENCES market_outcomes(id),
      price REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      market_id TEXT REFERENCES markets(id),
      account_id TEXT REFERENCES accounts(id),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_profiles (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id),
      role TEXT NOT NULL,
      strategy TEXT NOT NULL,
      focus_categories_json TEXT NOT NULL,
      risk_appetite REAL NOT NULL,
      max_trade_points INTEGER NOT NULL,
      max_position_shares REAL NOT NULL,
      wake_interval_minutes INTEGER NOT NULL,
      daily_action_budget INTEGER NOT NULL,
      actions_used_today INTEGER NOT NULL DEFAULT 0,
      next_wake_at TEXT NOT NULL,
      last_wake_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_memories (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id),
      summary TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_wake_runs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      status TEXT NOT NULL,
      context_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_actions (
      id TEXT PRIMARY KEY,
      wake_run_id TEXT NOT NULL REFERENCES agent_wake_runs(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      market_id TEXT REFERENCES markets(id),
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_facts (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      effective_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
```

- [ ] **Step 3: Verify schema build**

Run:

```bash
npm run build
```

Expected: build passes.

### Task 3: Ledger And Accounts

**Files:**
- Create: `tests/ledger.test.ts`
- Create: `src/services/ledger.ts`

- [ ] **Step 1: Write failing ledger tests**

Create `tests/ledger.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createTestDb } from './helpers.js';
import { LedgerService } from '../src/services/ledger.js';
import { AppError } from '../src/domain/errors.js';

describe('LedgerService', () => {
  test('creates human and agent accounts with initial grants', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);

    const human = ledger.createAccount({
      kind: 'human',
      handle: 'wang-ge',
      displayName: '王哥',
      initialPoints: 1000
    });
    const agent = ledger.createAccount({
      kind: 'agent',
      handle: 'hr-data-agent',
      displayName: 'HR Data Agent',
      initialPoints: 2000
    });

    expect(human.kind).toBe('human');
    expect(agent.kind).toBe('agent');
    expect(ledger.getBalance(human.id)).toBe(1000);
    expect(ledger.getBalance(agent.id)).toBe(2000);
  });

  test('debits and credits append ledger rows and derive balance', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'xiao-li',
      displayName: '小李',
      initialPoints: 500
    });

    ledger.debit(account.id, 120, 'trade', 'trade_1', 'buy shares');
    ledger.credit(account.id, 50, 'trade', 'trade_2', 'sell shares');

    expect(ledger.getBalance(account.id)).toBe(430);
    expect(ledger.getLedger(account.id).map((entry) => entry.amount)).toEqual([500, -120, 50]);
  });

  test('rejects debits that would make balance negative', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'xiao-zhao',
      displayName: '小赵',
      initialPoints: 20
    });

    expect(() => ledger.debit(account.id, 21, 'trade', 'trade_3', 'too much')).toThrow(AppError);
    expect(ledger.getBalance(account.id)).toBe(20);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/ledger.test.ts
```

Expected: fail because `src/services/ledger.ts` does not exist.

- [ ] **Step 3: Implement ledger service**

Create `src/services/ledger.ts`:

```ts
import type { Db } from '../db/connection.js';
import { AppError, notFound } from '../domain/errors.js';
import type { Account, AccountKind, LedgerEntryType } from '../domain/types.js';
import { newId } from './ids.js';

export interface CreateAccountInput {
  kind: AccountKind;
  handle: string;
  displayName: string;
  initialPoints?: number;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  type: LedgerEntryType;
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
  memo: string | null;
  createdAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapAccount(row: any): Account {
  return {
    id: row.id,
    kind: row.kind,
    handle: row.handle,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at
  };
}

export class LedgerService {
  constructor(private readonly db: Db) {}

  createAccount(input: CreateAccountInput): Account {
    const createdAt = nowIso();
    const id = newId('acct');
    this.db.prepare(`
      INSERT INTO accounts (id, kind, handle, display_name, status, created_at, last_active_at)
      VALUES (?, ?, ?, ?, 'active', ?, NULL)
    `).run(id, input.kind, input.handle, input.displayName, createdAt);

    const account = this.getAccount(id);
    if ((input.initialPoints ?? 0) > 0) {
      this.appendEntry(account.id, 'initial_grant', input.initialPoints!, 'account', account.id, 'initial points');
    }
    return account;
  }

  getAccount(accountId: string): Account {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!row) throw notFound(`Account not found: ${accountId}`);
    return mapAccount(row);
  }

  listAccounts(): Account[] {
    return this.db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all().map(mapAccount);
  }

  getBalance(accountId: string): number {
    this.getAccount(accountId);
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE account_id = ?
    `).get(accountId) as { balance: number };
    return Number(row.balance);
  }

  credit(accountId: string, amount: number, referenceType: string, referenceId: string, memo: string): LedgerEntry {
    if (amount <= 0) throw new AppError('VALIDATION_ERROR', 'Credit amount must be positive');
    return this.appendEntry(accountId, 'admin_grant', amount, referenceType, referenceId, memo);
  }

  debit(accountId: string, amount: number, referenceType: string, referenceId: string, memo: string): LedgerEntry {
    if (amount <= 0) throw new AppError('VALIDATION_ERROR', 'Debit amount must be positive');
    const balance = this.getBalance(accountId);
    if (balance < amount) {
      throw new AppError('INSUFFICIENT_BALANCE', `Account ${accountId} has ${balance}, needs ${amount}`);
    }
    return this.appendEntry(accountId, 'trade_debit', -amount, referenceType, referenceId, memo);
  }

  appendEntry(
    accountId: string,
    type: LedgerEntryType,
    amount: number,
    referenceType: string | null,
    referenceId: string | null,
    memo: string | null
  ): LedgerEntry {
    this.getAccount(accountId);
    const entry: LedgerEntry = {
      id: newId('ledg'),
      accountId,
      type,
      amount,
      referenceType,
      referenceId,
      memo,
      createdAt: nowIso()
    };
    this.db.prepare(`
      INSERT INTO ledger_entries (id, account_id, type, amount, reference_type, reference_id, memo, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.accountId, entry.type, entry.amount, entry.referenceType, entry.referenceId, entry.memo, entry.createdAt);
    return entry;
  }

  getLedger(accountId: string): LedgerEntry[] {
    this.getAccount(accountId);
    return this.db.prepare(`
      SELECT * FROM ledger_entries WHERE account_id = ? ORDER BY created_at ASC, id ASC
    `).all(accountId).map((row: any) => ({
      id: row.id,
      accountId: row.account_id,
      type: row.type,
      amount: row.amount,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      memo: row.memo,
      createdAt: row.created_at
    }));
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/ledger.test.ts
npm run build
```

Expected: ledger tests and build pass.

### Task 4: AMM Market Math

**Files:**
- Create: `tests/marketMath.test.ts`
- Create: `src/services/marketMath.ts`

- [ ] **Step 1: Write failing market math tests**

Create `tests/marketMath.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { getLmsrPrices, quoteLmsrTrade } from '../src/services/marketMath.js';

describe('marketMath', () => {
  test('returns equal prices for equal outcome quantities', () => {
    const prices = getLmsrPrices([0, 0, 0, 0], 100);
    expect(prices).toHaveLength(4);
    prices.forEach((price) => expect(price).toBeCloseTo(25, 6));
    expect(prices.reduce((sum, price) => sum + price, 0)).toBeCloseTo(100, 6);
  });

  test('buy quote has positive cost and raises selected outcome price', () => {
    const quote = quoteLmsrTrade({
      quantities: [0, 0, 0, 0],
      liquidityParameter: 100,
      outcomeIndex: 1,
      shares: 10,
      side: 'buy'
    });

    expect(quote.pointsAmount).toBeGreaterThan(0);
    expect(quote.priceBefore).toBeCloseTo(25, 6);
    expect(quote.priceAfter).toBeGreaterThan(25);
    expect(quote.nextQuantities[1]).toBe(10);
  });

  test('sell quote lowers selected outcome price and returns points', () => {
    const quote = quoteLmsrTrade({
      quantities: [0, 20, 0, 0],
      liquidityParameter: 100,
      outcomeIndex: 1,
      shares: 5,
      side: 'sell'
    });

    expect(quote.pointsAmount).toBeGreaterThan(0);
    expect(quote.priceAfter).toBeLessThan(quote.priceBefore);
    expect(quote.nextQuantities[1]).toBe(15);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/marketMath.test.ts
```

Expected: fail because `marketMath.ts` does not exist.

- [ ] **Step 3: Implement AMM math**

Create `src/services/marketMath.ts`:

```ts
import { AppError } from '../domain/errors.js';

export type TradeSide = 'buy' | 'sell';

export interface LmsrQuoteInput {
  quantities: number[];
  liquidityParameter: number;
  outcomeIndex: number;
  shares: number;
  side: TradeSide;
}

export interface LmsrQuote {
  side: TradeSide;
  outcomeIndex: number;
  shares: number;
  pointsAmount: number;
  priceBefore: number;
  priceAfter: number;
  pricesBefore: number[];
  pricesAfter: number[];
  nextQuantities: number[];
}

function validate(input: LmsrQuoteInput): void {
  if (input.quantities.length < 2) throw new AppError('VALIDATION_ERROR', 'Market must have at least two outcomes');
  if (input.liquidityParameter <= 0) throw new AppError('VALIDATION_ERROR', 'Liquidity parameter must be positive');
  if (input.outcomeIndex < 0 || input.outcomeIndex >= input.quantities.length) throw new AppError('INVALID_OUTCOME', 'Invalid outcome index');
  if (input.shares <= 0) throw new AppError('VALIDATION_ERROR', 'Shares must be positive');
  if (input.side === 'sell' && input.quantities[input.outcomeIndex] - input.shares < 0) {
    throw new AppError('VALIDATION_ERROR', 'AMM quantity cannot go below zero');
  }
}

export function lmsrCost(quantities: number[], liquidityParameter: number): number {
  const scaled = quantities.map((quantity) => quantity / liquidityParameter);
  const max = Math.max(...scaled);
  const sum = scaled.reduce((acc, value) => acc + Math.exp(value - max), 0);
  return liquidityParameter * (Math.log(sum) + max);
}

export function getLmsrPrices(quantities: number[], liquidityParameter: number): number[] {
  if (quantities.length < 2) throw new AppError('VALIDATION_ERROR', 'Market must have at least two outcomes');
  const scaled = quantities.map((quantity) => quantity / liquidityParameter);
  const max = Math.max(...scaled);
  const weights = scaled.map((value) => Math.exp(value - max));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((weight) => (weight / total) * 100);
}

export function quoteLmsrTrade(input: LmsrQuoteInput): LmsrQuote {
  validate(input);
  const pricesBefore = getLmsrPrices(input.quantities, input.liquidityParameter);
  const nextQuantities = [...input.quantities];
  nextQuantities[input.outcomeIndex] += input.side === 'buy' ? input.shares : -input.shares;
  const pricesAfter = getLmsrPrices(nextQuantities, input.liquidityParameter);

  const beforeCost = lmsrCost(input.quantities, input.liquidityParameter);
  const afterCost = lmsrCost(nextQuantities, input.liquidityParameter);
  const rawPoints = input.side === 'buy' ? afterCost - beforeCost : beforeCost - afterCost;

  return {
    side: input.side,
    outcomeIndex: input.outcomeIndex,
    shares: input.shares,
    pointsAmount: Math.max(1, Math.ceil(rawPoints)),
    priceBefore: pricesBefore[input.outcomeIndex],
    priceAfter: pricesAfter[input.outcomeIndex],
    pricesBefore,
    pricesAfter,
    nextQuantities
  };
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/marketMath.test.ts
npm run build
```

Expected: market math tests and build pass.

### Task 5: Market Trading Service

**Files:**
- Create: `tests/markets.test.ts`
- Create: `src/services/markets.ts`
- Modify: `src/services/ledger.ts`

- [ ] **Step 1: Write failing market service tests**

Create `tests/markets.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createTestDb } from './helpers.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';

describe('MarketService trading', () => {
  test('creates a market and quotes all outcome prices', () => {
    const db = createTestDb();
    const markets = new MarketService(db, new LedgerService(db));
    const market = markets.createMarket({
      title: '王哥将在6月休息几天？',
      category: 'attendance',
      closeTime: new Date(Date.now() + 86400000).toISOString(),
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });

    const detail = markets.getMarket(market.id);
    expect(detail.outcomes).toHaveLength(4);
    expect(detail.prices.reduce((sum, item) => sum + item.price, 0)).toBeCloseTo(100, 6);
  });

  test('buy trade debits points, creates position, trade, activity, and moves price', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({ kind: 'human', handle: 'wang-ge', displayName: '王哥', initialPoints: 1000 });
    const market = markets.createMarket({
      title: '王哥将在6月休息几天？',
      category: 'attendance',
      closeTime: new Date(Date.now() + 86400000).toISOString(),
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });
    const outcome = markets.getMarket(market.id).outcomes[1];

    const quote = markets.quoteTrade({ marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 10 });
    const trade = markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 10 });

    expect(trade.pointsAmount).toBe(quote.pointsAmount);
    expect(ledger.getBalance(account.id)).toBe(1000 - quote.pointsAmount);
    expect(markets.getPositions(account.id)).toEqual([
      expect.objectContaining({ marketId: market.id, outcomeId: outcome.id, shares: 10 })
    ]);
    expect(markets.getMarket(market.id).prices.find((item) => item.outcomeId === outcome.id)!.price).toBeGreaterThan(25);
    expect(markets.getActivity(market.id)).toHaveLength(1);
  });

  test('sell trade credits points and lowers position', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({ kind: 'human', handle: 'xiao-li', displayName: '小李', initialPoints: 1000 });
    const market = markets.createMarket({
      title: '需求会不会改第三版？',
      category: 'product',
      closeTime: new Date(Date.now() + 86400000).toISOString(),
      settlementSource: '飞书需求文档',
      outcomes: ['Yes', 'No'],
      liquidityParameter: 100
    });
    const outcome = markets.getMarket(market.id).outcomes[0];

    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 10 });
    const balanceAfterBuy = ledger.getBalance(account.id);
    const sell = markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'sell', shares: 4 });

    expect(ledger.getBalance(account.id)).toBe(balanceAfterBuy + sell.pointsAmount);
    expect(markets.getPositions(account.id)[0].shares).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/markets.test.ts
```

Expected: fail because `src/services/markets.ts` does not exist.

- [ ] **Step 3: Add specific ledger entry helpers**

Modify `src/services/ledger.ts` so trade debits and credits can use correct ledger types:

```ts
  tradeDebit(accountId: string, amount: number, tradeId: string, memo: string): LedgerEntry {
    if (amount <= 0) throw new AppError('VALIDATION_ERROR', 'Trade debit amount must be positive');
    const balance = this.getBalance(accountId);
    if (balance < amount) {
      throw new AppError('INSUFFICIENT_BALANCE', `Account ${accountId} has ${balance}, needs ${amount}`);
    }
    return this.appendEntry(accountId, 'trade_debit', -amount, 'trade', tradeId, memo);
  }

  tradeCredit(accountId: string, amount: number, tradeId: string, memo: string): LedgerEntry {
    if (amount <= 0) throw new AppError('VALIDATION_ERROR', 'Trade credit amount must be positive');
    return this.appendEntry(accountId, 'trade_credit', amount, 'trade', tradeId, memo);
  }
```

Keep existing `credit` and `debit` methods for tests and admin behavior.

- [ ] **Step 4: Implement market service**

Create `src/services/markets.ts` implementing:

```ts
import type { Db } from '../db/connection.js';
import { inTransaction } from '../db/connection.js';
import { AppError, notFound } from '../domain/errors.js';
import type { Market, MarketOutcome } from '../domain/types.js';
import { newId } from './ids.js';
import { LedgerService } from './ledger.js';
import { getLmsrPrices, quoteLmsrTrade, type TradeSide } from './marketMath.js';
```

Required public API:

```ts
export interface CreateMarketInput {
  title: string;
  category: string;
  closeTime: string;
  settlementSource: string;
  outcomes: string[];
  liquidityParameter?: number;
}

export interface TradeInput {
  accountId: string;
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  shares: number;
}

export class MarketService {
  constructor(private readonly db: Db, private readonly ledger: LedgerService) {}

  createMarket(input: CreateMarketInput): Market
  getMarket(marketId: string): MarketDetail
  listMarkets(): MarketDetail[]
  quoteTrade(input: Omit<TradeInput, 'accountId'>): TradeQuote
  placeTrade(input: TradeInput): TradeRecord
  getPositions(accountId: string): PositionRecord[]
  getActivity(marketId: string): ActivityRecord[]
}
```

Implementation requirements:

- Insert market and outcomes.
- Map outcome order to LMSR quantity arrays.
- Reject trades unless market status is `open` and close time is in the future.
- For buy, use `ledger.tradeDebit`.
- For sell, verify user position has enough shares, then use `ledger.tradeCredit`.
- Upsert `positions`.
- Insert `trades`, `activities`, and `market_price_snapshots`.
- Use `inTransaction` around `placeTrade`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/markets.test.ts tests/ledger.test.ts tests/marketMath.test.ts
npm run build
```

Expected: tests and build pass.

### Task 6: Settlement

**Files:**
- Create: `tests/settlement.test.ts`
- Modify: `src/services/markets.ts`
- Modify: `src/services/ledger.ts`

- [ ] **Step 1: Write failing settlement tests**

Create `tests/settlement.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createTestDb } from './helpers.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { AppError } from '../src/domain/errors.js';

describe('market settlement', () => {
  test('settles winning positions at 100 points per share', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const user = ledger.createAccount({ kind: 'human', handle: 'wang-ge', displayName: '王哥', initialPoints: 1000 });
    const market = markets.createMarket({
      title: '王哥将在6月休息几天？',
      category: 'attendance',
      closeTime: new Date(Date.now() + 1000).toISOString(),
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });
    const winning = markets.getMarket(market.id).outcomes[1];
    markets.placeTrade({ accountId: user.id, marketId: market.id, outcomeId: winning.id, side: 'buy', shares: 3 });
    const beforeSettlement = ledger.getBalance(user.id);

    markets.closeMarket(market.id);
    const settled = markets.settleMarket(market.id, winning.id);

    expect(settled.status).toBe('settled');
    expect(ledger.getBalance(user.id)).toBe(beforeSettlement + 300);
  });

  test('prevents trades after market close', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const user = ledger.createAccount({ kind: 'human', handle: 'xiao-zhao', displayName: '小赵', initialPoints: 1000 });
    const market = markets.createMarket({
      title: '下午茶会不会成团？',
      category: 'office',
      closeTime: new Date(Date.now() + 1000).toISOString(),
      settlementSource: '群公告',
      outcomes: ['Yes', 'No'],
      liquidityParameter: 100
    });
    const outcome = markets.getMarket(market.id).outcomes[0];

    markets.closeMarket(market.id);

    expect(() => markets.placeTrade({ accountId: user.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 1 })).toThrow(AppError);
  });

  test('rejects duplicate settlement', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const market = markets.createMarket({
      title: '需求会不会改第三版？',
      category: 'product',
      closeTime: new Date(Date.now() + 1000).toISOString(),
      settlementSource: '需求文档',
      outcomes: ['Yes', 'No'],
      liquidityParameter: 100
    });
    const outcome = markets.getMarket(market.id).outcomes[0];

    markets.closeMarket(market.id);
    markets.settleMarket(market.id, outcome.id);

    expect(() => markets.settleMarket(market.id, outcome.id)).toThrow(AppError);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/settlement.test.ts
```

Expected: fail because `closeMarket` and `settleMarket` are missing.

- [ ] **Step 3: Add settlement payout helper**

Modify `src/services/ledger.ts`:

```ts
  settlementPayout(accountId: string, amount: number, marketId: string, memo: string): LedgerEntry {
    if (amount <= 0) throw new AppError('VALIDATION_ERROR', 'Settlement payout must be positive');
    return this.appendEntry(accountId, 'settlement_payout', amount, 'market', marketId, memo);
  }
```

- [ ] **Step 4: Implement settlement behavior**

Modify `src/services/markets.ts`:

- Add `closeMarket(marketId: string): MarketDetail`.
- Add `settleMarket(marketId: string, winningOutcomeId: string): MarketDetail`.
- `closeMarket` changes status from `open` to `closed`.
- `settleMarket` accepts `open` or `closed`, verifies winning outcome belongs to market, rejects already settled markets, updates status and `winning_outcome_id`.
- Settlement loops over positions for the winning outcome and pays `Math.round(shares * 100)` points.
- Insert settlement activity.
- Use a transaction.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/settlement.test.ts tests/markets.test.ts tests/ledger.test.ts
npm run build
```

Expected: tests and build pass.

### Task 7: AI Agent Service

**Files:**
- Create: `tests/agents.test.ts`
- Create: `src/services/agents.ts`

- [ ] **Step 1: Write failing agent tests**

Create `tests/agents.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createTestDb } from './helpers.js';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { AgentService } from '../src/services/agents.js';

describe('AgentService', () => {
  test('creates an agent profile with memory and due wake time', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const agents = new AgentService(db, ledger, new MarketService(db, ledger));
    const account = ledger.createAccount({ kind: 'agent', handle: 'hr-data-agent', displayName: 'HR Data Agent', initialPoints: 1000 });

    agents.createAgentProfile({
      accountId: account.id,
      role: 'HR Data',
      strategy: 'data_value',
      focusCategories: ['attendance'],
      riskAppetite: 0.4,
      maxTradePoints: 120,
      maxPositionShares: 40,
      wakeIntervalMinutes: 30,
      dailyActionBudget: 5,
      memorySummary: '王哥上月休息2天，月底可能调休。',
      nextWakeAt: new Date(Date.now() - 1000).toISOString()
    });

    expect(agents.getDueAgents(new Date().toISOString(), 3)).toHaveLength(1);
  });

  test('wakes due agent and records a bounded action', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const agents = new AgentService(db, ledger, markets);
    const account = ledger.createAccount({ kind: 'agent', handle: 'trend-agent', displayName: 'Trend Agent', initialPoints: 1000 });
    agents.createAgentProfile({
      accountId: account.id,
      role: 'Trend Trader',
      strategy: 'trend',
      focusCategories: ['attendance'],
      riskAppetite: 0.8,
      maxTradePoints: 150,
      maxPositionShares: 50,
      wakeIntervalMinutes: 30,
      dailyActionBudget: 3,
      memorySummary: '偏向追随近期价格变化。',
      nextWakeAt: new Date(Date.now() - 1000).toISOString()
    });
    const market = markets.createMarket({
      title: '王哥将在6月休息几天？',
      category: 'attendance',
      closeTime: new Date(Date.now() + 86400000).toISOString(),
      settlementSource: '公司考勤记录',
      outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
      liquidityParameter: 100
    });

    const result = agents.wakeAgent(account.id);

    expect(result.accountId).toBe(account.id);
    expect(result.actions.length).toBeGreaterThanOrEqual(1);
    expect(agents.getAgent(account.id).actionsUsedToday).toBe(1);
    expect(markets.getActivity(market.id).some((item) => item.type.startsWith('agent_'))).toBe(true);
  });

  test('does not wake an agent beyond daily action budget', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const agents = new AgentService(db, ledger, markets);
    const account = ledger.createAccount({ kind: 'agent', handle: 'contrarian-agent', displayName: 'Contrarian Agent', initialPoints: 1000 });
    agents.createAgentProfile({
      accountId: account.id,
      role: 'Contrarian',
      strategy: 'contrarian',
      focusCategories: ['attendance'],
      riskAppetite: 0.6,
      maxTradePoints: 100,
      maxPositionShares: 20,
      wakeIntervalMinutes: 30,
      dailyActionBudget: 1,
      memorySummary: '喜欢反热门。',
      nextWakeAt: new Date(Date.now() - 1000).toISOString()
    });

    agents.wakeAgent(account.id);
    const second = agents.wakeAgent(account.id);

    expect(second.actions).toEqual([expect.objectContaining({ type: 'skip' })]);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/agents.test.ts
```

Expected: fail because `src/services/agents.ts` does not exist.

- [ ] **Step 3: Implement agent service**

Create `src/services/agents.ts` with:

- `createAgentProfile(input)`.
- `getAgent(accountId)`.
- `listAgents()`.
- `getDueAgents(nowIso, limit)`.
- `buildContextPacket(accountId)`.
- `wakeAgent(accountId)`.

Decision requirements:

- If action budget is exhausted, record a `skip`.
- Pick the first open market matching the agent focus category.
- Estimate fair probabilities deterministically:
  - `data_value`: prefer the second outcome for attendance markets.
  - `trend`: prefer the currently highest-priced outcome.
  - `contrarian`: prefer the currently lowest-priced outcome.
  - `market_maker`: prefer whichever outcome is closest to equal probability.
- If edge is at least 3 points and budget allows, place a small buy trade capped by `maxTradePoints`.
- Otherwise write a short signal.
- Insert `agent_wake_runs` and `agent_actions`.
- Insert `activities` through a helper in `MarketService` or direct insert with type `agent_trade`, `agent_signal`, or `agent_skip`.
- Increment `actions_used_today` and set `next_wake_at`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/agents.test.ts tests/markets.test.ts tests/ledger.test.ts
npm run build
```

Expected: tests and build pass.

### Task 8: Scheduler

**Files:**
- Create: `src/services/scheduler.ts`
- Modify: `tests/agents.test.ts`

- [ ] **Step 1: Add scheduler test**

Append to `tests/agents.test.ts`:

```ts
import { SchedulerService } from '../src/services/scheduler.js';

test('scheduler tick wakes only a bounded number of due agents', () => {
  const db = createTestDb();
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);
  for (const handle of ['a1', 'a2', 'a3']) {
    const account = ledger.createAccount({ kind: 'agent', handle, displayName: handle, initialPoints: 1000 });
    agents.createAgentProfile({
      accountId: account.id,
      role: handle,
      strategy: 'trend',
      focusCategories: ['attendance'],
      riskAppetite: 0.5,
      maxTradePoints: 50,
      maxPositionShares: 20,
      wakeIntervalMinutes: 30,
      dailyActionBudget: 2,
      memorySummary: 'test',
      nextWakeAt: new Date(Date.now() - 1000).toISOString()
    });
  }

  const scheduler = new SchedulerService(agents, { maxAgentsPerTick: 2 });
  const result = scheduler.tick(new Date().toISOString());

  expect(result.wokenAgents).toHaveLength(2);
  expect(result.skippedDueAgents).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/agents.test.ts
```

Expected: fail because `SchedulerService` does not exist.

- [ ] **Step 3: Implement scheduler**

Create `src/services/scheduler.ts`:

```ts
import { AgentService } from './agents.js';

export interface SchedulerConfig {
  maxAgentsPerTick: number;
}

export interface SchedulerTickResult {
  now: string;
  wokenAgents: string[];
  skippedDueAgents: number;
}

export class SchedulerService {
  constructor(
    private readonly agents: AgentService,
    private readonly config: SchedulerConfig
  ) {}

  tick(nowIso = new Date().toISOString()): SchedulerTickResult {
    const due = this.agents.getDueAgents(nowIso, this.config.maxAgentsPerTick + 1);
    const toWake = due.slice(0, this.config.maxAgentsPerTick);
    for (const agent of toWake) {
      this.agents.wakeAgent(agent.accountId);
    }
    return {
      now: nowIso,
      wokenAgents: toWake.map((agent) => agent.accountId),
      skippedDueAgents: Math.max(0, due.length - toWake.length)
    };
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/agents.test.ts
npm run build
```

Expected: tests and build pass.

### Task 9: Seed Data

**Files:**
- Create: `src/db/seed.ts`
- Modify: `tests/helpers.ts`

- [ ] **Step 1: Add seed helper test**

Append to `tests/helpers.ts`:

```ts
export async function seedDemoDataForTest(db: Db) {
  const { seedDemoData } = await import('../src/db/seed.js');
  return seedDemoData(db);
}
```

Add a seed assertion to `tests/api.test.ts` in Task 10, so this task can be verified through API tests.

- [ ] **Step 2: Implement idempotent seed**

Create `src/db/seed.ts`:

```ts
import { loadConfig } from '../config.js';
import { openDatabase, type Db } from './connection.js';
import { LedgerService } from '../services/ledger.js';
import { MarketService } from '../services/markets.js';
import { AgentService } from '../services/agents.js';

export function seedDemoData(db: Db) {
  const ledger = new LedgerService(db);
  const markets = new MarketService(db, ledger);
  const agents = new AgentService(db, ledger, markets);

  if (ledger.listAccounts().length > 0) {
    return { skipped: true };
  }

  const humans = [
    ledger.createAccount({ kind: 'human', handle: 'admin', displayName: 'Admin', initialPoints: 5000 }),
    ledger.createAccount({ kind: 'human', handle: 'wang-ge', displayName: '王哥', initialPoints: 2000 }),
    ledger.createAccount({ kind: 'human', handle: 'xiao-li', displayName: '小李', initialPoints: 2000 }),
    ledger.createAccount({ kind: 'human', handle: 'xiao-zhao', displayName: '小赵', initialPoints: 2000 })
  ];

  const agentInputs = [
    ['hr-data-agent', 'HR Data Agent', 'HR Data', 'data_value', '王哥上月休息2天，月底可能调休。'],
    ['boss-view-agent', 'Boss View Agent', 'Boss View', 'data_value', '项目节点紧时连续休息概率偏低。'],
    ['engineer-reality-agent', 'Engineer Reality Agent', 'Engineer Reality', 'contrarian', '研发排期常有临时变化。'],
    ['trend-agent', 'Trend Agent', 'Trend Trader', 'trend', '追随价格趋势但会控制仓位。'],
    ['contrarian-agent', 'Contrarian Agent', 'Contrarian', 'contrarian', '专门寻找热门结果的反向机会。'],
    ['market-maker-agent', 'Market Maker Agent', 'Market Maker', 'market_maker', '负责提供轻量流动性。']
  ] as const;

  const agentAccounts = agentInputs.map(([handle, displayName, role, strategy, memory]) => {
    const account = ledger.createAccount({ kind: 'agent', handle, displayName, initialPoints: 3000 });
    agents.createAgentProfile({
      accountId: account.id,
      role,
      strategy,
      focusCategories: ['attendance', 'product', 'office'],
      riskAppetite: 0.5,
      maxTradePoints: 120,
      maxPositionShares: 50,
      wakeIntervalMinutes: 45,
      dailyActionBudget: 8,
      memorySummary: memory,
      nextWakeAt: new Date(Date.now() - 1000).toISOString()
    });
    return account;
  });

  const closeTime = new Date(Date.now() + 14 * 86400000).toISOString();
  const mainMarket = markets.createMarket({
    title: '王哥将在6月休息几天？',
    category: 'attendance',
    closeTime,
    settlementSource: '公司考勤记录',
    outcomes: ['0-1天', '2-3天', '4-5天', '6天以上'],
    liquidityParameter: 100
  });

  markets.createMarket({
    title: '本周需求会不会改第三版？',
    category: 'product',
    closeTime,
    settlementSource: '需求文档版本记录',
    outcomes: ['Yes', 'No'],
    liquidityParameter: 100
  });

  markets.createMarket({
    title: '今天下午茶会不会成团？',
    category: 'office',
    closeTime,
    settlementSource: '群接龙记录',
    outcomes: ['Yes', 'No'],
    liquidityParameter: 100
  });

  return { skipped: false, humans, agentAccounts, mainMarket };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDatabase(loadConfig().databaseUrl);
  const result = seedDemoData(db);
  console.log(JSON.stringify(result, null, 2));
}
```

- [ ] **Step 3: Verify build**

Run:

```bash
npm run build
```

Expected: build passes.

### Task 10: HTTP API

**Files:**
- Create: `tests/api.test.ts`
- Create: `src/http/server.ts`
- Create: `src/http/routes.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Write failing API tests**

Create `tests/api.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createTestDb } from './helpers.js';
import { buildServer } from '../src/http/server.js';
import { seedDemoData } from '../src/db/seed.js';

describe('HTTP API', () => {
  test('serves health and seeded market list', async () => {
    const db = createTestDb();
    seedDemoData(db);
    const app = buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ ok: true, service: 'luckymarket' });

    const markets = await app.inject({ method: 'GET', url: '/markets' });
    expect(markets.statusCode).toBe(200);
    expect(markets.json().markets.length).toBeGreaterThanOrEqual(3);
  });

  test('quotes and places a trade through API', async () => {
    const db = createTestDb();
    seedDemoData(db);
    const app = buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    const marketsResponse = await app.inject({ method: 'GET', url: '/markets' });
    const market = marketsResponse.json().markets[0];
    const accountResponse = await app.inject({ method: 'GET', url: '/accounts/handle/wang-ge' });
    const account = accountResponse.json().account;
    const outcome = market.outcomes[1];

    const quote = await app.inject({
      method: 'POST',
      url: `/markets/${market.id}/quote`,
      payload: { outcomeId: outcome.id, side: 'buy', shares: 2 }
    });
    expect(quote.statusCode).toBe(200);
    expect(quote.json().quote.pointsAmount).toBeGreaterThan(0);

    const trade = await app.inject({
      method: 'POST',
      url: `/markets/${market.id}/trades`,
      payload: { accountId: account.id, outcomeId: outcome.id, side: 'buy', shares: 2 }
    });
    expect(trade.statusCode).toBe(200);
    expect(trade.json().trade.shares).toBe(2);
  });

  test('scheduler tick endpoint wakes bounded agents', async () => {
    const db = createTestDb();
    seedDemoData(db);
    const app = buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });

    const response = await app.inject({ method: 'POST', url: '/scheduler/tick' });

    expect(response.statusCode).toBe(200);
    expect(response.json().result.wokenAgents.length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- tests/api.test.ts
```

Expected: fail because HTTP server files do not exist.

- [ ] **Step 3: Implement server factory**

Create `src/http/server.ts`:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Db } from '../db/connection.js';
import { registerRoutes } from './routes.js';
import { AppError } from '../domain/errors.js';

export interface BuildServerOptions {
  db: Db;
  schedulerEnabled: boolean;
  maxAgentsPerTick: number;
}

export function buildServer(options: BuildServerOptions) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });
  registerRoutes(app, options);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }
    reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: error.message } });
  });

  return app;
}
```

- [ ] **Step 4: Implement routes**

Create `src/http/routes.ts` with routes listed in the spec:

- `GET /health`
- `GET /accounts`
- `POST /accounts`
- `GET /accounts/handle/:handle`
- `GET /accounts/:id`
- `GET /accounts/:id/ledger`
- `GET /accounts/:id/positions`
- `GET /markets`
- `POST /markets`
- `GET /markets/:id`
- `POST /markets/:id/quote`
- `POST /markets/:id/trades`
- `POST /markets/:id/close`
- `POST /markets/:id/settle`
- `GET /markets/:id/activity`
- `GET /agents`
- `GET /agents/:id`
- `POST /agents/:id/wake`
- `POST /scheduler/tick`
- `POST /seed/demo`

Use Zod schemas for request bodies. Each route should instantiate `LedgerService`, `MarketService`, `AgentService`, and `SchedulerService` with the shared DB.

- [ ] **Step 5: Implement entrypoint**

Create `src/index.ts`:

```ts
import { loadConfig } from './config.js';
import { openDatabase } from './db/connection.js';
import { buildServer } from './http/server.js';

const config = loadConfig();
const db = openDatabase(config.databaseUrl);
const app = buildServer({
  db,
  schedulerEnabled: config.schedulerEnabled,
  maxAgentsPerTick: config.maxAgentsPerTick
});

await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`LuckyMarket backend listening on http://localhost:${config.port}`);
```

- [ ] **Step 6: Verify GREEN**

Run:

```bash
npm test -- tests/api.test.ts
npm test
npm run build
```

Expected: API test, full suite, and build pass.

### Task 11: README And Frontend Handoff

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md` with:

```md
# LuckyMarket

LuckyMarket project for a company-internal prediction market with platform-only points, AMM trading, human accounts, and low-cost AI agent participants.

## Scripts

- `npm install`
- `npm test`
- `npm run build`
- `npm run seed`
- `npm run dev`

## Runtime

Default server:

- URL: `http://localhost:4000`
- Database: `data/luckymarket.sqlite`

Environment:

- `PORT=4000`
- `DATABASE_URL=data/luckymarket.sqlite`
- `SCHEDULER_ENABLED=true`
- `MAX_AGENTS_PER_TICK=3`

## API Highlights

- `GET /health`
- `GET /markets`
- `GET /markets/:id`
- `POST /markets/:id/quote`
- `POST /markets/:id/trades`
- `GET /accounts/:id/positions`
- `GET /agents`
- `POST /scheduler/tick`
- `POST /seed/demo`

## Product Rules

Points are internal game points only. They cannot be redeemed for money, goods, gifts, or real-world value.

AI agents are always labeled as agents. They share the same points, trades, positions, and settlement rules as humans.

## Frontend Handoff

The frontend should treat markets as Polymarket-style cards and detail pages. Use market prices for probabilities, activity for recent trades and agent signals, positions for portfolio views, and agent endpoints for Human vs AI modules.
```

- [ ] **Step 2: Final verification**

Run:

```bash
npm test
npm run build
npm run seed
```

Expected: tests pass, build passes, seed creates demo data.

- [ ] **Step 3: Start backend for handoff**

Run:

```bash
npm run dev
```

Expected: backend listens on `http://localhost:4000`.

In another terminal or via HTTP client, verify:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/markets
```

Expected: health returns `{ "ok": true, "service": "luckymarket" }`; markets returns seeded markets after `POST /seed/demo` or `npm run seed`.

## Plan Self-Review

- Spec coverage: The plan covers the backend V1 phase, modular monolith architecture, AMM market engine, append-only points ledger, accounts, AI task-agent model, scheduler, API surface, seed data, and tests.
- Placeholder scan: No task depends on undefined future frontend work. The only future upgrade references are explicitly non-V1, such as order book migration and optional LLM hooks.
- Type consistency: Core service names are stable across tests and implementation tasks: `LedgerService`, `MarketService`, `AgentService`, and `SchedulerService`.
- Scope check: This is large but cohesive as one backend V1 because market, ledger, settlement, and agents must integrate to produce working software. Frontend remains separate.
