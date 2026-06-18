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
      created_at TEXT NOT NULL,
      FOREIGN KEY (id, winning_outcome_id) REFERENCES market_outcomes(market_id, id)
    );

    CREATE TABLE IF NOT EXISTS market_outcomes (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      pool_quantity REAL NOT NULL DEFAULT 0,
      UNIQUE (market_id, id)
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
      created_at TEXT NOT NULL,
      FOREIGN KEY (market_id, outcome_id) REFERENCES market_outcomes(market_id, id)
    );

    CREATE TABLE IF NOT EXISTS positions (
      account_id TEXT NOT NULL REFERENCES accounts(id),
      market_id TEXT NOT NULL REFERENCES markets(id),
      outcome_id TEXT NOT NULL REFERENCES market_outcomes(id),
      shares REAL NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (account_id, market_id, outcome_id),
      FOREIGN KEY (market_id, outcome_id) REFERENCES market_outcomes(market_id, id)
    );

    CREATE TABLE IF NOT EXISTS market_price_snapshots (
      id TEXT PRIMARY KEY,
      market_id TEXT NOT NULL REFERENCES markets(id),
      outcome_id TEXT NOT NULL REFERENCES market_outcomes(id),
      price REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (market_id, outcome_id) REFERENCES market_outcomes(market_id, id)
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
  `);
}
