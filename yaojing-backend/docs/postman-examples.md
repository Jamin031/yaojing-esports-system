# Postman 测试示例

## 1. 登录获取 JWT

`POST /api/auth/login`

```json
{
  "username": "superadmin",
  "password": "Admin@123456"
}
```

## 2. 新增网吧（super_admin）

`POST /api/stores`

Headers:

- `Authorization: Bearer {{token}}`

Body:

```json
{
  "name": "忆时光网吧",
  "subdomain": "yishiguang",
  "commission_rate": 0.035
}
```

## 3. 新增套餐（store_owner/admin/super_admin）

`POST /api/packages`

Headers:

- `Authorization: Bearer {{token}}`

Body:

```json
{
  "store_id": 1,
  "game_type": "英雄联盟",
  "service_type": "陪玩",
  "title": "白银冲分2小时",
  "description": "语音+复盘",
  "price": 88,
  "duration": 120,
  "status": "active"
}
```

## 4. 新建订单（按子域名识别门店）

`POST /api/orders`

Headers:

- `Host: yishiguang.localhost:3000`

Body:

```json
{
  "package_id": 1,
  "player_id": 1,
  "customer_contact": "13800138000"
}
```

## 5. 确认订单（admin/super_admin）

`PUT /api/orders/1/confirm`

Headers:

- `Authorization: Bearer {{adminToken}}`

## 6. 完成订单（admin/super_admin）

`PUT /api/orders/1/complete`

Headers:

- `Authorization: Bearer {{adminToken}}`

## 7. 统计接口

`GET /api/stats/overview`

Headers:

- `Authorization: Bearer {{token}}`

## 8. 内部来单提醒（扩展接口）

`POST /api/internal/order-notify`

Headers:

- `x-internal-key: {{internalKey}}`

Body:

```json
{
  "store_name": "忆时光网吧",
  "amount": 88,
  "contact": "13800138000"
}
```

