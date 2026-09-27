export interface ActivityParams {
  orgIds?: string[];
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
    ['contributions', { orgIds: params.orgIds ?? [], from: params.from ?? '', to: params.to ?? '' }] as const,
  contributionSummary: (params: ActivityParams) =>
    ['contributions', 'summary', { orgIds: params.orgIds ?? [], from: params.from ?? '', to: params.to ?? '' }] as const,
  insights: (params: ActivityParams) =>
    ['insights', { orgIds: params.orgIds ?? [], from: params.from ?? '', to: params.to ?? '' }] as const,
  contributorContributions: (params: ActivityParams) =>
    [
      'contributors',
      'contributions',
      { orgIds: params.orgIds ?? [], from: params.from ?? '', to: params.to ?? '' },
    ] as const,
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
