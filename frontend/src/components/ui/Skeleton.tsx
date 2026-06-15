export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/10 ${className}`} />;
}

export function MarketCardSkeleton() {
  return (
    <div className="fluid-glass-card space-y-4 p-5">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-7 w-3/4" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}
