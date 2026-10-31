# 03 · 后端设计

> 依赖文档：`01-architecture-overview.md`
> 适用范围：`apps/api`（NestJS 10 + TypeScript）

---

## 1. 技术栈与依赖清单

| 分类 | 依赖 | 用途 |
| --- | --- | --- |
| 框架 | `@nestjs/core`、`@nestjs/common`、`@nestjs/platform-express` | 应用骨架（默认 Express 适配器，便于 Vite 代理与轻量部署） |
| 配置 | `@nestjs/config` | 环境变量加载、校验与类型化访问 |
| 校验 | `class-validator`、`class-transformer` | DTO 白名单校验与类型转换 |
| 缓存（预留） | `@nestjs/cache-manager`、`cache-manager` | 阶段三外部采集结果缓存（**尚未引入**） |
| 日志 | NestJS 内置 `Logger` | 结构化日志输出 |
| 外部调用 | 原生 `fetch`（**未引入 `@octokit` 等 SDK**） | `collector/` 直接调用 GitHub GraphQL，减少依赖面与版本维护成本 |
| 文件 IO | Node `fs/promises` | JSON 仓储读写 |

---

## 2. 模块划分

### 2.1 模块结构

```mermaid
flowchart TB
  APP["AppModule"]
  APP --> CFG["ConfigModule<br/>（全局，校验 env）"]
  APP --> CACHE["CacheModule<br/>（全局，内存实现）"]
  APP --> COMMON["CommonModule<br/>响应拦截器 / 异常过滤器 / 错误码"]
  APP --> HOME["HomeModule"]
  APP --> ACT["ActivityModule"]
  APP --> MTG["SummitModule"]
  APP --> MEETING["MeetingModule"]
  APP --> ORG["OrganizationModule"]
  APP --> PROV["ProvidersModule<br/>端口 Token 绑定与适配器注册"]
  APP --> REPO["RepositoriesModule<br/>JsonRepository 工厂"]

  HOME --> PROV
  ACT --> PROV
  MTG --> PROV
  MEETING --> PROV
  ORG --> PROV
  PROV --> REPO
```

### 2.2 模块职责表

| 模块 | 控制器 | 服务 | 依赖的端口 | 说明 |
| --- | --- | --- | --- | --- |
| `HomeModule` | `HomeController` | `HomeService` | `HOME_METRIC_PORT`、`SUMMIT_PORT`、`CONTRIBUTOR_CONTRIBUTION_PORT` | 聚合首页指标、下次峰会；**独立开发者数**由账号级端口派生（`isIndependentDeveloper`），不注入组织端口 |
| `OrganizationModule` | `OrganizationController` | `OrganizationService` | `ORGANIZATION_PORT`、`CONTRIBUTION_PORT`、`CONTRIBUTOR_CONTRIBUTION_PORT`、`WIKI_PORT`、`CONFLUENCE_ACCOUNT_PORT` | 组织档案与筛选；`scope=contributing` 需同时取 GitHub 组织级 + 账号级 top3 + Confluence 两维度 |
| `ActivityModule` | `ActivityController` | `ActivityService` | `CONTRIBUTION_PORT`、`CONTRIBUTOR_CONTRIBUTION_PORT`、`REPO_CONTRIBUTION_PORT`、`WIKI_PORT`、`CONFLUENCE_ACCOUNT_PORT` | 贡献明细、成果洞察、贡献聚合、**仓库维度**；通用排序 / `limit` 在此层（`repo-contributions` 除外，见 4.1） |
| `IdentityModule` | `IdentityController` 等 | `PersonService` / `CandidateService` / `OrgRosterService` / `IdentityAuditService` | —（**直接注入仓储**，不经端口） | 身份控制台：自然人 / 认领边 / 候选人 / 花名册 / 审计 |
| `SummitModule` | `SummitController` | `SummitService` | `SUMMIT_PORT` | 峰会列表、时间线、详情 |
| `MeetingModule` | `MeetingController` | `MeetingService` | `MEETING_ATTENDANCE_PORT` | 例会参会矩阵（**纯透传**，无口径计算） |
| `ProvidersModule` | — | — | — | 集中声明所有端口 Token → 适配器类的绑定；当前**九个**端口**恒为 JSON 实现**，采集不经此切换（见 2.3 节） |
| `RepositoriesModule` | — | — | — | 提供 `JsonRepository<T>` 实例（按文件名注入）+ 启动自检（缺文件 WARN、校验失败 ERROR） |
| `CommonModule` | — | — | — | 全局响应拦截器、异常过滤器、错误码枚举 |

> **设计意图**：把"端口 → 适配器"的绑定集中到 `ProvidersModule`，使业务模块（Home / Activity / Summit）只依赖端口、对数据来源无感知。
>
> **重要修正（读写分离）**：外部数据采集**不通过本模块切换**。按"采集写、接口读"的设计（见 `05-integration-roadmap.md` 2.5 节），`src/collector` 是唯一写入 `data/*.json` 的入口，API 请求链路永远只读本地落盘文件，因此 `CONTRIBUTION_PORT` / `WIKI_PORT` **恒为 JSON 实现**，不存在 `GithubContributionProvider` 之类的第二套适配器。本模块的绑定能力保留给另一类场景：未来更换存储实现（如 PostgreSQL），或确需 API 链路直连上游实时查询时。

### 2.3 关键文件清单约定

```text
apps/api/src/
├── main.ts                          # 全局 ValidationPipe / Filter / Interceptor / CORS
├── app.module.ts
├── config/
│   ├── configuration.ts             # 环境变量 → 配置对象
│   └── env.validation.ts            # 启动期 env 校验（必填项缺失即启动失败）
├── common/
│   ├── interceptors/response.interceptor.ts
│   ├── filters/all-exceptions.filter.ts
│   ├── constants/error-code.ts
│   ├── dto/api-response.dto.ts
│   ├── effective-org.ts             # ★ 生效归属纯函数：认领边索引 / effectiveOrgId / isBotAccount / 组织级投影
│   ├── github-event-derivation.ts   # ★ 事件 → 账号级派生（第一跳）：账号视图 + 仓库聚合 + 认领告警
│   └── org-order.ts                 # 组织档案按 displayOrder 排序（派生层不二次排序）
├── repositories/
│   ├── json-repository.ts           # 泛型仓储：读缓存（mtime 失效）+ 整文件级 fail-fast 校验 + 原子写 + 串行队列
│   ├── repository.tokens.ts         # 各数据文件的注入 Token（含 GITHUB_EVENTS_REPOSITORY）
│   ├── validators.ts                # 实体级 + 数组级校验函数（写读同一套，见 04 §3.12）
│   └── repositories.module.ts       # 装配 + 启动自检（缺文件 WARN、其余失败 ERROR）
├── providers/
│   ├── ports/                       # ★ 端口接口定义（纯接口，无实现；现 9 个）
│   │   ├── home-metric.port.ts
│   │   ├── organization.port.ts
│   │   ├── contribution.port.ts             # 组织级（事件两跳派生的第二跳）
│   │   ├── contributor-contribution.port.ts # 账号级（第一跳产物）
│   │   ├── repo-contribution.port.ts        # 仓库级（第一跳的 repos 聚合，不落盘）
│   │   ├── wiki.port.ts
│   │   ├── confluence-account.port.ts
│   │   ├── summit.port.ts
│   │   └── meeting-attendance.port.ts
│   ├── tokens.ts                    # 所有 DI Token 常量
│   ├── json/                        # 当前唯一实现（读 data/*.json；GitHub 三段共用一次派生）
│   └── providers.module.ts          # 端口 → 适配器绑定（换存储 / 直连上游时才动）
├── collector/                       # ★ 采集器：独立 Nest 上下文，不启动 HTTP 服务
│   ├── collector.module.ts          # 采集上下文装配，与 AppModule 解耦
│   ├── collector.tokens.ts          # GITHUB_SOURCE / CONFLUENCE_SOURCE 注入 Token（真实 / 离线可切换）
│   ├── collector.constants.ts       # 跨来源共享常量（伪组织、翻页上限、请求间隔）
│   ├── github/                      # GitHub 管线
│   │   ├── github-main.ts           # CLI 入口（--mode=auto|incremental|full、--dry-run）
│   │   ├── github-collector.service.ts   # 写三份：github-events.json（事件明细，唯一原子事实）+ github-accounts.json（账号档案 + 指标快照）+ github-organizations.json（基线快照）
│   │   ├── github-source.port.ts         # GithubSource 抽象与记录类型
│   │   ├── github-graphql.source.ts      # 真实实现（原生 fetch 调 GitHub GraphQL）；★ toAuthor() 在此归一作者字段（Bot 缺键 → null，三条构造路径共用）
│   │   ├── github-fixture.source.ts      # 离线实现（GITHUB_FIXTURE，无 token 自检用）
│   │   ├── github-sync-state.store.ts    # data/.sync-state.json 游标 + orgRepos/personRepos 集合读写
│   │   └── github.constants.ts           # GitHub 专属常量（搜索上限、页大小、配额下限）
│   └── confluence/                  # Confluence 管线
│       ├── confluence-main.ts            # CLI 入口（--mode=full、--report-only、--snapshot）
│       ├── confluence-collector.service.ts   # 聚合后写入 confluence-organizations.json
│       ├── confluence-source.port.ts     # ConfluenceSource 抽象与页面事实类型
│       ├── confluence-rest.source.ts     # 真实实现（原生 fetch 调 Confluence REST）
│       ├── confluence-fixture.source.ts  # 离线实现（CONFLUENCE_FIXTURE，无 token 自检用）
│       ├── confluence-content.parser.ts  # storage XHTML → 账号/计数的纯函数解析
│       ├── confluence-state.store.ts     # data/.sync-state.confluence.json 读写
│       ├── confluence-report.ts          # 取数观察报告（标签 / 创建者 / 页面树分布）
│       ├── confluence-snapshot.ts        # 原始页面快照落盘（复核用原料）
│       └── confluence.constants.ts       # Confluence 专属常量与口径默认值
├── scripts/                         # 辅助脚本（import-meetings.ts：xlsx → meetings.json）
└── modules/
    ├── home/
    ├── organization/
    ├── activity/
    ├── summit/
    └── meeting/
```

---

## 3. 分层职责与调用约定

| 层 | 职责 | 严格禁止 |
| --- | --- | --- |
| Controller | 绑定查询参数到 DTO、调用 Service、返回数据对象（由拦截器包装） | 读写文件、调用外部 API、业务口径计算 |
| Service | 口径计算、多源合并、排序、过滤、分页裁剪 | 出现 `fs`、`fetch`、`@octokit` 等具体实现引用；出现 `data/*.json` 文件名 |
| Provider Port | 声明方法签名与返回类型（纯 TypeScript interface） | 包含任何实现细节或框架装饰器 |
| Provider Adapter | 实现端口：读取数据、字段映射、缓存读写 | 包含业务口径计算（应放在 Service） |

**调用链**：`Controller → Service → (Port → Adapter → Repository) → 返回`。

---

## 4. 端口（Port）定义

以下为**接口签名约定**，是业务层与数据源之间的稳定边界。

### 4.1 组织与贡献端口

```ts
// providers/ports/organization.port.ts
export interface ListOrganizationsQuery {
  /** 按组织类型过滤 */
  type?: OrganizationType;
  /** 按名称模糊匹配 */
  keyword?: string;
}

export interface Organization {
  orgId: string;          // 稳定主键，kebab-case
  name: string;           // 展示名
  logoUrl: string;        // 对应 GitHub avatar_url
  homepageUrl: string;    // 对应 GitHub html_url
  type: 'tsc' | 'participant' | 'operation' | 'individual'; // individual = 独立开发者伪组织（ADR-0016，详见 04 §3.2）
  displayOrder?: number;  // 组织墙展示序（ADR-0016；缺省落末位、按名称升序）
  tags: string[];         // 如 ['伙伴单位','芯片']
  emailDomains?: string[]; // 采集口径归属的第二级信号（第一级是 aliases）
  aliases?: Record<string, string>; // { github: 'xxx', confluence: 'yyy' }
}

export interface OrganizationPort {
  listOrganizations(q: ListOrganizationsQuery): Promise<Organization[]>;
  getOrganizationById(orgId: string): Promise<Organization | null>;
}
```

> `scope` 是 HTTP 接口层参数（`GET /api/organizations`），由 `OrganizationService` 组合贡献数据实现（`contributing` = 全量组织 + 贡献指标，**桶序按档案 `displayOrder`**，见 ADR-0016；ADR-0001 的「贡献分降序」已废弃），不属于 Port 的查询条件。

```ts
// providers/ports/contribution.port.ts
export interface ContributionQuery {
  orgIds?: string[];
  /** 按仓库筛选（任意组合，`owner/repo` 全名）；缺省/空 ≡ 全选。指标在筛选范围内重算 */
  repoIds?: string[];
  /** ISO 8601 时刻，半开区间 `from <= timestamp < to`（ADR-0018）；缺省即全量口径 */
  from?: string;
  to?: string;
}

/** GitHub 维度贡献（由事件明细两跳派生，不落盘；字段定义见 04 §3.4） */
export interface OrganizationContribution {
  orgId: string;
  orgName: string;
  logoUrl: string;
  homepageUrl: string;
  github: {
    pullRequests: number; // 已合并 PR 数
    commits: number;      // PR 内提交数之和
    issues: number;       // Issue 数
    linesChanged: number; // additions + deletions 汇总
    repos: number;        // 参与仓库数（事件的 repository 并集大小，**唯一非求和字段**）
  };
  updatedAt: string;      // 事件文件 github-events.json 的信封时间戳
}

export interface ContributionPort {
  getContributions(q: ContributionQuery): Promise<OrganizationContribution[]>;
}
```

> **GitHub 三段共用一次派生**（事件明细收敛后）：`deriveGithubFromEvents`（`common/github-event-derivation.ts`）一次遍历事件产出 `views`（账号级）、`contributors`（排 bot）、`repos`（仓库聚合）、`viewByLogin`；组织级再由 `deriveOrganizationContributions`（`common/effective-org.ts`）按 `effectiveOrgId` 求和 ⇒ 「组织级 ≡ 账号级 ≡ 仓库级」由函数形状保证。三个 Port 各自只取自己那段：
>
> ⚠️ **区间切片在派生之前**（ADR-0018）：三个 GitHub provider 都先用**唯一谓词** `filterEventsByRange(events, toTimeRangeFilter(from, to))`（`common/time-range.ts` + `common/github-event-derivation.ts`）切一刀再调 `deriveGithubFromEvents`。谓词对 `undefined` **原数组同引用返回**（缺省 ≡ 全量口径），半开判定 `from <= timestamp < to`，不可解析的时间一律 `false`。三段共用同一把刀 ⇒ 恒等式在**任意区间**下依然成立。⚠️ **不要在 provider 里另写 `events.filter(...)`**：双写会让恒等式在两个实现之间悄悄分叉，而这类分叉**不会让任何测试变红**。Confluence 两个 provider 则**接受但恒不过滤**（该侧无时间维度明细）。

```ts
// providers/ports/contributor-contribution.port.ts —— 账号级（GET /api/contributor-contributions）
export interface ContributorContributionQuery {
  orgIds?: string[];    // 按 effectiveOrgId 匹配（认领优先）
  repoIds?: string[];   // 事件先按 repository 过滤再聚合 ⇒ repos ≡ repoIds.length
  from?: string; to?: string; // ISO 8601 时刻；半开区间生效（ADR-0018），缺省 ≡ 全量口径
}
export interface ContributorContributionPort {
  getContributorContributions(q: ContributorContributionQuery): Promise<ContributorContributionView[]>;
}
// 人物口径：机器账号不在返回结果中（isBotAccount 三信号），但其量仍计入组织级求和。

// providers/ports/repo-contribution.port.ts —— 仓库级（GET /api/repo-contributions，**不落盘**）
export interface RepoContributionQuery {
  from?: string; to?: string; // ISO 8601 时刻；半开区间**必须**生效（ADR-0018 决策 6）：与组织级 / 账号级同源于事件，只让两段切片会让恒等式对不上
  sortBy?: 'pullRequests' | 'commits' | 'issues' | 'linesChanged' | 'contributors' | 'orgs';
  order?: 'asc' | 'desc';
  limit?: number;
}
export interface RepoContributionPort {
  getRepoContributions(q: RepoContributionQuery): Promise<RepoContribution[]>;
}
// ⚠️ 排序与 limit 在 **Provider 内**完成（排序字段跨 github.* 与顶层 contributors/orgs，Service 的通用排序不适用）；
// ⚠️ 不接受 repoIds：行指标不随筛选变化（选仓库只是挑行），前端客户端过滤。
```

### 4.2 Confluence 洞察端口

```ts
// providers/ports/wiki.port.ts
export interface WikiQuery {
  orgIds?: string[];
  from?: string;
  to?: string;
}

/** Confluence 维度贡献 */
export interface OrganizationWiki {
  orgId: string;
  orgName: string;
  logoUrl: string;
  confluence: {
    requirements: number; // 需求数（Requirement Proposal 表格 Contacts 列的 @ 提及数）
    topicShares: number;  // 议题分享次数（会议纪要 Agenda 段内 @ 数，段落与表格行都算，按期去重）
  };
  updatedAt: string;
}

export interface WikiPort {
  getWiki(q: WikiQuery): Promise<OrganizationWiki[]>;
}
```

### 4.3 首页指标端口

```ts
// providers/ports/home-metric.port.ts
export interface MetricValue {
  value: number;
  unit?: string;
  /** 环比变化，可选 */
  delta?: number;
  deltaDirection?: 'up' | 'down' | 'flat';
}

export interface HomeSummary {
  partnerCount: MetricValue;            // 社区伙伴数量
  externalDeveloperCount: MetricValue;  // 外部开发者数量
  summitCount: MetricValue;            // 参加的峰会
  useCaseCount: MetricValue;            // 已提供的应用案例
  nextSummit: SummitSummary | null;   // 下一次峰会
  updatedAt: string;
}

export interface HomeMetricPort {
  getHomeSummary(): Promise<HomeSummary>;
}
```

### 4.4 峰会端口

```ts
// providers/ports/summit.port.ts
export interface SummitQuery {
  year?: number;
  includeDetail?: boolean;
  /** 仅返回未结束的峰会 */
  upcomingOnly?: boolean;
}

export interface SummitSummary {
  id: string;
  name: string;
  startDate: string;      // ISO 8601
  endDate: string;        // ISO 8601
  location: string;
  websiteUrl: string;
  isUpcoming: boolean;
}

export interface SummitDetail extends SummitSummary {
  host: string;
  attendeeCount: number;
  attendingOrganizations: string[];
  agendaHighlights: string[];
  outcomes: string[];
  minutesUrl?: string;
}

export interface SummitPort {
  listSummits(q: SummitQuery): Promise<SummitSummary[]>;
  getSummitById(id: string): Promise<SummitDetail | null>;
  getNextSummit(): Promise<SummitSummary | null>;
}
```

### 4.5 例会参会矩阵端口

```ts
// providers/ports/meeting-attendance.port.ts
/** 例会参会矩阵：行 = 日期，列 = 人名（照搬 Excel 台账，见 ADR-0005） */
export interface MeetingAttendanceRow {
  date: string;          // YYYY-MM-DD
  attendance: boolean[]; // 与 columns 等长、同序；true = 出席
}

export interface MeetingAttendanceMatrix {
  columns: string[];            // 人名原文（非主键）
  rows: MeetingAttendanceRow[]; // 保持台账原序
  updatedAt?: string;
}

export interface MeetingAttendancePort {
  getMatrix(): Promise<MeetingAttendanceMatrix>;
}
```

> 该端口是**纯透传**：Service 不做任何排序、聚合与补全（ADR-0005）。个人出席率与每场出席人数由**前端**派生（02 §6.3），后端不计算。

### 4.6 DI Token 与绑定切换

```ts
// providers/tokens.ts
export const HOME_METRIC_PORT = Symbol('HOME_METRIC_PORT');
export const ORGANIZATION_PORT = Symbol('ORGANIZATION_PORT');
export const CONTRIBUTION_PORT = Symbol('CONTRIBUTION_PORT');
export const WIKI_PORT = Symbol('WIKI_PORT');
export const SUMMIT_PORT = Symbol('SUMMIT_PORT');
export const MEETING_ATTENDANCE_PORT = Symbol('MEETING_ATTENDANCE_PORT');
```

```ts
// providers/providers.module.ts（更换存储实现 / 确需直连上游时才改此文件）
@Global()
@Module({
  providers: [
    // ── 六个端口恒为 JSON 实现 ──────────────────
    // 采集不走端口切换：collector 写 data/*.json，API 只读本地落盘文件
    { provide: HOME_METRIC_PORT,  useClass: JsonHomeMetricProvider },
    { provide: ORGANIZATION_PORT, useClass: JsonOrganizationProvider },
    { provide: CONTRIBUTION_PORT, useClass: JsonContributionProvider },
    { provide: WIKI_PORT,      useClass: JsonWikiProvider },
    { provide: SUMMIT_PORT,       useClass: JsonSummitProvider },
    { provide: MEETING_ATTENDANCE_PORT, useClass: JsonMeetingAttendanceProvider },
  ],
  exports: [HOME_METRIC_PORT, ORGANIZATION_PORT, CONTRIBUTION_PORT, WIKI_PORT, SUMMIT_PORT, MEETING_ATTENDANCE_PORT],
})
export class ProvidersModule {}
```

> **为什么没有 GitHub / Confluence 适配器**：本架构**不采用**"为真实数据源再写一套 Port 适配器"的方案。真实数据源由 `src/collector` 采集后落盘为与种子数据**完全相同**的 JSON 结构，API 读到的内容与阶段一别无二致——这正是"契约不变、前端与业务层零改动"的实现方式，同时避免了"端口适配器"与"采集器"两条并行数据路径（见 `05-integration-roadmap.md` 1.2 节约束 1 与 4）。
>
> **可替换性验收标准**：若"更换数据来源"需要修改 `modules/` 下任何一个文件的代码，则视为架构被破坏。按当前口径，更换数据来源（人工维护 → 采集脚本 → 定时采集）**只改变写入方，API 代码零改动**。

### 4.7 Provider 实现规范

- 端口方法必须是 `async`，即使 JSON 实现是同步可得的（保证接口一致，未来换成网络请求不改变签名）。
- 适配器内部**只做数据获取与字段映射**，不抛业务异常；数据缺失返回空数组或 `null`。
- 适配器**不得**直接 `import fs`，必须通过注入的 `JsonRepository<T>` 访问文件，以便统一处理缓存与原子写。

---

## 5. JSON 仓储设计（`JsonRepository<T>`）

存储层是本期唯一的"持久化"部件，需要特别设计以规避 JSON 文件的固有缺陷（并发写损坏、无 schema 约束、无索引）。

### 5.1 接口约定

```ts
// repositories/json-repository.ts
export interface JsonFileEnvelope<T> {
  schemaVersion: number;
  updatedAt: string;
  data: T;
}

export interface JsonRepository<T> {
  /** 读取（优先命中内存缓存，缓存未命中则读文件并解析校验） */
  read(): Promise<JsonFileEnvelope<T>>;
  /** 全量写入（原子写 + 串行队列），写入后刷新缓存 */
  write(data: T): Promise<void>;
  /** 局部更新（读出 → 变更函数 → 原子写），队列内串行执行避免丢失更新 */
  update(mutator: (current: T) => T): Promise<void>;
  /** 强制丢弃缓存，下次 read 重新读盘 */
  invalidate(): void;
}
```

### 5.2 文件划分与用途

| 文件 | 承载实体 | 写入频率 | 规模预估 | 读路径 |
| --- | --- | --- | --- | --- |
| `data/home.json` | `HomeSummary`（首页指标 + `nextSummitId`；**无** `externalDeveloperCount`） | 极低 | 1 条记录 | ✅ `HOME_METRIC_PORT` |
| `data/organizations.json` | `Organization[]` | 低 | 数十条（现 13） | ✅ `ORGANIZATION_PORT` + 派生的桶全集 |
| **`data/github-events.json`** | `GithubContributionEvent[]`（事件明细，**GitHub 侧唯一原子事实**；`schemaVersion` **1**） | 每轮采集追加 / 全量替换 | 现 798 条（618 PR + 180 Issue），随时间线性增长 | ✅ 账号级 / 组织级 / 仓库级三段全部派生自它 |
| `data/github-accounts.json` | `GithubAccount[]`（**账号档案**：展示名 / 头像 / `githubId` / 采集口径 `orgId` + 指标快照） | 低 | 数十条（现 40） | 🟡 只取展示与归属字段；`github` 指标与 `repoIds` 是**基线快照**（见 06 §2） |
| `data/github-organizations.json` | `OrganizationContribution[]`（**基线快照**） | 低（阶段三为定时采集） | 现 4 桶 | ⛔ **接口不读**（ADR-0017 后读路径改事件派生） |
| `data/confluence-accounts.json` | `ConfluenceAccount[]` | 低 | 现 23 条 | ✅ `WIKI_PORT` / `CONFLUENCE_ACCOUNT_PORT` 派生源 |
| `data/confluence-organizations.json` | `OrganizationWiki[]`（**基线快照**） | 低 | 现 1 桶 | ⛔ **接口不读**（ADR-0010 后改账号级派生） |
| `data/persons.json` / `identity-claims.json` | 自然人档案 / 认领边 | 中（身份控制台可写） | 现 29 / 46 条 | ✅ 生效归属的第一优先级（`buildGithubClaimIndex`） |
| `data/summits.json` | `SummitDetail[]` | 极低 | 十余条 | ✅ `SUMMIT_PORT` |
| `data/meetings.json` | `MeetingAttendanceMatrix` | 极低（运营手动触发导入） | 1 个矩阵（约数十行 × 数十列） | ✅ `MEETING_ATTENDANCE_PORT` |
| `data/.sync-state.json` | 采集游标 + `unattributedLogins` + `orgRepos` / `personRepos` 集合 | 每轮采集 | 1 条 | ⛔ 采集器内部状态，接口不读 |

> **命名规则（ADR-0008）**：数据文件名统一为 `<source>-<grain>.json`，`source ∈ {github, confluence}`、`grain ∈ {organizations, accounts}`。个人级用 `accounts`（**平台账号**层，GitHub `githubId` / Confluence `accountId`），与自然人档案 `persons.json` 区分层级。

> `nextSummit` 在 `home.json` 中只存 `nextSummitId` 引用，实际峰会对象由 `SummitProvider` 提供，避免同一峰会数据两处维护导致不一致。

### 5.3 读取路径（含缓存）

```mermaid
flowchart LR
  R["read()"] --> C{"内存缓存命中?"}
  C -->|是| RET["返回缓存副本"]
  C -->|否| F["读取 JSON 文件"]
  F --> P["JSON.parse"]
  P --> V{"schemaVersion 与<br/>结构校验通过?"}
  V -->|通过| SET["写入缓存"] --> RET
  V -->|失败| DEG["标记该文件为降级只读<br/>记录 ERROR 日志"] --> THROW["抛出 DataCorruptedException"]
```

**要点**：
- 返回**深拷贝**（`structuredClone`）而非缓存对象引用，防止调用方意外修改污染缓存。
- 缓存以文件为单位（key = 文件名），启动时不预热，首次请求懒加载。
- 校验失败**不静默返回残缺数据**，而是抛出明确的业务异常（见错误码 `DATA_CORRUPTED`），由前端展示"数据维护中"。

### 5.4 写入路径（原子写 + 串行队列）

JSON 文件写入有两大风险：**半写损坏**与**并发丢失更新**。对策如下：

```mermaid
sequenceDiagram
  participant S as Service
  participant Q as 写队列（每文件一条 Promise 链）
  participant FS as 文件系统
  S->>Q: update(mutator)
  Note over Q: 前一个任务完成前，本任务排队等待
  Q->>FS: 读取当前内容
  Q->>Q: 应用 mutator 得到新数据
  Q->>FS: 写入 <file>.tmp.<随机后缀>
  Q->>FS: rename(<file>.tmp → <file>)  ← 原子替换
  Q->>Q: 刷新内存缓存
  Q-->>S: resolve
```

1. **原子写**：先写同目录下的临时文件，`fs.rename` 覆盖目标文件。POSIX 与 Windows 上 `rename` 均为原子操作，保证任何时刻磁盘上的文件要么是旧的完整内容，要么是新的完整内容，不存在半截 JSON。
2. **串行队列**：每个文件维护一条 `Promise` 链，`update()` 调用被追加到链尾并 `await` 前序任务。这消除了"读到旧值 → 各自写入 → 后者覆盖前者"的丢失更新问题。
3. **写入即刷新缓存**：写成功后立即更新内存缓存，避免后续读命中过期数据。
4. **失败处理**：写失败时清理临时文件、**不更新缓存**、抛出 `DATA_WRITE_FAILED`，并在日志中记录文件路径与错误原因（不记录完整数据内容）。

> **本期写入场景极少**（数据由人工维护 JSON 或后续采集任务落盘），但仍按上述规范实现，因为阶段三引入定时采集后写入频率会显著上升。

### 5.5 存储层可替换性

`JsonRepository` 实现的是通用仓储语义。若后续数据量增长需要迁移到 PostgreSQL，只需：

1. 新增 `PrismaRepository<T>` 实现同一接口；
2. 修改 `RepositoriesModule` 的绑定。

`providers/` 与 `modules/` 均无需改动。

---

## 6. DTO 与统一响应

### 6.1 DTO 设计规范

| 规范 | 说明 |
| --- | --- |
| 命名 | `<动作><资源>QueryDto`，如 `ListSummitsQueryDto` |
| 白名单 | DTO 类上启用 `@IsOptional()` / `@IsString()` 等，并配合全局 `whitelist: true`、`forbidNonWhitelisted: true` 拒绝未知参数 |
| 类型转换 | 开启 `transform: true` + `enableImplicitConversion: true`，使 `?year=2026` 自动转为 `number` |
| 枚举约束 | 年份、scope、排序字段使用 `@IsIn([...])` 限定取值范围 |
| 分页参数 | `page`（默认 1，最小 1）、`pageSize`（默认 20，最大 100），均带 `@Type(() => Number)` |

示例：

```ts
export class ListSummitsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;

  @IsOptional() @IsIn(['true', 'false'])
  includeDetail?: string;

  @IsOptional() @IsIn(['true', 'false'])
  upcomingOnly?: string;
}
```

> `GET /api/meetings` **无查询参数**（原样透传矩阵，ADR-0005），因此无需对应的 `QueryDto`。

### 6.2 统一响应信封

所有成功响应经全局拦截器包装为：

```json
{
  "code": 0,
  "message": "ok",
  "data": { }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | `0` 表示成功；非 0 见第 7 节错误码表 |
| `message` | string | 面向调用方的简短说明，成功为 `"ok"` |
| `data` | any | 业务数据；无数据时为 `null` |

**分页响应** `data` 结构：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

**实施方式**：`ResponseInterceptor` 检查返回值是否为已包装对象（以 `code` 属性 + 特定符号标记），避免重复包装；`@Raw()` 装饰器可跳过包装（本期不需要，为健康检查等预留）。

> **约定**：HTTP 状态码仍如实返回（200/400/404/500），业务错误在 `code` 中细化。前端 `apiClient` 以 HTTP 层正常为前提下再判 `code`。

---

## 7. 异常处理与错误码

### 7.1 异常过滤器

`AllExceptionsFilter` 捕获所有异常并统一输出：

```json
{
  "code": 40001,
  "message": "参数 year 必须是 2000 到 2100 之间的整数",
  "data": null
}
```

处理顺序：

1. `HttpException` 及其子类（含 `ValidationPipe` 抛出的 `BadRequestException`）→ 映射为对应业务错误码，提取校验消息数组并拼接为可读文案。
2. 自定义业务异常（`DomainException`，携带 `ErrorCode`）→ 直接使用其 code 与 message。
3. 未预期异常 → 记录 `ERROR` 级日志（含堆栈与请求上下文），对外仅返回 `50000 / "服务内部错误"`，**不泄漏堆栈与内部路径**。

### 7.2 错误码表

| code | HTTP | 常量 | 含义 | 前端建议处理 |
| --- | --- | --- | --- | --- |
| `0` | 200 | `OK` | 成功 | — |
| `40000` | 400 | `BAD_REQUEST` | 通用参数错误 | 提示 `message` |
| `40001` | 400 | `VALIDATION_FAILED` | DTO 校验未通过 | 提示 `message` |
| `40002` | 400 | `INVALID_DATE_RANGE` | `from` 晚于 `to` 或格式非法 | 提示并重置筛选 |
| `40003` | 400 | `INVALID_YEAR` | 年份超出允许范围 | 重置筛选 |
| `40400` | 404 | `RESOURCE_NOT_FOUND` | 通用资源不存在 | 展示空态 |
| `40401` | 404 | `ORGANIZATION_NOT_FOUND` | 组织不存在 | 展示空态 + 返回列表 |
| `40402` | 404 | `SUMMIT_NOT_FOUND` | 峰会不存在 | 展示空态 + 返回时间线 |
| `50000` | 500 | `INTERNAL_ERROR` | 未预期错误 | 展示错误态 + 重试 |
| `50001` | 500 | `DATA_CORRUPTED` | JSON 文件结构/版本校验失败 | 展示"数据维护中" |
| `50002` | 500 | `DATA_WRITE_FAILED` | 数据写入失败 | 提示重试 |
| `50003` | 503 | `UPSTREAM_UNAVAILABLE` | 外部数据源不可用（阶段三） | 展示缓存数据 + 提示"数据可能不是最新" |
| `50004` | 429 | `UPSTREAM_RATE_LIMITED` | 外部数据源限流（阶段三） | 同上，并延后重试 |

> 前端只需识别 `0`（成功）与错误分类（4xxxx 用户可修正 / 5xxxx 系统问题），无需为每个码写分支逻辑。

---

## 8. 日志规范

| 项 | 规范 |
| --- | --- |
| 工具 | NestJS 内置 `Logger`，按模块创建上下文：`new Logger(HomeService.name)` |
| 级别 | `error`（影响功能）、`warn`（可降级）、`log`（关键流程）、`debug`（开发期细节，生产关闭） |
| 请求日志 | 记录 `method`、`path`、`status`、`durationMs`；**不记录**请求体全文与查询串完整值（避免敏感信息） |
| 数据访问 | 记录文件名与记录条数，如 `loaded github-organizations.json (23 records)`，**不 dump 内容** |
| 启动自检（`RepositoriesModule`） | 逐个 `read()` 十一个业务 JSON 文件：全部通过 → `log` 一行清单；有失败 → `warn` 汇总（降级只读，不阻断启动）。⚠️ **分级**：`github-events.json` **文件缺失**属预期状态（首次采集前必然缺失）→ 只 `warn` 并提示「请先运行 `npm run collect:github:full -w @openan/api`」；其余失败（结构 / `schemaVersion` 不符）→ `error` 单条 + `warn` 汇总。对应接口在缺失时返回 `50001`（宁可暴露，不静默为 0） |
| 外部调用（`collector/`） | 记录目标资源标识与状态码（如 `GET /repos/openan/x/pulls → 200`），**严禁**记录 Token、Authorization 头、完整响应体 |
| 异常日志 | 未预期异常记录完整堆栈与请求上下文（路径、参数键名），不回传客户端 |
| 禁止项 | 任何凭据、个人身份信息、完整数据文件内容 |

---

## 9. 缓存与限流

| 机制 | 设计 | 说明 |
| --- | --- | --- |
| 服务端缓存 | `CacheModule`（内存实现），key 形如 `contrib:${orgIds}:${from}:${to}`，TTL 默认 `CACHE_TTL_SECONDS=300` | 与 `JsonRepository` 内存缓存叠加；数据来自本地文件，收益有限，按需启用（**尚未引入依赖**） |
| 缓存穿透 | 空结果也缓存（短 TTL），避免重复读取文件 | — |
| 缓存击穿 | 同一 key 的并发请求合并为一次文件读取（Promise 复用） | 配合 Repository 串行队列 |
| 上游限流 | **不由请求链路触发**：配额预检、串行间隔与指数退避全部实现在采集任务内 | 详见 `05-integration-roadmap.md` 2.5 节与 `src/collector` |
| 降级 | API 侧不存在上游调用，读取的始终是最近一次成功落盘的 JSON；数据陈旧状态由采集器写入的 `.sync-state.json` 体现 | 前端据此提示"数据可能不是最新" |

---

## 10. 配置项清单

`config/configuration.ts` 汇总，`env.validation.ts` 在启动期校验必填项，缺失即**启动失败**（fail-fast）。

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `PORT` | 否 | `3000` | HTTP 监听端口 |
| `NODE_ENV` | 否 | `development` | 运行环境 |
| `DATA_DIR` | 否 | `<repo>/data` | JSON 数据目录绝对/相对路径 |
| `MEETINGS_SOURCE_PATH` | 否 | `data/source/meetings.xlsx` | 例会台账源文件路径（**仅供采集脚本使用，API 不读取**） |
| `CORS_ORIGINS` | 否 | `http://localhost:5173` | 允许来源，逗号分隔；同域部署可留空 |
| `CACHE_TTL_SECONDS` | 否 | `300` | 缓存有效期 |
| `LOG_LEVEL` | 否 | `log` | 日志级别 |
| `GITHUB_TOKEN` | 否（阶段三必填） | — | GitHub 个人访问令牌，需 `repo:read` 权限 |
| `GITHUB_ORGS` | 否 | — | 待采集组织，逗号分隔 |
| `GITHUB_REPOS` | 否 | — | 可选，显式指定仓库白名单 |
| `GITHUB_LOOKBACK_DAYS` | 否 | `3650` | **兜底**回溯窗口；仅当本地游标缺失/损坏时生效，正常增量以 `lastSyncAt` 为准 |
| `CONFLUENCE_BASE_URL` | 否 | — | Confluence 站点地址（不含 `/wiki` 后缀） |
| `CONFLUENCE_TOKEN` | 否 | — | Confluence API Token（Bearer 认证） |
| `CONFLUENCE_SPACES` | 否 | — | 待采集空间 Key，逗号分隔 |
| `CONFLUENCE_LOOKBACK_DAYS` | 否 | `3650` | 兜底回溯窗口（当前恒全量重算，暂未使用） |
| `CONFLUENCE_FIXTURE` | 否 | — | 离线 fixture 路径；配置后跳过网络请求，用于无 token 自检 |
| `CONFLUENCE_REQUIREMENT_PAGE_TITLE` | 否 | `Requirement Proposal` | 需求来源页标题（留空取默认） |
| `CONFLUENCE_REQUIREMENT_ANCESTOR_TITLE` | 否 | `Release Planning` | 需求页必须位于该祖先标题之下（留空取默认） |
| `CONFLUENCE_REQUIREMENT_CONTACT_COLUMN` | 否 | `Contacts` | 需求表格联系人列名（留空取默认） |
| `CONFLUENCE_REQUIREMENT_TITLE_COLUMN` | 否 | `Requirement Title` | 需求表格标题列名（仅快照/日志用，留空取默认） |
| `CONFLUENCE_MINUTES_PARENT_PATTERN` | 否 | `^\d{4} - TSC Minutes$` | 会议纪要父页标题正则（留空取默认） |
| `CONFLUENCE_MINUTES_TITLE_PATTERN` | 否 | `^\d{4}-\d{2}-\d{2} TSC Minutes$` | 会议纪要页标题正则（留空取默认） |
| `CONFLUENCE_MINUTES_AGENDA_HEADING` | 否 | `Agenda` | 议题分享所取的段名（留空取默认） |

**安全约定**：`.env` 必须加入 `.gitignore`；仓库提供 `.env.example` 只含键名与注释，不含真实值。

---

## 11. 关键请求时序

以首页为例（阶段一，数据来自 JSON 文件）：

```mermaid
sequenceDiagram
  participant W as 前端
  participant C as HomeController
  participant S as HomeService
  participant P as HomeMetricPort
  participant A as JsonHomeMetricProvider
  participant CC as ContributorContributionPort
  participant J as JsonContributorContributionProvider
  participant D as deriveGithubFromEvents
  participant R as JsonRepository
  participant F as data/home.json
  participant E as data/github-events.json

  W->>C: GET /api/home/summary
  C->>C: ValidationPipe（无参数，直接通过）
  C->>S: getHomeSummary()
  par 并发获取三块数据
    S->>P: getHomeSummary()
    P->>A: getHomeSummary()
    A->>R: read()
    R->>F: 读取（首次）/ 命中缓存（mtime 未变）
    F-->>R: JSON
    R-->>A: HomeFileData（schemaVersion 2，无 externalDeveloperCount）
  and
    S->>P: getNextSummit()
  and
    S->>CC: getContributorContributions({})
    CC->>J: getContributorContributions({})
    J->>R: read() 事件 + 账号档案 + 认领边 + 自然人
    R->>E: 读取 / 命中缓存
    E-->>R: 798 条事件（缺文件或校验失败 ⇒ 抛 DATA_CORRUPTED）
    J->>D: 派生（事件 → 账号级视图，第一跳）
    D-->>J: views / contributors / repos
    J-->>CC: ContributorContributionView[]（已排 bot）
    CC-->>S: isIndependentDeveloper 计数 ⇒ externalDeveloperCount（读时派生）
  end
  S->>S: 组装（合并 nextSummit、附加 updatedAt）
  S-->>C: HomeSummaryDto
  C-->>W: { code:0, message:"ok", data:{...} }
  Note over C,W: ResponseInterceptor 完成包装
```

**要点**：Service 内部使用 `Promise.all` 并发获取相互独立的数据块，避免串行等待；任一数据块缺失时降级为 `null`/空数组而非整体失败（首页指标缺失则整块隐藏，不影响其他区块）。⚠️ **例外**：`github-events.json` 缺失或结构非法**不降级**——`JsonRepository` 的整文件级 fail-fast 会抛 `DATA_CORRUPTED`（`50001`），首页直接进错误态；这是刻意选择（宁可暴露，不静默把独立开发者数报成 0），代价与开放风险见 `06 §5`。

---

## 12. 可测试性与质量保障

| 层次 | 测试方式 | 重点用例 |
| --- | --- | --- |
| Provider 适配器（JSON） | 单元测试 + 临时目录 fixture | 文件缺失、schema 版本不匹配、字段类型错误 |
| JsonRepository | 单元测试 | 原子写是否正确替换、并发 `update` 是否丢失更新、缓存是否失效 |
| Service | 单元测试（注入内存版 Port） | 口径计算（如 `linesChanged` 汇总）、空数据处理、`assertRange`（`from > to` → `40002`；`from == to` **合法** = 空区间）、排序稳定性 |
| **区间口径切片**（ADR-0018） | 离线自检 `identity-check.mjs` 场景 **[7]**（10 项） | 半开边界（`15:59:59Z` 不命中 / `16:00:00Z` 命中）、**无区间 ≡ 同引用**（`===`）、单侧无界、空区间命中 0、`isWithinRange` 三态（不可解析一律 `false`）、**同区间恒等式**（组织级 ≡ 账号级 ≡ 仓库级）、空区间的桶形状（枚举桶记 0 不消失）、窗口收紧后 `repos` 行收缩、校验器正负向 |
| 例会矩阵透传 | 单元测试 | `attendance.length !== columns.length` 时抛 `DATA_CORRUPTED`；返回结果保持原序、不被加工 |
| Controller | e2e 测试（`supertest`） | 参数校验拒绝未知字段、错误码正确、响应信封结构 |
| 契约一致性 | 类型级校验 | Service 返回类型与 04 文档契约字段逐项对齐（Code Review 清单） |
| **离线自检脚本**（`apps/api/scripts/`，无需网络 / 无需 token；先 `npm run build -w @openan/api`） | `npm run collect:github:check -w @openan/api`（`collector-check.mjs`，**76** 断言）、`identity:check`（`identity-check.mjs`，**68**）、`collect:wiki:check`（**73**） | 以 `GITHUB_FIXTURE` 跑通采集 → 落盘 → 读路径全链路；⭐ 关键约束是**写读一致性**：脚本直接 `import` 编译产物 `dist/repositories/validators.js` 的 `isGithubContributionEventArray` 校验**落盘结果**（而不是只查字段形状），否则「采集侧写出、读侧拒收」这类缺陷会静默通过——场景 **[7] Bot / 无作者** 即为此而加（临时 fixture + **负向对照**），场景 **[8] 缺时间戳整条拒绝**（ADR-0018）同为此类：另造三条记录的 fixture（有 ts / `null` / 空串），断言只落 1 条事件、聚合只吃 timed、游标 `untimedEvents === 2` 且 `recordCount === 3`、`WARN` 含累计数与样例。⚠️ 脚本内的 **D1 恒等式比对只在全量口径下成立**（基线快照 `github-organizations.json` 不带区间）；区间口径下的恒等式归 `identity-check` 场景 **[7]** |

**测试替身约定**：`InMemoryContributionProvider` 等内存实现放在 `test/` 下，**不得**进入 `providers/` 目录，避免与生产适配器混淆。

> ⚠️ **fixture 覆盖 ≠ 真实数据覆盖**：主 fixture 若没有某种形态（如 Bot 作者），自检全绿也拦不住线上事故——2026-10-30 的 `50001` 全量故障正是 63 条断言全绿时发生的（3 条 `dependabot` 事件丢键）。新增采集字段 / 作者形态时，**必须同步补 fixture 场景**。

---

## 13. 后端设计自检清单

在实现完成后，逐项确认以下条款，任一项不满足即视为偏离架构：

- [ ] `modules/` 下没有任何 `fs`、`fetch`、`@octokit` 直接引用
- [ ] 所有数据访问都经由 Provider 端口，端口实现由 `ProvidersModule` 统一声明
- [ ] 采集链路（`src/collector`）与请求链路完全解耦：API 侧不引用任何外部 API 客户端，只读本地 JSON
- [ ] `modules/` 下不含任何端口绑定逻辑，绑定集中于 `ProvidersModule`
- [ ] 所有 Controller 返回值经 `ResponseInterceptor` 统一包装，无手写 `{ code, message, data }`
- [ ] 所有异常经 `AllExceptionsFilter` 统一处理，错误码取自 `ErrorCode` 枚举
- [ ] `ValidationPipe` 开启 `whitelist` + `forbidNonWhitelisted` + `transform`
- [ ] JSON 写入使用临时文件 + `rename` 原子替换，且按文件串行
- [ ] 日志中不含任何凭据与完整数据内容
- [ ] 启动期校验 `DATA_DIR` 存在且**十一个**业务 JSON 文件结构合法（含 `github-events.json`）；缺文件按分级日志（事件文件缺失 → WARN + 下一步提示，其余 → ERROR），且**不阻断启动**（降级只读，由接口返回 `50001`）