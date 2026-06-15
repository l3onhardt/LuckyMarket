import { describe, expect, test } from 'vitest';
import { AppError } from '../src/domain/errors.js';
import { LedgerService } from '../src/services/ledger.js';
import { createTestDb } from './helpers.js';

describe('LedgerService', () => {
  test('creates human and agent accounts with initial grants', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);

    const human = ledger.createAccount({
      kind: 'human',
      handle: 'wang-ge',
      displayName: 'Wang Ge',
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
    expect(ledger.getLedger(human.id)).toMatchObject([
      { accountId: human.id, type: 'initial_grant', amount: 1000 }
    ]);
    expect(ledger.getLedger(agent.id)).toMatchObject([
      { accountId: agent.id, type: 'initial_grant', amount: 2000 }
    ]);
  });

  test('rejects fractional initial points without creating an account', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);

    expect(() =>
      ledger.createAccount({
        kind: 'human',
        handle: 'fractional-human',
        displayName: 'Fractional Human',
        initialPoints: 10.5
      })
    ).toThrow(AppError);

    expect(ledger.listAccounts()).toEqual([]);
    expect(db.prepare('SELECT * FROM ledger_entries').all()).toEqual([]);
  });

  test('debits and credits append ledger rows and derive balance', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'xiao-li',
      displayName: 'Xiao Li',
      initialPoints: 500
    });

    ledger.debit(account.id, 120, 'trade', 'trade_1', 'buy shares');
    ledger.credit(account.id, 50, 'trade', 'trade_2', 'sell shares');

    const entries = ledger.getLedger(account.id);
    expect(ledger.getBalance(account.id)).toBe(430);
    expect(entries.map((entry) => entry.amount)).toEqual([500, -120, 50]);
    expect(entries.map((entry) => entry.type)).toEqual(['initial_grant', 'trade_debit', 'admin_grant']);
  });

  test('rejects fractional ledger amounts without appending entries', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'integer-only-human',
      displayName: 'Integer Only Human',
      initialPoints: 100
    });

    expect(() => ledger.credit(account.id, 1.5, 'admin', 'grant_1', 'fractional grant')).toThrow(AppError);
    expect(() => ledger.debit(account.id, 2.5, 'trade', 'trade_1', 'fractional debit')).toThrow(AppError);
    expect(() => ledger.tradeDebit(account.id, 3.5, 'trade_2', 'fractional trade debit')).toThrow(AppError);
    expect(() => ledger.tradeCredit(account.id, 4.5, 'trade_3', 'fractional trade credit')).toThrow(AppError);
    expect(() => ledger.settlementPayout(account.id, 5.5, 'market_1', 'fractional payout')).toThrow(AppError);
    expect(() => ledger.appendEntry(account.id, 'trade_credit', 6.5, 'trade', 'trade_4', 'fractional append')).toThrow(
      AppError
    );

    expect(ledger.getBalance(account.id)).toBe(100);
    expect(ledger.getLedger(account.id).map((entry) => entry.amount)).toEqual([100]);
  });

  test('append-only ledger derives balances from every entry', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const account = ledger.createAccount({
      kind: 'agent',
      handle: 'trend-agent',
      displayName: 'Trend Agent',
      initialPoints: 0
    });

    ledger.appendEntry(account.id, 'agent_budget_grant', 300, 'agent', account.id, 'daily budget');
    ledger.appendEntry(account.id, 'trade_debit', -75, 'trade', 'trade_3', 'buy shares');
    ledger.appendEntry(account.id, 'trade_credit', 20, 'trade', 'trade_4', 'sell shares');

    expect(ledger.getBalance(account.id)).toBe(245);
    expect(ledger.getLedger(account.id).map((entry) => entry.amount)).toEqual([300, -75, 20]);
  });

  test('rejects debits that would make balance negative', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const account = ledger.createAccount({
      kind: 'human',
      handle: 'xiao-zhao',
      displayName: 'Xiao Zhao',
      initialPoints: 20
    });

    expect(() => ledger.debit(account.id, 21, 'trade', 'trade_5', 'too much')).toThrow(AppError);
    expect(() => ledger.debit(account.id, 21, 'trade', 'trade_5', 'too much')).toThrow('has 20, needs 21');
    expect(ledger.getBalance(account.id)).toBe(20);
    expect(ledger.getLedger(account.id).map((entry) => entry.amount)).toEqual([20]);
  });

  test('rejects direct negative ledger entries that would overdraw an account', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const account = ledger.createAccount({
      kind: 'agent',
      handle: 'contrarian-agent',
      displayName: 'Contrarian Agent',
      initialPoints: 10
    });

    expect(() => {
      ledger.appendEntry(account.id, 'trade_debit', -11, 'trade', 'trade_6', 'direct append');
    }).toThrow(AppError);
    expect(ledger.getBalance(account.id)).toBe(10);
    expect(ledger.getLedger(account.id).map((entry) => entry.amount)).toEqual([10]);
  });
});
