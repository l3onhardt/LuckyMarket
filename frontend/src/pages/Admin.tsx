import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Lock, PlusCircle, Settings } from 'lucide-react';
import { closeMarket, createMarket, listMarkets, settleMarket } from '@/lib/api-client';
import { useToast } from '@/hooks/useToast';
import { formatDate, formatProbability } from '@/lib/utils';

const defaultCloseTime = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

export default function Admin() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const marketsQuery = useQuery({ queryKey: ['markets'], queryFn: listMarkets, refetchInterval: 10000 });
  const [title, setTitle] = useState('本周五前会完成一次产品演示吗？');
  const [category, setCategory] = useState('product');
  const [closeTime, setCloseTime] = useState(defaultCloseTime());
  const [settlementSource, setSettlementSource] = useState('项目进度记录');
  const [outcomes, setOutcomes] = useState('Yes\nNo');
  const openMarkets = useMemo(() => marketsQuery.data?.filter((market) => market.status === 'open') ?? [], [marketsQuery.data]);

  const createMutation = useMutation({
    mutationFn: createMarket,
    onSuccess: async () => {
      toast.success('市场已创建');
      await queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: () => toast.error('创建市场失败，请检查表单'),
  });

  const closeMutation = useMutation({
    mutationFn: closeMarket,
    onSuccess: async () => {
      toast.success('市场已关闭');
      await queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: () => toast.error('关闭市场失败'),
  });

  const settleMutation = useMutation({
    mutationFn: ({ marketId, outcomeId }: { marketId: string; outcomeId: string }) => settleMarket(marketId, outcomeId),
    onSuccess: async () => {
      toast.success('市场已结算');
      await queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: () => toast.error('结算市场失败'),
  });

  const handleCreate = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate({
      title,
      category,
      closeTime: new Date(closeTime).toISOString(),
      settlementSource,
      outcomes: outcomes.split('\n').map((item) => item.trim()).filter(Boolean),
      liquidityParameter: 100,
    });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="mb-2 flex items-center gap-2 text-sm text-emerald-200">
          <Settings size={16} />
          Single Admin Mode
        </p>
        <h1 className="text-3xl font-bold text-white">管理控制台</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          当前阶段只保留默认 admin 管理能力：创建市场、关闭交易、结算结果。多用户体系暂不进入本轮。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[420px_1fr]">
        <form onSubmit={handleCreate} className="fluid-glass-card h-fit p-5">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
            <PlusCircle size={20} />
            创建市场
          </h2>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">标题</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="fluid-input" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">分类</span>
              <input value={category} onChange={(event) => setCategory(event.target.value)} className="fluid-input" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">截止时间</span>
              <input
                type="datetime-local"
                value={closeTime}
                onChange={(event) => setCloseTime(event.target.value)}
                className="fluid-input"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">结算来源</span>
              <input
                value={settlementSource}
                onChange={(event) => setSettlementSource(event.target.value)}
                className="fluid-input"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-slate-300">结果选项，每行一个</span>
              <textarea
                value={outcomes}
                onChange={(event) => setOutcomes(event.target.value)}
                className="fluid-input min-h-28"
              />
            </label>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="outcome-yes w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              创建市场
            </button>
          </div>
        </form>

        <section className="fluid-glass-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
            <Lock size={20} />
            市场管理
          </h2>
          <div className="space-y-4">
            {marketsQuery.data?.map((market) => (
              <div key={market.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-blue-400/10 px-2 py-1 text-blue-200">{market.category}</span>
                      <span className="rounded-full bg-slate-400/10 px-2 py-1 text-slate-200">{market.status}</span>
                      <span className="text-slate-500">截止 {formatDate(market.closeTime)}</span>
                    </div>
                    <h3 className="font-semibold text-white">{market.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {market.outcomes.map((outcome) => {
                        const price = market.prices.find((item) => item.outcomeId === outcome.id)?.price ?? 0;
                        return (
                          <span key={outcome.id} className="rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1 text-xs text-slate-300">
                            {outcome.label} {formatProbability(price)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 md:min-w-48">
                    <button
                      type="button"
                      onClick={() => closeMutation.mutate(market.id)}
                      disabled={market.status !== 'open' || closeMutation.isPending}
                      className="fluid-glass-button px-3 py-2 text-sm text-white disabled:opacity-40"
                    >
                      关闭交易
                    </button>
                    <select
                      disabled={market.status === 'settled'}
                      onChange={(event) => {
                        if (event.target.value) {
                          settleMutation.mutate({ marketId: market.id, outcomeId: event.target.value });
                          event.target.value = '';
                        }
                      }}
                      className="fluid-input py-2 text-sm"
                      defaultValue=""
                    >
                      <option value="">选择获胜结果并结算</option>
                      {market.outcomes.map((outcome) => (
                        <option key={outcome.id} value={outcome.id}>
                          {outcome.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            {!marketsQuery.data?.length && <div className="text-sm text-slate-400">暂无市场。</div>}
            {openMarkets.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-200">
                <CheckCircle2 size={16} />
                {openMarkets.length} 个市场正在开放交易
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
