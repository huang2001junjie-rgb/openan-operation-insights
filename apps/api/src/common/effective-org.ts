import {
  ConfluenceAccount,
  ConfluenceAccountView,
  ConfluenceEffectiveOrgSource,
  ConfluenceMetrics,
  IdentityClaim,
  Organization,
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
    const bucket = counts.get(view.effectiveOrgId) ?? { requirements: 0, topicShares: 0 };
    bucket.requirements += view.confluence.requirements;
    bucket.topicShares += view.confluence.topicShares;
    counts.set(view.effectiveOrgId, bucket);
  }

  return organizations.map((org) => {
    const metrics = counts.get(org.orgId) ?? { requirements: 0, topicShares: 0 };
    return {
      orgId: org.orgId,
      orgName: org.name,
      logoUrl: org.logoUrl,
      confluence: { requirements: metrics.requirements, topicShares: metrics.topicShares },
      updatedAt,
    };
  });
}
