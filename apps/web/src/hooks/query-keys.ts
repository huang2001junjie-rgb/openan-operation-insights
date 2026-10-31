export interface ActivityParams {
  orgIds?: string[];
  /** 仓库组合筛选（owner/repo 全名）；缺省/空 ≡ 全选（不过滤） */
  repoIds?: string[];
  from?: string;
  to?: string;
}

export interface IdentityPersonFilters {
  keyword?: string;
  orgId?: string;
}

export const queryKeys = {
  home: ['home', 'summary'] as const,
  organizations: (scope?: string, type?: string, keyword?: string) =>
    ['organizations', { scope: scope ?? 'all', type: type ?? 'all', keyword: keyword ?? '' }] as const,
  contributions: (params: ActivityParams) =>
    ['contributions', { orgIds: params.orgIds ?? [], repoIds: params.repoIds ?? [], from: params.from ?? '', to: params.to ?? '' }] as const,
  contributionSummary: (params: ActivityParams) =>
    ['contributions', 'summary', { orgIds: params.orgIds ?? [], repoIds: params.repoIds ?? [], from: params.from ?? '', to: params.to ?? '' }] as const,
  wiki: (params: ActivityParams) =>
    ['wiki', { orgIds: params.orgIds ?? [], from: params.from ?? '', to: params.to ?? '' }] as const,
  confluenceAccounts: (params: ActivityParams) =>
    ['confluence-accounts', { orgIds: params.orgIds ?? [], from: params.from ?? '', to: params.to ?? '' }] as const,
  contributorContributions: (params: ActivityParams) =>
    [
      'contributors',
      'contributions',
      { orgIds: params.orgIds ?? [], repoIds: params.repoIds ?? [], from: params.from ?? '', to: params.to ?? '' },
    ] as const,
  /**
   * 仓库维度贡献明细：行指标不随 `repoIds` 变化（选仓库只是挑行，前端客户端过滤），
   * 但**随区间变化**（ADR-0018 决策 6）——否则同页出现「组织表按区间 / 仓库表全历史」两套口径，
   * 恒等式「仓库级求和 ≡ 组织级」也会被破坏，故 from/to 必须进 key。
   */
  repoContributions: (params: Pick<ActivityParams, 'from' | 'to'> = {}) =>
    ['repo-contributions', { from: params.from ?? '', to: params.to ?? '' }] as const,
  summits: (year?: number, includeDetail?: boolean, page?: number, pageSize?: number) =>
    ['summits', { year: year ?? null, includeDetail: includeDetail ?? false, page: page ?? 1, pageSize: pageSize ?? 20 }] as const,
  summitDetail: (id: string) => ['summits', 'detail', id] as const,
  meetings: ['meetings'] as const,

  // 身份匹配控制台：所有写操作统一失效 identity 前缀，保证双模式即时联动
  identityPersons: (filters: IdentityPersonFilters = {}) =>
    ['identity', 'persons', { keyword: filters.keyword ?? '', orgId: filters.orgId ?? '' }] as const,
  identityClaims: ['identity', 'claims'] as const,
  identityCandidates: ['identity', 'candidates'] as const,
  identityRoster: ['identity', 'org-roster'] as const,
};

/** 身份匹配相关查询的统一前缀，用于写操作后失效（保证两模式共享归属即时同步） */
export const IDENTITY_ROOT_KEY = ['identity'] as const;
