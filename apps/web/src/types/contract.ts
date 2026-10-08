/**
 * 契约类型 —— 与 docs/04-data-and-api-contract.md 及后端 contract/entities.ts 逐字段对齐。
 * 修改任一侧必须同步修改另一侧。
 */

export type OrganizationType = 'tsc' | 'participant' | 'individual';
export type DeltaDirection = 'up' | 'down' | 'flat';
export type ContributionLevel = 'high' | 'medium' | 'low';

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
  description?: string;
}

export interface OrganizationCard extends Organization {
  contributionLevel?: ContributionLevel;
  contributionScore?: number;
}

export interface GithubMetrics {
  pullRequests: number;
  commits: number;
  issues: number;
  linesChanged: number;
  repos: number;
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
  github?: GithubMetrics;
}

/** `GET /api/contributor-contributions` 的响应条目：带采集指标的个人贡献（github 恒有值） */
export type ContributorContribution = Contributor & { github: GithubMetrics };

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
  partnerCount: MetricValue;
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
