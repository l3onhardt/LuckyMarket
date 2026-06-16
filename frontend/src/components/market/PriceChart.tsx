import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { MarketOutcome, PriceSnapshot } from '@/types';
import { toChartSeries } from '@/lib/priceHistory';

const COLORS = ['#10b981', '#60a5fa', '#a78bfa', '#f59e0b', '#f472b6'];

export default function PriceChart({
  snapshots,
  outcomes,
}: {
  snapshots: PriceSnapshot[];
  outcomes: MarketOutcome[];
}) {
  const data = toChartSeries(snapshots);
  if (data.length < 2) {
    return <div className="text-sm text-slate-400">暂无足够历史数据，成交后将出现价格走势。</div>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="t" hide />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke="#94a3b8" fontSize={12} />
          <Tooltip
            contentStyle={{
              background: '#1e293b',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
            }}
            formatter={(value: number, key) => [
              `${value.toFixed(0)}%`,
              outcomes.find((o) => o.id === key)?.label ?? key,
            ]}
            labelFormatter={() => ''}
          />
          {outcomes.map((o, i) => (
            <Line
              key={o.id}
              type="monotone"
              dataKey={o.id}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              name={o.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
