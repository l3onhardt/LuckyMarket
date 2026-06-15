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

interface AccountRow {
  id: string;
  kind: AccountKind;
  handle: string;
  display_name: string;
  status: Account['status'];
  created_at: string;
  last_active_at: string | null;
}

interface LedgerEntryRow {
  id: string;
  account_id: string;
  type: LedgerEntryType;
  amount: number;
  reference_type: string | null;
  reference_id: string | null;
  memo: string | null;
  created_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requireIntegerPoints(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new AppError('VALIDATION_ERROR', `${label} must be an integer`);
  }
}

function requirePositiveIntegerPoints(value: number, label: string): void {
  requireIntegerPoints(value, label);
  if (value <= 0) {
    throw new AppError('VALIDATION_ERROR', `${label} must be positive`);
  }
}

function mapAccount(row: AccountRow): Account {
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

function mapLedgerEntry(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    amount: row.amount,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    memo: row.memo,
    createdAt: row.created_at
  };
}

export class LedgerService {
  constructor(private readonly db: Db) {}

  createAccount(input: CreateAccountInput): Account {
    const initialPoints = input.initialPoints ?? 0;
    requireIntegerPoints(initialPoints, 'Initial points');
    if (initialPoints < 0) {
      throw new AppError('VALIDATION_ERROR', 'Initial points cannot be negative');
    }

    const id = newId('acct');
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO accounts (
          id, kind, handle, display_name, status, created_at, last_active_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, input.kind, input.handle, input.displayName, 'active', createdAt, null);

    const account = this.getAccount(id);
    if (initialPoints > 0) {
      this.appendEntry(account.id, 'initial_grant', initialPoints, 'account', account.id, 'initial points');
    }

    return account;
  }

  getAccount(accountId: string): Account {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as AccountRow | undefined;
    if (!row) {
      throw notFound(`Account not found: ${accountId}`);
    }

    return mapAccount(row);
  }

  getAccountByHandle(handle: string): Account {
    const row = this.db.prepare('SELECT * FROM accounts WHERE handle = ?').get(handle) as AccountRow | undefined;
    if (!row) {
      throw notFound(`Account not found: ${handle}`);
    }

    return mapAccount(row);
  }

  listAccounts(): Account[] {
    const rows = this.db.prepare('SELECT * FROM accounts ORDER BY created_at ASC, id ASC').all() as AccountRow[];
    return rows.map(mapAccount);
  }

  getBalance(accountId: string): number {
    this.getAccount(accountId);
    const row = this.db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE account_id = ?')
      .get(accountId) as { balance: number };

    return Number(row.balance);
  }

  credit(accountId: string, amount: number, referenceType: string, referenceId: string, memo: string): LedgerEntry {
    requirePositiveIntegerPoints(amount, 'Credit amount');

    return this.appendEntry(accountId, 'admin_grant', amount, referenceType, referenceId, memo);
  }

  debit(accountId: string, amount: number, referenceType: string, referenceId: string, memo: string): LedgerEntry {
    requirePositiveIntegerPoints(amount, 'Debit amount');

    const balance = this.getBalance(accountId);
    if (balance < amount) {
      throw new AppError('INSUFFICIENT_BALANCE', `Account ${accountId} has ${balance}, needs ${amount}`);
    }

    return this.appendEntry(accountId, 'trade_debit', -amount, referenceType, referenceId, memo);
  }

  tradeDebit(accountId: string, amount: number, tradeId: string, memo: string): LedgerEntry {
    requirePositiveIntegerPoints(amount, 'Trade debit amount');

    const balance = this.getBalance(accountId);
    if (balance < amount) {
      throw new AppError('INSUFFICIENT_BALANCE', `Account ${accountId} has ${balance}, needs ${amount}`);
    }

    return this.appendEntry(accountId, 'trade_debit', -amount, 'trade', tradeId, memo);
  }

  tradeCredit(accountId: string, amount: number, tradeId: string, memo: string): LedgerEntry {
    requirePositiveIntegerPoints(amount, 'Trade credit amount');

    return this.appendEntry(accountId, 'trade_credit', amount, 'trade', tradeId, memo);
  }

  settlementPayout(accountId: string, amount: number, marketId: string, memo: string): LedgerEntry {
    requirePositiveIntegerPoints(amount, 'Settlement payout');

    return this.appendEntry(accountId, 'settlement_payout', amount, 'market', marketId, memo);
  }

  appendEntry(
    accountId: string,
    type: LedgerEntryType,
    amount: number,
    referenceType: string | null,
    referenceId: string | null,
    memo: string | null
  ): LedgerEntry {
    requireIntegerPoints(amount, 'Ledger entry amount');
    this.getAccount(accountId);
    if (amount < 0) {
      const balance = this.getBalance(accountId);
      const needed = Math.abs(amount);
      if (balance < needed) {
        throw new AppError('INSUFFICIENT_BALANCE', `Account ${accountId} has ${balance}, needs ${needed}`);
      }
    }

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

    this.db
      .prepare(
        `INSERT INTO ledger_entries (
          id, account_id, type, amount, reference_type, reference_id, memo, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.id,
        entry.accountId,
        entry.type,
        entry.amount,
        entry.referenceType,
        entry.referenceId,
        entry.memo,
        entry.createdAt
      );

    return entry;
  }

  getLedger(accountId: string): LedgerEntry[] {
    this.getAccount(accountId);
    const rows = this.db
      .prepare('SELECT * FROM ledger_entries WHERE account_id = ? ORDER BY rowid ASC')
      .all(accountId) as LedgerEntryRow[];

    return rows.map(mapLedgerEntry);
  }
}
