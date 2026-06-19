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

export type WorldEventConfidence = 'low' | 'medium' | 'high';

export type MarketEventBindingStatus = 'suggested' | 'active' | 'disabled';
export type AgentEventQueueStatus = 'queued' | 'processed' | 'failed';

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
  status: MarketEventBindingStatus;
  suggestedBy: string;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  failureReason: string | null;
  wakeRunId: string | null;
}
