# NPM 命令手册

本项目为 npm workspaces 单仓（`apps/api` + `apps/web`），要求 **Node >= 20**。

所有子包脚本既可进入对应目录直接运行，也可在根目录通过 `-w <包名>` 运行，例如：

```bash
npm run collect:github -w @openan/api
```

## 环境准备

| 命令 | 说明 |
| --- | --- |
| `npm install` | 安装全部依赖（根目录执行一次即可，覆盖两个 workspace） |

## 根目录脚本（`openan-operation-insights`）

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 同时启动后端（api）与前端（web）开发模式，日志以 cyan/magenta 区分 |
| `npm run dev:api` | 仅启动后端开发模式（等价于 `@openan/api` 的 `start:dev`） |
| `npm run dev:web` | 仅启动前端开发模式（等价于 `@openan/web` 的 `dev`） |
| `npm run build` | 依次构建后端与前端 |
| `npm run build:api` | 仅构建后端 |
| `npm run build:web` | 仅构建前端 |
| `npm run start` | 以生产模式启动后端（`node dist/main.js`） |

## 后端脚本（`@openan/api` · NestJS 10）

### 服务与构建

| 命令 | 说明 |
| --- | --- |
| `npm run build` | NestJS 编译（`nest build`） |
| `npm run start` | 启动 NestJS（`nest start`） |
| `npm run start:dev` | 开发模式启动，文件变更自动重启（`--watch`） |
| `npm run start:prod` | 生产模式启动（`node dist/main.js`） |

### GitHub 采集

| 命令 | 说明 |
| --- | --- |
| `npm run collect:github` | 增量采集 GitHub 数据（运行编译产物） |
| `npm run collect:github:full` | 全量采集 GitHub 数据（`--mode=full`） |
| `npm run collect:github:dev` | 用 ts-node 直接运行源码做增量采集（无需先 build） |
| `npm run collect:github:dev:full` | 用 ts-node 直接运行源码做全量采集 |
| `npm run collect:github:check` | GitHub 采集链路离线自检（不联网，期望 46/46 通过） |

### Confluence / Wiki 采集

| 命令 | 说明 |
| --- | --- |
| `npm run collect:wiki` | 增量采集 Confluence 数据（运行编译产物） |
| `npm run collect:wiki:full` | 全量采集 Confluence 数据（`--mode=full`） |
| `npm run collect:wiki:dev` | 用 ts-node 直接运行源码做增量采集 |
| `npm run collect:wiki:probe` | 只读探测（`--report-only`，仅输出报告不落盘） |
| `npm run collect:wiki:dev:probe` | 用 ts-node 直接运行源码做只读探测 |
| `npm run collect:wiki:check` | Confluence 采集链路离线自检（固定 fixture + 合成档案，73 项断言，不联网） |

### 数据维护与检查

| 命令 | 说明 |
| --- | --- |
| `npm run collect:meetings` | 导入例会台账：将 `data/source/meetings.xlsx` 全量重算为 `data/meetings.json`（失败时保留旧数据） |
| `npm run identity:check` | 账号身份 / 认领关系检查（`scripts/identity-check.mjs`） |
| `npm run smoke` | 冒烟测试（`scripts/smoke.mjs`） |

## 前端脚本（`@openan/web` · React 18 + Vite）

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 类型检查并构建（`tsc -b && vite build`） |
| `npm run preview` | 本地预览构建产物（端口 4173） |
| `npm run typecheck` | 仅类型检查（`tsc --noEmit`） |

## 常用组合（CI / 验收）

```bash
# 构建后端并做两条采集链路的离线自检
npm run build -w @openan/api
npm run collect:github:check -w @openan/api   # 期望：46/46 通过
npm run collect:wiki:check -w @openan/api     # 期望：全部通过（73 项）

# 运维护例：更新例会台账后重新生成 meetings.json
npm run collect:meetings -w @openan/api
```

> 说明：`collect:*`、`identity:check`、`smoke` 等脚本运行的是编译产物（`dist/`）时需先执行 `npm run build -w @openan/api`；带 `:dev` 后缀的版本用 ts-node 直接运行源码，可跳过构建。
