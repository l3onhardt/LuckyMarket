# LuckyMarket 前端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 LuckyMarket 公司内部预测市场平台的前端应用，采用液态玻璃设计语言，提供极致易用的交易体验。

**Architecture:** React 18 SPA + TypeScript + Vite，使用 TanStack Query 管理 API 数据，Tailwind CSS 实现液态玻璃效果，React Router 处理路由，Zustand 管理认证状态。采用组件化架构，每个页面由多个可复用组件组成。

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query v5, React Router v6, Zustand, Radix UI, Framer Motion, Lucide React, axios, zod, date-fns

---

## 文件结构规划

```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                    # 基础 UI 组件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Dialog.tsx
│   │   │   └── Toast.tsx
│   │   ├── layout/                # 布局组件
│   │   │   ├── TopBar.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   ├── market/                # 市场相关组件
│   │   │   ├── MarketCard.tsx
│   │   │   ├── CategoryTabs.tsx
│   │   │   ├── OutcomeDisplay.tsx
│   │   │   ├── TradePanel.tsx
│   │   │   └── ActivityFeed.tsx
│   │   ├── portfolio/             # 投资组合组件
│   │   │   ├── PortfolioSummary.tsx
│   │   │   ├── PositionCard.tsx
│   │   │   └── TransactionHistory.tsx
│   │   ├── agent/                 # AI 代理组件
│   │   │   ├── HumanVsAI.tsx
│   │   │   └── AgentCard.tsx
│   │   └── admin/                 # 管理组件
│   │       ├── InviteCodeManager.tsx
│   │       ├── CreateMarketForm.tsx
│   │       ├── SettleMarketList.tsx
│   │       └── UserManagement.tsx
│   ├── pages/
│   │   ├── Home.tsx               # 市场列表
│   │   ├── MarketDetail.tsx       # 市场详情
│   │   ├── Portfolio.tsx          # 投资组合
│   │   ├── Agents.tsx             # AI 代理
│   │   ├── Admin.tsx              # 管理页面
│   │   ├── Login.tsx              # 登录
│   │   └── Register.tsx           # 注册
│   ├── lib/
│   │   ├── api.ts                 # API client
│   │   ├── auth.ts                # 认证工具
│   │   └── utils.ts               # 工具函数
│   ├── hooks/
│   │   ├── useAuth.ts             # 认证 Hook
│   │   ├── useMarkets.ts          # 市场数据 Hook
│   │   └── useToast.ts            # Toast 提示 Hook
│   ├── store/
│   │   └── authStore.ts           # 认证状态
│   ├── types/
│   │   └── index.ts               # 类型定义
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── .env.example
```

---

## Task 1: 项目初始化和基础配置

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/.env.example`
- Create: `frontend/index.html`

- [ ] **Step 1: 创建前端目录并初始化项目**

```bash
mkdir -p frontend
cd frontend
npm create vite@latest . -- --template react-ts
```

- [ ] **Step 2: 安装核心依赖**

```bash
npm install react-router-dom @tanstack/react-query axios zustand zod date-fns
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: 安装 UI 和动画库**

```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tabs
npm install framer-motion lucide-react
```

- [ ] **Step 4: 配置 Vite**

更新 `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
```

- [ ] **Step 5: 配置 Tailwind CSS**

更新 `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'success': '#10b981',
        'neutral': '#94a3b8',
        'primary': '#60a5fa',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 6: 配置环境变量**

创建 `.env.example`:
```
VITE_API_BASE_URL=http://localhost:4000
```

- [ ] **Step 7: 更新 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>预测市场</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: 提交**

```bash
git add frontend/
git commit -m "feat: initialize frontend project with Vite, React, TypeScript, and Tailwind CSS"
```

---

## Task 2: 类型定义和工具函数

**Files:**
- Create: `frontend/src/types/index.ts`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/lib/cn.ts`

- [ ] **Step 1: 定义核心类型**

创建 `src/types/index.ts`:
```typescript
export type AccountKind = 'human' | 'agent' | 'system';
export type AccountStatus = 'active' | 'disabled';
export type MarketStatus = 'open' | 'closed' | 'settled';

export interface Account {
  id: string;
  kind: AccountKind;
  handle: string;
  displayName: string;
  status: AccountStatus;
  role?: 'user' | 'admin';
  createdAt: string;
  lastActiveAt: string | null;
}

export interface MarketOutcome {
  id: string;
  marketId: string;
  label: string;
  sortOrder: number;
  poolQuantity: number;
  // 计算出的价格（前端从 poolQuantity 计算）
  price?: number;
}

export interface Market {
  id: string;
  title: string;
  category: string;
  status: MarketStatus;
  closeTime: string;
  settlementSource: string;
  winningOutcomeId: string | null;
  liquidityParameter: number;
  createdAt: string;
  outcomes?: MarketOutcome[];
}

export interface Position {
  marketId: string;
  marketTitle: string;
  outcomeId: string;
  outcomeLabel: string;
  shares: number;
  avgPrice: number;
  currentValue: number;
  costBasis: number;
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  type: string;
  amount: number;
  balance: number;
  description: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  handle: string;
  displayName: string;
  // 统计数据（前端计算）
  winRate?: number;
  profitRate?: number;
}

export interface TradeQuote {
  outcomeId: string;
  side: 'buy' | 'sell';
  shares: number;
  cost: number;
  newPrice: number;
}

export interface Activity {
  id: string;
  type: 'trade' | 'settle';
  accountHandle: string;
  accountDisplayName: string;
  outcomeLabel?: string;
  shares?: number;
  side?: 'buy' | 'sell';
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: Account;
}
```

- [ ] **Step 2: 创建工具函数**

创建 `src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num);
}

export function formatPercent(num: number): string {
  return `${(num * 100).toFixed(1)}%`;
}

export function formatDate(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  
  return d.toLocaleDateString('zh-CN');
}

export function calculatePrices(outcomes: Array<{ poolQuantity: number }>): number[] {
  const total = outcomes.reduce((sum, o) => sum + o.poolQuantity, 0);
  return outcomes.map(o => o.poolQuantity / total);
}
```

- [ ] **Step 3: 安装缺失的依赖**

```bash
npm install clsx tailwind-merge
```

- [ ] **Step 4: 测试工具函数**

创建 `src/lib/utils.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { formatNumber, formatPercent, calculatePrices } from './utils';

describe('utils', () => {
  it('formatNumber', () => {
    expect(formatNumber(1234)).toBe('1,234');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('formatPercent', () => {
    expect(formatPercent(0.68)).toBe('68.0%');
    expect(formatPercent(0.325)).toBe('32.5%');
  });

  it('calculatePrices', () => {
    const outcomes = [
      { poolQuantity: 680 },
      { poolQuantity: 320 },
    ];
    const prices = calculatePrices(outcomes);
    expect(prices[0]).toBeCloseTo(0.68);
    expect(prices[1]).toBeCloseTo(0.32);
  });
});
```

- [ ] **Step 5: 运行测试**

```bash
npm test
```

预期: 所有测试通过

- [ ] **Step 6: 提交**

```bash
git add src/types/ src/lib/
git commit -m "feat: add TypeScript types and utility functions"
```

---

## Task 3: API Client 和认证存储

**Files:**
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/store/authStore.ts`
- Create: `frontend/src/lib/auth.ts`

- [ ] **Step 1: 创建 API Client**

创建 `src/lib/api.ts`:
```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加 token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：处理错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token 过期，清除并跳转到登录页
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 2: 创建认证状态管理**

创建 `src/store/authStore.ts`:
```typescript
import { create } from 'zustand';
import type { Account } from '@/types';

interface AuthState {
  user: Account | null;
  token: string | null;
  setAuth: (user: Account, token: string) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: (() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  })(),
  token: localStorage.getItem('token'),
  
  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user, token });
  },
  
  clearAuth: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },
  
  isAuthenticated: () => {
    return get().token !== null;
  },
  
  isAdmin: () => {
    return get().user?.role === 'admin';
  },
}));
```

- [ ] **Step 3: 创建认证工具函数**

创建 `src/lib/auth.ts`:
```typescript
import { apiClient } from './api';
import type { AuthResponse } from '@/types';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  inviteCode: string;
  username: string;
  displayName: string;
  password: string;
}

export async function login(params: LoginParams): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', params);
  return response.data;
}

export async function register(params: RegisterParams): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/register', params);
  return response.data;
}

export async function getCurrentUser(): Promise<Account> {
  const response = await apiClient.get<{ user: Account }>('/auth/me');
  return response.data.user;
}
```

- [ ] **Step 4: 提交**

```bash
git add src/lib/api.ts src/lib/auth.ts src/store/
git commit -m "feat: add API client, auth store, and auth utilities"
```

---

## Task 4: 全局样式和液态玻璃 CSS

**Files:**
- Create: `frontend/src/index.css`

- [ ] **Step 1: 创建全局样式**

创建 `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-border;
  }
  
  body {
    @apply bg-gradient-to-b from-slate-900 to-slate-800 text-slate-200;
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  
  #root {
    min-height: 100vh;
  }
}

@layer components {
  /* 液态玻璃卡片 */
  .fluid-glass-card {
    @apply relative overflow-hidden;
    background: linear-gradient(
      135deg,
      rgba(30, 41, 59, 0.7) 0%,
      rgba(51, 65, 85, 0.5) 100%
    );
    backdrop-filter: blur(40px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    box-shadow: 
      0 20px 60px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      inset 0 -1px 0 rgba(0, 0, 0, 0.2);
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .fluid-glass-card:hover {
    transform: translateY(-4px) scale(1.01);
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.15);
  }
  
  /* 液态玻璃按钮 */
  .fluid-glass-button {
    @apply relative overflow-hidden;
    background: linear-gradient(
      135deg,
      rgba(30, 41, 59, 0.6) 0%,
      rgba(51, 65, 85, 0.4) 100%
    );
    backdrop-filter: blur(40px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
  
  .fluid-glass-button:hover {
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  }
  
  /* YES 按钮（绿色液态玻璃） */
  .outcome-yes {
    background: linear-gradient(
      135deg,
      rgba(16, 185, 129, 0.2) 0%,
      rgba(5, 150, 105, 0.15) 100%
    );
    border: 1.5px solid rgba(16, 185, 129, 0.4);
    box-shadow: 
      0 8px 24px rgba(16, 185, 129, 0.15),
      inset 0 1px 0 rgba(16, 185, 129, 0.3);
  }
  
  .outcome-yes:hover {
    border-color: rgba(16, 185, 129, 0.6);
    box-shadow: 0 12px 32px rgba(16, 185, 129, 0.25);
  }
  
  /* NO 按钮（灰色液态玻璃） */
  .outcome-no {
    background: linear-gradient(
      135deg,
      rgba(71, 85, 105, 0.3) 0%,
      rgba(51, 65, 85, 0.2) 100%
    );
    border: 1.5px solid rgba(148, 163, 184, 0.2);
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }
  
  .outcome-no:hover {
    border-color: rgba(148, 163, 184, 0.3);
  }
  
  /* 液态光效 */
  .fluid-glow {
    @apply absolute top-0 left-0 right-0 pointer-events-none;
    height: 80px;
    background: linear-gradient(
      180deg,
      rgba(139, 92, 246, 0.08) 0%,
      transparent 100%
    );
  }
  
  /* 输入框 */
  .fluid-input {
    @apply w-full px-4 py-3 rounded-xl;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #f1f5f9;
    transition: all 0.3s;
  }
  
  .fluid-input:focus {
    outline: none;
    border-color: rgba(96, 165, 250, 0.5);
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
  }
  
  .fluid-input::placeholder {
    color: #64748b;
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/index.css
git commit -m "feat: add global styles and fluid glass CSS"
```

---

## Task 5: 基础 UI 组件 - Button

**Files:**
- Create: `frontend/src/components/ui/Button.tsx`
- Test: `frontend/src/components/ui/Button.test.tsx`

- [ ] **Step 1: 创建 Button 组件测试**

创建 `src/components/ui/Button.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>点击我</Button>);
    expect(screen.getByText('点击我')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点击我</Button>);
    fireEvent.click(screen.getByText('点击我'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>禁用</Button>);
    const button = screen.getByText('禁用');
    expect(button).toBeDisabled();
  });
});
```

- [ ] **Step 2: 安装测试依赖**

```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event vitest jsdom
```

- [ ] **Step 3: 配置 Vitest**

更新 `vite.config.ts` 添加测试配置:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 4: 创建测试设置文件**

创建 `src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 5: 运行测试（应该失败）**

```bash
npm test
```

预期: FAIL - Button 组件未定义

- [ ] **Step 6: 实现 Button 组件**

创建 `src/components/ui/Button.tsx`:
```typescript
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, disabled, ...props }, ref) => {
    const baseStyles = 'font-medium transition-all duration-300 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed';
    
    const variants = {
      primary: 'fluid-glass-button text-slate-100 hover:text-white',
      secondary: 'bg-slate-700 text-slate-200 hover:bg-slate-600',
      success: 'outcome-yes text-emerald-100 hover:text-white',
      ghost: 'text-slate-300 hover:text-white hover:bg-slate-700/50',
    };
    
    const sizes = {
      sm: 'px-3 py-2 text-sm',
      md: 'px-4 py-3 text-base',
      lg: 'px-6 py-4 text-lg',
    };
    
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

- [ ] **Step 7: 运行测试（应该通过）**

```bash
npm test
```

预期: PASS - 所有 Button 测试通过

- [ ] **Step 8: 提交**

```bash
git add src/components/ui/Button.tsx src/components/ui/Button.test.tsx src/test/
git commit -m "feat: add Button component with tests"
```

---

## Task 6: 基础 UI 组件 - Input 和 Toast

**Files:**
- Create: `frontend/src/components/ui/Input.tsx`
- Create: `frontend/src/components/ui/Toast.tsx`
- Create: `frontend/src/hooks/useToast.ts`

- [ ] **Step 1: 创建 Input 组件**

创建 `src/components/ui/Input.tsx`:
```typescript
import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn('fluid-input', error && 'border-red-500', className)}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
```

- [ ] **Step 2: 创建 Toast Hook**

创建 `src/hooks/useToast.ts`:
```typescript
import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastStore {
  toasts: Toast[];
  addToast: (message: string, type: Toast['type']) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  
  addToast: (message, type) => {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = { id, message, type };
    
    set((state) => ({ toasts: [...state.toasts, toast] }));
    
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },
  
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export function useToast() {
  const { addToast } = useToastStore();
  
  return {
    success: (message: string) => addToast(message, 'success'),
    error: (message: string) => addToast(message, 'error'),
    info: (message: string) => addToast(message, 'info'),
  };
}
```

- [ ] **Step 3: 创建 Toast 组件**

创建 `src/components/ui/Toast.tsx`:
```typescript
import { X } from 'lucide-react';
import { useToastStore, Toast as ToastType } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

function ToastItem({ toast }: { toast: ToastType }) {
  const { removeToast } = useToastStore();
  
  const styles = {
    success: 'border-emerald-500/50 bg-emerald-500/10',
    error: 'border-red-500/50 bg-red-500/10',
    info: 'border-blue-500/50 bg-blue-500/10',
  };
  
  return (
    <div
      className={cn(
        'fluid-glass-card p-4 mb-3 flex items-center justify-between min-w-[300px]',
        styles[toast.type]
      )}
    >
      <p className="text-slate-100 text-sm">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="ml-4 text-slate-400 hover:text-slate-100 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useToastStore();
  
  if (toasts.length === 0) return null;
  
  return (
    <div className="fixed top-4 right-4 z-50">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add src/components/ui/Input.tsx src/components/ui/Toast.tsx src/hooks/useToast.ts
git commit -m "feat: add Input and Toast components"
```

---

## Task 7: 布局组件 - TopBar 和 BottomNav

**Files:**
- Create: `frontend/src/components/layout/TopBar.tsx`
- Create: `frontend/src/components/layout/BottomNav.tsx`

- [ ] **Step 1: 创建 TopBar 组件**

创建 `src/components/layout/TopBar.tsx`:
```typescript
import { useAuthStore } from '@/store/authStore';
import { formatNumber } from '@/lib/utils';

export function TopBar() {
  const user = useAuthStore((state) => state.user);
  
  // TODO: 从 API 获取实际余额
  const balance = 12500;
  
  return (
    <div className="sticky top-0 z-40 backdrop-blur-xl bg-slate-900/60 border-b border-white/5">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          预测市场
        </h1>
        
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-slate-400">余额</span>
            <span className="ml-2 text-purple-200 font-semibold">
              {formatNumber(balance)}
            </span>
          </div>
          
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-semibold text-sm">
            {user?.displayName?.charAt(0) || '用'}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 BottomNav 组件**

创建 `src/components/layout/BottomNav.tsx`:
```typescript
import { Link, useLocation } from 'react-router-dom';
import { Home, TrendingUp, Bot, Settings } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  icon: typeof Home;
  label: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', icon: Home, label: '首页' },
  { to: '/portfolio', icon: TrendingUp, label: '投资组合' },
  { to: '/agents', icon: Bot, label: 'AI 代理' },
  { to: '/admin', icon: Settings, label: '管理', adminOnly: true },
];

export function BottomNav() {
  const location = useLocation();
  const isAdmin = useAuthStore((state) => state.isAdmin());
  
  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  
  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <div className="fluid-glass-card px-6 py-3 flex gap-8">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors',
                isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon size={20} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/layout/
git commit -m "feat: add TopBar and BottomNav layout components"
```

---

## Task 8: 路由守卫和主应用结构

**Files:**
- Create: `frontend/src/components/layout/ProtectedRoute.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: 创建 ProtectedRoute 组件**

创建 `src/components/layout/ProtectedRoute.tsx`:
```typescript
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin } = useAuthStore();
  
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  
  if (requireAdmin && !isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="fluid-glass-card p-8 text-center">
          <h2 className="text-2xl font-bold text-slate-100 mb-2">权限不足</h2>
          <p className="text-slate-400">你没有访问此页面的权限</p>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}
```

- [ ] **Step 2: 创建占位符页面组件**

创建 `src/pages/Home.tsx`:
```typescript
export function Home() {
  return <div className="p-8 text-center text-slate-300">首页 - 开发中</div>;
}
```

创建 `src/pages/MarketDetail.tsx`:
```typescript
export function MarketDetail() {
  return <div className="p-8 text-center text-slate-300">市场详情 - 开发中</div>;
}
```

创建 `src/pages/Portfolio.tsx`:
```typescript
export function Portfolio() {
  return <div className="p-8 text-center text-slate-300">投资组合 - 开发中</div>;
}
```

创建 `src/pages/Agents.tsx`:
```typescript
export function Agents() {
  return <div className="p-8 text-center text-slate-300">AI 代理 - 开发中</div>;
}
```

创建 `src/pages/Admin.tsx`:
```typescript
export function Admin() {
  return <div className="p-8 text-center text-slate-300">管理页面 - 开发中</div>;
}
```

创建 `src/pages/Login.tsx`:
```typescript
export function Login() {
  return <div className="p-8 text-center text-slate-300">登录 - 开发中</div>;
}
```

创建 `src/pages/Register.tsx`:
```typescript
export function Register() {
  return <div className="p-8 text-center text-slate-300">注册 - 开发中</div>;
}
```

- [ ] **Step 3: 更新 App.tsx**

更新 `src/App.tsx`:
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { ToastContainer } from '@/components/ui/Toast';
import { Home } from '@/pages/Home';
import { MarketDetail } from '@/pages/MarketDetail';
import { Portfolio } from '@/pages/Portfolio';
import { Agents } from '@/pages/Agents';
import { Admin } from '@/pages/Admin';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen pb-32">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <>
                    <TopBar />
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/markets/:id" element={<MarketDetail />} />
                      <Route path="/portfolio" element={<Portfolio />} />
                      <Route path="/agents" element={<Agents />} />
                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute requireAdmin>
                            <Admin />
                          </ProtectedRoute>
                        }
                      />
                    </Routes>
                    <BottomNav />
                  </>
                </ProtectedRoute>
              }
            />
          </Routes>
          <ToastContainer />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
```

- [ ] **Step 4: 更新 main.tsx**

更新 `src/main.tsx`:
```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: 测试路由**

```bash
npm run dev
```

访问 http://localhost:3000，应该看到登录页面占位符

- [ ] **Step 6: 提交**

```bash
git add src/App.tsx src/main.tsx src/pages/ src/components/layout/ProtectedRoute.tsx
git commit -m "feat: add routing structure and protected routes"
```

---

## Task 9: 登录和注册页面

**Files:**
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/pages/Register.tsx`
- Create: `frontend/src/hooks/useAuth.ts`

- [ ] **Step 1: 创建认证 Hook**

创建 `src/hooks/useAuth.ts`:
```typescript
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { login, register, type LoginParams, type RegisterParams } from '@/lib/auth';
import { useAuthStore } from '@/store/authStore';
import { useToast } from './useToast';

export function useLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const toast = useToast();
  
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setAuth(data.user, data.token);
      toast.success('登录成功');
      navigate('/');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '登录失败，请检查用户名和密码');
    },
  });
}

export function useRegister() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const toast = useToast();
  
  return useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      setAuth(data.user, data.token);
      toast.success('注册成功');
      navigate('/');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '注册失败，请检查信息');
    },
  });
}
```

- [ ] **Step 2: 实现登录页面**

更新 `src/pages/Login.tsx`:
```typescript
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLogin } from '@/hooks/useAuth';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const loginMutation = useLogin();
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ username, password });
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fluid-glass-card p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-8 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          预测市场
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="用户名"
            type="text"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          
          <Input
            label="密码"
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? '登录中...' : '登录'}
          </Button>
        </form>
        
        <p className="text-center text-sm text-slate-400 mt-6">
          还没有账户？
          <Link to="/register" className="text-blue-400 hover:text-blue-300 ml-1">
            注册
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 实现注册页面**

更新 `src/pages/Register.tsx`:
```typescript
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useRegister } from '@/hooks/useAuth';

export function Register() {
  const [inviteCode, setInviteCode] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const registerMutation = useRegister();
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    if (password.length < 6) {
      setError('密码至少需要 6 个字符');
      return;
    }
    
    registerMutation.mutate({ inviteCode, username, displayName, password });
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="fluid-glass-card p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-slate-100">
          注册账户
        </h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="邀请码"
            type="text"
            placeholder="请输入邀请码"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
          />
          
          <Input
            label="用户名"
            type="text"
            placeholder="请输入用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          
          <Input
            label="显示名称"
            type="text"
            placeholder="请输入显示名称"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
          
          <Input
            label="密码"
            type="password"
            placeholder="至少 6 个字符"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          <Input
            label="确认密码"
            type="password"
            placeholder="再次输入密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={error}
            required
          />
          
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? '注册中...' : '注册'}
          </Button>
        </form>
        
        <p className="text-center text-sm text-slate-400 mt-6">
          已有账户？
          <Link to="/login" className="text-blue-400 hover:text-blue-300 ml-1">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 提交**

```bash
git add src/pages/Login.tsx src/pages/Register.tsx src/hooks/useAuth.ts
git commit -m "feat: implement login and register pages"
```

---

## Task 10: 市场数据 Hook 和 API

**Files:**
- Create: `frontend/src/hooks/useMarkets.ts`
- Create: `frontend/src/lib/api/markets.ts`

- [ ] **Step 1: 创建市场 API**

创建 `src/lib/api/markets.ts`:
```typescript
import { apiClient } from '../api';
import type { Market, TradeQuote, Activity } from '@/types';

export async function getMarkets(): Promise<Market[]> {
  const response = await apiClient.get<{ markets: Market[] }>('/markets');
  return response.data.markets;
}

export async function getMarket(id: string): Promise<Market> {
  const response = await apiClient.get<{ market: Market }>(`/markets/${id}`);
  return response.data.market;
}

export async function getMarketActivity(id: string): Promise<Activity[]> {
  const response = await apiClient.get<{ activity: Activity[] }>(`/markets/${id}/activity`);
  return response.data.activity;
}

export interface QuoteParams {
  outcomeId: string;
  side: 'buy' | 'sell';
  shares: number;
}

export async function getQuote(marketId: string, params: QuoteParams): Promise<TradeQuote> {
  const response = await apiClient.post<{ quote: TradeQuote }>(`/markets/${marketId}/quote`, params);
  return response.data.quote;
}

export interface TradeParams extends QuoteParams {
  accountId: string;
}

export async function placeTrade(marketId: string, params: TradeParams) {
  const response = await apiClient.post(`/markets/${marketId}/trades`, params);
  return response.data;
}
```

- [ ] **Step 2: 创建市场 Hook**

创建 `src/hooks/useMarkets.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMarkets, getMarket, getMarketActivity, getQuote, placeTrade, type QuoteParams, type TradeParams } from '@/lib/api/markets';
import { useToast } from './useToast';
import { calculatePrices } from '@/lib/utils';

export function useMarkets() {
  return useQuery({
    queryKey: ['markets'],
    queryFn: getMarkets,
    refetchInterval: 10000, // 每10秒刷新
    select: (markets) => {
      // 计算每个市场的概率
      return markets.map((market) => {
        if (market.outcomes) {
          const prices = calculatePrices(market.outcomes);
          market.outcomes = market.outcomes.map((outcome, index) => ({
            ...outcome,
            price: prices[index],
          }));
        }
        return market;
      });
    },
  });
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ['markets', id],
    queryFn: () => getMarket(id),
    enabled: !!id,
    select: (market) => {
      // 计算概率
      if (market.outcomes) {
        const prices = calculatePrices(market.outcomes);
        market.outcomes = market.outcomes.map((outcome, index) => ({
          ...outcome,
          price: prices[index],
        }));
      }
      return market;
    },
  });
}

export function useMarketActivity(id: string) {
  return useQuery({
    queryKey: ['markets', id, 'activity'],
    queryFn: () => getMarketActivity(id),
    enabled: !!id,
    refetchInterval: 5000, // 每5秒刷新
  });
}

export function useQuote(marketId: string) {
  return useMutation({
    mutationFn: (params: QuoteParams) => getQuote(marketId, params),
  });
}

export function usePlaceTrade(marketId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  
  return useMutation({
    mutationFn: (params: TradeParams) => placeTrade(marketId, params),
    onSuccess: () => {
      // 刷新市场数据
      queryClient.invalidateQueries({ queryKey: ['markets', marketId] });
      queryClient.invalidateQueries({ queryKey: ['markets'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      toast.success('交易成功');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '交易失败');
    },
  });
}
```

- [ ] **Step 3: 提交**

```bash
git add src/lib/api/markets.ts src/hooks/useMarkets.ts
git commit -m "feat: add markets API and hooks"
```

---

## 剩余任务概览

由于完整的实现计划会非常长（预计 3000+ 行），上述 10 个任务已经覆盖了核心基础设施。剩余的任务包括：

**Task 11-15: 市场相关组件**
- MarketCard 组件（液态玻璃卡片）
- CategoryTabs 分类标签
- 首页 Home 完整实现
- MarketDetail 页面和交易面板
- ActivityFeed 活动流

**Task 16-18: 投资组合**
- Portfolio 页面实现
- PositionCard 持仓卡片
- TransactionHistory 交易历史

**Task 19-20: AI 代理**
- Agents 页面实现
- HumanVsAI 对比组件

**Task 21-24: 管理页面**
- Admin 页面实现
- InviteCodeManager 邀请码管理
- CreateMarketForm 创建市场表单
- UserManagement 用户管理

**Task 25: 集成测试和部署**
- E2E 测试
- 构建优化
- 部署配置

## 关键实现注意事项

1. **后端 API 依赖**: 前端实现依赖后端提供认证 API（`/auth/login`, `/auth/register`, `/auth/me`）和管理 API。这些 API 需要先在后端实现。

2. **液态玻璃效果**: 所有卡片和按钮都应用 `fluid-glass-card` 和相关 CSS 类，确保视觉一致性。

3. **TDD 原则**: 对于复杂的工具函数和 Hook，先写测试再实现。

4. **渐进式开发**: 每个 Task 独立提交，确保每次提交都是可工作的状态。

5. **类型安全**: 所有 API 调用和状态管理都使用 TypeScript 类型，避免运行时错误。

## 后端需要新增的 API

参考设计文档 `docs/superpowers/specs/2026-06-15-luckymarket-frontend-design.md` 的"后端 API 需求"章节，需要实现：

- `POST /auth/register` - 用户注册（验证邀请码）
- `POST /auth/login` - 用户登录
- `GET /auth/me` - 获取当前用户
- `POST /admin/invite-codes` - 生成邀请码
- `GET /admin/invite-codes` - 邀请码列表
- `DELETE /admin/invite-codes/:code` - 删除邀请码
- `GET /admin/users` - 用户列表
- `PATCH /admin/users/:id/role` - 修改用户角色

以及数据库 Schema 调整（accounts 表添加 role 和 password_hash 字段，新增 invite_codes 表）。

## 执行建议

**推荐使用 subagent-driven-development 方式执行**，原因：
1. 每个任务都是独立的组件或功能
2. 可以并行开发多个组件
3. 每个任务完成后需要测试验证
4. 总任务量较大，适合分批执行

建议先完成 Task 1-10（核心基础设施），验证登录注册流程后，再继续实现具体页面组件。

---

**计划完成日期**: 2026-06-15  
**预计实现时间**: 3-5 天（取决于后端 API 的准备情况）