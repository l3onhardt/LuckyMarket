# LuckyMarket 前端修复与达标设计文档

**日期**: 2026-06-16
**作者**: Claude (Opus 4.8)
**版本**: 1.0
**关联文档**: [2026-06-15-luckymarket-frontend-design.md](./2026-06-15-luckymarket-frontend-design.md)（原始前端设计，本文档为其"未兑现部分"的修复增量 spec）

---

## 1. 背景与问题

原始前端 spec（2026-06-15）明确要求：**融合 Apple 设计语言、极致易用（70 岁老人也能轻松上手）、纯中文界面、Polymarket 金融感、液态玻璃质感**。

实现完成后被标记为"做好了"，但实际启动前端时界面极丑、交互困难。经排查，**问题不在设计，而在实现把这份 spec 做烂了**——一次没收尾的 Tailwind v4 迁移导致全局样式九成失效，叠加若干 spec 要求未落实。

### 1.1 根因（致命 bug，有编译产物为证）

`frontend/src/index.css:1-3` 使用 Tailwind v3 旧指令：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

但项目实际安装的是 **Tailwind v4**（`@tailwindcss/postcss@4.3.1`）。v4 已废弃这三条指令，必须改用 `@import "tailwindcss";`。提交 `9c63482 fix: update PostCSS config for Tailwind CSS v4` 只改了 `postcss.config.js`，**漏改 CSS 入口**——典型的迁移做一半。

后果：v4 默认主题未加载，**所有依赖主题值的工具类静默失效**。证据为编译产物 `frontend/dist/assets/index-CAj2UzHJ.css`（仅 7.8KB）：

- ✅ 生成的（不查主题的固定值类）：`flex` `grid` `fixed` `sticky` `items-center` `rounded-full` `border`
- ❌ **完全缺失**（组件中大量使用）：所有 `px-*`/`py-*` 内边距、`gap-*` 间距、`text-xs~4xl` 字号、所有颜色（`text-white`/`bg-slate-800` 等）、`font-bold/medium`、`rounded-xl/lg/2xl`、`backdrop-blur-xl`、`max-w-*`、所有 `sm:`/`lg:` 响应式

呈现结果：无间距（挤成一团）、无字号层级、无颜色、不加粗、几乎无圆角、底部固定导航遮挡内容（`pb-24` 也未生成）。

### 1.2 承诺 vs 现实（差距清单）

| spec 要求 | 现状 | 严重度 |
|---|---|---|
| Tailwind 工具类全部生效 | v4 迁移做一半，~90% 工具类不生成 | 🔴 致命 |
| 最小字号 14px（老人可读） | 顶栏/底栏/标签大量 `text-xs`=12px | 🔴 高 |
| 按钮最小高度 48px | `py-2/3`，无 min-height，约 36–40px | 🔴 高 |
| 重要操作二次确认（容错设计） | 详情页"确认买入"直接下单，无确认弹窗（Radix Dialog 已装未用） | 🔴 高 |
| 概率数字 48px/700（最显眼） | 详情页 `text-4xl`≈36px，首页 `text-2xl` | 🟡 中 |
| 底部导航 80px 宽 / 32px 间距 | `min-w-16`=64px / `justify-around` | 🟡 中 |
| 纯中文界面 | 英文泄漏："Admin Portfolio""Single Admin Mode""Rules-first Agent Runtime"、策略/状态原样英文 | 🟡 中 |
| 分类标签 CategoryTabs 筛选 | 未实现，首页平铺全部 | 🟡 中 |
| Skeleton 加载态 + 脉动 | 纯文字"正在加载..." | 🟡 中 |
| 价格走势图 PriceChart | 未实现，且无读取接口暴露快照数据 | 🟡 中 |
| Framer Motion 流畅动画 | 已装，基本未用 | 🟢 低 |
| 死代码 | `App.css` 废模板 + `.app-container`/`.main-content` 未定义 | 🟢 低 |

### 1.3 已知有意裁剪（不算缺陷，本轮沿用）

- 登录/注册被改为跳转首页（`Login.tsx`/`Register.tsx` 单管理员 demo 模式）
- 多用户体系 / 邀请码暂缓（`Admin.tsx:69` 自述"本轮单 admin 模式"）

---

## 2. 目标与范围

### 2.1 目标

让现有 5 个页面（市场列表 / 市场详情 / 组合 / AI 代理 / 管理）真正兑现原始 spec 的承诺：**苹果质感、80 岁能用、纯中文、Polymarket 金融感**，并补齐 spec 中缺失的关键视觉件。

### 2.2 范围（已与用户确认）

采用"修复 + 补齐视觉件"方案，并经用户同意为价格走势图新增一个只读后端端点。

**本轮包含**：P0 样式修复、P1 无障碍硬指标、P2 容错+体验+中文化+清理、P3 价格走势图（含后端只读端点）。

**本轮不含**：登录/注册多用户体系、邀请码、用户管理；不修改任何后端写/交易/结算逻辑。

### 2.3 设计原则（继承自原始 spec §设计原则总结）

少即是多 · 显而易见 · 即时反馈 · 容错设计 · 性能优先（60fps，<1s 加载）。

---

## 3. 设计决策（已锁定）

| 决策点 | 选择 | 理由 |
|---|---|---|
| Tailwind 入口 | `@import "tailwindcss";` + `@theme` 块承载自定义色/字体 | v4 唯一正确写法；v4 自动扫描 content |
| `tailwind.config.js` | 删除 | v4 不再需要 JS config；配置迁入 CSS `@theme` |
| 图表库 | **recharts**（新增依赖） | 声明式、易主题化、契合"简化折线图"，开发快 |
| 二次确认弹窗 | Radix Dialog（已装） | spec 已选用，无需新依赖 |
| 动效 | Framer Motion（已装） | spec 已选用；遵守 `prefers-reduced-motion` |
| 价格历史数据源 | 新增只读端点 `GET /markets/:id/price-history` | 快照数据已落库（`market_price_snapshots`），仅缺读取接口 |
| 验证方式 | 由实现方自行 `npm run build` + `tsc` + 检查编译产物（用户无需逐步截图） | 用户已授权"我自己验证就行" |

---

## 4. 分阶段方案

每阶段结束须自行验证（build / tsc / 编译产物 grep），通过后方可进入下一阶段。

### P0 · 复活样式（致命 bug）

**改动**
- `frontend/src/index.css`：`@tailwind base/components/utilities;` → `@import "tailwindcss";`
- 在 index.css 顶部新增 `@theme`，承载原始 spec 的语义色与字体：
  ```css
  @theme {
    --color-success: #10b981;   /* YES / 看涨 / 成功 */
    --color-primary: #60a5fa;   /* 操作 / 链接 / 选中 */
    --font-sans: "Inter", -apple-system, system-ui, sans-serif;
  }
  ```
  注：不重定义 `--color-neutral`（避免覆盖 Tailwind 默认 `neutral-*` 调色阶；组件用的灰色是 `slate-*`）。
- 保留现有 `@layer base` 与 `@layer components`（`.fluid-glass-*` 等本就能编译）
- 删除 `frontend/tailwind.config.js`

**验收**
- 编译 CSS 体积从 ~7.8KB 显著增大
- 编译 CSS 含：`px-`/`gap-`/`text-`(字号)/颜色类/`rounded-xl`/`backdrop-blur`/`sm:`/`lg:` 响应式
- `npm run build` 与 `tsc -b` 通过
- 启动后首页/详情呈现暗色液态玻璃设计（间距、字号层级、颜色、圆角到位）

### P1 · 无障碍硬指标（对照 spec §交互设计 / §字体层级）

**改动**
- **最小 14px**：全项目排查 `text-xs`(12px) 文本，正文/标签一律提升为 `text-sm`(14px)（`TopBar` 副标题、`BottomNav` 标签、各页 tag/小标签）
- **按钮 ≥48px 高**：`Button.tsx` 尺寸档重订（md/lg 保证 `min-h-[48px]`）；详情页"预估报价/确认买入"、Agents/Admin 操作按钮统一加最小高度
- **底部导航**（`BottomNav.tsx`）：每项宽 ≥80px、图标 20→24px、栏高加高、标签 `text-sm`、加大项间距
- **概率数字 48px/700**：`MarketDetail.tsx` 结果按钮概率 `text-4xl`→`text-5xl`（48px）`font-bold`；`Home.tsx` 卡片概率同步放大

**验收**：浏览器实测无正文 <14px；按钮/导航点击区达标；概率数字为页面最大视觉元素。

### P2 · 容错 + 体验 + 中文化 + 清理

**改动**
- **二次确认弹窗**（Radix Dialog）：`MarketDetail.tsx` 的"确认买入"先弹确认框，显示 市场标题 / 选择结果 / 份额 / 预计点数，按钮 [取消] / [确认买入]；确认后才调用 `placeTrade`。对齐 spec §市场详情 → 二次确认对话框。
- **CategoryTabs**：`Home.tsx` 新增横向可滚动分类标签组件，从 `markets` 派生分类，客户端筛选（"全部" + 各分类）。
- **Skeleton 加载态**：新增骨架占位组件，替换 `Home`/`MarketDetail`/`Portfolio`/`Agents` 的纯文字"正在加载…"，含轻微脉动。
- **全量中文化**：
  - `Home`/`Portfolio`/`Agents`/`Admin` 的英文 eyebrow 文案改中文（Admin Portfolio→我的组合、Single Admin Mode→单管理员模式、Rules-first Agent Runtime→AI 代理运行时 等）
  - 策略枚举映射中文：`data_value`→数据价值、`trend`→趋势、`contrarian`→反向、`market_maker`→做市
  - `Admin.tsx:135` 的 `market.status` 原样英文 → 开放/已关闭/已结算（复用现有状态映射）
- **Framer Motion 动效**（已装）：卡片 hover（`translateY(-4px) scale(1.01)`，spec 缓动曲线）、列表入场 stagger、页面淡入（0.3s）、弹窗 spring；统一封装并遵守 `prefers-reduced-motion`。
- **死代码清理**：删除 `frontend/src/App.css`；`App.tsx` 的 `.app-container`/`.main-content` 改为 Tailwind 工具类（或在 index.css 最小定义），消除未定义类。

**验收**：下单必经确认弹窗；分类可筛选；加载态为骨架屏；全界面无英文泄漏；动效流畅且可被系统"减少动态"关闭；无死代码与未定义类。

### P3 · 价格走势图（新增只读后端端点）

**后端（仅读，不碰写/交易/结算逻辑）**
- `src/services/markets.ts`：新增 `getPriceHistory(marketId)`，读取 `market_price_snapshots`（`SELECT * FROM market_price_snapshots WHERE market_id = ? ORDER BY created_at ASC, id ASC`），先做市场存在性校验，返回 `{ outcomeId, price, createdAt }[]`。补 `PriceSnapshotRow`/`PriceSnapshotRecord` 类型与 `mapSnapshot`。
- `src/http/routes.ts`：新增 `server.get('/markets/:id/price-history', ...)` → `{ history: markets.getPriceHistory(id) }`。
- 表结构已存在：`market_price_snapshots(id, market_id, outcome_id, price, created_at)`（`src/db/schema.ts:72`），且每笔交易已写入快照（`markets.ts:438` → `insertSnapshots`）。

**前端**
- `frontend/src/lib/api-client.ts`：新增 `getMarketPriceHistory(marketId)`；`frontend/src/types/index.ts` 补类型。
- 新增 hook `useMarketPriceHistory`。
- 新增 `PriceChart` 组件（recharts `LineChart`，按 `createdAt` 聚合为时间点、每个结果一条 `<Line>`，概率纵轴 0–100%），在 `MarketDetail.tsx` 渲染。
- `frontend/package.json` 新增 `recharts` 依赖。

**验收**：详情页展示真实历史折线；数据稀疏（如仅 1 个点）时优雅降级（显示"暂无足够历史"或单点）；`tsc`/`build` 通过。

---

## 5. 如实声明（避免过度承诺）

1. **recharts 为新增依赖**（P3 必需）。已获用户同意可加新依赖，仍在此明示。
2. **人类 vs AI 对比**（原始 spec §4）：所需"胜率/收益"指标依赖结算历史与持仓推算，当前后端数据**不一定可导出**。本轮**不编造数据**——能从现有接口算出的真实指标（参与度/活跃度/行动数等）才展示，算不出的指标标注或省略。该模块在本轮按"尽力而为、真实优先"处理，必要时降级为代理概览。
3. 价格历史依赖交易产生的快照；**新建或零成交市场无历史**，前端须优雅降级，不得显示空白或报错图表。

---

## 6. 验证与测试

- **逐阶段验证**：`npm run build`（前端 `tsc -b && vite build`）+ 检查编译 CSS 是否包含目标工具类；后端改动跑现有测试（vitest）。
- **新增单测**（按 TDD，先写后实现）：
  - 后端 `getPriceHistory`（含市场不存在、空快照、多结果排序）
  - 前端价格历史 → recharts 数据的转换函数（按时间点聚合）
  - CategoryTabs 筛选逻辑、策略枚举中文映射
- **回归**：现有 `Button.test.tsx`、`ProtectedRoute.test.tsx`、`utils.test.ts` 须保持通过。

---

## 7. 不在本轮范围

- 登录 / 注册 / JWT / 多用户认证
- 邀请码管理、用户管理（角色升降）
- 任何后端写路径（交易、结算、调度）逻辑变更
- 后端价格历史端点之外的新接口

---

**设计版本**: 1.0
**最后更新**: 2026-06-16
