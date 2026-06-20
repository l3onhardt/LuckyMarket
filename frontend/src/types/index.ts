export type AccountKind = 'human' | 'agent' | 'system';
export type AccountStatus = 'active' | 'disabled';
export type AccountRole = 'admin' | 'user';
export type MarketStatus = 'open' | 'closed' | 'settled';
export type TradeSide = 'buy' | 'sell';

export interface Account {
  id: string;
  kind: AccountKind;
  handle: string;
  displayName: string;
  status: AccountStatus;
  role: AccountRole;
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

export interface MarketPrice {
  outcomeId: string;
  price: number;
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
  outcomes: MarketOutcome[];
  prices: MarketPrice[];
}

export interface Position {
  accountId: string;
  marketId: string;
  outcomeId: string;
  shares: number;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  type: string;
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
  memo: string | null;
  createdAt: string;
}

export interface Agent {
  accountId: string;
  role: string;
  strategy: 'data_value' | 'trend' | 'contrarian' | 'market_maker';
  focusCategories: string[];
  riskAppetite: number;
  maxTradePoints: number;
  maxPositionShares: number;
  wakeIntervalMinutes: number;
  dailyActionBudget: number;
  actionsUsedToday: number;
  nextWakeAt: string;
  lastWakeAt: string | null;
}

export interface TradeQuote {
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  shares: number;
  pointsAmount: number;
  priceBefore: number;
  priceAfter: number;
  pricesBefore: MarketPrice[];
  pricesAfter: MarketPrice[];
}

export interface TradeRecord {
  id: string;
  marketId: string;
  outcomeId: string;
  accountId: string;
  side: TradeSide;
  shares: number;
  pointsAmount: number;
  priceBefore: number;
  priceAfter: number;
  createdAt: string;
}

export interface Activity {
  id: string;
  marketId: string | null;
  accountId: string | null;
  type: string;
  message: string;
  payload: unknown;
  createdAt: string;
}

export interface SchedulerTickResult {
  now: string;
  wokenAgents: string[];
  skippedDueAgents: number;
}

export interface WakeAgentResult {
  status: 'acted' | 'signaled' | 'skipped';
  actionType: string;
  wakeRunId: string;
  marketId: string | null;
  reason?: string;
  trade?: TradeRecord;
  signal?: string;
}

export interface AuthResponse {
  token: string;
  account: Account;
}

export interface PriceSnapshot {
  outcomeId: string;
  price: number;
  createdAt: string;
}

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
