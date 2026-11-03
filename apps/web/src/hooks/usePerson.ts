import { useQuery } from '@tanstack/react-query';
import type {
  PersonCandidatesData,
  PersonConfluenceRequirementsData,
  PersonContributionsData,
  PersonGithubEventsData,
} from '@/types/contract';
import { apiGet } from '@/lib/api-client';
import {
  queryKeys,
  type PersonConfluenceRequirementsParams,
  type PersonContributionsParams,
  type PersonGithubEventsParams,
} from './query-keys';

/** 丢弃 undefined/null 与空串后拼 query string（空值参数不得出现在 URL 里） */
function withParams(base: string, params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * 个人模式候选池（选择器数据源）。口径为「有任一来源贡献」，
 * 由 `person-candidates` 读时派生；候选集与区间无关（GitHub 侧按全历史判定）。
 */
export function usePersonCandidates() {
  return useQuery({
    queryKey: queryKeys.personCandidates,
    queryFn: () => apiGet<PersonCandidatesData>('/person-candidates'),
    staleTime: 5 * 60_000,
  });
}

/** 自然人统一画像（`/person-contributions`）：双来源指标、仓库并集、名下账号分解 */
export function usePersonContributions(params: PersonContributionsParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.personContributions(params),
    queryFn: () =>
      apiGet<PersonContributionsData>(withParams('/person-contributions', { personId: params.personId, from: params.from, to: params.to })),
    enabled,
  });
}

/** GitHub 事件明细（`/person-github-events`）：半开区间 [from, to)，limit 仅截断展示 */
export function usePersonGithubEvents(params: PersonGithubEventsParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.personGithubEvents(params),
    queryFn: () =>
      apiGet<PersonGithubEventsData>(
        withParams('/person-github-events', {
          personId: params.personId,
          account: params.account,
          from: params.from,
          to: params.to,
          limit: params.limit,
        }),
      ),
    enabled,
  });
}

/** Confluence 需求级事实明细（`/person-confluence-requirements`）：恒全历史，无区间参数 */
export function usePersonConfluenceRequirements(params: PersonConfluenceRequirementsParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.personConfluenceRequirements(params),
    queryFn: () =>
      apiGet<PersonConfluenceRequirementsData>(
        withParams('/person-confluence-requirements', { personId: params.personId, account: params.account }),
      ),
    enabled,
  });
}
