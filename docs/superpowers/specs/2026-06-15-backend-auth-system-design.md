# LuckyMarket 后端认证系统设计文档

**日期**: 2026-06-15  
**设计师**: Claude (Opus 4.8)  
**版本**: 1.0

## 项目概述

LuckyMarket 需要实现完整的用户认证系统，包括用户注册、登录、权限管理和邀请码机制。本文档描述了基于 JWT 的认证系统设计。

**核心需求**:
- 用户注册（需邀请码）
- 用户登录（用户名 + 密码）
- JWT token 认证（Access token + Refresh token）
- 管理员权限系统
- 邀请码管理

## 技术栈

- **Fastify + TypeScript** - 现有后端框架
- **@fastify/jwt** - JWT 插件
- **bcrypt** - 密码哈希
- **Better-SQLite3** - 数据库
- **Zod** - 数据验证

## 数据库 Schema 变更

### 1. 扩展 accounts 表

```sql
ALTER TABLE accounts ADD COLUMN role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin'));
ALTER TABLE accounts ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
```

**新增字段说明**:
- `role`: 用户角色（'user' 或 'admin'）
- `password_hash`: bcrypt 哈希后的密码

### 2. 新增 invite_codes 表

```sql
CREATE TABLE IF NOT EXISTS invite_codes (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES accounts(id),
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
```

**字段说明**:
- `code`: 邀请码（格式：`INV-XXXX-XXXX`）
- `created_by`: 创建者账户 ID（管理员）
- `max_uses`: 最大使用次数
- `used_count`: 已使用次数
- `expires_at`: 过期时间（可选，ISO 8601 格式）
- `created_at`: 创建时间

### 3. 新增 refresh_tokens 表

```sql
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

**字段说明**:
- `id`: Refresh token ID（用于撤销）
- `account_id`: 关联的账户 ID
- `token_hash`: Token 的哈希值（安全存储）
- `expires_at`: 过期时间
- `created_at`: 创建时间

### 4. 初始管理员账户

在 schema migration 中自动创建默认管理员：
- **用户名**: `admin`
- **Handle**: `admin`
- **显示名**: `系统管理员`
- **密码**: 从环境变量 `ADMIN_INITIAL_PASSWORD` 读取（默认：`admin123`）
- **角色**: `admin`

⚠️ **重要**: 首次部署后必须立即修改管理员密码

## 认证架构

### JWT Token 策略

**双 Token 机制**:
- **Access Token**: 短期有效（1 小时），用于 API 访问
- **Refresh Token**: 长期有效（7 天），用于刷新 access token

**Access Token Payload**:
```typescript
{
  accountId: string;
  role: 'user' | 'admin';
  iat: number;  // issued at
  exp: number;  // expires at (1 hour)
}
```

**Refresh Token Payload**:
```typescript
{
  accountId: string;
  tokenId: string;  // refresh_tokens 表的 ID
  iat: number;
  exp: number;  // expires at (7 days)
}
```

### 认证流程

**1. 用户注册流程**:
```
用户提交注册表单
    ↓
验证邀请码（有效、未过期、未用完）
    ↓
检查用户名是否已存在
    ↓
哈希密码（bcrypt, cost=10）
    ↓
创建账户（role='user'）
    ↓
邀请码使用次数 +1
    ↓
生成 access token + refresh token
    ↓
返回 tokens 和用户信息
```

**2. 用户登录流程**:
```
用户提交登录表单
    ↓
查找账户（通过用户名）
    ↓
验证密码（bcrypt.compare）
    ↓
生成 access token + refresh token
    ↓
Refresh token 存入数据库
    ↓
返回 tokens 和用户信息
```

**3. Token 刷新流程**:
```
客户端发送 refresh token
    ↓
验证 refresh token 签名
    ↓
从数据库查询 token 记录
    ↓
检查是否过期
    ↓
生成新的 access token
    ↓
返回新 access token
```

**4. API 请求验证**:
```
客户端发送请求（Header: Authorization: Bearer <token>）
    ↓
验证 access token 签名
    ↓
检查是否过期
    ↓
提取 accountId 和 role
    ↓
附加到 request 对象
    ↓
继续处理请求
```

### 安全措施

**密码安全**:
- 最小长度：6 个字符
- 使用 bcrypt 哈希（cost factor: 10）
- 前端和后端都验证

**Token 安全**:
- JWT secret 从环境变量读取（至少 32 字符）
- Refresh token 存储哈希值而非明文
- 每次刷新都验证数据库中的 token 存在性

**邀请码安全**:
- 字符集：`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`（排除易混淆字符 0OIl1）
- 格式：`INV-XXXX-XXXX`（8 个随机字符）
- 唯一性：32^8 = 1.1 万亿种组合

**Rate Limiting**（推荐）:
- 登录：每 IP 每分钟最多 5 次
- 注册：每 IP 每小时最多 3 次

## API 端点设计

### 认证端点

#### POST /auth/register

用户注册（需要邀请码）

**请求体**:
```typescript
{
  inviteCode: string;      // 邀请码（格式：INV-XXXX-XXXX）
  username: string;        // 用户名（唯一，3-20 字符）
  displayName: string;     // 显示名称
  password: string;        // 密码（最小 6 字符）
}
```

**响应**:
```typescript
{
  token: string;           // Access token (1 hour)
  refreshToken: string;    // Refresh token (7 days)
  user: {
    id: string;
    handle: string;
    displayName: string;
    role: 'user' | 'admin';
    createdAt: string;
  }
}
```

**错误**:
- `400`: 邀请码无效/过期/用完
- `400`: 用户名已存在
- `400`: 密码格式不正确

---

#### POST /auth/login

用户登录

**请求体**:
```typescript
{
  username: string;
  password: string;
}
```

**响应**:
```typescript
{
  token: string;
  refreshToken: string;
  user: {
    id: string;
    handle: string;
    displayName: string;
    role: 'user' | 'admin';
  }
}
```

**错误**:
- `401`: 用户名或密码错误
- `404`: 用户不存在

---

#### POST /auth/refresh

刷新 access token

**请求体**:
```typescript
{
  refreshToken: string;
}
```

**响应**:
```typescript
{
  token: string;  // 新的 access token
}
```

**错误**:
- `401`: Refresh token 无效或过期

---

#### GET /auth/me

获取当前用户信息

**Headers**:
```
Authorization: Bearer <access_token>
```

**响应**:
```typescript
{
  user: {
    id: string;
    handle: string;
    displayName: string;
    role: 'user' | 'admin';
    kind: 'human' | 'agent' | 'system';
    status: 'active' | 'disabled';
    createdAt: string;
    lastActiveAt: string | null;
  }
}
```

**错误**:
- `401`: Token 无效或过期

---

#### POST /auth/logout

登出（撤销 refresh token）

**Headers**:
```
Authorization: Bearer <access_token>
```

**请求体**:
```typescript
{
  refreshToken?: string;  // 可选，不提供则撤销所有 tokens
}
```

**响应**:
```typescript
{
  success: true
}
```

---

### 管理员端点

所有管理员端点都需要 `Authorization: Bearer <access_token>` 且 `role='admin'`

#### POST /admin/invite-codes

生成邀请码

**请求体**:
```typescript
{
  maxUses?: number;      // 默认：1
  expiresAt?: string;    // ISO 8601 格式，可选
}
```

**响应**:
```typescript
{
  code: string;          // 格式：INV-XXXX-XXXX
  createdBy: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  createdAt: string;
}
```

**错误**:
- `403`: 非管理员

---

#### GET /admin/invite-codes

获取所有邀请码

**响应**:
```typescript
{
  inviteCodes: Array<{
    code: string;
    createdBy: string;
    maxUses: number;
    usedCount: number;
    expiresAt: string | null;
    createdAt: string;
  }>
}
```

---

#### DELETE /admin/invite-codes/:code

删除邀请码

**响应**:
```typescript
{
  success: true
}
```

**错误**:
- `404`: 邀请码不存在

---

#### GET /admin/users

获取所有用户列表

**响应**:
```typescript
{
  users: Array<{
    id: string;
    handle: string;
    displayName: string;
    role: 'user' | 'admin';
    kind: 'human' | 'agent' | 'system';
    status: 'active' | 'disabled';
    createdAt: string;
    lastActiveAt: string | null;
  }>
}
```

---

#### PATCH /admin/users/:id/role

修改用户角色

**请求体**:
```typescript
{
  role: 'user' | 'admin';
}
```

**响应**:
```typescript
{
  user: {
    id: string;
    handle: string;
    displayName: string;
    role: 'user' | 'admin';
  }
}
```

**错误**:
- `404`: 用户不存在
- `400`: 不能修改自己的角色

## 代码结构

```
src/
├── http/
│   ├── routes.ts                    # 现有路由（添加认证中间件）
│   ├── auth-routes.ts               # 新增：认证路由
│   ├── admin-routes.ts              # 新增：管理员路由
│   └── plugins/
│       └── jwt.ts                   # 新增：JWT 插件配置
├── services/
│   ├── auth.ts                      # 新增：认证服务
│   ├── invite-codes.ts              # 新增：邀请码服务
│   └── users.ts                     # 新增：用户管理服务
├── domain/
│   └── auth.ts                      # 新增：认证类型定义
├── db/
│   ├── schema.ts                    # 更新：添加新表
│   └── migrations/
│       └── add-auth-system.ts       # 新增：认证系统迁移
└── middleware/
    └── auth.ts                      # 新增：认证中间件
```

### 核心服务

#### AuthService (`services/auth.ts`)

```typescript
class AuthService {
  // 密码处理
  hashPassword(password: string): Promise<string>
  verifyPassword(password: string, hash: string): Promise<boolean>
  
  // Token 生成
  generateAccessToken(account: Account): string
  generateRefreshToken(account: Account): Promise<{ token: string, tokenId: string }>
  
  // Token 验证
  verifyAccessToken(token: string): { accountId: string, role: string }
  verifyRefreshToken(token: string): Promise<{ accountId: string, tokenId: string }>
  
  // Token 撤销
  revokeRefreshToken(tokenId: string): Promise<void>
  revokeAllRefreshTokens(accountId: string): Promise<void>
  
  // 用户操作
  register(params: RegisterParams): Promise<AuthResponse>
  login(params: LoginParams): Promise<AuthResponse>
}
```

#### InviteCodeService (`services/invite-codes.ts`)

```typescript
class InviteCodeService {
  // 生成邀请码（格式：INV-XXXX-XXXX）
  generate(createdBy: string, maxUses: number, expiresAt?: string): Promise<InviteCode>
  
  // 验证邀请码
  validate(code: string): Promise<boolean>
  
  // 使用邀请码（used_count + 1）
  use(code: string): Promise<void>
  
  // 列出所有邀请码
  list(): Promise<InviteCode[]>
  
  // 删除邀请码
  delete(code: string): Promise<void>
}
```

### 中间件

#### authenticate 中间件

```typescript
// 验证 access token，将用户信息附加到 request
async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = extractBearerToken(request.headers.authorization);
    const payload = server.jwt.verify(token);
    
    // 附加用户信息到 request
    request.user = {
      accountId: payload.accountId,
      role: payload.role
    };
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}
```

#### requireAdmin 中间件

```typescript
// 检查用户是否是管理员
async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user?.role !== 'admin') {
    reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
  }
}
```

**使用示例**:
```typescript
// 需要认证的路由
server.get('/protected', { preHandler: [authenticate] }, handler);

// 需要管理员权限的路由
server.get('/admin/users', { preHandler: [authenticate, requireAdmin] }, handler);
```

## 错误处理

### HTTP 状态码

- **200 OK**: 成功
- **400 Bad Request**: 请求参数错误
- **401 Unauthorized**: 未认证或 token 无效
- **403 Forbidden**: 权限不足
- **404 Not Found**: 资源不存在
- **500 Internal Server Error**: 服务器错误

### 错误响应格式

```typescript
{
  statusCode: number;
  error: string;         // 错误类型
  message: string;       // 错误详情
}
```

### 常见错误

**注册错误**:
- `400 - Invalid invite code`: 邀请码不存在
- `400 - Invite code expired`: 邀请码已过期
- `400 - Invite code fully used`: 邀请码已用完
- `400 - Username already exists`: 用户名已被占用
- `400 - Password too short`: 密码少于 6 字符

**登录错误**:
- `401 - Invalid credentials`: 用户名或密码错误
- `404 - User not found`: 用户不存在

**Token 错误**:
- `401 - Invalid token`: Token 格式错误或签名无效
- `401 - Token expired`: Token 已过期
- `401 - Refresh token not found`: Refresh token 在数据库中不存在

**权限错误**:
- `403 - Admin access required`: 需要管理员权限
- `403 - Cannot modify own role`: 不能修改自己的角色

## 环境变量

```env
# JWT 配置
JWT_SECRET=<至少32字符的随机字符串>  # 必需
JWT_ACCESS_EXPIRY=1h                  # Access token 过期时间
JWT_REFRESH_EXPIRY=7d                 # Refresh token 过期时间

# 密码配置
BCRYPT_ROUNDS=10                      # bcrypt cost factor

# 初始管理员
ADMIN_INITIAL_PASSWORD=admin123       # 管理员初始密码（首次部署后需修改）
```

⚠️ **安全提示**:
- `JWT_SECRET` 必须是强随机字符串（建议使用 `openssl rand -base64 32` 生成）
- 生产环境必须修改 `ADMIN_INITIAL_PASSWORD`

## 实施计划

实施顺序：

1. **数据库迁移**
   - 添加 role 和 password_hash 字段到 accounts 表
   - 创建 invite_codes 和 refresh_tokens 表
   - 创建初始管理员账户

2. **核心服务**
   - 实现 AuthService（密码哈希、token 生成/验证）
   - 实现 InviteCodeService（生成、验证、使用）

3. **认证端点**
   - POST /auth/register
   - POST /auth/login
   - POST /auth/refresh
   - GET /auth/me
   - POST /auth/logout

4. **管理员端点**
   - POST /admin/invite-codes
   - GET /admin/invite-codes
   - DELETE /admin/invite-codes/:code
   - GET /admin/users
   - PATCH /admin/users/:id/role

5. **中间件集成**
   - 为现有 API 端点添加认证中间件
   - 测试权限控制

6. **测试**
   - 单元测试（服务层）
   - 集成测试（API 端点）
   - 安全测试（token 验证、权限检查）

## 测试策略

### 单元测试

- **AuthService**:
  - 密码哈希和验证
  - Token 生成和验证
  - Refresh token 存储和撤销

- **InviteCodeService**:
  - 邀请码生成（格式验证）
  - 邀请码验证（有效性检查）
  - 使用次数递增

### 集成测试

- **注册流程**:
  - 有效邀请码注册成功
  - 无效邀请码注册失败
  - 用户名重复注册失败
  - 密码格式验证

- **登录流程**:
  - 正确凭据登录成功
  - 错误密码登录失败
  - 不存在的用户登录失败

- **Token 刷新**:
  - 有效 refresh token 刷新成功
  - 过期 refresh token 刷新失败
  - 撤销的 refresh token 刷新失败

- **权限控制**:
  - 管理员可访问管理端点
  - 普通用户无法访问管理端点
  - 未认证用户无法访问受保护端点

### 安全测试

- Token 伪造检测
- 过期 token 拒绝
- 密码强度验证
- SQL 注入防护（Zod + 参数化查询）

## 后续优化

可选的未来增强：

1. **登录历史记录**
   - 记录登录时间、IP、设备
   - 异常登录检测

2. **密码重置**
   - 通过邮件重置密码
   - 临时重置链接

3. **双因素认证 (2FA)**
   - TOTP 支持
   - 备用恢复码

4. **会话管理**
   - 查看活跃会话
   - 远程登出所有设备

5. **账户锁定**
   - 登录失败 N 次后锁定
   - 自动解锁或管理员解锁

---

**设计版本**: 1.0  
**最后更新**: 2026-06-15