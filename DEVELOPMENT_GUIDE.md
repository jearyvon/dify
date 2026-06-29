# Dify 开发文档

## 一、项目概述

Dify 是一个开源的 LLM 应用开发平台，提供直观的界面来构建 AI 工作流、RAG 管道、Agent 能力和模型管理。

### 核心功能

| 功能模块 | 描述 |
|---------|------|
| **Workflow** | 可视化画布构建强大的 AI 工作流 |
| **Model Support** | 支持 GPT、Mistral、Llama3 等数百种专有/开源模型 |
| **Prompt IDE** | 直观的提示词编辑界面，支持模型性能对比 |
| **RAG Pipeline** | 完整的文档 ingestion 到检索的 RAG 能力 |
| **Agent Capabilities** | 基于 LLM Function Calling 或 ReAct 的 Agent 定义 |
| **LLMOps** | 监控和分析应用日志与性能 |
| **Backend-as-a-Service** | 完整的 API 支持，便于集成到业务逻辑 |

## 二、技术栈

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Dify Platform                            │
├─────────────────────┬───────────────────────────────────────┤
│    Frontend Web     │         Backend Services              │
│   (Next.js + React) │                                       │
│                     ├── API Server (Flask)                  │
│                     ├── Worker (Celery)                     │
│                     ├── Beat (Scheduled Tasks)              │
│                     └── Agent Backend                       │
├─────────────────────┴───────────────────────────────────────┤
│                     Infrastructure                          │
│   PostgreSQL │ Redis │ Vector DB (Weaviate/Milvus/...)      │
└─────────────────────────────────────────────────────────────┘
```

### 技术栈详情

| 分类 | 技术 | 版本/说明 |
|------|------|-----------|
| 前端 | Next.js | React + TypeScript |
| 前端构建 | Vite+ (vinext) | 替代传统 Vite |
| 前端包管理 | pnpm | 工作区模式 |
| 后端框架 | Flask | Python |
| 后端包管理 | uv | 替代 Poetry |
| 异步任务 | Celery | Redis 作为 Broker |
| 数据库 | PostgreSQL | 主数据库 |
| 缓存 | Redis | 缓存和消息队列 |
| 向量数据库 | Weaviate/Milvus/OpenSearch | 可配置切换 |
| 测试 | pytest (后端) / Vitest (前端) | TDD 实践 |

## 三、项目结构

```
dify/
├── api/                    # 后端 API (Python Flask)
│   ├── commands/           # CLI 命令
│   ├── configs/            # 配置文件
│   ├── constants/          # 常量定义
│   ├── core/               # 核心业务逻辑 (DDD)
│   │   ├── agent/          # Agent 相关
│   │   ├── app/            # 应用相关
│   │   ├── db/             # 数据库抽象
│   │   ├── file/           # 文件处理
│   │   ├── mcp/            # MCP 协议
│   │   ├── ops/            # 运维相关
│   │   ├── rag/            # RAG 相关
│   │   └── tools/          # 工具相关
│   ├── enums/              # 枚举定义
│   ├── events/             # 事件系统
│   ├── factories/          # 工厂模式
│   ├── fields/             # 字段定义
│   ├── libs/               # 通用库
│   ├── models/             # SQLAlchemy 模型
│   ├── providers/          # 模型提供商
│   ├── repositories/       # 仓储层
│   ├── services/           # 服务层
│   ├── tasks/              # Celery 任务
│   └── tests/              # 测试用例
├── web/                    # 前端 Web (Next.js)
│   ├── app/                # App Router 页面
│   ├── components/         # 组件
│   ├── context/            # 上下文 (i18n 等)
│   ├── hooks/              # 自定义 Hooks
│   ├── i18n/               # 国际化资源
│   └── docs/               # 前端文档
├── cli/                    # 命令行工具
├── dify-agent/             # Agent 后端服务
├── docker/                 # Docker 部署配置
├── e2e/                    # 端到端测试
└── packages/               # 共享包
    └── dify-ui/            # UI 组件库
```

## 四、开发环境搭建

### 前置依赖

- CPU >= 2 Core
- RAM >= 4 GiB
- Docker & Docker Compose
- Node.js (推荐使用 corepack 管理版本)
- pnpm
- uv (Python 包管理)

### 快速开始 (推荐)

使用脚本快速搭建开发环境：

```bash
# 1. 运行初始化脚本
./dev/setup

# 2. 查看并配置环境变量
# 检查 api/.env, web/.env.local, docker/middleware.env

# 3. 启动中间件 (PostgreSQL/Redis/Weaviate)
./dev/start-docker-compose

# 4. 启动后端 API (自动执行迁移)
./dev/start-api

# 5. 启动前端
./dev/start-web

# 6. 启动 Worker (异步任务)
./dev/start-worker

# 7. 可选: 启动 Celery Beat (定时任务)
./dev/start-beat
```

### 手动启动

#### 后端启动

```bash
cd api

# 安装依赖
uv sync --group dev

# 运行迁移
uv run flask db upgrade

# 启动 API 服务
uv run flask run --host=0.0.0.0 --port=5001

# 启动 Worker
uv run celery -A dify_app.celery worker --loglevel=info

# 启动 Beat
uv run celery -A dify_app.celery beat --loglevel=info
```

#### 前端启动

```bash
# 安装依赖 (从项目根目录)
pnpm install

# 复制并配置环境变量
cp web/.env.example web/.env.local

# 启动开发服务器
pnpm -C web run dev
# 或使用 vinext (推荐)
pnpm -C web run dev:vinext
```

### Docker 部署

```bash
cd docker

# 复制环境变量
cp .env.example .env

# 启动所有服务
docker compose up -d

# 访问 http://localhost/install 完成初始化
```

## 五、编码规范

### Python 规范

**命名约定**：
- 变量/函数：`snake_case`
- 类：`PascalCase`
- 常量：`UPPER_CASE`

**类型提示**：
- 使用现代类型形式：`list[str]`、`dict[str, int]`
- 避免 `Any`，优先使用 `TypedDict`
- 类成员变量显式声明类型

**文档字符串**：
- 模块级：说明用途、边界、关键不变量
- 类级：职责、生命周期、使用方式
- 函数级：行为契约、参数、返回值、副作用、异常

**代码质量**：
```bash
# 格式化
uv run ruff format ./

# 检查并修复
uv run ruff check --fix ./

# 类型检查
uv run pyrefly check
```

### TypeScript 规范

**配置**：
- 使用严格模式 (`strict: true`)
- 避免 `any` 类型
- 使用 ESLint + pnpm lint:fix

**国际化**：
- 用户可见字符串必须放在 `web/i18n/en-US/`
- 禁止硬编码文本

## 六、测试实践

### 后端测试

```bash
cd api

# 运行所有测试
uv run pytest

# 仅运行单元测试
uv run pytest tests/unit_tests/

# 运行集成测试
uv run pytest tests/integration_tests/

# 运行特定测试
uv run pytest tests/unit_tests/test_example.py
```

### 前端测试

```bash
# 运行测试
pnpm -C web test

# 分析组件复杂度
pnpm analyze-component app/components/your-component/index.tsx
```

### 测试原则

- **TDD 流程**：红 → 绿 → 重构
- **Arrange-Act-Assert** 结构
- 前端组件必须有完整测试覆盖
- 集成测试仅在 CI 环境运行

## 七、贡献指南

### 贡献流程

1. Fork 仓库
2. 创建 Issue 讨论变更
3. 创建新分支
4. 添加测试用例
5. 确保通过现有测试
6. PR 描述中链接 Issue
7. 等待审核合并

### Bug 报告要求

- 清晰的标题
- 详细描述和错误信息
- 复现步骤
- 期望行为
- 日志（后端问题必备）

### PR 规范

- 提交前运行：`make lint`、`make type-check`、`make test`
- 遵循编码规范
- 添加必要的测试
- 更新相关文档

## 八、架构原则

### 后端架构

遵循 **DDD (领域驱动设计)** 和 **Clean Architecture**：

```
Controller → Service → Core/Domain → Repository → Database
```

- **Controllers**：解析输入、调用服务、返回响应，无业务逻辑
- **Services**：协调仓储、提供商、后台任务，显式声明副作用
- **Core/Domain**：领域业务逻辑，纯函数优先
- **Repositories**：数据访问抽象

### 异步任务

- 通过 `services/async_workflow_service` 调度异步工作
- 任务实现位于 `tasks/`，显式选择队列
- 使用 Celery + Redis 作为 Broker

### 状态管理

- 组件内部状态：使用 React 本地状态
- 跨组件共享状态：使用 Jotai atoms
- 复杂交互状态：使用特性级 stores
- 持久化偏好：使用 `use-local-storage` hook

## 九、配置管理

### 环境变量

**后端配置** (`api/.env`)：
```bash
SECRET_KEY=your-secret-key
DB_USERNAME=dify
DB_PASSWORD=dify
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=dify
REDIS_HOST=localhost
REDIS_PORT=6379
```

**前端配置** (`web/.env.local`)：
```bash
NEXT_PUBLIC_API_PREFIX=http://localhost:5001/api
NEXT_PUBLIC_PUBLIC_API_PREFIX=http://localhost:5001/api
NEXT_PUBLIC_COOKIE_DOMAIN=1
```

### 生成 SECRET_KEY

```bash
# Linux
sed -i "/^SECRET_KEY=/c\SECRET_KEY=$(openssl rand -base64 42)" .env

# Mac
secret_key=$(openssl rand -base64 42)
sed -i '' "/^SECRET_KEY=/c\SECRET_KEY=${secret_key}" .env
```

## 十、监控与可观测性

### OpenTelemetry

```bash
# 启用 OTEL
ENABLE_OTEL=true
OTLP_BASE_ENDPOINT=your-otlp-endpoint
```

### Grafana 监控

可导入社区贡献的 Grafana Dashboard：
- [dify-grafana-dashboard](https://github.com/bowenliang123/dify-grafana-dashboard)

## 十一、社区与支持

- **GitHub Discussion**: https://github.com/langgenius/dify/discussions
- **GitHub Issues**: https://github.com/langgenius/dify/issues
- **Discord**: https://discord.gg/FngNHpbcY7
- **X(Twitter)**: https://twitter.com/dify_ai

## 十二、许可证

Dify 使用基于 Apache 2.0 的 [Dify Open Source License](LICENSE)，包含额外条件。