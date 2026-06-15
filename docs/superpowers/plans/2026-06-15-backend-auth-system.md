# LuckyMarket 后端认证系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现基于 JWT 的用户认证系统，包括注册、登录、权限管理和邀请码机制

**Architecture:** 使用 @fastify/jwt 插件处理 JWT token（access + refresh 双 token），bcrypt 哈希密码，Zod 验证输入，通过 Fastify 中间件实现权限控制

**Tech Stack:** Fastify, TypeScript, @fastify/jwt, bcrypt, Better-SQLite3, Zod

---

## 文件结构规划

```
src/
├── db/
│   ├── schema.ts                    # 更新：添加认证相关表
│   └── migrations/
│       └── 001-add-auth-system.ts   # 新增：认证系统迁移
├── domain/
│   └── auth.ts                      # 新增：认证类型定义
├── services/
│   ├── auth.ts                      # 新增：认证服务
│   ├── invite-codes.ts              # 新增：邀请码服务
│   └── users.ts                     # 新增：用户管理服务
├── http/
│   ├── plugins/
│   │   └── jwt.ts                   # 新增：JWT 插件配置
│   ├── middleware/
│   │   └── auth.ts                  # 新增：认证中间件
│   ├── auth-routes.ts               # 新增：认证路由
│   ├── admin-routes.ts              # 新增：管理员路由
│   └── routes.ts                    # 更新：注册新路由
└── index.ts                         # 更新：注册 JWT 插件
```

---

## Task 1: 安装依赖和环境配置

**Files:**
- Modify: `package.json`
- Create: `.env.example`
- Modify: `src/config.ts`

- [ ] **Step 1: 安装认证相关依赖**

```bash
npm install @fastify/jwt bcrypt
npm install -D @types/bcrypt
```

- [ ] **Step 2: 更新 .env.example**

创建或更新 `.env.example`:
```env
# 现有配置...

# JWT 配置
JWT_SECRET=your-secret-key-at-least-32-characters-long
JWT_ACCESS_EXPIRY=1h
JWT_REFRESH_EXPIRY=7d

# 密码配置
BCRYPT_ROUNDS=10

# 初始管理员
ADMIN_INITIAL_PASSWORD=admin123
```

- [ ] **Step 3: 更新配置文件**

在 `src/config.ts` 中添加:
```typescript
export const config = {
  // 现有配置...
  
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '1h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  },
  
  admin: {
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || 'admin123',
  },
};
```

- [ ] **Step 4: 验证配置加载**

```bash
npm run build
node dist/index.js
```

预期：无错误，配置正确加载

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json .env.example src/config.ts
git commit -m "feat: add auth dependencies and configuration"
```

---

## Task 2: 数据库 Schema 更新

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: 更新 schema.ts 添加认证相关表**

在 `src/db/schema.ts` 的 `createSchema` 函数中，accounts 表创建语句后添加:

```typescript
// 更新 accounts 表定义（添加新字段）
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('human', 'agent', 'system')),
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  password_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_active_at TEXT
);
```

然后在 schema 末尾添加新表:

```typescript
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES accounts(id),
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_refresh_tokens_account ON refresh_tokens(account_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
```

- [ ] **Step 2: 测试 schema 创建**

```bash
npm run build
# 删除旧数据库（测试环境）
rm -f market.db
node dist/index.js
```

预期：数据库创建成功，包含所有新表和字段

- [ ] **Step 3: 验证表结构**

```bash
sqlite3 market.db ".schema accounts"
sqlite3 market.db ".schema invite_codes"
sqlite3 market.db ".schema refresh_tokens"
```

预期：显示完整的表结构，包含新字段

- [ ] **Step 4: 提交**

```bash
git add src/db/schema.ts
git commit -m "feat: add auth tables and extend accounts schema"
```

---

## Task 3: 认证领域类型定义

**Files:**
- Create: `src/domain/auth.ts`

- [ ] **Step 1: 创建认证类型定义**

创建 `src/domain/auth.ts`:
```typescript
export interface JWTPayload {
  accountId: string;
  role: 'user' | 'admin';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  accountId: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    handle: string;
    displayName: string;
    role: 'user' | 'admin';
    kind: 'human' | 'agent' | 'system';
    createdAt: string;
  };
}

export interface RegisterParams {
  inviteCode: string;
  username: string;
  displayName: string;
  password: string;
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface InviteCode {
  code: string;
  createdBy: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface RefreshToken {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/domain/auth.ts
git commit -m "feat: add auth domain types"
```

---

## Task 4: JWT 插件配置

**Files:**
- Create: `src/http/plugins/jwt.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 创建 JWT 插件配置**

创建 `src/http/plugins/jwt.ts`:
```typescript
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config.js';

export default fp(async function (server: FastifyInstance) {
  await server.register(jwt, {
    secret: config.jwt.secret,
  });
});
```

- [ ] **Step 2: 在 index.ts 中注册 JWT 插件**

在 `src/index.ts` 中，在路由注册之前添加:
```typescript
import jwtPlugin from './http/plugins/jwt.js';

// 注册 JWT 插件
await server.register(jwtPlugin);
```

- [ ] **Step 3: 测试插件加载**

```bash
npm run build
node dist/index.js
```

预期：服务器启动成功，JWT 插件加载无错误

- [ ] **Step 4: 提交**

```bash
git add src/http/plugins/jwt.ts src/index.ts
git commit -m "feat: add JWT plugin configuration"
```

---

## Task 5: 邀请码服务（InviteCodeService）

**Files:**
- Create: `src/services/invite-codes.ts`
- Test: 手动测试（后续可添加单元测试）

- [ ] **Step 1: 创建 InviteCodeService**

创建 `src/services/invite-codes.ts`:
```typescript
import type { Db } from '../db/connection.js';
import type { InviteCode } from '../domain/auth.js';

export class InviteCodeService {
  constructor(private db: Db) {}

  /**
   * 生成邀请码（格式：INV-XXXX-XXXX）
   * 排除易混淆字符：0, O, I, l, 1
   */
  generate(createdBy: string, maxUses: number = 1, expiresAt?: string): InviteCode {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const generateSegment = (length: number): string => {
      let result = '';
      for (let i = 0; i < length; i++) {
        result += charset[Math.floor(Math.random() * charset.length)];
      }
      return result;
    };

    const code = `INV-${generateSegment(4)}-${generateSegment(4)}`;
    const createdAt = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO invite_codes (code, created_by, max_uses, used_count, expires_at, created_at)
         VALUES (?, ?, ?, 0, ?, ?)`
      )
      .run(code, createdBy, maxUses, expiresAt || null, createdAt);

    return {
      code,
      createdBy,
      maxUses,
      usedCount: 0,
      expiresAt: expiresAt || null,
      createdAt,
    };
  }

  /**
   * 验证邀请码是否有效
   */
  validate(code: string): boolean {
    const invite = this.db
      .prepare(
        `SELECT * FROM invite_codes WHERE code = ?`
      )
      .get(code) as any;

    if (!invite) {
      return false;
    }

    // 检查是否用完
    if (invite.used_count >= invite.max_uses) {
      return false;
    }

    // 检查是否过期
    if (invite.expires_at) {
      const expiresAt = new Date(invite.expires_at);
      if (expiresAt < new Date()) {
        return false;
      }
    }

    return true;
  }

  /**
   * 使用邀请码（used_count + 1）
   */
  use(code: string): void {
    this.db
      .prepare(
        `UPDATE invite_codes SET used_count = used_count + 1 WHERE code = ?`
      )
      .run(code);
  }

  /**
   * 列出所有邀请码
   */
  list(): InviteCode[] {
    const rows = this.db
      .prepare(
        `SELECT code, created_by, max_uses, used_count, expires_at, created_at
         FROM invite_codes
         ORDER BY created_at DESC`
      )
      .all() as any[];

    return rows.map(row => ({
      code: row.code,
      createdBy: row.created_by,
      maxUses: row.max_uses,
      usedCount: row.used_count,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * 删除邀请码
   */
  delete(code: string): void {
    this.db
      .prepare(`DELETE FROM invite_codes WHERE code = ?`)
      .run(code);
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/services/invite-codes.ts
git commit -m "feat: add InviteCodeService with generation and validation"
```

---

## Task 6: 认证服务（AuthService）- 第一部分

**Files:**
- Create: `src/services/auth.ts`

- [ ] **Step 1: 创建 AuthService（密码和 Token 基础功能）**

创建 `src/services/auth.ts`:
```typescript
import bcrypt from 'bcrypt';
import type { FastifyJWT } from '@fastify/jwt';
import type { Db } from '../db/connection.js';
import type {
  JWTPayload,
  RefreshTokenPayload,
  AuthResponse,
  RegisterParams,
  LoginParams,
} from '../domain/auth.js';
import { config } from '../config.js';
import { InviteCodeService } from './invite-codes.js';

export class AuthService {
  private inviteCodeService: InviteCodeService;

  constructor(
    private db: Db,
    private jwt: FastifyJWT
  ) {
    this.inviteCodeService = new InviteCodeService(db);
  }

  /**
   * 哈希密码
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.bcrypt.rounds);
  }

  /**
   * 验证密码
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * 生成 access token
   */
  generateAccessToken(accountId: string, role: 'user' | 'admin'): string {
    const payload: JWTPayload = {
      accountId,
      role,
    };

    return this.jwt.sign(payload, {
      expiresIn: config.jwt.accessExpiry,
    });
  }

  /**
   * 生成 refresh token 并存储到数据库
   */
  async generateRefreshToken(accountId: string): Promise<{ token: string; tokenId: string }> {
    const tokenId = `rt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const createdAt = new Date().toISOString();
    
    // 计算过期时间（7天）
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    const payload: RefreshTokenPayload = {
      accountId,
      tokenId,
    };

    const token = this.jwt.sign(payload, {
      expiresIn: config.jwt.refreshExpiry,
    });

    // 存储 token 哈希到数据库
    const tokenHash = await bcrypt.hash(token, 10);

    this.db
      .prepare(
        `INSERT INTO refresh_tokens (id, account_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(tokenId, accountId, tokenHash, expiresAt.toISOString(), createdAt);

    return { token, tokenId };
  }

  /**
   * 验证 refresh token
   */
  async verifyRefreshToken(token: string): Promise<{ accountId: string; tokenId: string }> {
    // 验证 JWT 签名
    const payload = this.jwt.verify<RefreshTokenPayload>(token);

    // 从数据库查询 token
    const stored = this.db
      .prepare(
        `SELECT * FROM refresh_tokens WHERE id = ? AND account_id = ?`
      )
      .get(payload.tokenId, payload.accountId) as any;

    if (!stored) {
      throw new Error('Refresh token not found');
    }

    // 检查是否过期
    if (new Date(stored.expires_at) < new Date()) {
      throw new Error('Refresh token expired');
    }

    return {
      accountId: payload.accountId,
      tokenId: payload.tokenId,
    };
  }

  /**
   * 撤销 refresh token
   */
  revokeRefreshToken(tokenId: string): void {
    this.db
      .prepare(`DELETE FROM refresh_tokens WHERE id = ?`)
      .run(tokenId);
  }

  /**
   * 撤销用户的所有 refresh tokens
   */
  revokeAllRefreshTokens(accountId: string): void {
    this.db
      .prepare(`DELETE FROM refresh_tokens WHERE account_id = ?`)
      .run(accountId);
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/services/auth.ts
git commit -m "feat: add AuthService with password and token methods"
```

---

由于计划很长，让我继续编写剩余的任务...

## Task 7: 认证服务 - 注册和登录功能

**Files:**
- Modify: `src/services/auth.ts`

- [ ] **Step 1: 添加用户注册方法**

在 `AuthService` 类中添加:
```typescript
/**
 * 用户注册
 */
async register(params: RegisterParams): Promise<AuthResponse> {
  // 1. 验证邀请码
  if (!this.inviteCodeService.validate(params.inviteCode)) {
    throw new Error('Invalid, expired, or fully used invite code');
  }

  // 2. 检查用户名是否已存在
  const existing = this.db
    .prepare(`SELECT id FROM accounts WHERE handle = ?`)
    .get(params.username);

  if (existing) {
    throw new Error('Username already exists');
  }

  // 3. 哈希密码
  const passwordHash = await this.hashPassword(params.password);

  // 4. 创建账户
  const accountId = `acc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const createdAt = new Date().toISOString();

  this.db
    .prepare(
      `INSERT INTO accounts (id, kind, handle, display_name, status, role, password_hash, created_at)
       VALUES (?, 'human', ?, ?, 'active', 'user', ?, ?)`
    )
    .run(accountId, params.username, params.displayName, passwordHash, createdAt);

  // 5. 使用邀请码
  this.inviteCodeService.use(params.inviteCode);

  // 6. 生成 tokens
  const accessToken = this.generateAccessToken(accountId, 'user');
  const { token: refreshToken } = await this.generateRefreshToken(accountId);

  return {
    token: accessToken,
    refreshToken,
    user: {
      id: accountId,
      handle: params.username,
      displayName: params.displayName,
      role: 'user',
      kind: 'human',
      createdAt,
    },
  };
}

/**
 * 用户登录
 */
async login(params: LoginParams): Promise<AuthResponse> {
  // 1. 查找用户
  const account = this.db
    .prepare(
      `SELECT id, handle, display_name, role, kind, password_hash, created_at
       FROM accounts
       WHERE handle = ? AND kind = 'human'`
    )
    .get(params.username) as any;

  if (!account) {
    throw new Error('User not found');
  }

  // 2. 验证密码
  const valid = await this.verifyPassword(params.password, account.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  // 3. 生成 tokens
  const accessToken = this.generateAccessToken(account.id, account.role);
  const { token: refreshToken } = await this.generateRefreshToken(account.id);

  return {
    token: accessToken,
    refreshToken,
    user: {
      id: account.id,
      handle: account.handle,
      displayName: account.display_name,
      role: account.role,
      kind: account.kind,
      createdAt: account.created_at,
    },
  };
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/services/auth.ts
git commit -m "feat: add register and login methods to AuthService"
```

---

## Task 8: 认证中间件

**Files:**
- Create: `src/http/middleware/auth.ts`

- [ ] **Step 1: 创建认证中间件**

创建 `src/http/middleware/auth.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from '../../domain/auth.js';

// 扩展 FastifyRequest 类型
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

/**
 * 认证中间件：验证 access token
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // 从 Authorization header 提取 token
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.slice(7); // 移除 "Bearer "

    // 验证 token
    const payload = await request.server.jwt.verify<JWTPayload>(token);

    // 将用户信息附加到 request
    request.user = payload;
  } catch (err) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * 管理员权限中间件
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  if (request.user.role !== 'admin') {
    return reply.code(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Admin access required',
    });
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/http/middleware/auth.ts
git commit -m "feat: add authentication middleware"
```

---

## Task 9: 认证路由

**Files:**
- Create: `src/http/auth-routes.ts`

- [ ] **Step 1: 创建认证路由**

创建 `src/http/auth-routes.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from '../services/auth.js';
import { authenticate } from './middleware/auth.js';
import type { Db } from '../db/connection.js';

const registerSchema = z.object({
  inviteCode: z.string().min(1),
  username: z.string().min(3).max(20),
  displayName: z.string().min(1),
  password: z.string().min(6),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export async function registerAuthRoutes(
  server: FastifyInstance,
  db: Db
): Promise<void> {
  const authService = new AuthService(db, server.jwt);

  // POST /auth/register
  server.post('/auth/register', async (request, reply) => {
    try {
      const body = registerSchema.parse(request.body);
      const result = await authService.register(body);
      return reply.code(200).send(result);
    } catch (err: any) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message || 'Registration failed',
      });
    }
  });

  // POST /auth/login
  server.post('/auth/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);
      const result = await authService.login(body);
      return reply.code(200).send(result);
    } catch (err: any) {
      const isAuthError = err.message === 'User not found' || err.message === 'Invalid credentials';
      return reply.code(isAuthError ? 401 : 400).send({
        statusCode: isAuthError ? 401 : 400,
        error: isAuthError ? 'Unauthorized' : 'Bad Request',
        message: err.message || 'Login failed',
      });
    }
  });

  // POST /auth/refresh
  server.post('/auth/refresh', async (request, reply) => {
    try {
      const body = refreshSchema.parse(request.body);
      const payload = await authService.verifyRefreshToken(body.refreshToken);
      
      // 获取用户角色
      const account = db
        .prepare(`SELECT role FROM accounts WHERE id = ?`)
        .get(payload.accountId) as any;

      if (!account) {
        throw new Error('Account not found');
      }

      const newAccessToken = authService.generateAccessToken(payload.accountId, account.role);

      return reply.code(200).send({
        token: newAccessToken,
      });
    } catch (err: any) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: err.message || 'Invalid or expired refresh token',
      });
    }
  });

  // GET /auth/me
  server.get('/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.user) {
        throw new Error('User not authenticated');
      }

      const account = db
        .prepare(
          `SELECT id, kind, handle, display_name, role, status, created_at, last_active_at
           FROM accounts WHERE id = ?`
        )
        .get(request.user.accountId) as any;

      if (!account) {
        throw new Error('Account not found');
      }

      return reply.code(200).send({
        user: {
          id: account.id,
          kind: account.kind,
          handle: account.handle,
          displayName: account.display_name,
          role: account.role,
          status: account.status,
          createdAt: account.created_at,
          lastActiveAt: account.last_active_at,
        },
      });
    } catch (err: any) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: err.message || 'User not found',
      });
    }
  });

  // POST /auth/logout
  server.post('/auth/logout', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      if (!request.user) {
        throw new Error('User not authenticated');
      }

      const body = logoutSchema.parse(request.body);

      if (body.refreshToken) {
        // 撤销特定 token
        const payload = await authService.verifyRefreshToken(body.refreshToken);
        authService.revokeRefreshToken(payload.tokenId);
      } else {
        // 撤销所有 tokens
        authService.revokeAllRefreshTokens(request.user.accountId);
      }

      return reply.code(200).send({ success: true });
    } catch (err: any) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message || 'Logout failed',
      });
    }
  });
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/http/auth-routes.ts
git commit -m "feat: add authentication routes"
```

---

## Task 10: 用户管理服务

**Files:**
- Create: `src/services/users.ts`

- [ ] **Step 1: 创建 UsersService**

创建 `src/services/users.ts`:
```typescript
import type { Db } from '../db/connection.js';

export interface User {
  id: string;
  kind: 'human' | 'agent' | 'system';
  handle: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'disabled';
  createdAt: string;
  lastActiveAt: string | null;
}

export class UsersService {
  constructor(private db: Db) 

  /**
   * 获取所有用户列表
   */
  list(): User[] {
    const rows = this.db
      .prepare(
        `SELECT id, kind, handle, display_name, role, status, created_at, last_active_at
         FROM accounts
         WHERE kind = 'human'
         ORDER BY created_at DESC`
      )
      .all() as any[];

    return rows.map(row => ({
      id: row.id,
      kind: row.kind,
      handle: row.handle,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      lastActiveAt: row.last_active_at,
    }));
  }

  /**
   * 修改用户角色
   */
  updateRole(userId: string, role: 'user' | 'admin'): User {
    this.db
      .prepare(`UPDATE accounts SET role = ? WHERE id = ?`)
      .run(role, userId);

    const account = this.db
      .prepare(
        `SELECT id, kind, handle, display_name, role, status, created_at, last_active_at
         FROM accounts WHERE id = ?`
      )
      .get(userId) as any;

    if (!account) {
      throw new Error('User not found');
    }

    return {
      id: account.id,
      kind: account.kind,
      handle: account.handle,
      displayName: account.display_name,
      role: account.role,
      status: account.status,
      createdAt: account.created_at,
      lastActiveAt: account.last_active_at,
    };
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/services/users.ts
git commit -m "feat: add UsersService for user management"
```

---

## Task 11: 管理员路由

**Files:**
- Create: `src/http/admin-routes.ts`

- [ ] **Step 1: 创建管理员路由**

创建 `src/http/admin-routes.ts`:
```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { InviteCodeService } from '../services/invite-codes.js';
import { UsersService } from '../services/users.js';
import { authenticate, requireAdmin } from './middleware/auth.js';
import type { Db } from '../db/connection.js';

const createInviteCodeSchema = z.object({
  maxUses: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

const updateRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export async function registerAdminRoutes(
  server: FastifyInstance,
  db: Db
): Promise<void> {
  const inviteCodeService = new InviteCodeService(db);
  const usersService = new UsersService(db);

  // 所有管理员路由都需要认证和管理员权限
  const adminPreHandler = [authenticate, requireAdmin];

  // POST /admin/invite-codes
  server.post('/admin/invite-codes', { preHandler: adminPreHandler }, async (request, reply) => {
    try {
      const body = createInviteCodeSchema.parse(request.body);
      
      if (!request.user) {
        throw new Error('User not authenticated');
      }

      const inviteCode = inviteCodeService.generate(
        request.user.accountId,
        body.maxUses || 1,
        body.expiresAt
      );

      return reply.code(200).send(inviteCode);
    } catch (err: any) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: err.message || 'Failed to create invite code',
      });
    }
  });

  // GET /admin/invite-codes
  server.get('/admin/invite-codes', { preHandler: adminPreHandler }, async (request, reply) => {
    try {
      const inviteCodes = inviteCodeService.list();
      return reply.code(200).send({ inviteCodes });
    } catch (err: any) {
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: err.message || 'Failed to list invite codes',
      });
    }
  });

  // DELETE /admin/invite-codes/:code
  server.delete('/admin/invite-codes/:code', { preHandler: adminPreHandler }, async (request, reply) => {
    try {
      const { code } = request.params as { code: string };
      inviteCodeService.delete(code);
      return reply.code(200).send({ success: true });
    } catch (err: any) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Invite code not found',
      });
    }
  });

  // GET /admin/users
  server.get('/admin/users', { preHandler: adminPreHandler }, async (request, reply) => {
    try {
      const users = usersService.list();
      return reply.code(200).send({ users });
    } catch (err: any) {
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: err.message || 'Failed to list users',
      });
    }
  });

  // PATCH /admin/users/:id/role
  server.patch('/admin/users/:id/role', { preHandler: adminPreHandler }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateRoleSchema.parse(request.body);

      // 不能修改自己的角色
      if (request.user && request.user.accountId === id) {
        return reply.code(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot modify your own role',
        });
      }

      const user = usersService.updateRole(id, body.role);
      return reply.code(200).send({ user });
    } catch (err: any) {
      return reply.code(err.message === 'User not found' ? 404 : 400).send({
        statusCode: err.message === 'User not found' ? 404 : 400,
        error: err.message === 'User not found' ? 'Not Found' : 'Bad Request',
        message: err.message || 'Failed to update user role',
      });
    }
  });
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build
```

预期：无 TypeScript 错误

- [ ] **Step 3: 提交**

```bash
git add src/http/admin-routes.ts
git commit -m "feat: add admin routes for invite codes and user management"
```

---

## Task 12: 创建初始管理员账户

**Files:**
- Create: `src/db/migrations/001-create-admin.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: 创建管理员初始化脚本**

创建 `src/db/migrations/001-create-admin.ts`:
```typescript
import bcrypt from 'bcrypt';
import type { Db } from '../connection.js';
import { config } from '../../config.js';

export async function createAdminAccount(db: Db): Promise<void> {
  // 检查管理员是否已存在
  const existing = db
    .prepare(`SELECT id FROM accounts WHERE handle = 'admin'`)
    .get();

  if (existing) {
    console.log('Admin account already exists, skipping creation');
    return;
  }

  // 创建管理员账户
  const passwordHash = await bcrypt.hash(config.admin.initialPassword, config.bcrypt.rounds);
  const accountId = 'acc_admin';
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO accounts (id, kind, handle, display_name, status, role, password_hash, created_at)
     VALUES (?, 'human', 'admin', '系统管理员', 'active', 'admin', ?, ?)`
  ).run(accountId, passwordHash, createdAt);

  console.log('Admin account created successfully');
  console.log('Username: admin');
  console.log(`Password: ${config.admin.initialPassword}`);
  console.log('⚠️  IMPORTANT: Change this password immediately after first login!');
}
```

- [ ] **Step 2: 在 index.ts 中调用初始化**

在 `src/index.ts` 中，schema 创建之后添加:
```typescript
import { createAdminAccount } from './db/migrations/001-create-admin.js';

// 在 createSchema(db) 之后添加
await createAdminAccount(db);
```

- [ ] **Step 3: 测试管理员创建**

```bash
npm run build
rm -f market.db
node dist/index.js
```

预期：看到管理员账户创建成功的日志

- [ ] **Step 4: 验证管理员存在**

```bash
sqlite3 market.db "SELECT handle, role FROM accounts WHERE handle='admin'"
```

预期：显示 admin | admin

- [ ] **Step 5: 提交**

```bash
git add src/db/migrations/001-create-admin.ts src/index.ts
git commit -m "feat: add initial admin account creation"
```

---

## Task 13: 注册路由到主应用

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: 导入并注册认证和管理员路由**

在 `src/index.ts` 中，现有路由注册之后添加:
```typescript
import { registerAuthRoutes } from './http/auth-routes.js';
import { registerAdminRoutes } from './http/admin-routes.js';

// 注册认证路由
await registerAuthRoutes(server, db);

// 注册管理员路由
await registerAdminRoutes(server, db);
```

- [ ] **Step 2: 测试服务器启动**

```bash
npm run build
node dist/index.js
```

预期：服务器启动成功，所有路由注册完成

- [ ] **Step 3: 提交**

```bash
git add src/index.ts
git commit -m "feat: register auth and admin routes"
```

---

## Task 14: 测试认证流程

**Files:**
- 无（手动 API 测试）

- [ ] **Step 1: 测试管理员登录**

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

预期：返回 token 和 refreshToken

- [ ] **Step 2: 保存 access token 并测试 /auth/me**

```bash
TOKEN="<从上一步获取的token>"
curl -X GET http://localhost:4000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

预期：返回管理员用户信息

- [ ] **Step 3: 测试创建邀请码**

```bash
curl -X POST http://localhost:4000/admin/invite-codes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxUses":5}'
```

预期：返回格式为 INV-XXXX-XXXX 的邀请码

- [ ] **Step 4: 测试用户注册**

```bash
INVITE_CODE="<从上一步获取的code>"
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"inviteCode\":\"$INVITE_CODE\",\"username\":\"testuser\",\"displayName\":\"测试用户\",\"password\":\"password123\"}"
```

预期：返回新用户的 token 和信息

- [ ] **Step 5: 测试新用户登录**

```bash
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

预期：返回 token

- [ ] **Step 6: 测试 refresh token**

```bash
REFRESH_TOKEN="<从注册或登录获取的refreshToken>"
curl -X POST http://localhost:4000/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

预期：返回新的 access token

- [ ] **Step 7: 测试权限控制（普通用户访问管理员端点）**

```bash
USER_TOKEN="<testuser的token>"
curl -X GET http://localhost:4000/admin/users \
  -H "Authorization: Bearer $USER_TOKEN"
```

预期：返回 403 Forbidden

- [ ] **Step 8: 测试管理员查看用户列表**

```bash
ADMIN_TOKEN="<admin的token>"
curl -X GET http://localhost:4000/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

预期：返回用户列表（包含 admin 和 testuser）

- [ ] **Step 9: 文档测试结果**

创建 `docs/auth-testing-results.md` 记录测试结果

- [ ] **Step 10: 提交测试文档**

```bash
git add docs/auth-testing-results.md
git commit -m "docs: add authentication system testing results"
```

---

## 实施完成检查清单

完成所有任务后，验证以下功能：

- [ ] ✅ 数据库包含所有认证相关表（accounts 扩展、invite_codes、refresh_tokens）
- [ ] ✅ 管理员账户自动创建
- [ ] ✅ JWT 插件正确配置
- [ ] ✅ 用户可以使用邀请码注册
- [ ] ✅ 用户可以登录并获取 token
- [ ] ✅ Access token 可以访问受保护端点
- [ ] ✅ Refresh token 可以刷新 access token
- [ ] ✅ 管理员可以创建、查看、删除邀请码
- [ ] ✅ 管理员可以查看用户列表
- [ ] ✅ 管理员可以修改用户角色
- [ ] ✅ 普通用户无法访问管理员端点
- [ ] ✅ 所有错误处理正确（401, 403, 404）
- [ ] ✅ 密码正确哈希存储（bcrypt）
- [ ] ✅ 邀请码格式正确（INV-XXXX-XXXX）

---

**计划完成日期**: 2026-06-15  
**预计实现时间**: 4-6 小时（取决于测试的详细程度）