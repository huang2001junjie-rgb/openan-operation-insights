import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, apiGet, apiMutate } from '@/lib/api-client';
import { pushToast } from '@/lib/toast';
import type {
  ClaimDeleteResult,
  IdentityCandidate,
  IdentityCandidatesData,
  IdentityClaim,
  IdentitySource,
  OrgRosterData,
  Person,
  PersonDeleteResult,
  PersonListItem,
  PersonRef,
} from '@/types/contract';
import { IDENTITY_ROOT_KEY, IdentityPersonFilters, queryKeys } from './query-keys';

type CandidateSourceKey = 'github' | 'confluence' | 'meeting';

type QueryClient = ReturnType<typeof useQueryClient>;

// ── 查询 ────────────────────────────────────────────────────────────

export function useIdentityPersons(filters: IdentityPersonFilters = {}) {
  return useQuery({
    queryKey: queryKeys.identityPersons(filters),
    queryFn: ({ signal }) =>
      apiGet<PersonListItem[]>('/identity/persons', {
        params: { keyword: filters.keyword, orgId: filters.orgId },
        signal,
      }),
  });
}

export function useIdentityClaims() {
  return useQuery({
    queryKey: queryKeys.identityClaims,
    queryFn: ({ signal }) => apiGet<IdentityClaim[]>('/identity/claims', { signal }),
  });
}

export function useIdentityCandidates() {
  return useQuery({
    queryKey: queryKeys.identityCandidates,
    queryFn: ({ signal }) => apiGet<IdentityCandidatesData>('/identity/candidates', { signal }),
  });
}

export function useOrgRoster() {
  return useQuery({
    queryKey: queryKeys.identityRoster,
    queryFn: ({ signal }) => apiGet<OrgRosterData>('/identity/org-roster', { signal }),
  });
}

// ── 公共工具 ────────────────────────────────────────────────────────

function reportError(error: unknown, action: string): void {
  if (error instanceof ApiError && error.isAuthError) {
    pushToast({
      tone: 'error',
      title: '写操作未启用',
      description: '请在右上角配置有效的管理令牌后重试。',
    });
    return;
  }
  const message =
    error instanceof ApiError ? error.message : error instanceof Error ? error.message : '未知错误';
  pushToast({ tone: 'error', title: `${action}失败`, description: message });
}

function reportSuccess(title: string, description?: string): void {
  pushToast({ tone: 'success', title, description });
}

function invalidateIdentity(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: IDENTITY_ROOT_KEY });
}

function snapshotIdentity(queryClient: QueryClient) {
  return queryClient.getQueriesData({ queryKey: IDENTITY_ROOT_KEY });
}

function restoreIdentity(queryClient: QueryClient, snapshot: ReturnType<typeof snapshotIdentity>): void {
  for (const [key, value] of snapshot) queryClient.setQueryData(key, value);
}

function sortRefs(refs: PersonRef[]): PersonRef[] {
  return [...refs].sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hans-CN'));
}

/** 就地改写所有 persons 列表缓存中的 orgId */
function patchPersonsOrg(queryClient: QueryClient, personId: string, orgId: string | null): void {
  queryClient.setQueriesData<PersonListItem[]>({ queryKey: ['identity', 'persons'] }, (list) =>
    list?.map((item) => (item.personId === personId ? { ...item, orgId } : item)),
  );
}

/** 就地改写花名册缓存（组织↔开发者模式与归属下拉即时联动） */
function patchRosterOrg(queryClient: QueryClient, personId: string, orgId: string | null): void {
  queryClient.setQueryData<OrgRosterData>(queryKeys.identityRoster, (data) => {
    if (!data) return data;
    const ref = [...data.organizations.flatMap((entry) => entry.members), ...data.unassigned].find(
      (member) => member.personId === personId,
    );
    if (!ref) return data;

    const organizations = data.organizations.map((entry) => {
      const withoutPerson = entry.members.filter((member) => member.personId !== personId);
      const members =
        entry.organization.orgId === orgId ? sortRefs([...withoutPerson, ref]) : withoutPerson;
      return {
        ...entry,
        members,
        memberCount: members.length,
      };
    });

    const baseUnassigned = data.unassigned.filter((member) => member.personId !== personId);
    const unassigned = orgId === null ? sortRefs([...baseUnassigned, ref]) : baseUnassigned;
    return { ...data, organizations, unassigned };
  });
}

/** 就地改写候选池缓存中的 claimedBy */
function patchCandidateOwners(
  queryClient: QueryClient,
  source: IdentitySource,
  accountKey: string,
  updater: (owners: IdentityCandidate['claimedBy']) => IdentityCandidate['claimedBy'],
): void {
  queryClient.setQueryData<IdentityCandidatesData>(queryKeys.identityCandidates, (data) => {
    if (!data) return data;
    const key = source as CandidateSourceKey;
    const list = data[key];
    if (!list) return data;
    return {
      ...data,
      [key]: list.map((item) =>
        item.accountKey === accountKey ? { ...item, claimedBy: updater(item.claimedBy) } : item,
      ),
    };
  });
}

// ── 自然人增删改 ────────────────────────────────────────────────────

export function useCreatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) =>
      apiMutate<Person>('POST', '/identity/persons', { body: { displayName } }),
    onSuccess: (person) => reportSuccess('已创建自然人', person.displayName),
    onError: (error) => reportError(error, '创建自然人'),
    onSettled: () => invalidateIdentity(queryClient),
  });
}

export interface UpdatePersonVars {
  personId: string;
  displayName?: string;
  orgId?: string | null;
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, ...body }: UpdatePersonVars) =>
      apiMutate<Person>('PATCH', `/identity/persons/${encodeURIComponent(personId)}`, { body }),
    onMutate: async ({ personId, orgId, displayName }) => {
      await queryClient.cancelQueries({ queryKey: IDENTITY_ROOT_KEY });
      const snapshot = snapshotIdentity(queryClient);
      if (orgId !== undefined) {
        patchPersonsOrg(queryClient, personId, orgId);
        patchRosterOrg(queryClient, personId, orgId);
      }
      if (displayName !== undefined) {
        queryClient.setQueriesData<PersonListItem[]>({ queryKey: ['identity', 'persons'] }, (list) =>
          list?.map((item) => (item.personId === personId ? { ...item, displayName } : item)),
        );
      }
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      if (context) restoreIdentity(queryClient, context.snapshot);
      reportError(error, '更新自然人');
    },
    onSuccess: (_person, vars) =>
      reportSuccess(vars.orgId !== undefined ? '已更新归属' : '已重命名'),
    onSettled: () => invalidateIdentity(queryClient),
  });
}

export interface BulkAssignVars {
  personIds: string[];
  orgId: string;
}

/** 批量收纳：一次性提交多人归属，只弹一条汇总提示 */
export function useBulkAssignOrg() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ personIds, orgId }: BulkAssignVars) => {
      const results = await Promise.allSettled(
        personIds.map((personId) =>
          apiMutate<Person>('PATCH', `/identity/persons/${encodeURIComponent(personId)}`, {
            body: { orgId },
          }),
        ),
      );
      const failures = results.filter((result) => result.status === 'rejected');
      const firstError = failures[0]?.status === 'rejected' ? failures[0].reason : undefined;
      return { total: personIds.length, failed: failures.length, firstError };
    },
    onSuccess: ({ total, failed, firstError }) => {
      if (failed === 0) {
        reportSuccess(`已收纳 ${total} 人`);
        return;
      }
      const detail =
        firstError instanceof ApiError ? firstError.message : '部分请求未成功，请重试。';
      pushToast({ tone: 'error', title: `${failed}/${total} 人收纳失败`, description: detail });
    },
    onSettled: () => invalidateIdentity(queryClient),
  });
}

/** 物理删除（不可逆，仅限误建/重复提取；先解除其全部认领边再删除本体） */
export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (personId: string) =>
      apiMutate<PersonDeleteResult>('DELETE', `/identity/persons/${encodeURIComponent(personId)}`),
    onSuccess: (result) =>
      reportSuccess(
        '已物理删除自然人',
        result.removedClaims > 0 ? `同时解除 ${result.removedClaims} 条认领` : undefined,
      ),
    onError: (error) => reportError(error, '删除自然人'),
    onSettled: () => invalidateIdentity(queryClient),
  });
}

// ── 认领 / 解除 ─────────────────────────────────────────────────────

export interface CreateClaimVars {
  personId: string;
  personDisplayName: string;
  source: IdentitySource;
  accountKey: string;
  displayName?: string;
}

export function useCreateClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, source, accountKey, displayName }: CreateClaimVars) =>
      apiMutate<IdentityClaim>('POST', '/identity/claims', {
        body: { personId, source, accountKey, displayName },
      }),
    onMutate: async ({ personId, personDisplayName, source, accountKey }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.identityCandidates });
      const snapshot = snapshotIdentity(queryClient);
      patchCandidateOwners(queryClient, source, accountKey, (owners) =>
        owners.some((owner) => owner.personId === personId)
          ? owners
          : [...owners, { personId, displayName: personDisplayName }],
      );
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      if (context) restoreIdentity(queryClient, context.snapshot);
      reportError(error, '认领账号');
    },
    onSuccess: (_claim, vars) => reportSuccess('已认领账号', vars.displayName ?? vars.accountKey),
    onSettled: () => invalidateIdentity(queryClient),
  });
}

export function useDeleteClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (claimId: string) =>
      apiMutate<ClaimDeleteResult>('DELETE', `/identity/claims/${encodeURIComponent(claimId)}`),
    onSuccess: () => reportSuccess('已解除认领'),
    onError: (error) => reportError(error, '解除认领'),
    onSettled: () => invalidateIdentity(queryClient),
  });
}
