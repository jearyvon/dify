
## 二次开发指南

## web项目二次开发指南
```bash
根目录下执行
### 1. 安装依赖
pnpm install

### 2. 配置环境
cp web/.env.example web/.env.local
### 编辑 web/.env.local，设置 DEV_PROXY_TARGET 为你的线上地址

### 3. 终端 代理
pnpm -C web run dev:proxy

### 4. 终端 2
pnpm -C web run dev
# 或使用 vinext（README 推荐，开发体验更好）
pnpm -C web run dev:vinext
```
