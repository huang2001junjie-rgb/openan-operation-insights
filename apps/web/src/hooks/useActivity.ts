import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api-client';
import { queryKeys, type ActivityParams } from './query-keys';
import type {
  ConfluenceAccountView,
  ContributionSummaryData,
  ContributorContributionView,
  Organization,
  OrganizationContribution,
  OrganizationWiki,
  RepoContribution,
} from '@/types/contract';

const toParams = (params: ActivityParams) => ({
  orgIds: params.orgIds,
  repoIds: params.repoIds,
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

/**
 * 个人维度 GitHub 贡献榜（含**生效归属**，04 文档 5.3.8 / ADR-0017）：
 * 仅返回带采集指标的**真人**——机器账号（如 `dependabot`）由 API 排除，
 * 未归属者即独立开发者（生效归属为伪组织 `unattributed`）。
 */
export function useContributorContributions(params: ActivityParams = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.contributorContributions(params),
    queryFn: ({ signal }) =>
      apiGet<ContributorContributionView[]>('/contributor-contributions', {
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

/**
 * 仓库维度贡献明细（D1：由 github-events.json 读时派生），默认按 commits 降序。
 *
 * - **不接受 repoIds**：选仓库只是挑行，由前端客户端过滤（`filterRepoRows`）；
 * - **接受 from/to**（ADR-0018 决策 6）：与组织级 / 账号级同区间，恒等式「仓库级求和 ≡ 组织级」
 *   才成立；区间内无事件的仓库不出行，故筛选候选随区间收缩（已选但区间内无活动的仓库
 *   由页面标为「区间内无活动」，不静默消失）。
 */
export function useRepoContributions(params: Pick<ActivityParams, 'from' | 'to'> = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.repoContributions(params),
    queryFn: ({ signal }) =>
      apiGet<RepoContribution[]>('/repo-contributions', {
        params: { sortBy: 'commits', order: 'desc', from: params.from, to: params.to },
        signal,
      }),
    placeholderData: (previous) => previous,
    staleTime: 10 * 60_000,
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
