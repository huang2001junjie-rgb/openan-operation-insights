# ADR-0012：采集器目录按「来源」分层与命名模板

- **状态**：✅ 已接受（2026-09-29）
- **日期**：2026-09-29
- **关联文档**：03 §2（后端目录结构）；04 §3.11；CONTEXT.md（Contributor / 数据粒度）；ADR-0008 / ADR-0009 / ADR-0010 / ADR-0011
- **决策者**：项目负责人

## 背景

`apps/api/src/collector/` 原先平铺 **17 个文件**，GitHub 与 Confluence 两条**几乎零共享**的管线混在一起。实际只有 3 个文件跨来源共用（`collector.module.ts` / `collector.tokens.ts` / `collector.constants.ts`），其余 14 个各自属于一条管线。平铺带来的具体问题：

1. **入口不对称**：跑 GitHub 的入口叫 `main.ts`（无来源标识），旁边的却叫 `confluence-main.ts`，读者无法从文件名判断它属于哪条管线。
2. **命名轴不一致**：GitHub 侧用「内容名」`Contribution*`，Confluence 侧用「来源名」`Confluence*`。
3. **`Contribution` 与领域术语冲突**：CONTEXT.md 的 **Contributor** 指「GitHub 账号档案」，而 `contribution-collector` 指的是「GitHub 上的贡献」，两者易被读成同一回事。
4. **无来源标识的共享幻觉**：`sync-state.store.ts` / `SyncStateStore` / `.sync-state.json` 其实是 **GitHub 专属**，只有内部注释提醒「别和 Confluence 混」。
5. **词序相反**：`graphql-github.source.ts`（传输在前）与 `confluence-rest.source.ts`（来源在前）并存。
6. **一名两职**：`confluence-report.ts` 既含「取数观察报告」，又含「快照落盘」。
7. **一个常量文件服务两条管线**：`collector.constants.ts` 前半是 GitHub 分页/配额常量，后半是 Confluence 口径默认值。

## 决策

| # | 问题 | 决策 |
| --- | --- | --- |
| 1 | 分组主轴 | **按来源**分顶层：`github/` + `confluence/`；装配层三件（`collector.module.ts` / `collector.tokens.ts` / `collector.constants.ts`）留在 `collector/` 根，不再套 `shared/` |
| 2 | 命名模板 | 统一为 **`<来源>-<角色>.<角色>.ts`**，CLI 入口为 **`<来源>-main.ts`** |
| 3 | 端口契约 | `*-source.types.ts` → **`*-source.port.ts`**（它已是 `GithubSource` / `ConfluenceSource` 可替换抽象，"types" 埋没了「这是采集源端口」这一事实） |
| 4 | 标识符 | **与文件名同步改名**（不留「文件名新、类名旧」的分裂）：`ContributionCollectorService`→`GithubCollectorService`、`CollectOptions`/`CollectOutcome`→`GithubCollectOptions`/`GithubCollectOutcome`、`SyncState`/`SyncStateStore`→`GithubSyncState`/`GithubSyncStateStore`、`WikiCollectOptions`/`WikiCollectOutcome`→`ConfluenceCollectOptions`/`ConfluenceCollectOutcome`、`GraphqlGithubSource`→`GithubGraphqlSource`、`FixtureGithubSource`→`GithubFixtureSource`、`FixtureConfluenceSource`→`ConfluenceFixtureSource` |
| 5 | 拆分 | **只拆两处一专多能文件**：按来源拆出 `github/github.constants.ts` 与 `confluence/confluence.constants.ts`（跨来源共享的伪组织常量留在根）；`confluence-report.ts` 拆出 `confluence-snapshot.ts`（`writeConfluenceSnapshot` + 快照派生态） |

最终布局：

```
collector/
├── collector.module.ts / collector.tokens.ts / collector.constants.ts   # 装配层（共享）
├── github/     github-main · github-collector.service · github-source.port
│               github-graphql.source · github-fixture.source
│               github-sync-state.store · github.constants
└── confluence/ confluence-main · confluence-collector.service · confluence-source.port
                confluence-rest.source · confluence-fixture.source
                confluence-content.parser · confluence-state.store
                confluence-report · confluence-snapshot · confluence.constants
```

## 理由与取舍

- **为什么不按职责分（sources / services / state）**：两条管线各自是 `source → parser/store → service → cli` 的闭环，跨来源只有 3 个文件；按职责分会把同一条管线的东西摊到三处，改动时来回跳目录。按来源分则「读一条管线」=「读一个目录」。
- **为什么根目录不套 `shared/`**：共享文件只有 3 个，`collector/` 根本身就充当装配层，多一层目录只增加路径噪音。
- **为什么连标识符一起改**：只改文件名会留下 `github-collector.service.ts` 里导出 `ContributionCollectorService` 这类分裂，比现状更难读。代价是改动面变大，但引用全部在 `collector/` 内（无跨模块引用），风险可控。
- **为什么 `*-source.types.ts` 只改名不拆分**：它已是单一职责（只放端口契约与记录类型），问题只在命名，不在职责。
- **为什么 `.port.ts` 而不是 `.abstract.ts` / `.dto.ts`**：端口 = 「被替换的实现」（真实 / 离线 fixture）所依赖的契约，`port` 直接对应这一角色（见 `GITHUB_SOURCE` / `CONFLUENCE_SOURCE` 两个注入 Token）。

## 后果

- **产物路径变化**：`dist/collector/main.js` → `dist/collector/github/github-main.js`；`dist/collector/confluence-main.js` → `dist/collector/confluence/confluence-main.js`。`package.json` 的采集相关脚本与 `scripts/collector-check.mjs`、`scripts/confluence-check.mjs` 的 dist 路径同步更新 —— 任何**外部**按旧路径调用采集入口的脚本（CI、部署任务、运维手册）都需一并更新。
- **命令键更名**：`package.json` 的 GitHub 侧采集脚本由 `collect` / `collect:full` / `collect:dev` / `collect:dev:full` / `collect:check` 统一为 `collect:github` / `collect:github:full` / `collect:github:dev` / `collect:github:dev:full` / `collect:github:check`，与 Confluence 侧 `collect:wiki*` 的命名轴对齐（`collect:meetings` 属第三个来源，不动）；全仓引用（`scripts/collector-check.mjs` 注释、`docs/05`、`docs/08`、ADR-0007）同步更新。
- **对外契约不变**：HTTP 接口、`data/*.json` 的文件名与结构、`.sync-state*.json` 的落盘路径与字段**全部不动**，本次是纯代码组织调整。
- **连带更新**：`docs/03` 目录树；`configuration.ts` 与 `confluence-source.port.ts` 等按文件名引用常量的注释；ADR-0007 / 0008 / 0010 / 0011 中失效的路径引用。

## 验证

- `npm run build -w @openan/api` 通过。
- `npm run collect:github:check`（GitHub 链路离线自检）：**46/46 全通过**。
- `npm run collect:wiki:check`（Confluence 链路离线自检）：**全部通过（73 项）**。

## 备注

- **已办结的既有问题**（先于本次重构即存在，非本次引入）：`apps/api/scripts/fixtures/seed-data/confluence-organizations.json`（`schemaVersion: 2` → **3**）与 `confluence-accounts.json`（`schemaVersion: 2` → **4**）原先停留在 ADR-0011 之前的模型，`scripts/confluence-check.mjs` 的两处 `schemaVersion` 断言也停留在 v2。三者已随 ADR-0011 的字段新增（`confluence.edits`、`orgSource`）一并迁移，Confluence 离线自检由「未通过」恢复全绿。
