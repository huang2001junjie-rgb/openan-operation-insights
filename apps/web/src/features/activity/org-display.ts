import type { Organization } from '@/types/contract';

/** 独立开发者伪组织 orgId（与后端 effective-org / organizations.json 一致） */
export const ORG_UNATTRIBUTED = 'unattributed';

/**
 * 社区活跃度页对伪组织的展示名：用 individual 代替档案里的「独立开发者」。
 * 仅是本页的展示口径——组织档案、首页卡片墙、身份控制台等仍用档案原名。
 */
export const UNATTRIBUTED_LABEL = 'individual';

/** 组织档案的展示视图：伪组织名称替换为 individual（浅拷贝，不改动源数据） */
export function toDisplayOrganizations(organizations: Organization[]): Organization[] {
  return organizations.map((org) =>
    org.orgId === ORG_UNATTRIBUTED ? { ...org, name: UNATTRIBUTED_LABEL } : org,
  );
}

/** 贡献 / 成果列表（`orgName` 字段）的展示视图：伪组织同样替换为 individual */
export function toDisplayOrgNamedList<T extends { orgId: string; orgName: string }>(items: T[]): T[] {
  return items.map((item) =>
    item.orgId === ORG_UNATTRIBUTED ? { ...item, orgName: UNATTRIBUTED_LABEL } : item,
  );
}

/**
 * 伪组织无 Logo，Avatar 降级徽标不取首字母（I），直接展示完整单词 individual；
 * 其余组织返回 undefined，沿用姓名首字母降级。
 */
export function orgBadgeFallback(orgId: string): string | undefined {
  return orgId === ORG_UNATTRIBUTED ? UNATTRIBUTED_LABEL : undefined;
}
