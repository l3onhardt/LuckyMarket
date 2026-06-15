import { unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestDb } from './helpers.js';
import { inTransaction, openDatabase } from '../src/db/connection.js';
import { newId } from '../src/services/ids.js';

const expectedTables = [
  'accounts',
  'ledger_entries',
  'markets',
  'market_outcomes',
  'trades',
  'positions',
  'market_price_snapshots',
  'activities',
  'agent_profiles',
  'agent_memories',
  'agent_wake_runs',
  'agent_actions',
  'company_facts'
];

function insertAccount(db: ReturnType<typeof createTestDb>, id: string): void {
  db.prepare(
    `INSERT INTO accounts (
      id, kind, handle, display_name, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, 'human', id, `${id} User`, 'active', new Date().toISOString());
}

function insertMarket(db: ReturnType<typeof createTestDb>, id: string): void {
  db.prepare(
    `INSERT INTO markets (
      id, title, category, status, close_time, settlement_source,
      liquidity_parameter, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    `${id} title`,
    'engineering',
    'open',
    new Date(Date.now() + 86_400_000).toISOString(),
    'internal',
    100,
    new Date().toISOString()
  );
}

function insertOutcome(db: ReturnType<typeof createTestDb>, id: string, marketId: string): void {
  db.prepare(
    `INSERT INTO market_outcomes (
      id, market_id, label, sort_order, pool_quantity
    ) VALUES (?, ?, ?, ?, ?)`
  ).run(id, marketId, id, 0, 0);
}

function insertMarketFixture(db: ReturnType<typeof createTestDb>): void {
  insertAccount(db, 'acct_schema');
  insertMarket(db, 'market_one');
  insertMarket(db, 'market_two');
  insertOutcome(db, 'outcome_one', 'market_one');
  insertOutcome(db, 'outcome_two', 'market_two');
}

describe('database schema', () => {
  test('creates all core LuckyMarket tables in a test database', () => {
    const db = createTestDb();

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = rows.map((row) => row.name);

    expect(tableNames).toEqual(expect.arrayContaining(expectedTables));
  });

  test('test databases enforce foreign keys', () => {
    const db = createTestDb();

    expect(() => {
      db.prepare(
        `INSERT INTO ledger_entries (
          id, account_id, type, amount, created_at
        ) VALUES (?, ?, ?, ?, ?)`
      ).run('ledger_missing_account', 'missing_account', 'initial_grant', 100, new Date().toISOString());
    }).toThrow();
  });

  test('openDatabase creates schema and transaction helper rolls back on errors', () => {
    const dbPath = join(tmpdir(), `luckymarket-${newId('test')}.sqlite`);
    const db = openDatabase(dbPath);

    expect(() => {
      inTransaction(db, () => {
        db.prepare(
          `INSERT INTO accounts (
            id, kind, handle, display_name, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run('acct_rollback', 'human', 'rollback', 'Rollback User', 'active', new Date().toISOString());
        throw new Error('force rollback');
      });
    }).toThrow('force rollback');

    const account = db.prepare('SELECT id FROM accounts WHERE id = ?').get('acct_rollback');
    expect(account).toBeUndefined();

    db.close();
    unlinkSync(dbPath);
  });

  test('rejects trades that reference an outcome from another market', () => {
    const db = createTestDb();
    insertMarketFixture(db);

    expect(() => {
      db.prepare(
        `INSERT INTO trades (
          id, market_id, outcome_id, account_id, side, shares, points_amount,
          price_before, price_after, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        'trade_cross_market',
        'market_one',
        'outcome_two',
        'acct_schema',
        'buy',
        1,
        50,
        0.5,
        0.55,
        new Date().toISOString()
      );
    }).toThrow();
  });

  test('rejects positions that reference an outcome from another market', () => {
    const db = createTestDb();
    insertMarketFixture(db);

    expect(() => {
      db.prepare(
        `INSERT INTO positions (
          account_id, market_id, outcome_id, shares, updated_at
        ) VALUES (?, ?, ?, ?, ?)`
      ).run('acct_schema', 'market_one', 'outcome_two', 1, new Date().toISOString());
    }).toThrow();
  });

  test('rejects market price snapshots that reference an outcome from another market', () => {
    const db = createTestDb();
    insertMarketFixture(db);

    expect(() => {
      db.prepare(
        `INSERT INTO market_price_snapshots (
          id, market_id, outcome_id, price, created_at
        ) VALUES (?, ?, ?, ?, ?)`
      ).run('snapshot_cross_market', 'market_one', 'outcome_two', 0.5, new Date().toISOString());
    }).toThrow();
  });

  test('rejects market settlement with a winning outcome from another market', () => {
    const db = createTestDb();
    insertMarketFixture(db);

    expect(() => {
      db.prepare(
        `UPDATE markets
        SET status = ?, winning_outcome_id = ?
        WHERE id = ?`
      ).run('settled', 'outcome_two', 'market_one');
    }).toThrow();
  });
});

describe('ID helpers', () => {
  test('generates prefixed compact random IDs', () => {
    const first = newId('acct');
    const second = newId('acct');

    expect(first).toMatch(/^acct_[a-f0-9]{20}$/);
    expect(second).toMatch(/^acct_[a-f0-9]{20}$/);
    expect(first).not.toBe(second);
  });
});
