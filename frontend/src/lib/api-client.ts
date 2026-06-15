import { apiClient } from './api';
import type {
  Account,
  Activity,
  Agent,
  LedgerEntry,
  Market,
  Position,
  SchedulerTickResult,
  TradeQuote,
  TradeRecord,
  WakeAgentResult,
} from '@/types';

// ==================== Account APIs ====================

export interface CreateAccountParams {
  kind: 'human' | 'agent';
  handle: string;
  displayName: string;
  initialPoints?: number;
}

export async function createAccount(params: CreateAccountParams): Promise<Account> {
  const response = await apiClient.post<{ account: Account }>('/accounts', params);
  return withRole(response.data.account);
}

export async function listAccounts(): Promise<Account[]> {
  const response = await apiClient.get<{ accounts: Account[] }>('/accounts');
  return response.data.accounts.map(withRole);
}

export async function getAccount(id: string): Promise<Account> {
  const response = await apiClient.get<{ account: Account }>(`/accounts/${id}`);
  return withRole(response.data.account);
}

export async function getAccountByHandle(handle: string): Promise<Account> {
  const response = await apiClient.get<{ account: Account }>(`/accounts/handle/${handle}`);
  return withRole(response.data.account);
}

export async function getAccountLedger(accountId: string): Promise<LedgerEntry[]> {
  const response = await apiClient.get<{ ledger: LedgerEntry[] }>(`/accounts/${accountId}/ledger`);
  return response.data.ledger;
}

export async function getAccountPositions(accountId: string): Promise<Position[]> {
  const response = await apiClient.get<{ positions: Position[] }>(`/accounts/${accountId}/positions`);
  return response.data.positions;
}

// ==================== Market APIs ====================

export interface CreateMarketParams {
  title: string;
  category: string;
  closeTime: string;
  settlementSource: string;
  outcomes: string[];
  liquidityParameter?: number;
}

export async function createMarket(params: CreateMarketParams): Promise<Market> {
  const response = await apiClient.post<{ market: Market }>('/markets', params);
  return response.data.market;
}

export async function listMarkets(): Promise<Market[]> {
  const response = await apiClient.get<{ markets: Market[] }>('/markets');
  return response.data.markets;
}

export async function getMarket(id: string): Promise<Market> {
  const response = await apiClient.get<{ market: Market }>(`/markets/${id}`);
  return response.data.market;
}

export async function getMarketActivity(marketId: string): Promise<Activity[]> {
  const response = await apiClient.get<{ activity: Activity[] }>(`/markets/${marketId}/activity`);
  return response.data.activity;
}

// ==================== Trade APIs ====================

export interface QuoteTradeParams {
  outcomeId: string;
  side: 'buy' | 'sell';
  shares: number;
}

export async function quoteTrade(marketId: string, params: QuoteTradeParams): Promise<TradeQuote> {
  const response = await apiClient.post<{ quote: TradeQuote }>(`/markets/${marketId}/quote`, params);
  return response.data.quote;
}

export interface PlaceTradeParams extends QuoteTradeParams {
  accountId: string;
}

export async function placeTrade(marketId: string, params: PlaceTradeParams): Promise<TradeRecord> {
  const response = await apiClient.post<{ trade: TradeRecord }>(`/markets/${marketId}/trades`, params);
  return response.data.trade;
}

// ==================== Market Management APIs ====================

export async function closeMarket(marketId: string): Promise<Market> {
  const response = await apiClient.post<{ market: Market }>(`/markets/${marketId}/close`);
  return response.data.market;
}

export async function settleMarket(marketId: string, winningOutcomeId: string): Promise<Market> {
  const response = await apiClient.post<{ market: Market }>(`/markets/${marketId}/settle`, {
    winningOutcomeId,
  });
  return response.data.market;
}

// ==================== Seed Data API ====================

export async function seedDemoData(): Promise<unknown> {
  const response = await apiClient.post('/seed/demo');
  return response.data.result;
}

// ==================== Agent APIs ====================

export async function listAgents(): Promise<Agent[]> {
  const response = await apiClient.get<{ agents: Agent[] }>('/agents');
  return response.data.agents;
}

export async function wakeAgent(accountId: string): Promise<WakeAgentResult> {
  const response = await apiClient.post<{ result: WakeAgentResult }>(`/agents/${accountId}/wake`);
  return response.data.result;
}

export async function runSchedulerTick(): Promise<SchedulerTickResult> {
  const response = await apiClient.post<{ result: SchedulerTickResult }>('/scheduler/tick');
  return response.data.result;
}

function withRole(account: Account): Account {
  return {
    ...account,
    role: account.handle === 'admin' ? 'admin' : account.role ?? 'user',
  };
}
