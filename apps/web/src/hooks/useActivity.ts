import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import { queryKeys, type ActivityParams } from './query-keys';
import type {
  ContributionSummaryData,
  ContributorContribution,
  Organization,
  OrganizationContribution,
  OrganizationWiki,
} from '@/types/contract';

const toParams = (params: ActivityParams) => ({
  orgIds: params.orgIds,
  from: params.from,
  to: params.to,
});

/**
 * 三个请求各自独立发起、独立处理错误（见 02 文档 6.2），
 * 任一失败不影响其余区块渲染。
 */
export function useContributions(params: ActivityParams = {}) {
  return useQuery({
    queryKey: queryKeys.contributions(params),
    queryFn: ({ signal }) =>
      apiGet<OrganizationContribution[]>('/contributions', {
        params: { ...toParams(params), sortBy: 'pullRequests', order: 'desc' },
        signal,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useWiki(params: ActivityParams = {}) {
  return useQuery({
    queryKey: queryKeys.wiki(params),
    queryFn: ({ signal }) =>
      apiGet<OrganizationWiki[]>('/wiki', {
        params: { ...toParams(params), sortBy: 'requirements', order: 'desc' },
        signal,
      }),
    placeholderData: (previous) => previous,
  });
}

/** 个人维度 GitHub 贡献榜：仅返回带采集指标的个人（含独立开发者，见 04 文档 5.3.8） */
export function useContributorContributions(params: ActivityParams = {}) {
  return useQuery({
    queryKey: queryKeys.contributorContributions(params),
    queryFn: ({ signal }) =>
      apiGet<ContributorContribution[]>('/contributor-contributions', {
        params: { ...toParams(params), sortBy: 'commits', order: 'desc' },
        signal,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useContributionSummary(params: ActivityParams = {}) {
  return useQuery({
    queryKey: queryKeys.contributionSummary(params),
    queryFn: ({ signal }) =>
      apiGet<ContributionSummaryData>('/contributions/summary', {
        params: toParams(params),
        signal,
      }),
    placeholderData: (previous) => previous,
  });
}

/** 供筛选下拉使用的组织清单（全量档案） */
export function useOrganizationOptions() {
  return useQuery({
    queryKey: queryKeys.organizations('all'),
    queryFn: ({ signal }) => apiGet<Organization[]>('/organizations', { signal }),
    staleTime: 10 * 60_000,
  });
}
