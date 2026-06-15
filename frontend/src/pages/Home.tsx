import { Link } from 'react-router-dom';
import { Activity, ChevronRight, Clock, Database } from 'lucide-react';
import { useMarkets } from '@/hooks/useMarkets';
import { seedDemoData } from '@/lib/api-client';
import { useToast } from '@/hooks/useToast';
import { formatDate, formatProbability } from '@/lib/utils';
import type { Market } from '@/types';
import { categoryLabel } from '@/lib/i18n';
import { MarketCardSkeleton } from '@/components/ui/Skeleton';

function statusLabel(status: Market['status']) {
  if (status === 'open') return '开放交易';
  if (status === 'closed') return '已关闭';
  return '已结算';
}

function MarketCard({ market }: { market: Market }) {
  const topPrice = Math.max(...market.prices.map((price) => price.price));

  return (
    <Link to={`/markets/${market.id}`} className="fluid-glass-card block p-5 hover:no-underline">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-400/10 px-2 py-1 text-sm font-medium text-blue-200">
              {categoryLabel(market.category)}
            </span>
            <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-sm font-medium text-emerald-200">
              {statusLabel(market.status)}
            </span>
          </div>
          <h2 className="text-lg font-semibold leading-7 text-white">{market.title}</h2>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {market.outcomes.map((outcome) => {
          const price = market.prices.find((item) => item.outcomeId === outcome.id)?.price ?? 0;
          const isLeader = price === topPrice;
          return (
            <div
              key={outcome.id}
              className={`rounded-xl border p-3 ${
                isLeader ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="text-sm text-slate-300">{outcome.label}</div>
              <div className="mt-1 text-3xl font-bold text-white">{formatProbability(price)}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
        <Clock size={16} />
        <span>截止 {formatDate(market.closeTime)}</span>
      </div>
    </Link>
  );
}

export default function Home() {
  const marketsQuery = useMarkets();
  const toast = useToast();

  const handleSeed = async () => {
    await seedDemoData();
    await marketsQuery.refetch();
    toast.success('演示数据已就绪');
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-emerald-200">
            <Activity size={16} />
            单管理员市场驾驶舱
          </p>
          <h1 className="text-3xl font-bold text-white">预测市场</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            市场、交易、账本和 AI 代理都连接到本地后端。当前默认账号是 admin。
          </p>
        </div>
        <button
          type="button"
          onClick={handleSeed}
          className="fluid-glass-button inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white"
        >
          <Database size={16} />
          准备演示数据
        </button>
      </div>

      {marketsQuery.isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MarketCardSkeleton />
          <MarketCardSkeleton />
          <MarketCardSkeleton />
          <MarketCardSkeleton />
        </div>
      )}
      {marketsQuery.isError && (
        <div className="fluid-glass-card border-red-400/30 p-6 text-red-200">
          无法连接后端，请先启动 http://localhost:4000。
        </div>
      )}
      {marketsQuery.data && marketsQuery.data.length === 0 && (
        <div className="fluid-glass-card p-6 text-slate-300">暂无市场，点击“准备演示数据”。</div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {marketsQuery.data?.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
}
