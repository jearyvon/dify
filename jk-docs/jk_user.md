# JK 用户接口文档

本文档描述 `api/controllers/console/jk/jk_user.py` 中提供的用户管理相关接口。

## 通用说明

| 项目 | 说明 |
|------|------|
| 基础路径 | `/console/api` |
| 请求格式 | `Content-Type: application/json`（`GET` 接口无请求体） |
| 认证 | 以下接口为内部 JK 集成接口，不依赖标准 Console 登录态；`/_jk_login` 会在响应中写入 Cookie |

### 通用错误响应

当抛出 `AccountNotFound` 等 HTTP 异常时，响应格式为：

```json
{
  "code": "account_not_found",
  "message": "Account not found.",
  "status": 400
}
```

参数校验失败（Pydantic）时，返回 `400`，`message` 为具体校验错误说明。

---

## 1. 用户登录

**`POST /console/api/_jk_login`**

根据 `user_id` 完成登录，返回 Token 并写入 Cookie。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | 是 | 用户 ID（Account ID） |
| `remember_me` | boolean | 否 | 是否记住登录，默认 `true` |

### 请求示例

```json
{
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "remember_me": true
}
```

### 成功响应 `200`

响应体：

```json
{
  "result": "success",
  "token_pair": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "csrf_token": "..."
  }
}
```

同时会在响应头 `Set-Cookie` 中写入 `access_token`、`refresh_token`、`csrf_token`。

### 错误情况

| 场景 | HTTP 状态码 | code |
|------|-------------|------|
| 用户不存在 | 400 | `account_not_found` |

---

## 2. 用户登出

**`POST /console/api/_jk_logout`**

根据 `user_id` 登出指定用户，并清除 Cookie。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | 是 | 用户 ID |

### 请求示例

```json
{
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### 成功响应 `200`

```json
{
  "result": "success"
}
```

同时清除 `access_token`、`refresh_token`、`csrf_token` 相关 Cookie。

### 错误情况

| 场景 | HTTP 状态码 | code |
|------|-------------|------|
| 用户不存在 | 400 | `account_not_found` |

---

## 3. 创建用户

**`POST /console/api/_jk_user_create`**

创建用户（若邮箱已存在则复用已有账户），加入指定或默认工作空间，角色为 `normal`。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 用户名称 |
| `email` | string | 是 | 用户邮箱 |
| `password` | string | 是 | 用户密码 |
| `tenant_id` | string | 否 | 工作空间 ID；不传则使用默认工作空间 |

### 请求示例

```json
{
  "name": "张三",
  "email": "zhangsan@example.com",
  "password": "your-password",
  "tenant_id": "tenant-uuid-optional"
}
```

### 成功响应 `200`

```json
{
  "result": "success",
  "data": {
    "account_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "zhangsan@example.com",
    "name": "张三",
    "tenant_id": "workspace-uuid"
  }
}
```

### 错误情况

| 场景 | HTTP 状态码 | 说明 |
|------|-------------|------|
| 账户被封禁 | 400 | `AccountBannedError` |
| 账户处于冻结期 | 400 | `AccountInFreezeError` |
| 工作空间不存在 | 400 | `NotAllowedCreateWorkspace` |

---

## 4. 更新成员角色

**`POST /console/api/_jk_role_update`**

在默认工作空间中更新指定用户的成员角色。操作者自动取该工作空间的 `owner` 或 `admin`。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | 是 | 用户 ID |
| `role` | integer | 是 | 角色编码，见下表 |

#### 角色编码

| 值 | 角色 |
|----|------|
| `1` | `normal`（普通成员） |
| `2` | `editor`（编辑者） |
| `3` | `owner`（所有者） |

### 请求示例

```json
{
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "role": 2
}
```

### 成功响应 `200`

```json
{
  "result": "success"
}
```

### 错误响应

| HTTP 状态码 | code | 说明 |
|-------------|------|------|
| 400 | `cannot-operate-self` | 不能修改自己的角色 |
| 400 | `role-already-assigned` | 目标角色已分配 |
| 400 | — | `role` 参数无效（非 1/2/3） |
| 403 | `forbidden` | 无权限执行操作 |
| 404 | `member-not-found` | 用户不在工作空间中 |
| 400 | `account_not_found` | 用户不存在，或无可用 operator |

---

## 5. 更新用户状态

**`POST /console/api/_jk_status_update`**

更新账户状态，状态值对应 `AccountStatus` 枚举。

### 请求体

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `user_id` | string | 是 | 用户 ID |
| `status` | integer | 是 | 状态编码，见下表 |

#### 状态编码

| 值 | 状态 | 说明 |
|----|------|------|
| `1` | `pending` | 待激活 |
| `2` | `uninitialized` | 未初始化 |
| `3` | `active` | 已激活 |
| `4` | `banned` | 已封禁 |
| `5` | `closed` | 已关闭 |

> 当状态设为 `active`（`3`）且用户尚未初始化时，会自动设置 `initialized_at`。

### 请求示例

```json
{
  "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": 3
}
```

### 成功响应 `200`

```json
{
  "result": "success",
  "data": {
    "user_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "active"
  }
}
```

### 错误情况

| 场景 | HTTP 状态码 | 说明 |
|------|-------------|------|
| 用户不存在 | 400 | `account_not_found` |
| `status` 无效 | 400 | 参数校验失败 |

---

## 6. 初始化管理员

**`GET /console/api/_jk_init_admin`**

初始化管理员账户。若 `admin@admin.com` 不存在则自动创建，并返回管理员信息。

### 请求参数

无。

### 成功响应 `200`

```json
{
  "result": "success",
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "email": "admin@admin.com",
    "name": "admin",
    "tenant_id": "workspace-uuid"
  }
}
```

### 说明

- 首次调用会创建管理员账户，默认密码为 `admin123456`。
- 若账户已存在，直接返回现有管理员信息。

### 错误情况

| 场景 | HTTP 状态码 | code |
|------|-------------|------|
| 账户加载失败 | 400 | `account_not_found` |

---

## 调用示例（cURL）

```bash
# 登录
curl -X POST 'http://localhost:5001/console/api/_jk_login' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "YOUR_USER_ID"}'

# 创建用户
curl -X POST 'http://localhost:5001/console/api/_jk_user_create' \
  -H 'Content-Type: application/json' \
  -d '{"name": "张三", "email": "zhangsan@example.com", "password": "your-password"}'

# 更新角色
curl -X POST 'http://localhost:5001/console/api/_jk_role_update' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "YOUR_USER_ID", "role": 2}'

# 更新状态
curl -X POST 'http://localhost:5001/console/api/_jk_status_update' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "YOUR_USER_ID", "status": 3}'

# 登出
curl -X POST 'http://localhost:5001/console/api/_jk_logout' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "YOUR_USER_ID"}'

# 初始化管理员
curl -X GET 'http://localhost:5001/console/api/_jk_init_admin'
```

> 请将 `http://localhost:5001` 替换为实际 API 服务地址。
