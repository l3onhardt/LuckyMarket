import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMarket,
  getMarketActivity,
  getMarketPriceHistory,
  listMarkets,
  placeTrade,
  quoteTrade,
  type PlaceTradeParams,
  type QuoteTradeParams,
} from '@/lib/api-client';

export function useMarkets() {
  return useQuery({
    queryKey: ['markets'],
    queryFn: listMarkets,
    refetchInterval: 10000,
  });
}

export function useMarket(id: string | undefined) {
  return useQuery({
    queryKey: ['market', id],
    queryFn: () => getMarket(id as string),
    enabled: Boolean(id),
  });
}

export function useMarketActivity(id: string | undefined) {
  return useQuery({
    queryKey: ['market', id, 'activity'],
    queryFn: () => getMarketActivity(id as string),
    enabled: Boolean(id),
    refetchInterval: 5000,
  });
}

export function useMarketPriceHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['market', id, 'price-history'],
    queryFn: () => getMarketPriceHistory(id as string),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });
}

export function useQuote(marketId: string | undefined) {
  return useMutation({
    mutationFn: (params: QuoteTradeParams) => quoteTrade(marketId as string, params),
  });
}

export function usePlaceTrade(marketId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: PlaceTradeParams) => placeTrade(marketId as string, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['market', marketId] });
      queryClient.invalidateQueries({ queryKey: ['market', marketId, 'activity'] });
    },
  });
}
