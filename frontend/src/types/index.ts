// 账户类型
export type AccountKind = 'user' | 'market' | 'operator' | 'house';

// 账户状态
export type AccountStatus = 'active' | 'frozen';

// 市场状态
export type MarketStatus = 'open' | 'closed' | 'resolved';

// 账户接口
export interface Account {
  id: string;
  kind: AccountKind;
  status: AccountStatus;
  balance: number;
  displayName?: string; // For UI display
  role?: 'admin' | 'user'; // For access control
  createdAt: string;
  updatedAt: string;
}

// 市场结果接口
export interface MarketOutcome {
  id: string;
  marketId: string;
  title: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

// 市场接口
export interface Market {
  id: string;
  title: string;
  description: string;
  status: MarketStatus;
  operatorAccountId: string;
  liquidity: number;
  volume: number;
  resolutionDate?: string;
  resolvedOutcomeId?: string;
  createdAt: string;
  updatedAt: string;
  outcomes: MarketOutcome[];
}

// 持仓接口
export interface Position {
  id: string;
  accountId: string;
  outcomeId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
  outcome?: MarketOutcome;
}

// 账本条目接口
export interface LedgerEntry {
  id: string;
  accountId: string;
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

// 代理人接口
export interface Agent {
  id: string;
  accountId: string;
  name: string;
  strategy: string;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// 交易报价接口
export interface TradeQuote {
  outcomeId: string;
  isBuy: boolean;
  quantity: number;
  price: number;
  cost: number;
  fee: number;
  totalCost: number;
  priceImpact: number;
}

// 活动接口
export interface Activity {
  id: string;
  type: 'trade' | 'deposit' | 'withdraw' | 'market_created' | 'market_resolved';
  accountId: string;
  marketId?: string;
  outcomeId?: string;
  amount?: number;
  price?: number;
  quantity?: number;
  description: string;
  createdAt: string;
}

// 认证响应接口
export interface AuthResponse {
  token: string;
  account: Account;
}
