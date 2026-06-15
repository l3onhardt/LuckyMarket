# LuckyMarket 前端修复与达标 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复导致前端"笔丑+难用"的致命 Tailwind v4 迁移 bug，并把现有界面提升到原始 spec 的"苹果质感 + 80 岁能用 + 纯中文 + Polymarket 金融感"标准。

**Architecture:** 4 个顺序阶段。P0 修 Tailwind 入口（一改即全局复活，是后续视觉验证的前提）；P1 落实无障碍硬指标；P2 容错弹窗+中文化+骨架屏+动效+清理；P3 新增只读价格历史端点并画走势图。除 P3 一个只读端点外不碰任何后端写/交易逻辑。

**Tech Stack:** React 19 + Vite + TypeScript + Tailwind CSS v4 + Radix UI（Dialog）+ Framer Motion + recharts（新增）+ TanStack Query；后端 Fastify + better-sqlite3 + vitest。

**关联 spec:** `docs/superpowers/specs/2026-06-16-luckymarket-frontend-remediation-design.md`

**分支:** `frontend-remediation`

---

## 命令速查

| 用途 | 命令 |
|---|---|
| 后端测试 | 仓库根 `npm test`（= `vitest run`） |
| 后端构建 | 仓库根 `npm run build`（= `tsc -p tsconfig.json`） |
| 前端一次性测试 | `cd frontend && npx vitest run` |
| 前端构建 | `cd frontend && npm run build`（= `tsc -b && vite build`） |
| 前端开发预览 | `cd frontend && npm run dev` |

> 注意：bash 工具的工作目录会跨调用保留。前端命令统一用 `cd /d/github/LuckyMarket/frontend && ...` 绝对路径，避免目录漂移。

---

## 文件结构

**P0**
- 改 `frontend/src/index.css`（入口指令 + `@theme`）
- 删 `frontend/tailwind.config.js`

**P1（无障碍硬指标，均为 className 级精确改动）**
- 改 `frontend/src/components/ui/Button.tsx`（≥48px 高、flex 居中、保留 `button-sm/md/lg` 标记类）
- 改 `frontend/src/components/layout/BottomNav.tsx`（项 ≥80px、图标 24px、标签 14px、栏更高）
- 改 `frontend/src/components/layout/TopBar.tsx`（`text-xs`→`text-sm`）
- 改 `frontend/src/pages/MarketDetail.tsx`（概率 `text-4xl`→`text-5xl`；`text-xs`→`text-sm`）
- 改 `frontend/src/pages/Home.tsx`（概率放大；`text-xs`→`text-sm`）

**P2**
- 新建 `frontend/src/lib/i18n.ts`（策略/状态/分类 中文映射）+ `frontend/src/lib/i18n.test.ts`
- 新建 `frontend/src/lib/motion.ts`（Framer Motion variants，含 reduced-motion）
- 新建 `frontend/src/components/ui/Skeleton.tsx`
- 新建 `frontend/src/components/ui/ConfirmDialog.tsx`（Radix Dialog 封装）
- 新建 `frontend/src/components/market/CategoryTabs.tsx` + `CategoryTabs.test.tsx`
- 改 `frontend/src/pages/MarketDetail.tsx`（下单前二次确认）
- 改 `frontend/src/pages/Home.tsx`（分类筛选 + 骨架屏 + 列表入场动效）
- 改 `frontend/src/pages/Agents.tsx`（策略中文化 + 骨架屏）
- 改 `frontend/src/pages/Portfolio.tsx`（骨架屏）
- 改 `frontend/src/pages/Admin.tsx`（状态中文化）
- 改 `frontend/src/App.tsx`（`.app-container`/`.main-content`→工具类；页面 fade-in 包裹）
- 删 `frontend/src/App.css`

**P3**
- 改 `src/services/markets.ts`（`getPriceHistory` + 类型 + `mapSnapshot`）
- 改 `src/http/routes.ts`（`GET /markets/:id/price-history`）
- 新增测试 `tests/priceHistory.test.ts`（service）、`tests/api.test.ts` 增 1 例（route）
- 改 `frontend/src/types/index.ts`（`PriceSnapshot`）
- 改 `frontend/src/lib/api-client.ts`（`getMarketPriceHistory`）
- 改 `frontend/src/hooks/useMarkets.ts`（`useMarketPriceHistory`）
- 新建 `frontend/src/lib/priceHistory.ts`（快照→图表序列）+ `priceHistory.test.ts`
- 新建 `frontend/src/components/market/PriceChart.tsx`
- 改 `frontend/src/pages/MarketDetail.tsx`（渲染图表）
- 改 `frontend/package.json`（新增 recharts）

---

# 阶段 P0 · 复活样式（致命 bug）

### Task 1: 修 Tailwind v4 入口

**Files:**
- Modify: `frontend/src/index.css:1-3`

- [ ] **Step 1: 替换入口指令为 v4 写法 + 迁移自定义主题**

把 `frontend/src/index.css` 开头的三行：
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
整体替换为：
```css
@import "tailwindcss";

@theme {
  --color-success: #10b981; /* YES / 看涨 / 成功 */
  --color-primary: #60a5fa; /* 操作 / 链接 / 选中 */
  --font-sans: "Inter", -apple-system, system-ui, sans-serif;
}
```
> 保留文件其余全部内容（`@layer base` 与 `@layer components` 的 `.fluid-glass-*` 等原样不动）。不重定义 `--color-neutral`，以免覆盖 Tailwind 默认 `neutral-*` 调色阶（组件用的灰是 `slate-*`）。

- [ ] **Step 2: 删除已失效的 v3 配置文件**

```bash
rm /d/github/LuckyMarket/frontend/tailwind.config.js
```
> v4 通过 `@tailwindcss/postcss` 自动扫描源码，不再需要 JS config。

- [ ] **Step 3: 构建并验证编译产物包含工具类（关键验收）**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 构建成功；然后检查编译 CSS：
```bash
cd /d/github/LuckyMarket/frontend && for f in dist/assets/*.css; do echo "$f size: $(wc -c < "$f")"; for k in 'rounded-xl' 'backdrop-blur' 'gap-4' 'px-4' 'text-sm' 'lg:grid-cols'; do echo -n "  $k: "; grep -c "$k" "$f"; done; done
```
Expected: CSS 体积远大于修复前的 7.8KB（数十 KB）；`rounded-xl`/`backdrop-blur`/`gap-4`/`px-4`/`text-sm`/`lg:grid-cols` 计数均 > 0（修复前这些都是 0）。

- [ ] **Step 4: 人工目检（可选但推荐）**

```bash
cd /d/github/LuckyMarket/frontend && npm run dev
```
打开 http://localhost:3000 ，应看到暗色液态玻璃界面（卡片有圆角/间距/模糊、字号有层级、底部导航成形）。确认后 Ctrl-C。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/index.css && git rm frontend/tailwind.config.js && git commit -m "fix(frontend): complete Tailwind v4 migration in CSS entry

Replace removed v3 @tailwind directives with @import \"tailwindcss\" + @theme.
This restores ~90% of utility classes that previously never compiled
(padding/gap/text-size/color/rounded-xl/backdrop-blur/responsive)."
```

---

# 阶段 P1 · 无障碍硬指标

> 目标（对照 spec §交互/§字体）：正文最小 14px、按钮点击区 ≥48px、概率数字 48px、底部导航项 ≥80px。

### Task 2: 按钮 ≥48px 点击区

**Files:**
- Modify: `frontend/src/components/ui/Button.tsx`

- [ ] **Step 1: 基础类加 flex 居中；尺寸档加最小高度（保留标记类）**

把 `Button.tsx` 中 `sizeClasses` 改为（保留 `button-sm/md/lg` 标记类，使既有测试 `Button.test.tsx` 仍通过）：
```tsx
    const sizeClasses = {
      sm: 'button-sm min-h-[40px] px-4 text-sm',
      md: 'button-md min-h-[48px] px-5 text-base',
      lg: 'button-lg min-h-[52px] px-6 text-lg',
    };
```
并把基础 className 字符串（`clsx(...)` 第一参数）改为：
```tsx
        'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200',
```

- [ ] **Step 2: 跑既有按钮测试，确认未回归**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run src/components/ui/Button.test.tsx
```
Expected: PASS（`button-lg`、`outcome-yes` 断言仍成立）。

- [ ] **Step 3: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/components/ui/Button.tsx && git commit -m "feat(frontend): enforce >=48px tap targets on Button (a11y)"
```

### Task 3: 底部导航达标 + 顶栏字号

**Files:**
- Modify: `frontend/src/components/layout/BottomNav.tsx`
- Modify: `frontend/src/components/layout/TopBar.tsx`

- [ ] **Step 1: 底部导航——项 ≥80px 宽、图标 24px、标签 14px、栏更高**

在 `BottomNav.tsx` 中：
- 容器 `<div className="flex h-16 items-center justify-around">` → `flex h-20 items-center justify-around`
- 链接 className 的 `min-w-16 ... px-3 py-2 text-xs` → `min-w-[80px] ... px-3 py-2 text-sm`，并把 `<Icon className="h-5 w-5" />` → `<Icon className="h-6 w-6" />`

- [ ] **Step 2: 顶栏副标题 14px**

在 `TopBar.tsx` 把两处 `text-xs`（`单管理员演示模式` 副标题、`管理员余额` 小标签）改为 `text-sm`。

- [ ] **Step 3: 构建验证**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 构建通过。

- [ ] **Step 4: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/components/layout/BottomNav.tsx frontend/src/components/layout/TopBar.tsx && git commit -m "feat(frontend): bigger bottom-nav targets and 14px min text (a11y)"
```

### Task 4: 概率数字放大 + 详情/首页最小字号

**Files:**
- Modify: `frontend/src/pages/MarketDetail.tsx`
- Modify: `frontend/src/pages/Home.tsx`

- [ ] **Step 1: 详情页概率 48px**

`MarketDetail.tsx` 结果按钮里的 `<div className="text-4xl font-bold text-white">{formatProbability(price)}</div>` → `text-5xl font-bold`（`text-5xl` = 48px）。并把该文件内用于正文/标签的 `text-xs` 改为 `text-sm`（如分类/状态标签、`池数量`、活动时间戳、`item.type`）。保留纯装饰性极小元素不强求。

- [ ] **Step 2: 首页概率与字号**

`Home.tsx` 卡片概率 `<div className="mt-1 text-2xl font-bold text-white">` → `text-3xl font-bold`；并把卡片内 `text-xs`（分类/状态标签）改为 `text-sm`。

- [ ] **Step 3: 构建验证**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/pages/MarketDetail.tsx frontend/src/pages/Home.tsx && git commit -m "feat(frontend): emphasize probability (48px) and lift min text size"
```

---

# 阶段 P2 · 容错 + 体验 + 中文化 + 清理

### Task 5: i18n 文案映射（TDD）

**Files:**
- Create: `frontend/src/lib/i18n.ts`
- Test: `frontend/src/lib/i18n.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/i18n.test.ts`:
```tsx
import { describe, it, expect } from 'vitest';
import { strategyLabel, marketStatusLabel, categoryLabel } from './i18n';

describe('i18n labels', () => {
  it('maps known strategy enums to Chinese', () => {
    expect(strategyLabel('data_value')).toBe('数据价值');
    expect(strategyLabel('trend')).toBe('趋势');
    expect(strategyLabel('contrarian')).toBe('反向');
    expect(strategyLabel('market_maker')).toBe('做市');
  });

  it('falls back to raw strategy when unknown', () => {
    expect(strategyLabel('something_new')).toBe('something_new');
  });

  it('maps market status to Chinese', () => {
    expect(marketStatusLabel('open')).toBe('开放交易');
    expect(marketStatusLabel('closed')).toBe('已关闭');
    expect(marketStatusLabel('settled')).toBe('已结算');
  });

  it('maps known english categories, passes through others', () => {
    expect(categoryLabel('product')).toBe('产品');
    expect(categoryLabel('科技')).toBe('科技'); // 已是中文，原样
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run src/lib/i18n.test.ts
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`frontend/src/lib/i18n.ts`:
```ts
const STRATEGY: Record<string, string> = {
  data_value: '数据价值',
  trend: '趋势',
  contrarian: '反向',
  market_maker: '做市',
};

const MARKET_STATUS: Record<string, string> = {
  open: '开放交易',
  closed: '已关闭',
  settled: '已结算',
};

// 已知英文分类的显示映射；未知分类原样展示（分类是用户自建自由文本）
const CATEGORY: Record<string, string> = {
  product: '产品',
  tech: '科技',
  sports: '体育',
  entertainment: '娱乐',
  attendance: '考勤',
  delivery: '交付',
  ops: '运维',
  quality: '质量',
};

export function strategyLabel(value: string): string {
  return STRATEGY[value] ?? value;
}

export function marketStatusLabel(value: string): string {
  return MARKET_STATUS[value] ?? value;
}

export function categoryLabel(value: string): string {
  return CATEGORY[value] ?? value;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run src/lib/i18n.test.ts
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/lib/i18n.ts frontend/src/lib/i18n.test.ts && git commit -m "feat(frontend): add Chinese label maps for strategy/status/category"
```

### Task 6: 应用中文化到各页

**Files:**
- Modify: `frontend/src/pages/Agents.tsx`、`frontend/src/pages/Admin.tsx`、`frontend/src/pages/Home.tsx`、`frontend/src/pages/Portfolio.tsx`、`frontend/src/pages/MarketDetail.tsx`

- [ ] **Step 1: 替换英文 eyebrow 与原样英文枚举**

- `Agents.tsx`：`Rules-first Agent Runtime` → `AI 代理运行时`；代理卡片中 `{agent.strategy}` → `{strategyLabel(agent.strategy)}`（import `strategyLabel`）。
- `Admin.tsx`：`Single Admin Mode` → `单管理员模式`；市场管理列表中 `{market.status}`（:135 附近）→ `{marketStatusLabel(market.status)}`（import `marketStatusLabel`）。
- `Portfolio.tsx`：`Admin Portfolio` → `我的组合`。
- `Home.tsx` / `MarketDetail.tsx`：分类显示 `{market.category}` → `{categoryLabel(market.category)}`（import `categoryLabel`）。
- 全局自查：`grep -rn "Portfolio\|Runtime\|Single Admin\|Admin Portfolio" frontend/src` 应无英文界面文案残留。

- [ ] **Step 2: 构建验证**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/pages && git commit -m "feat(frontend): full Chinese UI (remove English leaks, localize enums)"
```

### Task 7: 骨架屏组件 + 接入加载态

**Files:**
- Create: `frontend/src/components/ui/Skeleton.tsx`
- Modify: `Home.tsx`、`Portfolio.tsx`、`Agents.tsx`、`MarketDetail.tsx`

- [ ] **Step 1: 实现 Skeleton**

`frontend/src/components/ui/Skeleton.tsx`:
```tsx
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
```

- [ ] **Step 2: 用骨架屏替换纯文字加载态**

把各页 `isLoading` 分支的 `正在加载...` 文案替换为骨架屏。示例 `Home.tsx`：
```tsx
{marketsQuery.isLoading && (
  <div className="grid gap-4 lg:grid-cols-2">
    <MarketCardSkeleton />
    <MarketCardSkeleton />
    <MarketCardSkeleton />
    <MarketCardSkeleton />
  </div>
)}
```
`Portfolio.tsx`/`Agents.tsx`/`MarketDetail.tsx` 同理用 `<Skeleton/>` 拼合理占位。

- [ ] **Step 3: 构建验证**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/components/ui/Skeleton.tsx frontend/src/pages && git commit -m "feat(frontend): skeleton loading states"
```

### Task 8: 分类标签 CategoryTabs（TDD）

**Files:**
- Create: `frontend/src/components/market/CategoryTabs.tsx`
- Test: `frontend/src/components/market/CategoryTabs.test.tsx`
- Modify: `frontend/src/pages/Home.tsx`

- [ ] **Step 1: 写失败测试**

`CategoryTabs.test.tsx`:
```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import CategoryTabs from './CategoryTabs';

describe('CategoryTabs', () => {
  it('renders an 全部 tab plus one per category and reports clicks', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CategoryTabs categories={['product', '科技']} active="all" onChange={onChange} />);

    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '产品' }));
    expect(onChange).toHaveBeenCalledWith('product');
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run src/components/market/CategoryTabs.test.tsx
```
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

`CategoryTabs.tsx`:
```tsx
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
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run src/components/market/CategoryTabs.test.tsx
```
Expected: PASS。

- [ ] **Step 5: 接入 Home（客户端筛选）**

`Home.tsx`：引入 `useState`；从 `marketsQuery.data` 派生去重分类 `const categories = [...new Set((marketsQuery.data ?? []).map(m => m.category))]`；`const [activeCat, setActiveCat] = useState('all')`；在标题区下方渲染 `<CategoryTabs categories={categories} active={activeCat} onChange={setActiveCat} />`；渲染列表前按 `activeCat==='all' || m.category===activeCat` 过滤。

- [ ] **Step 6: 构建 + 全量前端测试**

```bash
cd /d/github/LuckyMarket/frontend && npm run build && npx vitest run
```
Expected: 构建通过，全部测试 PASS。

- [ ] **Step 7: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/components/market/CategoryTabs.tsx frontend/src/components/market/CategoryTabs.test.tsx frontend/src/pages/Home.tsx && git commit -m "feat(frontend): category tabs with client-side filtering"
```

### Task 9: 交易二次确认弹窗（容错）

**Files:**
- Create: `frontend/src/components/ui/ConfirmDialog.tsx`
- Modify: `frontend/src/pages/MarketDetail.tsx`

- [ ] **Step 1: 实现 ConfirmDialog（Radix Dialog 封装）**

`ConfirmDialog.tsx`:
```tsx
import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;        // 确认详情内容
  confirmLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
}

export default function ConfirmDialog({
  open, onOpenChange, title, children, confirmLabel = '确认', onConfirm, pending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fluid-glass-card fixed left-1/2 top-1/2 z-[70] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 p-6">
          <Dialog.Title className="text-xl font-semibold text-white">{title}</Dialog.Title>
          <div className="mt-4 space-y-2 text-sm text-slate-200">{children}</div>
          <div className="mt-6 flex gap-3">
            <Dialog.Close className="min-h-[48px] flex-1 rounded-xl bg-white/10 px-4 text-base font-medium text-white hover:bg-white/20">
              取消
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="outcome-yes min-h-[48px] flex-1 rounded-xl px-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: 接入 MarketDetail——"确认买入"先弹确认**

在 `MarketDetail.tsx`：新增 `const [confirmOpen, setConfirmOpen] = useState(false)`；把"确认买入"按钮的 `onClick` 由 `handleTrade` 改为 `() => setConfirmOpen(true)`（保留 disabled 条件）；新增 `handleConfirm` = 关闭弹窗后调用原 `handleTrade`。在组件返回里加：
```tsx
<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="确认交易"
  confirmLabel="确认买入"
  pending={tradeMutation.isPending}
  onConfirm={async () => { setConfirmOpen(false); await handleTrade(); }}
>
  <div>市场：{market.title}</div>
  <div>选择：{selectedOutcome?.label}</div>
  <div>份额：{shares}</div>
  {quoteMutation.data && <div>预计点数：{formatPoints(quoteMutation.data.pointsAmount)}</div>}
  <div className="text-slate-400">确认后将按当前市价成交并扣除点数。</div>
</ConfirmDialog>
```

- [ ] **Step 3: 构建验证**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 通过。

- [ ] **Step 4: 手动验证下单流程（推荐）**

启动前后端后，在详情页点"确认买入"→ 应弹确认框；点取消不下单，点确认才下单并出 Toast。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/components/ui/ConfirmDialog.tsx frontend/src/pages/MarketDetail.tsx && git commit -m "feat(frontend): require trade confirmation dialog (容错)"
```

### Task 10: Framer Motion 动效（低风险范围）

**Files:**
- Create: `frontend/src/lib/motion.ts`
- Modify: `frontend/src/pages/Home.tsx`（列表入场 stagger）、各页根容器（淡入）

> 范围控制：只做"页面挂载淡入"和"卡片列表入场 stagger"，**不引入 AnimatePresence 路由切换**（RR7 下易出 bug）。卡片 hover 已由 CSS `.fluid-glass-card:hover` 处理，无需 JS。

- [ ] **Step 1: 定义 variants（含 reduced-motion）**

`frontend/src/lib/motion.ts`:
```ts
export const pageFade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const listItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const } },
};
```
> Framer Motion 默认会在用户系统开启"减少动态"时弱化动画（配合 `MotionConfig reducedMotion="user"`，见下一步）。

- [ ] **Step 2: 在 App 根用 MotionConfig 尊重系统偏好**

`App.tsx`：从 `framer-motion` 引入 `MotionConfig`，把 `<AppRoutes/>` 包一层 `<MotionConfig reducedMotion="user">...</MotionConfig>`。

- [ ] **Step 3: Home 列表入场 stagger**

`Home.tsx`：把卡片列表外层 `<div className="grid ...">` 换成 `<motion.div className="grid ..." variants={staggerContainer} initial="initial" animate="animate">`，每个 `<MarketCard>` 用 `<motion.div variants={listItem}>` 包裹（import `motion`）。

- [ ] **Step 4: 构建验证**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/lib/motion.ts frontend/src/App.tsx frontend/src/pages/Home.tsx && git commit -m "feat(frontend): subtle Framer Motion entrance animations (reduced-motion aware)"
```

### Task 11: 清理死代码 + 未定义类

**Files:**
- Delete: `frontend/src/App.css`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 删除未被引用的模板 CSS**

```bash
rm /d/github/LuckyMarket/frontend/src/App.css
```
> 已确认 `App.css` 未被任何文件 import。

- [ ] **Step 2: 替换未定义类**

`App.tsx`：`className="app-container"` → `className="min-h-screen"`；6 处 `<main className="main-content">` → `<main>`（这些类全项目未定义；页面自身已含容器与 `pb-24` 间距）。

- [ ] **Step 3: 构建 + 确认无残留引用**

```bash
cd /d/github/LuckyMarket/frontend && grep -rn "App.css\|app-container\|main-content" src; npm run build
```
Expected: grep 无结果；构建通过。

- [ ] **Step 4: Commit**

```bash
cd /d/github/LuckyMarket && git rm frontend/src/App.css && git add frontend/src/App.tsx && git commit -m "chore(frontend): remove dead App.css and undefined layout classes"
```

---

# 阶段 P3 · 价格走势图（含只读后端端点）

### Task 12: 后端 getPriceHistory（TDD）

**Files:**
- Modify: `src/services/markets.ts`
- Test: `tests/priceHistory.test.ts`

- [ ] **Step 1: 写失败测试**

`tests/priceHistory.test.ts`:
```ts
import { describe, expect, test } from 'vitest';
import { LedgerService } from '../src/services/ledger.js';
import { MarketService } from '../src/services/markets.js';
import { notFound } from '../src/domain/errors.js';
import { createTestDb } from './helpers.js';

function tomorrow(): string {
  return new Date(Date.now() + 86_400_000).toISOString();
}

describe('MarketService.getPriceHistory', () => {
  test('returns empty array for a market with no trades', () => {
    const db = createTestDb();
    const markets = new MarketService(db, new LedgerService(db));
    const market = markets.createMarket({
      title: 'No trades yet', category: 'product', closeTime: tomorrow(),
      settlementSource: 'src', outcomes: ['Yes', 'No'],
    });
    expect(markets.getPriceHistory(market.id)).toEqual([]);
  });

  test('returns one snapshot per outcome per trade, ascending by time', () => {
    const db = createTestDb();
    const ledger = new LedgerService(db);
    const markets = new MarketService(db, ledger);
    const account = ledger.createAccount({ kind: 'human', handle: 'h', displayName: 'H', initialPoints: 1000 });
    const market = markets.createMarket({
      title: 'M', category: 'product', closeTime: tomorrow(),
      settlementSource: 'src', outcomes: ['Yes', 'No'],
    });
    const outcome = markets.getMarket(market.id).outcomes[0];
    markets.placeTrade({ accountId: account.id, marketId: market.id, outcomeId: outcome.id, side: 'buy', shares: 5 });

    const history = markets.getPriceHistory(market.id);
    expect(history.length).toBe(2); // 2 outcomes x 1 trade
    expect(history[0]).toHaveProperty('outcomeId');
    expect(history[0]).toHaveProperty('price');
    expect(history[0]).toHaveProperty('createdAt');
  });

  test('throws for unknown market', () => {
    const db = createTestDb();
    const markets = new MarketService(db, new LedgerService(db));
    expect(() => markets.getPriceHistory('mkt_nope')).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /d/github/LuckyMarket && npx vitest run tests/priceHistory.test.ts
```
Expected: FAIL（`getPriceHistory` 不存在）。

- [ ] **Step 3: 实现 service 方法 + 类型**

在 `src/services/markets.ts` 增加类型与映射，并在 `MarketService` 类内新增方法（紧邻 `getActivity` 之后）：
```ts
// 顶部类型区
export interface PriceSnapshotRecord {
  outcomeId: string;
  price: number;
  createdAt: string;
}
interface PriceSnapshotRow {
  id: string;
  market_id: string;
  outcome_id: string;
  price: number;
  created_at: string;
}
function mapSnapshot(row: PriceSnapshotRow): PriceSnapshotRecord {
  return { outcomeId: row.outcome_id, price: row.price, createdAt: row.created_at };
}

// MarketService 类内
getPriceHistory(marketId: string): PriceSnapshotRecord[] {
  this.getMarketRow(marketId); // 不存在则抛 notFound
  const rows = this.db
    .prepare('SELECT * FROM market_price_snapshots WHERE market_id = ? ORDER BY created_at ASC, id ASC')
    .all(marketId) as PriceSnapshotRow[];
  return rows.map(mapSnapshot);
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /d/github/LuckyMarket && npx vitest run tests/priceHistory.test.ts
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add src/services/markets.ts tests/priceHistory.test.ts && git commit -m "feat(api): MarketService.getPriceHistory reads price snapshots"
```

### Task 13: 后端路由 GET /markets/:id/price-history（TDD）

**Files:**
- Modify: `src/http/routes.ts`
- Test: `tests/api.test.ts`（新增 1 例）

- [ ] **Step 1: 在 api.test.ts 增加失败测试**

在 `tests/api.test.ts` 的 describe 内追加：
```ts
test('returns price history after a trade', async () => {
  const db = createTestDb();
  await seedDemoDataForTest(db);
  const server = await buildServer({ db, schedulerEnabled: false, maxAgentsPerTick: 2 });
  try {
    const market = (await server.inject({ method: 'GET', url: '/markets' }))
      .json<{ markets: Array<{ id: string; outcomes: Array<{ id: string }> }> }>().markets[0];
    const accountId = (await server.inject({ method: 'GET', url: '/accounts/handle/wang-ge' }))
      .json<{ account: { id: string } }>().account.id;
    await server.inject({
      method: 'POST', url: `/markets/${market.id}/trades`,
      payload: { accountId, outcomeId: market.outcomes[0].id, side: 'buy', shares: 2 },
    });

    const res = await server.inject({ method: 'GET', url: `/markets/${market.id}/price-history` });
    expect(res.statusCode).toBe(200);
    const history = res.json<{ history: Array<{ outcomeId: string; price: number; createdAt: string }> }>().history;
    expect(history.length).toBeGreaterThanOrEqual(market.outcomes.length);
  } finally {
    await server.close();
    db.close();
  }
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /d/github/LuckyMarket && npx vitest run tests/api.test.ts
```
Expected: 新增用例 FAIL（404，路由不存在）。

- [ ] **Step 3: 加路由**

在 `src/http/routes.ts` 紧邻 `/markets/:id/activity` 路由之后新增：
```ts
server.get<{ Params: { id: string } }>('/markets/:id/price-history', async (request) => ({
  history: markets.getPriceHistory(request.params.id)
}));
```

- [ ] **Step 4: 运行确认通过 + 后端构建**

```bash
cd /d/github/LuckyMarket && npx vitest run tests/api.test.ts && npm run build
```
Expected: PASS；`tsc` 通过。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add src/http/routes.ts tests/api.test.ts && git commit -m "feat(api): add GET /markets/:id/price-history (read-only)"
```

### Task 14: 前端数据层（类型 + api + hook）

**Files:**
- Modify: `frontend/src/types/index.ts`、`frontend/src/lib/api-client.ts`、`frontend/src/hooks/useMarkets.ts`

- [ ] **Step 1: 类型**

`frontend/src/types/index.ts` 追加：
```ts
export interface PriceSnapshot {
  outcomeId: string;
  price: number;
  createdAt: string;
}
```

- [ ] **Step 2: api-client**

`frontend/src/lib/api-client.ts`（Market APIs 区）追加，并在顶部 import 增加 `PriceSnapshot`：
```ts
export async function getMarketPriceHistory(marketId: string): Promise<PriceSnapshot[]> {
  const response = await apiClient.get<{ history: PriceSnapshot[] }>(`/markets/${marketId}/price-history`);
  return response.data.history;
}
```

- [ ] **Step 3: hook**

`frontend/src/hooks/useMarkets.ts` 追加（并 import `getMarketPriceHistory`）：
```ts
export function useMarketPriceHistory(id: string | undefined) {
  return useQuery({
    queryKey: ['market', id, 'price-history'],
    queryFn: () => getMarketPriceHistory(id as string),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });
}
```

- [ ] **Step 4: 类型检查**

```bash
cd /d/github/LuckyMarket/frontend && npx tsc -b
```
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/types/index.ts frontend/src/lib/api-client.ts frontend/src/hooks/useMarkets.ts && git commit -m "feat(frontend): price-history type, api client, and query hook"
```

### Task 15: 快照→图表序列 转换（TDD）

**Files:**
- Create: `frontend/src/lib/priceHistory.ts`
- Test: `frontend/src/lib/priceHistory.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/priceHistory.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toChartSeries } from './priceHistory';
import type { PriceSnapshot } from '@/types';

const snaps: PriceSnapshot[] = [
  { outcomeId: 'a', price: 60, createdAt: '2026-06-16T00:00:00.000Z' },
  { outcomeId: 'b', price: 40, createdAt: '2026-06-16T00:00:00.000Z' },
  { outcomeId: 'a', price: 70, createdAt: '2026-06-16T01:00:00.000Z' },
  { outcomeId: 'b', price: 30, createdAt: '2026-06-16T01:00:00.000Z' },
];

describe('toChartSeries', () => {
  it('pivots snapshots into one row per timestamp keyed by outcomeId', () => {
    const rows = toChartSeries(snaps);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ t: '2026-06-16T00:00:00.000Z', a: 60, b: 40 });
    expect(rows[1]).toMatchObject({ t: '2026-06-16T01:00:00.000Z', a: 70, b: 30 });
  });

  it('returns empty array for empty input', () => {
    expect(toChartSeries([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run src/lib/priceHistory.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现**

`frontend/src/lib/priceHistory.ts`:
```ts
import type { PriceSnapshot } from '@/types';

export type ChartRow = { t: string } & Record<string, number | string>;

/** 把 (outcome,timestamp) 快照透视成每时间点一行，键为 outcomeId */
export function toChartSeries(snapshots: PriceSnapshot[]): ChartRow[] {
  const byTime = new Map<string, ChartRow>();
  for (const s of snapshots) {
    const row = byTime.get(s.createdAt) ?? { t: s.createdAt };
    row[s.outcomeId] = s.price;
    byTime.set(s.createdAt, row);
  }
  return [...byTime.values()].sort((a, b) => a.t.localeCompare(b.t));
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run src/lib/priceHistory.test.ts
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/lib/priceHistory.ts frontend/src/lib/priceHistory.test.ts && git commit -m "feat(frontend): price-history snapshot to chart-series transform"
```

### Task 16: 安装 recharts 并实现 PriceChart

**Files:**
- Modify: `frontend/package.json`（recharts）
- Create: `frontend/src/components/market/PriceChart.tsx`
- Modify: `frontend/src/pages/MarketDetail.tsx`

- [ ] **Step 1: 安装 recharts**

```bash
cd /d/github/LuckyMarket/frontend && npm install recharts@^2.15.0
```
Expected: 安装成功。若出现 React 19 peer 警告但安装完成，可继续（recharts 2.15+ 兼容 React 19）；若安装失败，停下并反馈（fallback：手写 SVG sparkline，不阻塞其它阶段）。

- [ ] **Step 2: 实现 PriceChart**

`frontend/src/components/market/PriceChart.tsx`:
```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { MarketOutcome, PriceSnapshot } from '@/types';
import { toChartSeries } from '@/lib/priceHistory';

const COLORS = ['#10b981', '#60a5fa', '#a78bfa', '#f59e0b', '#f472b6'];

export default function PriceChart({
  snapshots, outcomes,
}: { snapshots: PriceSnapshot[]; outcomes: MarketOutcome[] }) {
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
            contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
            formatter={(value: number, key) => [`${value.toFixed(0)}%`, outcomes.find(o => o.id === key)?.label ?? key]}
            labelFormatter={() => ''}
          />
          {outcomes.map((o, i) => (
            <Line key={o.id} type="monotone" dataKey={o.id} stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2} dot={false} name={o.label} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: 在 MarketDetail 渲染图表**

`MarketDetail.tsx`：import `useMarketPriceHistory` 与 `PriceChart`；在组件内 `const historyQuery = useMarketPriceHistory(id)`；在"最近活动"卡片上方新增一张玻璃卡片：
```tsx
<div className="fluid-glass-card p-6">
  <h2 className="mb-4 text-xl font-semibold text-white">价格走势</h2>
  <PriceChart snapshots={historyQuery.data ?? []} outcomes={market.outcomes} />
</div>
```

- [ ] **Step 4: 构建 + 全量前端测试**

```bash
cd /d/github/LuckyMarket/frontend && npm run build && npx vitest run
```
Expected: 构建通过；全部测试 PASS。

- [ ] **Step 5: 手动验证（推荐）**

启动前后端 → 详情页连下 2 笔交易 → 价格走势卡片出现多结果折线；新市场显示"暂无足够历史"。

- [ ] **Step 6: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/package.json frontend/package-lock.json frontend/src/components/market/PriceChart.tsx frontend/src/pages/MarketDetail.tsx && git commit -m "feat(frontend): price history line chart on market detail"
```

---

# 阶段 P4 · 人类 vs AI 对比（最小可交付）

### Task 17: Agents 页加"人类 vs AI"概览

**Files:**
- Modify: `frontend/src/pages/Agents.tsx`

> 按 spec §5 的"最小可交付"：仅用现有 `GET /agents` + `GET /accounts` 字段。展示 AI 代理数 vs 人类账户数、AI 累计今日行动数、活跃度。**不展示胜率/收益**（无法从现有只读接口推导，不造假、不加后端）。

- [ ] **Step 1: 取数并渲染对比卡**

`Agents.tsx`：新增 `useQuery(['accounts'], listAccounts)`（import `listAccounts`）；在页面顶部（代理列表上方）渲染两栏对比卡：
```tsx
<div className="mb-5 grid gap-4 sm:grid-cols-2">
  <div className="fluid-glass-card p-5">
    <div className="text-sm text-slate-400">人类参与者</div>
    <div className="mt-2 text-4xl font-bold text-white">
      {accountsQuery.data?.filter(a => a.kind === 'human').length ?? 0}
    </div>
    <div className="mt-1 text-sm text-slate-400">个账户</div>
  </div>
  <div className="fluid-glass-card p-5">
    <div className="text-sm text-slate-400">AI 代理</div>
    <div className="mt-2 text-4xl font-bold text-emerald-300">{agentsQuery.data?.length ?? 0}</div>
    <div className="mt-1 text-sm text-slate-400">
      今日累计行动 {agentsQuery.data?.reduce((s, a) => s + a.actionsUsedToday, 0) ?? 0} 次
    </div>
  </div>
</div>
```

- [ ] **Step 2: 构建验证**

```bash
cd /d/github/LuckyMarket/frontend && npm run build
```
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
cd /d/github/LuckyMarket && git add frontend/src/pages/Agents.tsx && git commit -m "feat(frontend): human-vs-AI overview (real metrics only)"
```

---

# 收尾验证

### Task 18: 全量回归 + 编译产物核对

- [ ] **Step 1: 后端全测 + 构建**

```bash
cd /d/github/LuckyMarket && npm test && npm run build
```
Expected: 全部 PASS；`tsc` 通过。

- [ ] **Step 2: 前端全测 + 构建**

```bash
cd /d/github/LuckyMarket/frontend && npx vitest run && npm run build
```
Expected: 全部 PASS；构建通过。

- [ ] **Step 3: 编译 CSS 终检（确认 P0 修复稳固）**

```bash
cd /d/github/LuckyMarket/frontend && for f in dist/assets/*.css; do echo "$(wc -c < "$f") bytes"; grep -c 'backdrop-blur' "$f"; done
```
Expected: CSS 体积数十 KB；`backdrop-blur` 计数 > 0。

- [ ] **Step 4: 无障碍/中文化自查**

```bash
cd /d/github/LuckyMarket/frontend && grep -rn "text-xs" src/pages src/components/layout | cat; grep -rn "Portfolio\|Runtime\|Single Admin" src | cat
```
Expected: 关键正文无 `text-xs` 残留（如有，确认是否可接受的纯装饰元素）；无英文界面文案。

- [ ] **Step 5: 手动冒烟（推荐，需前后端同时启动）**

后端 `npm run dev`（:4000）+ 前端 `npm run dev`（:3000）。逐页过：首页（分类筛选/卡片观感/骨架屏）、详情（48px 概率/价格走势/二次确认下单）、组合、AI 代理（人类vsAI 概览）、管理（中文状态）。

---

## Plan Review Loop（执行前）

按 writing-plans 流程，本计划写完后将派发 plan-document-reviewer 子代理审查（提供本计划与 spec 路径）。若服务不可用则内联审查并标注。

## 执行交接

计划保存于 `docs/superpowers/plans/2026-06-16-luckymarket-frontend-remediation.md`。两种执行方式：
1. **Subagent-Driven（推荐）**：每个 Task 派发新子代理，任务间双段审查。
2. **Inline 执行**：本会话内分批执行，带检查点。
