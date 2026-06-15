import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { getAccountLedger } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

export default function TopBar() {
  const user = useAuthStore((state) => state.user);
  const ledgerQuery = useQuery({
    queryKey: ['account', user?.id, 'ledger'],
    queryFn: () => getAccountLedger(user?.id as string),
    enabled: Boolean(user?.id && user.id !== 'admin'),
    refetchInterval: 5000,
  });
  const balance =
    ledgerQuery.data?.reduce((sum, entry) => sum + entry.amount, 0) ??
    (user?.id === 'admin' ? 5000 : 0);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-bold tracking-normal text-white">LuckyMarket</h1>
          <p className="text-xs text-slate-400">单管理员演示模式</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-slate-400">管理员余额</div>
            <div className="text-lg font-semibold text-emerald-300">{formatNumber(balance, 0)} 点</div>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30">
            <ShieldCheck size={20} />
          </div>
        </div>
      </div>
    </header>
  );
}
