import { categoryLabel } from '@/lib/i18n';

interface CategoryTabsProps {
  categories: string[];
  active: string; // 'all' 或具体分类
  onChange: (value: string) => void;
}

export default function CategoryTabs({ categories, active, onChange }: CategoryTabsProps) {
  const tabs = ['all', ...categories];
  return (
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {tabs.map((value) => {
        const selected = value === active;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium transition ${
              selected
                ? 'bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {value === 'all' ? '全部' : categoryLabel(value)}
          </button>
        );
      })}
    </div>
  );
}
