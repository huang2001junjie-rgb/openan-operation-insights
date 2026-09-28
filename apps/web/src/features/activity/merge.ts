import type { Organization, OrganizationContribution, OrganizationWiki } from '@/types/contract';

/** 明细表行：组织档案为底表，GitHub 与 Confluence 两个数据源按 orgId 连接后的结果 */
export interface ActivityRow {
  orgId: string;
  orgName: string;
  logoUrl: string;
  homepageUrl: string;
  pullRequests: number;
  commits: number;
  issues: number;
  linesChanged: number;
  repos: number;
  requirements: number;
  bestPractices: number;
  updatedAt: string;
}

/**
 * 以组织档案为底表合并贡献数据（ADR-0002）：
 * - 档案中每个组织各占一行，无贡献记录时指标按 0、更新时间为空（表格显示「—」）
 * - 展示字段（名称 / Logo / 官网）以档案为准，贡献记录仅提供指标数值
 * - 档案为空（未加载或加载失败）时退回两源合并的旧行为
 * - 贡献记录中 orgId 不在档案内的行照旧保留，避免数据漂移被静默吞掉
 */
export function mergeActivityRows(
  contributions: OrganizationContribution[],
  wiki: OrganizationWiki[],
  organizations: Organization[] = [],
): ActivityRow[] {
  const rows = new Map<string, ActivityRow>();

  for (const org of organizations) {
    rows.set(org.orgId, {
      orgId: org.orgId,
      orgName: org.name,
      logoUrl: org.logoUrl,
      homepageUrl: org.homepageUrl,
      pullRequests: 0,
      commits: 0,
      issues: 0,
      linesChanged: 0,
      repos: 0,
      requirements: 0,
      bestPractices: 0,
      updatedAt: '',
    });
  }

  for (const item of contributions) {
    const existing = rows.get(item.orgId);
    if (existing) {
      existing.pullRequests = item.github.pullRequests;
      existing.commits = item.github.commits ?? 0;
      existing.issues = item.github.issues;
      existing.linesChanged = item.github.linesChanged;
      existing.repos = item.github.repos;
      existing.updatedAt = item.updatedAt;
    } else {
      rows.set(item.orgId, {
        orgId: item.orgId,
        orgName: item.orgName,
        logoUrl: item.logoUrl,
        homepageUrl: item.homepageUrl,
        pullRequests: item.github.pullRequests,
        commits: item.github.commits ?? 0,
        issues: item.github.issues,
        linesChanged: item.github.linesChanged,
        repos: item.github.repos,
        requirements: 0,
        bestPractices: 0,
        updatedAt: item.updatedAt,
      });
    }
  }

  for (const item of wiki) {
    const existing = rows.get(item.orgId);
    if (existing) {
      existing.requirements = item.confluence.requirements;
      existing.bestPractices = item.confluence.bestPractices;
      if (!existing.updatedAt || Date.parse(item.updatedAt) > Date.parse(existing.updatedAt)) {
        existing.updatedAt = item.updatedAt;
      }
    } else {
      // 仅有 Confluence 成果、暂无代码贡献的组织也要出现在表中
      rows.set(item.orgId, {
        orgId: item.orgId,
        orgName: item.orgName,
        logoUrl: item.logoUrl,
        homepageUrl: '',
        pullRequests: 0,
        commits: 0,
        issues: 0,
        linesChanged: 0,
        repos: 0,
        requirements: item.confluence.requirements,
        bestPractices: item.confluence.bestPractices,
        updatedAt: item.updatedAt,
      });
    }
  }

  return [...rows.values()];
}

export type SortKey =
  | 'orgName'
  | 'pullRequests'
  | 'commits'
  | 'issues'
  | 'linesChanged'
  | 'requirements'
  | 'bestPractices';

export function sortRows(rows: ActivityRow[], key: SortKey, direction: 'asc' | 'desc'): ActivityRow[] {
  const factor = direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (key === 'orgName') {
      return a.orgName.localeCompare(b.orgName, 'zh-Hans-CN') * factor;
    }
    return (a[key] - b[key]) * factor;
  });
}
