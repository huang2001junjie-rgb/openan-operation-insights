import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import { queryKeys, type ActivityParams } from './query-keys';
import type {
  ConfluenceAccountView,
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
export function useContributions(params: ActivityParams = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.contributions(params),
    queryFn: ({ signal }) =>
      apiGet<OrganizationContribution[]>('/contributions', {
        params: { ...toParams(params), sortBy: 'pullRequests', order: 'desc' },
        signal,
      }),
    placeholderData: (previous) => previous,
    enabled,
  });
}

/** 组织级 Confluence 成果（生效归属，ADR-0010）：GitHub / Confluence 两套视图共用 */
export function useWiki(params: ActivityParams = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.wiki(params),
    queryFn: ({ signal }) =>
      apiGet<OrganizationWiki[]>('/wiki', {
        params: { ...toParams(params), sortBy: 'requirements', order: 'desc' },
        signal,
      }),
    placeholderData: (previous) => previous,
    enabled,
  });
}

/**
 * 账号级 Confluence 明细（含生效归属，见 04 文档 5.3.16 / ADR-0010）：
 * 供 Confluence 视图的账号榜与「未归属」提示使用。
 */
export function useConfluenceAccounts(params: ActivityParams = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.confluenceAccounts(params),
    queryFn: ({ signal }) =>
      apiGet<ConfluenceAccountView[]>('/confluence-accounts', {
        params: { ...toParams(params), sortBy: 'requirements', order: 'desc' },
        signal,
      }),
    placeholderData: (previous) => previous,
    enabled,
  });
}

/** 个人维度 GitHub 贡献榜：仅返回带采集指标的个人（含独立开发者，见 04 文档 5.3.8） */
export function useContributorContributions(params: ActivityParams = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.contributorContributions(params),
    queryFn: ({ signal }) =>
      apiGet<ContributorContribution[]>('/contributor-contributions', {
        params: { ...toParams(params), sortBy: 'commits', order: 'desc' },
        signal,
      }),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useContributionSummary(params: ActivityParams = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.contributionSummary(params),
    queryFn: ({ signal }) =>
      apiGet<ContributionSummaryData>('/contributions/summary', {
        params: toParams(params),
        signal,
      }),
    placeholderData: (previous) => previous,
    enabled,
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
