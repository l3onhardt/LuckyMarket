import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, DatabaseZap, Loader2, Send, TrendingUp } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useMarket,
  useMarketActivity,
  useMarketBindings,
  useMarketPriceHistory,
  useMarketWorldEvents,
  usePlaceTrade,
  useQuote,
} from '@/hooks/useMarkets';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/store/authStore';
import { describeWorldEvent, describeWorldEventActivity } from '@/lib/worldEvents';
import { formatDate, formatPoints, formatProbability } from '@/lib/utils';
import { categoryLabel } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/Skeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import PriceChart from '@/components/market/PriceChart';

export default function MarketDetail() {
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const toast = useToast();
  const marketQuery = useMarket(id);
  const activityQuery = useMarketActivity(id);
  const historyQuery = useMarketPriceHistory(id);
  const worldEventsQuery = useMarketWorldEvents(id);
  const bindingsQuery = useMarketBindings(id);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>('');
  const [shares, setShares] = useState(2);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const quoteMutation = useQuote(id);
  const tradeMutation = usePlaceTrade(id);

  const market = marketQuery.data;
  const effectiveSelectedOutcomeId =
    market?.outcomes.some((outcome) => outcome.id === selectedOutcomeId)
      ? selectedOutcomeId
      : market?.outcomes[0]?.id ?? '';
  const selectedOutcome = market?.outcomes.find((outcome) => outcome.id === effectiveSelectedOutcomeId);

  const pricesByOutcome = useMemo(() => {
    return new Map(market?.prices.map((price) => [price.outcomeId, price.price]) ?? []);
  }, [market]);

  const handleQuote = () => {
    if (!effectiveSelectedOutcomeId) return;
    quoteMutation.mutate({ outcomeId: effectiveSelectedOutcomeId, side: 'buy', shares });
  };

  const handleTrade = async () => {
    if (!user?.id || !effectiveSelectedOutcomeId) return;
    try {
      await tradeMutation.mutateAsync({
        accountId: user.id,
        outcomeId: effectiveSelectedOutcomeId,
        side: 'buy',
        shares,
      });
      toast.success('交易完成，市场价格已更新');
      quoteMutation.reset();
      await queryClient.invalidateQueries({ queryKey: ['account', user.id] });
    } catch {
      toast.error('交易失败，请检查余额或市场状态');
    }
  };

  if (marketQuery.isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-5 px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link to="/" className="text-emerald-200">返回市场</Link>
        <div className="fluid-glass-card mt-4 p-6 text-red-200">市场不存在或后端未启动。</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white">
        <ArrowLeft size={16} />
        返回市场
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="fluid-glass-card p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-400/10 px-2 py-1 text-sm text-blue-200">{categoryLabel(market.category)}</span>
              <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-sm text-emerald-200">
                {market.status === 'open' ? '开放交易' : market.status === 'closed' ? '已关闭' : '已结算'}
              </span>
              <span className="text-sm text-slate-400">截止 {formatDate(market.closeTime)}</span>
            </div>
            <h1 className="text-3xl font-bold leading-10 text-white">{market.title}</h1>
            <p className="mt-3 text-sm text-slate-400">结算来源：{market.settlementSource}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {market.outcomes.map((outcome) => {
              const price = pricesByOutcome.get(outcome.id) ?? 0;
              const selected = effectiveSelectedOutcomeId === outcome.id;
              return (
                <button
                  key={outcome.id}
                  type="button"
                  onClick={() => setSelectedOutcomeId(outcome.id)}
                  className={`rounded-2xl border p-5 text-left transition ${
                    selected ? 'border-emerald-300/60 bg-emerald-300/10' : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm text-slate-300">{outcome.label}</span>
                    {selected && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}
                  </div>
                  <div className="text-5xl font-bold text-white">{formatProbability(price)}</div>
                  <div className="mt-2 text-sm text-slate-500">池数量 {outcome.poolQuantity.toFixed(2)}</div>
                </button>
              );
            })}
          </div>

          <div className="fluid-glass-card p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">价格走势</h2>
            <PriceChart snapshots={historyQuery.data ?? []} outcomes={market.outcomes} />
          </div>

          <div className="fluid-glass-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
              <DatabaseZap size={20} />
              公司事件影响
            </h2>
            <div className="space-y-3">
              {worldEventsQuery.data?.length ? (
                worldEventsQuery.data.slice(0, 4).map((event) => (
                  <div key={event.id} className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3">
                    <div className="text-sm font-medium text-emerald-100">{describeWorldEvent(event)}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {event.source === 'feishu_attendance' ? '飞书考勤' : '人工事件'} · {event.confidence}
                    </div>
                  </div>
                ))
              ) : bindingsQuery.data?.length ? (
                <div className="text-sm text-slate-400">已绑定公司事件，等待下一次同步。</div>
              ) : (
                <div className="text-sm text-slate-400">这个市场还没有绑定公司事件。</div>
              )}
            </div>
          </div>

          <div className="fluid-glass-card p-6">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
              <TrendingUp size={20} />
              最近活动
            </h2>
            <div className="space-y-3">
              {activityQuery.data?.length ? (
                activityQuery.data.map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-200">
                        {item.type === 'agent_trade' && item.payload && typeof item.payload === 'object'
                          ? describeWorldEventActivity(item.payload as Record<string, unknown>)
                          : item.message}
                      </span>
                      <span className="text-sm text-slate-500">{formatDate(item.createdAt)}</span>
                    </div>
                    <div className="mt-1 text-sm uppercase tracking-wide text-slate-500">{item.type}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-400">暂无活动，先下一笔交易或唤醒 AI 代理。</div>
              )}
            </div>
          </div>
        </section>

        <aside className="fluid-glass-card h-fit p-5">
          <h2 className="text-xl font-semibold text-white">管理员交易</h2>
          <p className="mt-1 text-sm text-slate-400">当前账号：{user?.displayName ?? 'Admin'}</p>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">买入结果</span>
              <select
                value={effectiveSelectedOutcomeId}
                onChange={(event) => setSelectedOutcomeId(event.target.value)}
                className="fluid-input"
              >
                {market.outcomes.map((outcome) => (
                  <option key={outcome.id} value={outcome.id}>
                    {outcome.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">买入份额</span>
              <input
                type="number"
                min={1}
                step={1}
                value={shares}
                onChange={(event) => setShares(Math.max(1, Number(event.target.value) || 1))}
                className="fluid-input"
              />
            </label>

            <button
              type="button"
              onClick={handleQuote}
              disabled={!effectiveSelectedOutcomeId || quoteMutation.isPending}
              className="fluid-glass-button flex min-h-[48px] w-full items-center justify-center gap-2 px-4 text-base font-medium text-white"
            >
              {quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp size={16} />}
              预估报价
            </button>

            {quoteMutation.data && (
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-sm">
                <div className="text-slate-300">买入 {selectedOutcome?.label}</div>
                <div className="mt-1 text-2xl font-bold text-white">{formatPoints(quoteMutation.data.pointsAmount)}</div>
                <div className="mt-1 text-slate-400">
                  价格 {formatProbability(quoteMutation.data.priceBefore)} → {formatProbability(quoteMutation.data.priceAfter)}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={market.status !== 'open' || !effectiveSelectedOutcomeId || tradeMutation.isPending}
              className="outcome-yes flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {tradeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} />}
              确认买入
            </button>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认交易"
        confirmLabel="确认买入"
        pending={tradeMutation.isPending}
        onConfirm={async () => {
          setConfirmOpen(false);
          await handleTrade();
        }}
      >
        <div>市场：{market.title}</div>
        <div>选择：{selectedOutcome?.label}</div>
        <div>份额：{shares}</div>
        {quoteMutation.data && <div>预计点数：{formatPoints(quoteMutation.data.pointsAmount)}</div>}
        <div className="text-slate-400">确认后将按当前市价成交并扣除点数。</div>
      </ConfirmDialog>
    </div>
  );
}
