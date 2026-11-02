import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api-client';
import { queryKeys } from './query-keys';
import type { RepoReleasesData } from '../types/contract';

/** 版本发布页汇总（ADR-0019）：近实时看板口径 */
export function useRepoReleases() {
  return useQuery({
    queryKey: queryKeys.repoReleases,
    queryFn: () => apiGet<RepoReleasesData>('/repo-releases'),
    staleTime: 10 * 60 * 1000,
  });
}
