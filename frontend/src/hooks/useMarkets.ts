import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Market, Activity, TradeQuote } from '@/types';
import * as marketsApi from '@/lib/api/markets';
import { calculatePrices } from '@/lib/utils';

/**
 * 获取所有市场（每 10 秒自动刷新）
 */
export function useMarkets() {
  return useQuery({
    queryKey: ['markets'],
    queryFn: marketsApi.getMarkets,
    refetchInterval: 10000, // 每 10 秒刷新
    select: (markets) => {
      // 为每个市场计算价格
      return markets.map((market) => ({
        ...market,
        prices: calculatePrices(market.outcomes.map((o) => o.quantity)),
      }));
    },
  });
}

/**
 * 获取单个市场详情
 */
export function useMarket(id: string) {
  return useQuery({
    queryKey: ['market', id],
    queryFn: () => marketsApi.getMarket(id),
    enabled: !!id,
    select: (market) => ({
      ...market,
      prices: calculatePrices(market.outcomes.map((o) => o.quantity)),
    }),
  });
}

/**
 * 获取市场活动（每 5 秒自动刷新）
 */
export function useMarketActivity(id: string) {
  return useQuery({
    queryKey: ['market', id, 'activity'],
    queryFn: () => marketsApi.getMarketActivity(id),
    enabled: !!id,
    refetchInterval: 5000, // 每 5 秒刷新
  });
}

/**
 * 获取交易报价
 */
export function useQuote() {
  return useMutation({
    mutationFn: (params: marketsApi.GetQuoteParams) => marketsApi.getQuote(params),
  });
}

/**
 * 执行交易
 */
export function usePlaceTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: marketsApi.PlaceTradeParams) => marketsApi.placeTrade(params),
    onSuccess: (_, variables) => {
      // 交易成功后，使相关查询失效以触发重新获取
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['market', variables.marketId] });
      queryClient.invalidateQueries({ queryKey: ['market', variables.marketId, 'activity'] });
    },
  });
}
