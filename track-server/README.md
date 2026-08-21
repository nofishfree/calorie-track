# Calorie Track Server

每日热量与营养摄入记录工具的后端服务，使用Rust + Axum + PostgreSQL + JWT构建。

## 技术栈

- **Web框架**: Axum 0.7
- **数据库**: PostgreSQL + SQLx
- **认证**: JWT + bcrypt
- **异步运行时**: Tokio

## 功能特性

- 用户注册和登录（JWT认证）
- 食物管理（创建、查询、更新、删除）
- 用餐记录（添加、查询、删除）
- 用户营养目标设置
- 每日营养统计
- 期间营养统计分析
- 收藏食物功能

## 数据模型

项目已精简，仅保留四种核心营养素：
- 热量
- 碳水化合物
- 蛋白质
- 脂肪

## 安装和运行

### 前置要求

- Rust 1.70+
- PostgreSQL 12+
- (可选) Docker

### 1. 克隆项目

```bash
git clone <repository-url>
cd track-server
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DATABASE_URL=postgresql://username:password@localhost/calorie_track
# Generate with: openssl rand -base64 32
JWT_SECRET=replace-with-at-least-32-byte-secret
HOST=0.0.0.0
PORT=3000
```

`JWT_SECRET` 是必填项，长度必须至少为 32 字节。可使用以下命令生成：

```bash
openssl rand -base64 32
```

### 3. 设置数据库

#### 使用Docker（推荐）

```bash
docker run --name calorie-track-db \
  -e POSTGRES_DB=calorie_track \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:15
```

#### 手动创建数据库

```sql
CREATE DATABASE calorie_track;
```

### 4. 运行数据库迁移

```bash
# 使用sqlx-cli运行迁移
cargo install sqlx-cli
sqlx database create
sqlx migrate run
```

或者手动执行 `migrations/001_initial.up.sql` 文件。

### 5. 运行服务器

```bash
cargo run
```

服务器将在 `http://localhost:3000` 启动。

## API接口

### 公开接口

#### 健康检查
```
GET /health
```

#### 用户注册
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "username": "optional_username"
}
```

#### 用户登录
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 需要认证的接口

所有以下接口需要在请求头中包含JWT token：
```
Authorization: Bearer <your-jwt-token>
```

#### 食物管理

创建食物：
```
POST /api/foods
Content-Type: application/json

{
  "name": "鸡胸肉",
  "brand": "可选品牌",
  "image_url": "可选图片URL",
  "num": 100.0,
  "calorie": 165.0,
  "carbs_g": 0.0,
  "protein_g": 31.0,
  "fat_g": 3.6
}
```

获取食物列表：
```
GET /api/foods?search=鸡胸肉&is_system=false&limit=50&offset=0
```

获取单个食物：
```
GET /api/foods/{food_id}
```

更新食物：
```
PUT /api/foods/{food_id}
Content-Type: application/json

{
  "name": "更新后的名称",
  "calorie": 170.0
}
```

删除食物：
```
DELETE /api/foods/{food_id}
```

#### 用餐记录

创建用餐记录：
```
POST /api/meal-records
Content-Type: application/json

{
  "food_id": "uuid",
  "serving_count": 2.0,
  "record_time": "2026-06-01T14:30:00Z"
}
```

获取用餐记录：
```
GET /api/meal-records?date=2026-06-01
GET /api/meal-records?start_date=2026-06-01T00:00:00Z&end_date=2026-06-07T23:59:59Z
```

删除用餐记录：
```
DELETE /api/meal-records/{record_id}
```

#### 用户目标

获取用户目标：
```
GET /api/goals
```

创建或更新用户目标：
```
POST /api/goals
Content-Type: application/json

{
  "calorie_target": 2000,
  "carb_target_g": 250.0,
  "protein_target_g": 150.0,
  "fat_target_g": 65.0
}
```

更新用户目标：
```
PUT /api/goals
Content-Type: application/json

{
  "calorie_target": 2200
}
```

#### 统计分析

每日统计：
```
GET /api/stats/daily?date=2026-06-01
```

营养统计：
```
GET /api/stats/nutrients?start_date=2026-06-01&end_date=2026-06-07
GET /api/stats/nutrients?days=7
```

#### 收藏食物

添加收藏：
```
POST /api/favorites/{food_id}
```

获取收藏列表：
```
GET /api/favorites
```

移除收藏：
```
DELETE /api/favorites/{food_id}
```

## 项目结构

```
track-server/
├── src/
│   ├── main.rs              # 主程序入口
│   ├── lib.rs               # 库文件
│   ├── models.rs            # 数据模型
│   ├── error.rs             # 错误处理
│   ├── auth.rs              # JWT认证
│   ├── database.rs          # 数据库连接
│   └── handlers/            # API处理器
│       ├── mod.rs
│       ├── auth.rs
│       ├── foods.rs
│       ├── meal_records.rs
│       ├── goals.rs
│       ├── stats.rs
│       └── favorites.rs
├── migrations/              # 数据库迁移文件
│   └── 001_initial.up.sql
├── Cargo.toml               # Rust项目配置
├── .env.example             # 环境变量示例
└── README.md                # 项目文档
```

## 开发

### 运行测试

```bash
cargo test
```

### 代码检查

```bash
cargo clippy
```

### 格式化代码

```bash
cargo fmt
```

## 安全注意事项

1. 在生产环境中使用强JWT密钥
2. 使用HTTPS保护API通信
3. 定期更新依赖包
4. 限制CORS来源
5. 实施速率限制

## 许可证

MIT License
