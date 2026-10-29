import {
  ConfluenceAccount,
  ConfluenceAccountView,
  ConfluenceEffectiveOrgSource,
  ConfluenceMetrics,
  Contributor,
  ContributorContribution,
  GithubMetrics,
  GithubOrgSource,
  IdentityClaim,
  Organization,
  OrganizationContribution,
  OrganizationWiki,
  Person,
} from '../contract/entities';

/** 独立开发者伪组织 orgId（与 `collector.constants` / `organizations.json` 保持一致） */
export const ORG_UNATTRIBUTED = 'unattributed';

/** 认领边索引：`source=confluence` 的 `accountKey`（accountId，小写归一）→ personId / Person.orgId */
export interface ConfluenceClaimIndex {
  personByKey: Map<string, string>;
  orgByKey: Map<string, string>;
}

/**
 * 构建身份认领索引（ADR-0010）：`source=confluence` 的认领边 → personId 与 `Person.orgId`。
 *
 * - **不按展示名模糊匹配**：同名会静默错归，认领边机制的存在正是为了规避这一点；
 * - `personByKey` 同时是**落盘快照**与**读时派生**的依据——生效归属必须与 `personId` 一致，
 *   否则会出现「已归属某组织却显示未认领」的自相矛盾；
 * - `orgByKey` 只收「认领到的自然人确实有 orgId」的边：认领到无归属自然人时**不覆盖**采集口径。
 */
export function buildConfluenceClaimIndex(
  claims: IdentityClaim[],
  persons: Person[],
): { index: ConfluenceClaimIndex; warnings: string[] } {
  const warnings: string[] = [];

  const personOrg = new Map<string, string>();
  for (const person of persons) {
    if (person.orgId) personOrg.set(person.personId, person.orgId);
  }

  const personByKey = new Map<string, string>();
  const orgByKey = new Map<string, string>();

  for (const claim of claims) {
    if (claim.source !== 'confluence') continue;
    const key = claim.accountKey?.trim().toLowerCase();
    if (!key) continue;

    const existingPerson = personByKey.get(key);
    if (existingPerson && existingPerson !== claim.personId) {
      warnings.push(
        `Confluence 账号 ${claim.accountKey} 同时被多个自然人认领（${existingPerson} / ${claim.personId}），按认领边顺序取 ${existingPerson}`,
      );
    } else {
      personByKey.set(key, claim.personId);
    }

    const orgId = personOrg.get(claim.personId);
    if (!orgId) continue;

    const existingOrg = orgByKey.get(key);
    if (existingOrg && existingOrg !== orgId) {
      warnings.push(
        `Confluence 账号 ${claim.accountKey} 被认领到多个组织（${existingOrg} / ${orgId}），按认领边顺序归属 ${existingOrg}`,
      );
      continue;
    }
    orgByKey.set(key, orgId);
  }

  return { index: { personByKey, orgByKey }, warnings };
}

/**
 * 读时派生**生效归属**（ADR-0010）：
 * `effectiveOrgId = 认领边派生的 Person.orgId ?? 采集口径 orgId ?? 'unattributed'`。
 *
 * 认领优先于 `aliases` / 空间兜底等采集口径；认领边命中但自然人无 orgId 时**回落**采集口径
 * （不清零），`orgSource` 也随之保持采集值。
 */
export function resolveEffectiveOrg(
  account: ConfluenceAccount,
  index: ConfluenceClaimIndex,
): ConfluenceAccountView {
  const key = account.accountId.trim().toLowerCase();
  const claimedPersonId = index.personByKey.get(key) ?? null;
  const claimedOrgId = index.orgByKey.get(key);

  const orgSource: ConfluenceEffectiveOrgSource = claimedOrgId ? 'claim' : account.orgSource;

  return {
    ...account,
    personId: claimedPersonId,
    orgSource,
    effectiveOrgId: claimedOrgId ?? account.orgId ?? ORG_UNATTRIBUTED,
  };
}

/** 批量派生生效归属 */
export function toConfluenceAccountViews(
  accounts: ConfluenceAccount[],
  claims: IdentityClaim[],
  persons: Person[],
): { views: ConfluenceAccountView[]; warnings: string[] } {
  const { index, warnings } = buildConfluenceClaimIndex(claims, persons);
  return { views: accounts.map((account) => resolveEffectiveOrg(account, index)), warnings };
}

/** 账号级最新 `updatedAt`（组织级投影的时间戳来源；无账号时回退当前时间） */
export function latestAccountUpdatedAt(accounts: ConfluenceAccount[]): string {
  return accounts.reduce(
    (latest, account) => (Date.parse(account.updatedAt) > Date.parse(latest) ? account.updatedAt : latest),
    accounts[0]?.updatedAt ?? new Date().toISOString(),
  );
}

/**
 * 组织级投影 = 账号级按**生效归属**求和（ADR-0010）。
 *
 * 覆盖组织档案全部组织（含伪组织 `unattributed`），未命中记 0——
 * 「组织级 = 账号级求和」由此从约定升级为**结构上恒成立**。
 */
export function deriveOrganizationWiki(
  organizations: Organization[],
  views: ConfluenceAccountView[],
  updatedAt: string,
): OrganizationWiki[] {
  const counts = new Map<string, ConfluenceMetrics>();
  for (const view of views) {
    const bucket = counts.get(view.effectiveOrgId) ?? {
      requirements: 0,
      topicShares: 0,
      edits: 0,
    };
    bucket.requirements += view.confluence.requirements;
    bucket.topicShares += view.confluence.topicShares;
    bucket.edits += view.confluence.edits;
    counts.set(view.effectiveOrgId, bucket);
  }

  return organizations.map((org) => {
    const metrics = counts.get(org.orgId) ?? { requirements: 0, topicShares: 0, edits: 0 };
    return {
      orgId: org.orgId,
      orgName: org.name,
      logoUrl: org.logoUrl,
      confluence: {
        requirements: metrics.requirements,
        topicShares: metrics.topicShares,
        edits: metrics.edits,
      },
      updatedAt,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub 侧（ADR-0017）：与上方 Confluence 函数**同构**，两平台共用一套兜底链语义。
// Confluence 侧函数一行未动；本段只新增。
// ─────────────────────────────────────────────────────────────────────────────

/** 读时派生叠加到 GitHub 账号上的**生效归属**字段（与契约层 `ContributorContributionView` 追加的字段一致） */
export interface GithubEffectiveOrg {
  /** 生效归属；未归属时为伪组织 `ORG_UNATTRIBUTED`，**恒非空** */
  effectiveOrgId: string;
  orgSource: GithubOrgSource;
  /** 认领到的自然人；`null` = 尚未认领 */
  personId: string | null;
}

/**
 * GitHub 账号 + 生效归属。泛型是为了保留 `ContributorContribution` 的 `github` 必填收窄，
 * 使派生结果可直接参与求和而不必再判空；`ContributorView<ContributorContribution>` 即契约层
 * 的 `ContributorContributionView`（结构相同，可直接作为出参返回）。
 */
export type ContributorView<T extends Contributor = Contributor> = T & GithubEffectiveOrg;

/** 认领边索引：`source=github` 的 `accountKey`（`githubId` 的字符串形式）→ personId / `Person.orgId` */
export interface GithubClaimIndex {
  personByKey: Map<string, string>;
  orgByKey: Map<string, string>;
}

/**
 * 构建 GitHub 身份认领索引（ADR-0017，与 `buildConfluenceClaimIndex` 同构）。
 *
 * - 匹配键是 **`githubId`**（数字账号 ID），**不用 login**：login 可改名，`githubId` 稳定；
 * - **不按展示名模糊匹配**（同 ADR-0010）：同名会静默错归，认领边机制的存在正是为规避这一点；
 * - 同一 `accountKey` 有多条边 → 取**首条**并记 `WARN`；
 * - `orgByKey` 只收「认领到的自然人确实有 `orgId`」的边：认领到无归属自然人时**回落**采集口径，不清零。
 */
export function buildGithubClaimIndex(
  claims: IdentityClaim[],
  persons: Person[],
): { index: GithubClaimIndex; warnings: string[] } {
  const warnings: string[] = [];

  const personOrg = new Map<string, string>();
  for (const person of persons) {
    if (person.orgId) personOrg.set(person.personId, person.orgId);
  }

  const personByKey = new Map<string, string>();
  const orgByKey = new Map<string, string>();

  for (const claim of claims) {
    if (claim.source !== 'github') continue;
    const key = claim.accountKey?.trim();
    if (!key) continue;

    const existingPerson = personByKey.get(key);
    if (existingPerson && existingPerson !== claim.personId) {
      warnings.push(
        `GitHub 账号 ${claim.accountKey} 同时被多个自然人认领（${existingPerson} / ${claim.personId}），按认领边顺序取 ${existingPerson}`,
      );
    } else {
      personByKey.set(key, claim.personId);
    }

    const orgId = personOrg.get(claim.personId);
    if (!orgId) continue;

    const existingOrg = orgByKey.get(key);
    if (existingOrg && existingOrg !== orgId) {
      warnings.push(
        `GitHub 账号 ${claim.accountKey} 被认领到多个组织（${existingOrg} / ${orgId}），按认领边顺序归属 ${existingOrg}`,
      );
      continue;
    }
    orgByKey.set(key, orgId);
  }

  return { index: { personByKey, orgByKey }, warnings };
}

/**
 * 读时派生 GitHub **生效归属**（ADR-0017 决策 1）：
 * `effectiveOrgId = 认领边派生的 Person.orgId ?? 账号级 orgId ?? 'unattributed'`。
 *
 * 账号级 `orgId` 自此降为**兜底**（采集口径），不再是对外真相；
 * 认领 / 解除 / 改 `Person.orgId` 后**下一个请求即生效**，无需重跑采集器或重启进程。
 */
export function resolveGithubEffectiveOrg<T extends Contributor>(
  account: T,
  index: GithubClaimIndex,
): ContributorView<T> {
  const key = String(account.githubId).trim();
  const claimedPersonId = index.personByKey.get(key) ?? null;
  const claimedOrgId = index.orgByKey.get(key);

  const orgSource: GithubOrgSource = claimedOrgId
    ? 'claim'
    : account.orgId
      ? 'collection'
      : 'unattributed';

  return {
    ...account,
    personId: claimedPersonId,
    orgSource,
    effectiveOrgId: claimedOrgId ?? account.orgId ?? ORG_UNATTRIBUTED,
  };
}

/** 批量派生 GitHub 生效归属 */
export function toContributorViews<T extends Contributor>(
  accounts: T[],
  claims: IdentityClaim[],
  persons: Person[],
): { views: ContributorView<T>[]; warnings: string[] } {
  const { index, warnings } = buildGithubClaimIndex(claims, persons);
  return { views: accounts.map((account) => resolveGithubEffectiveOrg(account, index)), warnings };
}

/** GitHub App 头像路径前缀（人类用户是 `/u/`），bot 判定信号之一 */
const GITHUB_APP_AVATAR = 'avatars.githubusercontent.com/in/';

/**
 * 机器人 / GitHub App 账号判定（ADR-0017 决策 5）：取**三信号并集**，防单信号漏判。
 *
 * 纯函数、只读账号档案字段，不引入配置文件、不给 `Contributor` 加落盘的 `isBot` 字段。
 * 当前数据下三者收敛于同一账号（`dependabot`）。
 */
export function isBotAccount(account: Contributor): boolean {
  return (
    account.githubId === 0 ||
    (account.avatarUrl ?? '').includes(GITHUB_APP_AVATAR) ||
    /bot/i.test(account.contributorId)
  );
}

/**
 * 独立开发者判定（ADR-0017 决策 5 / 14）：**生效归属**为伪组织 `unattributed` 且**非机器人**。
 *
 * 归属到真组织 `personal`（Personal，`type=tsc`）的人是**已归属**，不算独立开发者。
 * 机器人只从**人物口径**排除，其 commits / PRs 等**量**仍计入生效归属桶（决策 11）。
 */
export function isIndependentDeveloper(view: Contributor & GithubEffectiveOrg): boolean {
  return view.effectiveOrgId === ORG_UNATTRIBUTED && !isBotAccount(view);
}

/** 空指标：全覆盖派生时未命中的组织记 0，而非跳过（否则恒等式不成立） */
function emptyGithubMetrics(): GithubMetrics {
  return { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0, repos: 0 };
}

/**
 * 组织级投影 = 账号级按**生效归属**求和（ADR-0017 决策 2 / 9 / 10 / 11）。
 *
 * 覆盖组织档案**全部**组织（含伪组织 `unattributed`），未命中记 0——于是
 * 「组织级各项 ≡ 账号级按生效归属求和」由**函数形状**保证，不依赖任何重算时机，
 * `lfn` 卡片不可能再出现「commits = 0 但 top3 有人」的自相矛盾。
 *
 * - 桶序 = 传入的组织档案顺序（已按 `displayOrder` 排好，ADR-0016），本函数**不二次排序**；
 * - `updatedAt` 取账号级**文件**的时间戳（`github-accounts.json` 记录级无 `updatedAt` 字段）；
 * - 机器人的量**计入**其生效归属桶，保证求和恒等式与历史快照可比；
 * - `repos` 是唯一的**非求和**字段：语义为「参与过的仓库去重数」，故取账号级 `repoIds` 的**并集大小**
 *   （决策 15）。求和会把跨账号共用的仓库重复计数（实测 `huawei` 13 → 51，而范围内仓库总数只有 13）。
 */
export function deriveOrganizationContributions(
  organizations: Organization[],
  views: ContributorView<ContributorContribution>[],
  updatedAt: string,
): OrganizationContribution[] {
  const sums = new Map<string, GithubMetrics>();
  const repoSets = new Map<string, Set<string>>();

  for (const view of views) {
    const bucket = sums.get(view.effectiveOrgId) ?? emptyGithubMetrics();
    bucket.pullRequests += view.github.pullRequests;
    bucket.commits += view.github.commits;
    bucket.issues += view.github.issues;
    bucket.linesChanged += view.github.linesChanged;
    sums.set(view.effectiveOrgId, bucket);

    const repos = repoSets.get(view.effectiveOrgId) ?? new Set<string>();
    for (const repoId of view.github.repoIds) repos.add(repoId);
    repoSets.set(view.effectiveOrgId, repos);
  }

  return organizations.map((org) => ({
    orgId: org.orgId,
    orgName: org.name,
    logoUrl: org.logoUrl,
    homepageUrl: org.homepageUrl,
    github: {
      ...(sums.get(org.orgId) ?? emptyGithubMetrics()),
      repos: repoSets.get(org.orgId)?.size ?? 0,
    },
    updatedAt,
  }));
}
