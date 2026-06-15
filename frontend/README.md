# LuckyMarket Frontend

公司内部预测市场平台 - 前端应用

LuckyMarket 是一个内部预测市场平台，允许员工对公司相关事件进行预测和交易，以聚合集体智慧并改善决策。

## 技术栈

- **框架**: React 19 + TypeScript 6
- **构建工具**: Vite 8
- **状态管理**: Zustand + TanStack Query
- **路由**: React Router 7
- **UI组件**: Radix UI + Tailwind CSS 4
- **动画**: Framer Motion
- **数据验证**: Zod

## 环境要求

- Node.js >= 18.0.0
- npm 或 pnpm

## 开发设置

### 1. 安装依赖

```bash
npm install
```

### 2. 环境变量

创建 `.env` 文件（已在 `.gitignore` 中，不会被提交）:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

可用的环境变量:
- `VITE_API_BASE_URL`: 后端 API 地址（必需）

### 3. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:5173` 启动。

### 4. 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

### 5. 预览生产构建

```bash
npm run preview
```

## 可用脚本

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run lint` - 运行 ESLint 检查
- `npm run preview` - 预览生产构建

## 项目结构

```
src/
├── components/     # React 组件
├── pages/          # 页面组件
├── hooks/          # 自定义 React hooks
├── services/       # API 服务
├── stores/         # Zustand 状态管理
├── types/          # TypeScript 类型定义
├── utils/          # 工具函数
└── main.tsx        # 应用入口
```

## 代码质量

项目配置了:
- **TypeScript strict mode** - 严格类型检查
- **ESLint** - 代码规范检查
- **Tailwind CSS** - 实用优先的样式

## 了解更多

- [React 文档](https://react.dev/)
- [Vite 文档](https://vite.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
