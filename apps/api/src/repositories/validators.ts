import {
  ConfluenceAccount,
  Contributor,
  HomeFileData,
  IdentityClaim,
  MeetingAttendanceMatrix,
  MeetingAttendanceRow,
  Person,
  SummitDetail,
  MetricValue,
  Organization,
  OrganizationContribution,
  OrganizationWiki,
} from '../contract/entities';

/** 例会日期固定为 YYYY-MM-DD（04 文档 §3.8） */
const MEETING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);
const isNullableString = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || isString(value);

const ORGANIZATION_TYPES = ['partner', 'external', 'community', 'individual'];
const DELTA_DIRECTIONS = ['up', 'down', 'flat'];

function isMetricValue(value: unknown): value is MetricValue {
  if (!isObject(value)) return false;
  if (!isNumber(value.value)) return false;
  if (value.unit !== undefined && !isString(value.unit)) return false;
  if (value.delta !== undefined && !isNumber(value.delta)) return false;
  if (value.deltaDirection !== undefined && !DELTA_DIRECTIONS.includes(String(value.deltaDirection)))
    return false;
  return true;
}

export function isOrganization(value: unknown): value is Organization {
  if (!isObject(value)) return false;
  return (
    isString(value.orgId) &&
    isString(value.name) &&
    isString(value.logoUrl) &&
    isString(value.homepageUrl) &&
    ORGANIZATION_TYPES.includes(String(value.type)) &&
    isStringArray(value.tags) &&
    (value.aliases === undefined || isObject(value.aliases)) &&
    (value.emailDomains === undefined || isStringArray(value.emailDomains)) &&
    isNullableString(value.joinedAt) &&
    isNullableString(value.description)
  );
}

export function isOrganizationArray(value: unknown): value is Organization[] {
  return Array.isArray(value) && value.every(isOrganization);
}

export function isContribution(value: unknown): value is OrganizationContribution {
  if (!isObject(value)) return false;
  const github = value.github;
  return (
    isString(value.orgId) &&
    isString(value.orgName) &&
    isString(value.logoUrl) &&
    isString(value.homepageUrl) &&
    isObject(github) &&
    isNumber(github.pullRequests) &&
    // commits 为后续新增指标：旧数据文件可能缺失，存在时必须为数字（服务层读取统一按 0 归一化）
    (github.commits === undefined || isNumber(github.commits)) &&
    isNumber(github.issues) &&
    isNumber(github.linesChanged) &&
    isNumber(github.repos) &&
    isString(value.updatedAt)
  );
}

export function isContributionArray(value: unknown): value is OrganizationContribution[] {
  return Array.isArray(value) && value.every(isContribution);
}

export function isWiki(value: unknown): value is OrganizationWiki {
  if (!isObject(value)) return false;
  const confluence = value.confluence;
  return (
    isString(value.orgId) &&
    isString(value.orgName) &&
    isString(value.logoUrl) &&
    isObject(confluence) &&
    isNumber(confluence.requirements) &&
    isNumber(confluence.topicShares) &&
    // edits 为新增指标（ADR-0011）：不兼容变更已随 schemaVersion 提升，故要求必须存在
    isNumber(confluence.edits) &&
    isString(value.updatedAt)
  );
}

export function isWikiArray(value: unknown): value is OrganizationWiki[] {
  return Array.isArray(value) && value.every(isWiki);
}

/** 落盘允许的采集口径归属来源（`'claim'` 只出现在接口出参，见 ADR-0010） */
const CONFLUENCE_ORG_SOURCES = ['alias', 'space', 'unattributed'];

/**
 * 账号级 Confluence 条目（04 文档 §3.11）：
 * - `accountId` 必填且非空（退化兜底值由采集器给出）；
 * - `orgId` / `personId` 必须显式出现，取值 `string | null`（`null` = 未归属 / 未认领）；
 * - `orgSource` 必须为 `alias` / `space` / `unattributed`（v3 新增，ADR-0010）；
 * - `confluence` 计数与组织级同构。
 */
export function isConfluenceAccount(value: unknown): value is ConfluenceAccount {
  if (!isObject(value)) return false;
  const accountId = value.accountId;
  if (!isString(accountId) || accountId.length === 0) return false;

  const confluence = value.confluence;
  return (
    isString(value.displayName) &&
    (value.orgId === null || isString(value.orgId)) &&
    CONFLUENCE_ORG_SOURCES.includes(String(value.orgSource)) &&
    (value.personId === null || isString(value.personId)) &&
    isObject(confluence) &&
    isNumber(confluence.requirements) &&
    isNumber(confluence.topicShares) &&
    isNumber(confluence.edits) &&
    isString(value.updatedAt)
  );
}

export function isConfluenceAccountArray(value: unknown): value is ConfluenceAccount[] {
  return Array.isArray(value) && value.every(isConfluenceAccount);
}

/** 贡献者内嵌的 GitHub 指标（ADR-0003）：整体可选，存在时字段校验与组织贡献一致（commits 兼容缺失） */
function isGithubMetrics(value: unknown): value is Contributor['github'] {
  if (!isObject(value)) return false;
  return (
    isNumber(value.pullRequests) &&
    (value.commits === undefined || isNumber(value.commits)) &&
    isNumber(value.issues) &&
    isNumber(value.linesChanged) &&
    isNumber(value.repos)
  );
}

export function isContributor(value: unknown): value is Contributor {
  if (!isObject(value)) return false;
  return (
    isString(value.contributorId) &&
    isNumber(value.githubId) &&
    isString(value.name) &&
    isNullableString(value.orgId) &&
    isNullableString(value.avatarUrl) &&
    isNullableString(value.joinedAt) &&
    isNullableString(value.description) &&
    (value.github === undefined || isGithubMetrics(value.github))
  );
}

export function isContributorArray(value: unknown): value is Contributor[] {
  return Array.isArray(value) && value.every(isContributor);
}

export function isSummitDetail(value: unknown): value is SummitDetail {
  if (!isObject(value)) return false;
  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.startDate) &&
    isString(value.endDate) &&
    isString(value.location) &&
    isString(value.websiteUrl) &&
    isBoolean(value.isUpcoming) &&
    isString(value.description) &&
    isNullableString(value.hostOrgId) &&
    isString(value.host) &&
    isNumber(value.attendeeCount) &&
    isStringArray(value.attendingOrganizations) &&
    isStringArray(value.agendaHighlights) &&
    isStringArray(value.outcomes) &&
    isNullableString(value.minutesUrl)
  );
}

export function isSummitDetailArray(value: unknown): value is SummitDetail[] {
  return Array.isArray(value) && value.every(isSummitDetail);
}

function isMeetingAttendanceRow(value: unknown): value is MeetingAttendanceRow {
  if (!isObject(value)) return false;
  return (
    isString(value.date) &&
    MEETING_DATE_PATTERN.test(value.date) &&
    Array.isArray(value.attendance) &&
    value.attendance.every(isBoolean)
  );
}

/**
 * 例会参会矩阵（04 文档 §3.8）：
 * - columns 非空字符串数组；
 * - 每行 date 为 YYYY-MM-DD，attendance 与 columns 等长；
 * - updatedAt 可选。
 */
export function isMeetingAttendanceMatrix(value: unknown): value is MeetingAttendanceMatrix {
  if (!isObject(value)) return false;
  const columns = value.columns;
  if (!isStringArray(columns) || columns.length === 0) return false;

  const rows = value.rows;
  if (!Array.isArray(rows) || !rows.every(isMeetingAttendanceRow)) return false;
  if (!rows.every((row) => (row as MeetingAttendanceRow).attendance.length === columns.length)) {
    return false;
  }

  return value.updatedAt === undefined || isString(value.updatedAt);
}

export function isHomeFileData(value: unknown): value is HomeFileData {
  if (!isObject(value)) return false;
  return (
    isMetricValue(value.partnerCount) &&
    isMetricValue(value.externalDeveloperCount) &&
    isMetricValue(value.summitCount) &&
    isMetricValue(value.useCaseCount) &&
    isNullableString(value.nextSummitId)
  );
}

const IDENTITY_SOURCES = ['github', 'confluence', 'meeting'];

/**
 * 自然人（04 文档 §3.9）：
 * - `personId` / `displayName` / 时间戳必填；
 * - `orgId` 必须显式出现，取值 `string | null`（`null` = 未归属）；
 * - `avatarUrl` 可选。
 */
export function isPerson(value: unknown): value is Person {
  if (!isObject(value)) return false;
  return (
    isString(value.personId) &&
    isString(value.displayName) &&
    (value.orgId === null || isString(value.orgId)) &&
    isNullableString(value.avatarUrl) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function isPersonArray(value: unknown): value is Person[] {
  return Array.isArray(value) && value.every(isPerson);
}

/**
 * 身份认领边（04 文档 §3.10）：
 * - `claimId` / `personId` / `source` / `accountKey` / `createdAt` 必填；
 * - `displayName`、`createdBy` 可选；
 * - 不做唯一性校验（同一账号可被多人引用）。
 */
export function isIdentityClaim(value: unknown): value is IdentityClaim {
  if (!isObject(value)) return false;
  return (
    isString(value.claimId) &&
    isString(value.personId) &&
    IDENTITY_SOURCES.includes(String(value.source)) &&
    isString(value.accountKey) &&
    isNullableString(value.displayName) &&
    isString(value.createdAt) &&
    isNullableString(value.createdBy)
  );
}

export function isIdentityClaimArray(value: unknown): value is IdentityClaim[] {
  return Array.isArray(value) && value.every(isIdentityClaim);
}
