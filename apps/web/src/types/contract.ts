/**
 * 契约类型 —— 与 docs/04-data-and-api-contract.md 及后端 contract/entities.ts 逐字段对齐。
 * 修改任一侧必须同步修改另一侧。
 */

/**
 * 组织类型。`individual` 为伪组织（独立开发者聚合），其余均为真实组织类别。
 * `partnerCount` 口径为 `type !== 'individual'`，故 operation 计入伙伴单位数。
 */
export type OrganizationType = 'tsc' | 'participant' | 'operation' | 'individual';
export type DeltaDirection = 'up' | 'down' | 'flat';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MetricValue {
  value: number;
  unit?: string;
  delta?: number;
  deltaDirection?: DeltaDirection;
}

export interface Organization {
  orgId: string;
  name: string;
  logoUrl: string;
  homepageUrl: string;
  type: OrganizationType;
  tags: string[];
  aliases?: Record<string, string>;
  /** 组织邮箱域名后缀清单（小写），用于按贡献者邮箱域名自动归属 */
  emailDomains?: string[];
  joinedAt?: string;
  /** 展示顺序（ADR-0016）：运营人工排位，越小越靠前；同值/缺失按 name 升序兜底 */
  displayOrder?: number;
  description?: string;
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

export interface GithubMetrics {
  pullRequests: number;
  commits: number;
  issues: number;
  linesChanged: number;
  /** 参与仓库数：组织级为**去重数**（账号级 repoIds 的并集大小），账号级恒等于 repoIds.length */
  repos: number;
}

/**
 * 账号级 GitHub 指标（ADR-0017 决策 15）：额外带仓库清单，供组织级派生取并集还原去重仓库数。
 * 前端不消费 `repoIds`，此处仅为与 API 契约同构（`github-accounts.json` schemaVersion 2）。
 */
export interface AccountGithubMetrics extends GithubMetrics {
  repoIds: string[];
}

export interface OrganizationContribution {
  orgId: string;
  orgName: string;
  logoUrl: string;
  homepageUrl: string;
  github: GithubMetrics;
  updatedAt: string;
}

/**
 * 仓库维度贡献（后端 `contract/entities.ts#RepoContribution` 镜像）。
 * 由 `github-events.json`（GitHub 侧唯一原子事实）读时派生、不落盘。
 * 口径混合：四项计数含 bot；contributors 为人物口径（排除 bot）；orgs 按生效归属去重（含 unattributed）。
 */
export interface RepoContribution {
  /** owner/repo 全名 */
  repoId: string;
  github: Omit<GithubMetrics, 'repos'>;
  /** 贡献者数：排除 bot 后的去重登录名数 */
  contributors: number;
  /** 参与组织数：按生效归属去重（含伪组织 unattributed） */
  orgs: number;
  updatedAt: string;
}

/** 单组件发布摘要（GET /api/repo-releases，ADR-0019） */
export interface RepoReleaseSummary {
  /** owner/repo 全名 */
  repoId: string;
  /** 累计发布次数 */
  releaseCount: number;
  /** 最近一次发布（按 publishedAt 最新，不按 tag 名排序） */
  latest: {
    /** tag 名，原样展示（如 `v2.1.0`） */
    tag: string;
    /** 发布名称；与 tag 不同时仅作参考展示 */
    name: string;
    publishedAt: string;
    url: string;
  };
}

/** 版本发布页数据（ADR-0019）；前端展示一律中文，无 i18n */
export interface RepoReleasesData {
  /** 有 Release 的组件（按最近发布倒序） */
  repos: RepoReleaseSummary[];
  /** 采集范围内仓库总数 */
  totalInScope: number;
  /** 无 Release 的仓库（repoId 升序） */
  reposWithoutReleases: string[];
  /** 近 90 天（宽松含边界当天）发布次数 */
  recent90dCount: number;
  /** 最近一次发布（无则 null） */
  latestRelease: {
    repoId: string;
    tag: string;
    publishedAt: string;
  } | null;
  /** 平均发布周期（天）：各组件内部发布间隔均值、再按组件等权平均；无任一组件 ≥2 次发布时为 null */
  avgDaysBetweenReleases: number | null;
  updatedAt: string;
}

export interface ConfluenceMetrics {
  requirements: number;
  topicShares: number;
  /** 编辑量：作为页面版本作者的版本条数（含创建那一次，ADR-0011） */
  edits: number;
}

export interface OrganizationWiki {
  orgId: string;
  orgName: string;
  logoUrl: string;
  confluence: ConfluenceMetrics;
  updatedAt: string;
}

/** 采集口径归属来源（落盘值，ADR-0010）；`'claim'` 只出现在接口出参 */
export type ConfluenceOrgSource = 'alias' | 'space' | 'unattributed';
/** 读时派生的归属来源：人工认领优先 */
export type ConfluenceEffectiveOrgSource = ConfluenceOrgSource | 'claim';

/**
 * 账号级 Confluence 明细（`GET /api/confluence-accounts` 的响应条目）。
 * `effectiveOrgId` / `orgSource` / `personId` 为**读时派生**的生效值（ADR-0010）。
 */
export interface ConfluenceAccountView {
  accountId: string;
  displayName: string;
  /** 采集口径归属；`null` = 采集器未归属 */
  orgId: string | null;
  orgSource: ConfluenceEffectiveOrgSource;
  /** 生效归属；未归属时为伪组织 `unattributed` */
  effectiveOrgId: string;
  personId: string | null;
  confluence: ConfluenceMetrics;
  updatedAt: string;
}

export interface Contributor {
  contributorId: string;
  githubId: number;
  name: string;
  orgId?: string | null;
  avatarUrl?: string;
  joinedAt?: string;
  description?: string;
  /** GitHub 协作指标：仅采集到贡献记录的个人才有；人工维护的纯档案可缺失 */
  github?: AccountGithubMetrics;
}

/** `GET /api/contributor-contributions` 的响应条目：带采集指标的个人贡献（github 恒有值） */
export type ContributorContribution = Contributor & { github: AccountGithubMetrics };

/**
 * GitHub 归属来源三态（ADR-0017）：`claim`（认领边）/ `collection`（采集口径）/ `unattributed`。
 * 账号级档案**不落盘**该字段，纯由接口读时派生。
 */
export type GithubOrgSource = 'claim' | 'collection' | 'unattributed';

/**
 * `GET /api/contributor-contributions` 的响应条目（ADR-0017）：在既有出参上**追加**读时派生的生效归属。
 *
 * - `effectiveOrgId = 认领边派生的 Person.orgId ?? orgId ?? 'unattributed'`（人工优先，与 Confluence 侧同构）；
 * - 落盘的 `orgId` 是**采集口径**，已降为兜底，**不得**再用于展示归属；
 * - 机器账号（如 `dependabot`）**不出现在本出参中**（人物口径排除），其代码量仍计入组织级求和。
 */
export interface ContributorContributionView extends ContributorContribution {
  /** 生效归属；未归属时为伪组织 `unattributed` */
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

export interface HomeSummary {
  /** 伙伴单位数：口径 = 组织档案内 `type !== 'individual'` 者（TSC 成员单位 + 参与单位 + 运营单位） */
  partnerCount: MetricValue;
  /**
   * 独立开发者数：生效归属为伪组织 `unattributed` 且非机器人的 GitHub 账号数（ADR-0017，**读时派生**）。
   * 字段名沿用旧称「外部开发者」，对外文案已统一为「独立开发者」。
   * **不带 `delta` / `deltaDirection`**（环比须基于历史快照，不得伪造），故趋势药丸自动隐藏。
   */
  externalDeveloperCount: MetricValue;
  summitCount: MetricValue;
  useCaseCount: MetricValue;
  nextSummit: SummitSummary | null;
  updatedAt: string;
}

export interface ContributionTotals {
  pullRequests: number;
  commits: number;
  issues: number;
  linesChanged: number;
  requirements: number;
  topicShares: number;
  /** 编辑量合计（ADR-0011） */
  edits: number;
}

export interface ContributionSummaryData {
  totals: ContributionTotals;
  orgCount: number;
  updatedAt: string;
}

/**
 * 例会参会矩阵（ADR-0005 / 04 文档 §3.8）—— 无主键、无规范化、无聚合。
 * 直接照搬运营台账：列为人名原文（保留原序），行为日期，格子表示是否出席。
 */
export interface MeetingAttendanceRow {
  /** 例会日期，`YYYY-MM-DD` */
  date: string;
  /** 出席标记，与 columns 等长、同序 */
  attendance: boolean[];
}

export interface MeetingAttendanceMatrix {
  /** 列头：人名原文（照搬台账，保留原序与原文） */
  columns: string[];
  /** 每次例会一行，保持台账原序 */
  rows: MeetingAttendanceRow[];
  /** 台账最后同步时间（ISO 8601） */
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// 身份匹配控制台（04 §3.9 / §3.10 / §5.3.10～§5.3.15）
// ---------------------------------------------------------------------------

/** 来源类型：未来新增来源只需扩展此联合类型，Person 结构不变 */
export type IdentitySource = 'github' | 'confluence' | 'meeting';

/** 自然人 —— 跨来源的身份根（04 §3.9） */
export interface Person {
  personId: string;
  displayName: string;
  /** 归属组织，**唯一真相**；null = 未归属 */
  orgId: string | null;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** 身份认领边（04 §3.10） */
export interface IdentityClaim {
  claimId: string;
  personId: string;
  source: IdentitySource;
  /** 来源内稳定标识：github=githubId、confluence=accountId、meeting=人名原文 */
  accountKey: string;
  displayName?: string;
  createdAt: string;
  createdBy?: string;
}

/** `GET /api/identity/persons` 的响应条目 */
export interface PersonListItem extends Person {
  claimCount: number;
}

export interface IdentityCandidateOwner {
  personId: string;
  displayName: string;
  /** 该自然人的归属组织（Person.orgId，ADR-0014）；null = 未归属 */
  orgId: string | null;
  /** 组织展示名（读时解析 organizations.json）；未归属或档案缺失时为 null */
  orgName: string | null;
}

interface IdentityCandidateBase {
  accountKey: string;
  displayName: string;
  /** 空数组 = 待认领；长度 > 1 = 冲突（同一账号被多个自然人引用） */
  claimedBy: IdentityCandidateOwner[];
}

/** GitHub 候选：`metrics` 取自贡献者档案的人工维护值（无采集记录时缺失） */
export interface GithubIdentityCandidate extends IdentityCandidateBase {
  source: 'github';
  avatarUrl?: string;
  metrics?: Omit<GithubMetrics, 'repos'>;
  /** 采集口径归属（落盘 orgId，ADR-0014）；null = 独立贡献者 */
  orgId: string | null;
  /** 组织展示名；未归属或档案缺失时为 null */
  orgName: string | null;
}

/** Confluence 候选：每条都至少被 @ 过一次，`metrics` 恒有值 */
export interface ConfluenceIdentityCandidate extends IdentityCandidateBase {
  source: 'confluence';
  metrics: ConfluenceMetrics;
  /** 采集口径归属（落盘 orgId，非 effectiveOrgId，ADR-0014）；null = 采集器未归属 */
  orgId: string | null;
  /** 采集口径 orgId 的来源（alias / space / unattributed） */
  orgSource: 'alias' | 'space' | 'unattributed';
  /** 组织展示名；未归属或档案缺失时为 null */
  orgName: string | null;
}

/** 例会候选：人名原文，无指标 */
export interface MeetingIdentityCandidate extends IdentityCandidateBase {
  source: 'meeting';
}

// ── 个人模式（Person Mode，ADR-0020）：`/api/person-*` 契约镜像 ─────────
// 全部为**读时派生**，前端不做二次聚合：人物级计数/仓库并集/生效归属均由后端给出。

/** GitHub 原子事件镜像（`github-events.json` v2 条目）；`PersonGithubEventItem` 在其上追加读时派生的深链 */
export interface GithubContributionEvent {
  kind: 'pullRequest' | 'issue';
  /** owner/repo 全名 */
  repository: string;
  number: number;
  author: { login: string; githubId: number; name?: string | null; avatarUrl?: string } | null;
  linesChanged: number;
  timestamp: string;
  commitCount: number;
}

export interface PersonGithubEventItem extends GithubContributionEvent {
  /** 读时派生：PR → `https://github.com/{repo}/pull/{n}`，Issue → `.../issues/{n}` */
  url: string;
}

export interface PersonGithubEventsData {
  events: PersonGithubEventItem[];
  /** 区间内的总命中数（含被截断部分） */
  total: number;
  /** 因 limit 截断为 true；超过上限被后端封顶时亦为 true */
  truncated: boolean;
  updatedAt: string;
}

/** Confluence 需求级事实镜像（ADR-0021 新契约 `confluence-requirements.json` 条目） */
export interface ConfluenceRequirementEvent {
  accountId: string;
  requirementTitle: string;
  pageId: string;
  pageTitle: string;
  /** ancestor chain 中位于 “Release Planning” 之下的一级；解析不到为 null（明细仍给出，供人工核对） */
  release: string | null;
  rowIndex: number;
}

export interface PersonConfluenceRequirementItem extends ConfluenceRequirementEvent {
  /** 账号档案展示名（取自 confluence-accounts.json） */
  displayName: string;
  /** 读时派生：`{confluence.baseUrl}/wiki/pages/viewpage.action?pageId={pageId}`；baseUrl 未配置时为空串 */
  url: string;
}

export interface PersonConfluenceRequirementsData {
  requirements: PersonConfluenceRequirementItem[];
  total: number;
  /** 需求事实文件的时间戳；文件缺失（待采集）时为 null */
  updatedAt: string | null;
}

/** 仓库分解条目（`github.repos` 为并集，本表为按仓库拆分；合计 ≡ 画像四项计数） */
export interface PersonRepoBreakdownItem {
  repoId: string;
  github: Omit<GithubMetrics, 'repos'>;
}

/** 名下账号分解条目：GitHub 与 Confluence 联合（可判别 union） */
export type PersonAccountItem =
  | {
      source: 'github';
      /** 登录名 */
      accountKey: string;
      displayName: string;
      avatarUrl: string | null;
      effectiveOrgId: string;
      orgName: string | null;
      orgSource: GithubOrgSource | 'claim';
      isBot: boolean;
      github: Omit<GithubMetrics, 'repos'> & { repoIds: string[] };
    }
  | {
      source: 'confluence';
      /** accountId */
      accountKey: string;
      displayName: string;
      avatarUrl: null;
      effectiveOrgId: string;
      orgName: string | null;
      orgSource: ConfluenceEffectiveOrgSource;
      isBot: false;
      confluence: ConfluenceMetrics;
    };

export interface PersonContributionsData {
  person: Person;
  /** 生效组织名；未归属（unattributed 伪组织）时为 null */
  orgName: string | null;
  /** 读时派生：`person.orgId ?? 'unattributed'` */
  effectiveOrgId: string;
  /** 归属口径来源：`'person'` = 取自人物档案；`'account'` = 档案未填组织，回落 */
  orgSource: 'person' | 'account';
  github: {
    metrics: GithubMetrics;
    /** 名下账号 repoIds 的并集（升序）；并集大小恒等于 metrics.repos */
    repoIds: string[];
    /** 按 commits 降序的仓库分解；合计 ≡ metrics */
    repoBreakdown: PersonRepoBreakdownItem[];
    /** 事件文件时间戳；名下无 GitHub 事件时为 null */
    updatedAt: string | null;
  };
  confluence: {
    metrics: ConfluenceMetrics;
    /** 名下账号的最新 updatedAt；名下无 Confluence 账号时为 null */
    updatedAt: string | null;
  };
  accounts: PersonAccountItem[];
}

/** 个人模式候选池（选择器用）：有任一来源贡献的自然人与账号 */
export interface PersonCandidateItem {
  personId: string;
  displayName: string;
  avatarUrl: string | null;
  orgId: string | null;
  orgName: string | null;
  github: boolean;
  confluence: boolean;
}

export interface PersonAccountCandidateItem {
  source: 'github' | 'confluence';
  accountKey: string;
  displayName: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  effectiveOrgId: string;
  orgName: string | null;
  /** 认领该账号的全部自然人（many-to-many 全列，按认领边顺序） */
  persons: { personId: string; displayName: string }[];
}

export interface PersonCandidatesData {
  updatedAt: string;
  persons: PersonCandidateItem[];
  githubAccounts: PersonAccountCandidateItem[];
  confluenceAccounts: PersonAccountCandidateItem[];
}

/** 候选池条目（04 §5.3.11）：按 `source` 收窄的判别联合 */
export type IdentityCandidate =
  | GithubIdentityCandidate
  | ConfluenceIdentityCandidate
  | MeetingIdentityCandidate;

/** `GET /api/identity/candidates` 的响应 data */
export interface IdentityCandidatesData {
  github: GithubIdentityCandidate[];
  confluence: ConfluenceIdentityCandidate[];
  meeting: MeetingIdentityCandidate[];
  warnings: string[];
}

/** 花名册成员引用（Person 的展示子集） */
export type PersonRef = Pick<Person, 'personId' | 'displayName' | 'avatarUrl'>;

/** 组织花名册条目（04 §5.3.13） */
export interface OrgRosterEntry {
  organization: Organization;
  /** 归属该组织的自然人数 */
  memberCount: number;
  members: PersonRef[];
}

/** `GET /api/identity/org-roster` 的响应 data */
export interface OrgRosterData {
  organizations: OrgRosterEntry[];
  unassigned: PersonRef[];
  updatedAt: string;
}

/** `DELETE /api/identity/persons/:personId` 的响应 data（物理删除，仅限误建/重复提取，不可逆） */
export interface PersonDeleteResult {
  personId: string;
  removedClaims: number;
}

/** `DELETE /api/identity/claims/:claimId` 的响应 data */
export interface ClaimDeleteResult {
  claimId: string;
  personId: string;
  source: IdentitySource;
  accountKey: string;
}
