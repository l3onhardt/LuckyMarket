import { apiClient } from '../api-client';
import type { Market, Activity, TradeQuote } from '@/types';

/**
 * 获取所有市场
 */
export async function getMarkets(): Promise<Market[]> {
  const response = await apiClient.get<{ markets: Market[] }>('/markets');
  return response.data.markets;
}

/**
 * 获取单个市场详情
 */
export async function getMarket(id: string): Promise<Market> {
  const response = await apiClient.get<{ market: Market }>(`/markets/${id}`);
  return response.data.market;
}

/**
 * 获取市场活动
 */
export async function getMarketActivity(id: string): Promise<Activity[]> {
  const response = await apiClient.get<{ activity: Activity[] }>(`/markets/${id}/activity`);
  return response.data.activity;
}

/**
 * 获取交易报价
 */
export interface GetQuoteParams {
  marketId: string;
  outcomeId: string;
  side: 'buy' | 'sell';
  shares: number;
}

export async function getQuote(params: GetQuoteParams): Promise<TradeQuote> {
  const { marketId, ...quoteParams } = params;
  const response = await apiClient.post<{ quote: TradeQuote }>(
    `/markets/${marketId}/quote`,
    quoteParams
  );
  return response.data.quote;
}

/**
 * 执行交易
 */
export interface PlaceTradeParams {
  marketId: string;
  accountId: string;
  outcomeId: string;
  side: 'buy' | 'sell';
  shares: number;
}

export async function placeTrade(params: PlaceTradeParams): Promise<void> {
  const { marketId, ...tradeParams } = params;
  await apiClient.post(`/markets/${marketId}/trades`, tradeParams);
}
