# 曜竞后台管理系统后端（ESPORTS CLUB）

Node.js + Express + MySQL 8.0。
已实现多角色权限、订单持久化、统计接口、线上用户模块、软删除与状态流转。

## 启动方式

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
copy .env.example .env
```

3. 启动服务（开发）

```bash
npm run dev
```

4. 启动服务（生产）

```bash
npm start
```

服务默认地址：`http://localhost:3000`

## 域名规划（生产）

- 统一根域名：`yaojingclub.com`
- 固定子域名：
  - `admin.yaojingclub.com`
  - `online.yaojingclub.com`
- 新增网吧沿用动态规则：`{domain_prefix}.yaojingclub.com`
- 本地联调地址规则：`http://localhost:5174/?store={domain_prefix}`
- 来源识别优先级保持不变：`req.body.store_key` -> `req.query.store` -> `req.headers.host`

## 运行入口说明

- 当前主入口：`app.js`（根目录）
- 兼容入口：`server/app.js`（已转发到主入口）

## 健康检查

- `GET /api/health`
- 期望返回：

```json
{ "status": "ok" }
```

## 角色权限

- `super_admin`
  - 全局管理（订单状态、删除/恢复、用户/网吧/陪玩店管理）
- `admin`
  - 查看全部订单
  - 确认订单生效（`completed`）
  - 查看统计、线上用户
- `store_owner`
  - 仅可见 `store_id = 自己` 且 `status = completed` 且 `is_deleted = 0` 的订单
  - 仅可见自身统计

## 核心接口

- 认证
  - `POST /api/auth/login`
- 订单
  - `GET /api/orders`
  - `POST /api/orders`
  - `POST /api/orders/:id/confirm`
  - `PATCH /api/orders/:id/status`
  - `DELETE /api/orders/:id`
  - `PATCH /api/orders/:id/restore`
- 统计
  - `GET /api/stats/overview`
- 网吧
  - `GET /api/stores`
- 用户
  - `GET /api/users`
- 陪玩店
  - `GET /api/play_shops`
- 线上用户
  - `GET /api/online-users`

## 数据持久化约定

- 所有新增/修改/删除均写入 MySQL。
- 前端页面每次进入应调用 API 拉取最新数据，不使用本地 mock 数组。
- Pinia 仅建议持久化 `token / userInfo / role`。

## 常见问题

1. `API endpoint not found`
- 检查请求路径是否为 `/api/...`
- 检查前端 `baseURL` 是否已包含 `/api`，若已包含则请求写 `/orders`，不要写 `/api/orders`

2. 端口占用
- Windows 下可先结束旧 Node 进程，再重新 `npm run dev`



