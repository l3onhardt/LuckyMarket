import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Clock, Loader2, Play, Zap } from 'lucide-react';
import { listAgents, runSchedulerTick, wakeAgent } from '@/lib/api-client';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';
import { strategyLabel } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/Skeleton';

export default function Agents() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: listAgents,
    refetchInterval: 10000,
  });
  const wakeMutation = useMutation({
    mutationFn: wakeAgent,
    onSuccess: async (result) => {
      toast.success(result.actionType === 'agent_trade' ? 'AI 代理已完成交易' : 'AI 代理已记录信号');
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      await queryClient.invalidateQueries({ queryKey: ['markets'] });
      if (result.marketId) {
        await queryClient.invalidateQueries({ queryKey: ['market', result.marketId, 'activity'] });
      }
    },
    onError: () => toast.error('唤醒 AI 代理失败'),
  });
  const schedulerMutation = useMutation({
    mutationFn: runSchedulerTick,
    onSuccess: async (result) => {
      toast.success(`调度完成，唤醒 ${result.wokenAgents.length} 个代理`);
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      await queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: () => toast.error('调度 tick 失败'),
  });

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-sm text-emerald-200">
            <Bot size={16} />
            AI 代理运行时
          </p>
          <h1 className="text-3xl font-bold text-white">AI 代理</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            代理使用同一套市场、账本、交易接口。点击调度 tick 可以让到期代理自动分析并行动。
          </p>
        </div>
        <button
          type="button"
          onClick={() => schedulerMutation.mutate()}
          disabled={schedulerMutation.isPending}
          className="outcome-yes inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {schedulerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap size={16} />}
          运行调度 tick
        </button>
      </div>

      {agentsQuery.isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44" />
          <Skeleton className="h-44" />
        </div>
      )}
      {agentsQuery.isError && (
        <div className="fluid-glass-card border-red-400/30 p-6 text-red-200">无法读取 agents，请确认后端已启动。</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {agentsQuery.data?.map((agent) => (
          <div key={agent.accountId} className="fluid-glass-card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 rounded-full bg-purple-400/10 px-2 py-1 text-sm text-purple-200">
                  {strategyLabel(agent.strategy)}
                </div>
                <h2 className="text-xl font-semibold text-white">{agent.role}</h2>
                <p className="mt-1 text-sm text-slate-400">{agent.focusCategories.join(' / ')}</p>
              </div>
              <button
                type="button"
                onClick={() => wakeMutation.mutate(agent.accountId)}
                disabled={wakeMutation.isPending}
                className="fluid-glass-button inline-flex items-center gap-2 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {wakeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play size={15} />}
                唤醒
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-slate-500">单次上限</div>
                <div className="mt-1 text-lg font-semibold text-white">{agent.maxTradePoints} 点</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-slate-500">今日预算</div>
                <div className="mt-1 text-lg font-semibold text-white">
                  {agent.actionsUsedToday}/{agent.dailyActionBudget}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm text-slate-500">风险偏好</div>
                <div className="mt-1 text-lg font-semibold text-white">{Math.round(agent.riskAppetite * 100)}%</div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-sm text-slate-400">
              <Clock size={16} />
              <span>下次唤醒 {formatDate(agent.nextWakeAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
