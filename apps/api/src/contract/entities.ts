/**
 * 契约实体定义 —— 唯一来源为 docs/04-data-and-api-contract.md。
 * 端口（providers/ports）与前端 types/ 必须与此逐字段对齐。
 */

/**
 * 组织类型。`individual` 为伪组织（独立开发者聚合），其余均为真实组织类别。
 * `partnerCount` 口径为 `type !== 'individual'`，故 operation 计入伙伴单位数。
 */
export type OrganizationType = 'tsc' | 'participant' | 'operation' | 'individual';
export type DeltaDirection = 'up' | 'down' | 'flat';

export interface Organization {
  orgId: string;
  name: string;
  logoUrl: string;
  homepageUrl: string;
  type: OrganizationType;
  tags: string[];
  aliases?: Record<string, string>;
  /** 组织邮箱域名后缀清单（小写），用于按贡献者邮箱域名自动归属；如 ["huawei.com"] */
  emailDomains?: string[];
  joinedAt?: string;
  /** 展示顺序（ADR-0016）：运营人工排位，越小越靠前；同值/缺失按 name 升序兜底 */
  displayOrder?: number;
  description?: string;
}

export interface GithubMetrics {
  /** 已合并（merged）PR 数 */
  pullRequests: number;
  /** 合并 PR 内的提交数（各 PR commits.totalCount 累计） */
  commits: number;
  issues: number;
  /** additions + deletions */
  linesChanged: number;
  /** 参与仓库数：组织级为**去重数**（并集大小），账号级恒等于 `repoIds.length` */
  repos: number;
}

/**
 * 账号级 GitHub 指标（ADR-0017 决策 15）：在共用计数之上额外落盘**仓库清单**。
 *
 * 为什么必须落清单：组织级 `repos` 的语义是「参与过的仓库**去重数**」，而组织级自 ADR-0017 起
 * 由账号级按生效归属**求和**派生——若账号级只存计数，跨账号共用的仓库会被重复计数
 * （实测 `huawei` 13 → 51，而采集范围内仓库总数只有 13）。有了 `repoIds`，派生层才能取并集大小，
 * 既保住「组织级 ≡ 账号级派生」的单点归属，又保住去重语义。
 */
export interface AccountGithubMetrics extends GithubMetrics {
  /** 参与过的仓库全名（`owner/repo`）去重升序；`repos` 恒等于其长度 */
  repoIds: string[];
}

/**
 * `github-events.json` v1 落盘事件：**GitHub 侧唯一原子事实**（事件级明细，D1 收敛）。
 * 组织级 / 账号级 / 仓库级的一切数字都由本文件**读时派生**（认领边、账号档案、别名索引参与归属解析）；
 * `github-accounts.json` 降级为账号档案（姓名/头像/githubId/采集口径 orgId），`github-organizations.json` 维持基线快照。
 *
 * 与采集管道的 `GithubContributionRecord` 的差异：`author` 仅保留展示与归属所需字段——
 * `email` / `commitEmail` / `url` 沿用「仅用于采集时归属判定，**不落盘**」的既有决策。
 */
export interface GithubEventAuthorRef {
  login: string;
  githubId: number | null;
  name: string | null;
  avatarUrl: string;
}

/**
 * GitHub 贡献事件（ADR-0017 D1 / ADR-0018）：GitHub 侧唯一原子事实，
 * 组织级 / 账号级 / 仓库级数字全部由它读时派生。
 *
 * 刻意**不存**邮箱（`commitEmail` / `author.email` 只活在采集期内存，ADR-0017 D3）；
 * 刻意**不存**派生指标（pullRequests / commits / issues / linesChanged）——事件本身就是最小事实。
 * `timestamp` **必填**（ADR-0018 决策 4）：它是事件唯一的时间坐标，缺时间的事件在采集期即被拦下
 * 不落盘（WARN + 计入 `.sync-state.json` 的 `untimedEvents`），读路径因此没有 null 分支。
 */
export interface GithubContributionEvent {
  kind: 'pullRequest' | 'issue';
  /** owner/repo 全名 */
  repository: string;
  /** PR / issue 编号；`kind + repository + number` = 增量去重幂等键 */
  number: number;
  /** 作者缺失（已注销账号等）时为 null；读路径按人物口径跳过，与组织级聚合口径一致 */
  author: GithubEventAuthorRef | null;
  /** PR：additions + deletions；Issue 恒为 0 */
  linesChanged: number;
  /**
   * 事件时间戳（ISO 8601 时刻）：PR=mergedAt；Issue=createdAt。
   * 区间口径（ADR-0018）以它做 `from <= timestamp < to` 的半开过滤。
   */
  timestamp: string;
  /** PR：PR 内提交总数；Issue 恒为 0 */
  commitCount: number;
}

/**
 * 仓库维度贡献（`GET /api/repo-contributions` 出参）：由 `github-events.json` **读时派生**、不落盘。
 * 口径混合（同组织级）：四项计数**含 bot**（dependabot 量计入其归属桶）；`contributors` 为**人物口径**（排除 bot）。
 */
export interface RepoContribution {
  /** owner/repo 全名 */
  repoId: string;
  github: Omit<GithubMetrics, 'repos'>;
  /** 贡献者数：排除 bot 后的去重登录名数 */
  contributors: number;
  /** 参与组织数：按**生效归属**去重（含伪组织 `unattributed`） */
  orgs: number;
  updatedAt: string;
}

export interface OrganizationContribution {
  orgId: string;
  orgName: string;
  logoUrl: string;
  homepageUrl: string;
  github: GithubMetrics;
  updatedAt: string;
}

export interface ConfluenceMetrics {
  /** 需求数：Requirement Proposal 表格 Contacts 列的 @ 提及数（每个提及各 1 条） */
  requirements: number;
  /** 议题分享次数：会议纪要 Agenda 段内 @ 的期数（段落与表格行都算，按期去重） */
  topicShares: number;
  /**
   * 编辑量：该账号作为**页面版本作者**的版本条数（`GET /api/v2/pages/{id}/versions` 的 `authorId`）。
   *
   * 含页面创建那一次（版本号从 1 开始，不做扣减）；覆盖空间内全部页面，
   * 不做单页封顶、不剔除多人共编的大页（见 ADR-0011）。
   */
  edits: number;
}

export interface OrganizationWiki {
  orgId: string;
  orgName: string;
  logoUrl: string;
  confluence: ConfluenceMetrics;
  updatedAt: string;
}

/**
 * 采集口径归属的来源（落盘值，ADR-0010）。
 * 认领命中的 `'claim'` **不落盘**，由读时派生层覆写（见 `ConfluenceEffectiveOrgSource`）。
 */
export type ConfluenceOrgSource = 'alias' | 'space' | 'unattributed';

/** 接口对外（读时派生）的归属来源：在采集口径之上叠加人工认领。 */
export type ConfluenceEffectiveOrgSource = ConfluenceOrgSource | 'claim';

/**
 * 账号级 Confluence 事实（04 §3.11 / ADR-0008 / ADR-0010）。
 *
 * 主体是**平台账号**而非自然人：未认领时只到账号级（"先落到账号，再谈自然人"）。
 *
 * - `orgId` / `orgSource` 是**采集口径**（`aliases.confluence` → 空间兜底 → 伪组织）：
 *   记「采集器看到了什么」，是落盘的兜底归属与审计线索。
 * - `personId` 为由 `identity-claims.json` 派生的落盘快照，**不是键**：为空即尚未认领。
 * - **对外展示**一律用读时派生的 `effectiveOrgId`（人工认领优先），见 `ConfluenceAccountView`。
 */
export interface ConfluenceAccount {
  /** 稳定键：Confluence `accountId`；取不到时退化为 `displayName:<展示名>` */
  accountId: string;
  displayName: string;
  /** 采集口径的所属组织；`null` = 采集器未归属（前端归入「独立开发者」） */
  orgId: string | null;
  /** 采集口径 `orgId` 的来源（`'claim'` 不在此列，见类型注释） */
  orgSource: ConfluenceOrgSource;
  /** 认领到的自然人（落盘快照）；`null` = 尚未认领 */
  personId: string | null;
  confluence: ConfluenceMetrics;
  updatedAt: string;
}

/**
 * 账号级 Confluence 的**接口出参**（04 §5.3.16 / ADR-0010）：叠加读时派生的**生效归属**。
 *
 * - `effectiveOrgId = 认领边派生的 Person.orgId ?? orgId ?? 'unattributed'`（人工优先）；
 * - `orgSource` 在认领命中时覆写为 `'claim'`，否则等于落盘值；
 * - `personId` 亦以认领边为准（不再依赖落盘快照）。
 */
export interface ConfluenceAccountView extends Omit<ConfluenceAccount, 'orgSource' | 'personId'> {
  orgSource: ConfluenceEffectiveOrgSource;
  /** 生效归属；未归属时为伪组织 `'unattributed'` */
  effectiveOrgId: string;
  personId: string | null;
}

export interface Contributor {
  contributorId: string;
  githubId: number;
  name: string;
  orgId?: string | null;
  avatarUrl?: string;
  joinedAt?: string;
  description?: string;
  /**
   * GitHub 协作指标（ADR-0003）：仅采集到贡献记录的个人才有；人工维护的纯档案可缺失。
   * 含仓库清单 `repoIds`（ADR-0017 决策 15），供组织级派生取并集还原去重仓库数。
   */
  github?: AccountGithubMetrics;
}

/** GET /api/contributor-contributions 的响应条目：带采集指标的个人贡献（github 恒有值） */
export type ContributorContribution = Contributor & { github: AccountGithubMetrics };

/**
 * GitHub 归属来源三态（ADR-0017）。
 *
 * 与 Confluence 的 `orgSource` 不同：账号级档案**不落盘**该字段（`Contributor` 无此字段），
 * 纯由派生得出——`claim`（认领边）/ `collection`（采集口径 `aliases.github` → `emailDomains`）/
 * `unattributed`（两者皆无）。
 */
export type GithubOrgSource = 'claim' | 'collection' | 'unattributed';

/**
 * 账号级 GitHub 的**接口出参**（04 §5.3.8 / ADR-0017）：在既有出参上**追加**读时派生的生效归属，向后兼容。
 *
 * - `effectiveOrgId = 认领边派生的 Person.orgId ?? orgId ?? 'unattributed'`（人工优先，与 ADR-0010 同构）；
 * - `personId` 为**读时派生**值（非落盘快照）：GitHub 账号档案上没有 `personId` 字段；
 * - 落盘的 `orgId` 是**采集口径**，自此降为兜底，不再是对外真相；
 * - 机器账号（如 `dependabot`）**不出现在本出参中**：人物口径排除，其代码量仍计入组织级求和（决策 5 / 11）。
 */
export interface ContributorContributionView extends ContributorContribution {
  /** 生效归属；未归属时为伪组织 `'unattributed'` */
  effectiveOrgId: string;
  orgSource: GithubOrgSource;
  personId: string | null;
}

export interface SummitSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  websiteUrl: string;
  /** 未结束即为 true（进行中的峰会同为 true） */
  isUpcoming: boolean;
}

export interface SummitDetail extends SummitSummary {
  description: string;
  hostOrgId?: string | null;
  host: string;
  attendeeCount: number;
  attendingOrganizations: string[];
  agendaHighlights: string[];
  outcomes: string[];
  minutesUrl?: string;
}

export interface MetricValue {
  value: number;
  unit?: string;
  delta?: number;
  deltaDirection?: DeltaDirection;
}

/**
 * data/home.json 的 data 结构。
 *
 * **不含独立开发者人数**：该指标自 ADR-0017 起为**读时派生**——不落盘、不由采集器回填，
 * 见 `HomeSummary.externalDeveloperCount`。
 */
export interface HomeFileData {
  /** 伙伴单位数：口径 = 组织档案内 `type !== 'individual'` 者（TSC 成员单位 + 参与单位 + 运营单位） */
  partnerCount: MetricValue;
  summitCount: MetricValue;
  useCaseCount: MetricValue;
  nextSummitId: string | null;
}

/**
 * GET /api/home/summary 的响应 data。
 *
 * `externalDeveloperCount` 的**出参形状不变**（仍为 `MetricValue`，ADR-0017 决策 8），但值改为
 * **读时派生**：生效归属为伪组织 `unattributed` 且非机器人的 GitHub 账号数。
 * 字段名沿用旧称「外部开发者」；对外文案已统一为「独立开发者」，与 `Badge.tsx` 的
 * `TYPE_LABEL.individual`、组织墙文案一致。改名会波及契约 / 校验 / 前端，收益不抵风险，故保留。
 *
 * **不带 `delta` / `deltaDirection`**：环比须基于历史快照（07 §2.2 P1 待办 ②），
 * 不得由「当前值 − 上次值」伪造。
 */
export interface HomeSummary extends Omit<HomeFileData, 'nextSummitId'> {
  externalDeveloperCount: MetricValue;
  nextSummit: SummitSummary | null;
  updatedAt: string;
}

/**
 * 组织卡片的各维度 top 贡献者条目（ADR-0016）：服务端聚合、随 scope=contributing 一次下发。
 * GitHub 维度取 `Contributor.name` / `avatarUrl`、`value = commits`；
 * Confluence 维度取 `displayName`、`value = edits`，**无头像字段**（前端首字母色块降级）。
 */
export interface OrganizationTopContributor {
  name: string;
  avatarUrl?: string;
  value: number;
}

/** 组织卡片派生字段（ADR-0016）：原始贡献指标 + 各维度 top3；原 contributionScore/contributionLevel 已退役 */
export interface OrganizationCard extends Organization {
  /** 代码贡献量：已合并 PR 内提交总数（github.commits）；无记录为 0 */
  commits?: number;
  /** Confluence 贡献量：编辑量（confluence.edits，读时派生求和）；无记录为 0 */
  confluenceEdits?: number;
  /** 各维度 top3：GitHub 按 commits、Confluence 按 edits 降序，并列稳定排序 */
  topContributors?: {
    github: OrganizationTopContributor[];
    confluence: OrganizationTopContributor[];
  };
}

export interface ContributionTotals {
  pullRequests: number;
  commits: number;
  issues: number;
  linesChanged: number;
  requirements: number;
  topicShares: number;
  /** 编辑量合计（Confluence 页面版本作者条数，见 `ConfluenceMetrics.edits` / ADR-0011） */
  edits: number;
}

export interface ContributionSummaryData {
  totals: ContributionTotals;
  orgCount: number;
  updatedAt: string;
}

/**
 * 例会参会矩阵（ADR-0005）—— 无主键、无规范化、无聚合。
 * 直接照搬运营台账：列为人名原文、行为日期，格子表示是否出席。
 */
export interface MeetingAttendanceRow {
  /** 例会日期，`YYYY-MM-DD` */
  date: string;
  /** 出席标记，与 columns 等长、同序（true=出席，false=缺席） */
  attendance: boolean[];
}

export interface MeetingAttendanceMatrix {
  /** 列头：人名原文（照搬台账，保留原序与原文） */
  columns: string[];
  /** 每次例会一行，保持台账原序（不在接口层排序） */
  rows: MeetingAttendanceRow[];
  /** 台账最后同步时间（ISO 8601），由采集脚本写入 */
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// 身份匹配控制台（04 §3.9 / §3.10 / §5.3.10～§5.3.15）
// ---------------------------------------------------------------------------

/** 来源类型：未来新增来源只需扩展此联合类型，Person 结构不变 */
export type IdentitySource = 'github' | 'confluence' | 'meeting';

/**
 * 自然人 —— 跨来源的身份根（04 §3.9）。
 * 与 Contributor 不同：Contributor 是 GitHub 账号维度档案，两者非一一对应。
 */
export interface Person {
  /** 不可变身份根主键（可读 slug，重名时末尾追加序号） */
  personId: string;
  displayName: string;
  /** 归属组织，**唯一真相**；null = 未归属（组织花名册由此字段派生） */
  orgId: string | null;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** 身份认领边 —— 把某来源账号判定为某自然人（04 §3.10） */
export interface IdentityClaim {
  claimId: string;
  personId: string;
  source: IdentitySource;
  /** 来源内稳定标识：github=githubId、confluence=accountId、meeting=人名原文 */
  accountKey: string;
  /** 认领时的来源展示名快照，仅作渲染兜底 */
  displayName?: string;
  createdAt: string;
  createdBy?: string;
}

/** `GET /api/identity/persons` 的响应条目 */
export interface PersonListItem extends Person {
  /** 该自然人当前持有的认领边数（派生） */
  claimCount: number;
}

/** 候选池条目的已归属引用 */
export interface IdentityCandidateOwner {
  personId: string;
  displayName: string;
  /** 该自然人的归属组织（Person.orgId，ADR-0014）；null = 未归属 */
  orgId: string | null;
  /** 组织展示名（读时解析 organizations.json）；未归属或档案缺失时为 null */
  orgName: string | null;
}

/**
 * 候选池条目：派生、不落盘（04 §5.3.11）；响应不含邮箱等敏感字段。
 *
 * 按 `source` 收窄的**判别联合**：每种来源只带自己的 `metrics`，
 * 避免出现「confluence 候选却带 github 字段」这类非法组合。
 */
export type IdentityCandidate =
  | GithubIdentityCandidate
  | ConfluenceIdentityCandidate
  | MeetingIdentityCandidate;

interface IdentityCandidateBase {
  accountKey: string;
  displayName: string;
  /** 空数组 = 待认领；长度 > 1 = 冲突（同一账号被多个自然人引用） */
  claimedBy: IdentityCandidateOwner[];
}

/** GitHub 候选：`metrics` 取自 `github-accounts.json` 的人工维护值（无采集记录时缺失） */
export interface GithubIdentityCandidate extends IdentityCandidateBase {
  source: 'github';
  avatarUrl?: string;
  metrics?: Omit<GithubMetrics, 'repos'>;
  /** 采集口径归属（`github-accounts.json` 落盘 `orgId`，ADR-0014）；null = 独立贡献者 */
  orgId: string | null;
  /** 组织展示名（读时解析 organizations.json）；未归属或档案缺失时为 null */
  orgName: string | null;
}

/** Confluence 候选：每条都至少被 @ 过一次，`metrics` 恒有值 */
export interface ConfluenceIdentityCandidate extends IdentityCandidateBase {
  source: 'confluence';
  metrics: ConfluenceMetrics;
  /** 采集口径归属（落盘 `orgId`）；null = 采集器未归属。候选池输出采集口径（非 effectiveOrgId），供认领冲突比对（ADR-0014） */
  orgId: string | null;
  /** 采集口径 `orgId` 的来源（落盘三值：alias / space / unattributed） */
  orgSource: ConfluenceOrgSource;
  /** 组织展示名（读时解析 organizations.json）；未归属或档案缺失时为 null */
  orgName: string | null;
}

/** 例会候选：人名原文，无指标 */
export interface MeetingIdentityCandidate extends IdentityCandidateBase {
  source: 'meeting';
}

/** `GET /api/identity/candidates` 的响应 data */
export interface IdentityCandidatesData {
  github: GithubIdentityCandidate[];
  confluence: ConfluenceIdentityCandidate[];
  meeting: MeetingIdentityCandidate[];
  /** 来源降级说明，如「confluence 数据源暂无数据」 */
  warnings: string[];
}

/** 花名册成员引用（Person 的展示子集） */
export type PersonRef = Pick<Person, 'personId' | 'displayName' | 'avatarUrl'>;

/** 组织花名册条目：派生、不落盘（04 §5.3.13） */
export interface OrgRosterEntry {
  /** 组织档案原文（只读取自 organizations.json） */
  organization: Organization;
  /** 归属该组织的自然人数 */
  memberCount: number;
  /** 成员清单，按 displayName 升序 */
  members: PersonRef[];
}

/** `GET /api/identity/org-roster` 的响应 data */
export interface OrgRosterData {
  organizations: OrgRosterEntry[];
  /** orgId 为 null 的自然人 */
  unassigned: PersonRef[];
  updatedAt: string;
}

/** `DELETE /api/identity/persons/:personId` 的响应 data（物理删除，仅限误建/重复提取，不可逆） */
export interface PersonDeleteResult {
  personId: string;
  /** 随物理删除一并解除的认领边数 */
  removedClaims: number;
}

/** `DELETE /api/identity/claims/:claimId` 的响应 data */
export interface ClaimDeleteResult {
  claimId: string;
  personId: string;
  source: IdentitySource;
  accountKey: string;
}
