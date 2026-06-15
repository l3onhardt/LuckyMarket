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
