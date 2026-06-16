import { useQuery } from '@tanstack/react-query';
import { History, PieChart, Wallet } from 'lucide-react';
import { getAccountLedger, getAccountPositions, listMarkets } from '@/lib/api-client';
import { useAuthStore } from '@/store/authStore';
import { formatDate, formatPoints, formatProbability } from '@/lib/utils';

export default function Portfolio() {
  const user = useAuthStore((state) => state.user);
  const accountId = user?.id;
  const ledgerQuery = useQuery({
    queryKey: ['account', accountId, 'ledger'],
    queryFn: () => getAccountLedger(accountId as string),
    enabled: Boolean(accountId && accountId !== 'admin'),
    refetchInterval: 5000,
  });
  const positionsQuery = useQuery({
    queryKey: ['account', accountId, 'positions'],
    queryFn: () => getAccountPositions(accountId as string),
    enabled: Boolean(accountId && accountId !== 'admin'),
    refetchInterval: 5000,
  });
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: listMarkets,
  });

  const balance =
    ledgerQuery.data?.reduce((sum, entry) => sum + entry.amount, 0) ??
    (accountId === 'admin' ? 5000 : 0);
  const positions = positionsQuery.data ?? [];
  const markets = marketsQuery.data ?? [];
  const marketValue = positions.reduce((sum, position) => {
    const market = markets.find((item) => item.id === position.marketId);
    const price = market?.prices.find((item) => item.outcomeId === position.outcomeId)?.price ?? 0;
    return sum + position.shares * price;
  }, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="mb-2 flex items-center gap-2 text-sm text-emerald-200">
          <Wallet size={16} />
          我的组合
        </p>
        <h1 className="text-3xl font-bold text-white">管理员组合</h1>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <div className="fluid-glass-card p-5">
          <div className="text-sm text-slate-400">当前余额</div>
          <div className="mt-2 text-4xl font-bold text-white">{formatPoints(balance)}</div>
        </div>
        <div className="fluid-glass-card p-5">
          <div className="text-sm text-slate-400">持仓估值</div>
          <div className="mt-2 text-4xl font-bold text-white">{formatPoints(marketValue)}</div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <section className="fluid-glass-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
            <PieChart size={20} />
            当前持仓
          </h2>
          <div className="space-y-3">
            {positions.length ? (
              positions.map((position) => {
                const market = markets.find((item) => item.id === position.marketId);
                const outcome = market?.outcomes.find((item) => item.id === position.outcomeId);
                const price = market?.prices.find((item) => item.outcomeId === position.outcomeId)?.price ?? 0;
                return (
                  <div key={`${position.marketId}-${position.outcomeId}`} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm text-slate-400">{market?.category ?? 'market'}</div>
                    <div className="mt-1 font-semibold text-white">{market?.title ?? position.marketId}</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div>
                        <div className="text-sm text-slate-500">结果</div>
                        <div className="text-sm text-slate-200">{outcome?.label ?? position.outcomeId}</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">份额</div>
                        <div className="text-sm text-slate-200">{position.shares.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-slate-500">当前概率</div>
                        <div className="text-sm text-slate-200">{formatProbability(price)}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-400">暂无持仓。去市场详情页买入一笔即可看到组合变化。</div>
            )}
          </div>
        </section>

        <aside className="fluid-glass-card p-5">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-white">
            <History size={20} />
            账本流水
          </h2>
          <div className="space-y-3">
            {(ledgerQuery.data ?? []).slice().reverse().slice(0, 12).map((entry) => (
              <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">{entry.memo ?? entry.type}</span>
                  <span className={entry.amount >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                    {entry.amount >= 0 ? '+' : ''}{formatPoints(entry.amount)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-500">{formatDate(entry.createdAt)} · {entry.type}</div>
              </div>
            ))}
            {!ledgerQuery.data?.length && <div className="text-sm text-slate-400">暂无流水或后端正在加载。</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}
