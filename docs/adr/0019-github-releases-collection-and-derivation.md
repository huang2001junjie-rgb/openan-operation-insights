# ADR-0019：组件版本发布统计——GitHub Releases 全量枚举落盘 + 读时派生（新页面 /releases）

- **状态**：✅ 已接受（2026-10-31）— 新增 `data/github-releases.json`（`schemaVersion` = **1**）与接口 `GET /api/repo-releases`；导航栏在「社区活跃度」后新增「版本发布」。**沿用 ADR-0017「一份原子事实 + 读时派生」与 ADR-0018「区间是视图属性」的两条主线**：Release 事实全量落盘，页面口径全部读时派生。
- **日期**：2026-10-31
- **关联文档**：04 §1 / §1.1 / §3.13～§3.15 / §4.12 / §5.2（第 21 项）/ §5.3.18 / §6.2；02 §4（导航 /releases）；05 §5.1（collect:github 每轮同时刷新 Releases）；09（启动自检 WARN 集合新增 github-releases.json）；README §5 术语表
- **决策者**：项目负责人（Q1–Q8 逐条给出推荐答案后一次性拍板）

## 背景

运营侧需要回答「各组件（有 Release 的项目）发布得怎么样」：谁在发版、最新是什么版本、多久没发、发布节奏如何。此前平台没有任何 Release 数据——GitHub 采集器只采 PR / Issue 事件，Confluence 的版本树（Releases > Release Planning）描述的是 OpenAN 自身的发布火车（26.06 / 26.12），与「组件仓库的 GitHub Release」是两种语义，后者才是「组件发布情况」的直接事实。

约束：

1. **组件 = 采集范围内的 GitHub 仓库**（`GITHUB_ORGS` / `GITHUB_REPOS` 白名单，ADR-0012 组织枚举），口径分母必须与之对齐；
2. 数据必须**自动更新**（人工维护 JSON 是债），采集链路现成（GraphQL + 状态存 + 离线 fixture）；
3. 「无 Release 的仓库」也是信息（声明行），分母不能由 releases 反推——有 Release 才有记录。

## 决策

### 决策 1：Release 是新的原子事实文件，全量枚举、整体替换、无增量游标

- 新增 `data/github-releases.json`：`JsonFileEnvelope<GithubReleasesFileData>`（v1），`data = { repositories, releases }`。
- `releases`：一条 = 一个**非 draft** GitHub Release（`repository / tag / name / publishedAt / url`）。draft 采集期过滤；缺 `tag` / `publishedAt` 的异常节点跳过 + `WARN`（与 contributions 的防御同级）。
- `repositories`：采集范围的**解析结果**（白名单 / 组织枚举，采集时已 resolve），随本轮 Releases 一并固化——它是「无 Release 仓库 / 总数」的**唯一分母**。
- **全量替换**：每次 `collect:github:*`（含增量轮）逐仓库枚举 Releases 后整体写。Release 量级小（每组件一年几次），无增量语义；失败（含配额触底）即**整体中止本轮**——与贡献数据同策略：什么都不落盘，保留上一次成功结果。
- 与 `github-events.json` 同为首次采集前**可能缺失**的文件：启动自检只 WARN，接口在缺失时返回 `50001`（fail-fast，不静默为 0）。

### 决策 2：三个展示口径

| 口径 | 裁定 |
| --- | --- |
| 「最新版本」 | 按 `publishedAt` **最新**取，**不按 tag 字符串排序**（跨仓库命名不规范，semver 排序不可靠）；tag 原样展示（如 `v2.1.0`） |
| 表格范围 | **只列有 Release 的组件**（`releaseCount > 0`）；无 Release 仓库由表尾声明行（数量 + 名称）表达 |
| 平均发布周期 | **各组件内部**相邻发布间隔均值（`span / (count-1)`），再按**组件等权**平均；无任一组件 ≥2 次发布时为 `null` |

「近 90 天」沿用 ADR-0018 的「自今起 N 天」口径（窗口左边界 = 今天零点 − 89 天，宽松含边界当天）。prerelease 不剔除（GitHub 语义上是正式发布的预发版本，次数照计），仅 draft 排除。

### 决策 3：读侧「一端口一 Provider」，出参 `RepoReleasesData`

- 新端口 `REPO_RELEASE_PORT` + `JsonRepoReleaseProvider`（读时派生，**不落盘、不新增派生文件**），与 ADR-0017 的 `REPO_CONTRIBUTION_PORT` 同一形状；`modules/release` 暴露 `GET /api/repo-releases`。
- 出参一次给全页面需要的数据（`repos / totalInScope / reposWithoutReleases / recent90dCount / latestRelease / avgDaysBetweenReleases / updatedAt`），无 Query 参数；排序 / 搜索由前端在已获取数据上本地完成（沿用 04 §5.1 约定）。
- 前端：`useRepoReleases` + `ReleasesPage`（4 张 StatCard + 组件明细表）+ `RepoReleaseTable`（复刻 `RepoContributionTable` 模式：搜索 / 排序 / 合计行 / 口径说明行）；`NAV_ITEMS` 在「社区活跃度」后插入「版本发布」，新增 `IconTag`。

### 决策 4：fixture 源「显式提供才落盘」

`GithubFixtureSource.fetchReleases()`：fixture 文件**显式含 `releases` 数组**时按真实源同口径归一化并落盘；**未提供时返回 `null`**，采集服务跳过 `github-releases.json` 写入——旧 fixture 文件跑离线自检不会用空数据覆盖真实文件。真实源（GraphQL）恒返回结果，行为不受此开关影响。

## 影响

| 面 | 内容 |
| --- | --- |
| 数据 | 新增 `github-releases.json`（v1）；**无 schemaVersion 迁移**（新文件） |
| API | 新增 `GET /api/repo-releases`（接口总数 20 → 21）；缺失 / 损坏时 `50001` |
| 前端 | 新页面 `/releases` + 导航项；无 i18n（全站中文硬编码） |
| 采集 | `collect:github:full` 与 `collect:github:incremental` 每轮均全量刷新 Releases（请求量 +每仓 1+ 次，Release 页数通常 1 页）；`collect:github` CLI 汇总日志多一行 Releases 统计 |
| 自检 | 启动自检 WARN 集合新增 `github-releases.json`；离线自检（05 §5.1 的断言数字）**未同步更新**——新增断言属后续债 |
| 配额 | Release 枚举与贡献采集共用同一 `RateLimitFloor` 熔断器，触底行为一致 |

## 备择方案（Why not）

- **Confluence 版本树抽取**（`Releases > Release Planning`）：语义是「OpenAN 发布火车纳入哪些组件」，不是「组件仓库发了哪些版」；且树结构无稳定字段，抽取脆。版本火车视图如未来需要，应作为 Confluence 侧独立实体另行设计。
- **增量游标（state store 记 Releases cursor）**：Release 无 updatedSince 语义需要——量级小、整体替换最简；引入游标反而要处理「仓库退出范围后游标残留」这类边角。
- **读侧 join `github-events.json` 的仓库集合当分母**：事件的仓库集合只含「有过 PR/Issue 的仓库」，与采集范围不等价（有仓库零事件零 Release），分母会错。分母必须由采集器在 resolve 范围时固化。
