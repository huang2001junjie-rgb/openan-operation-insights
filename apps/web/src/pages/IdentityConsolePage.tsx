import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/layout/PageHeading';
import { IconKey } from '@/components/icons';
import { cn } from '@/lib/cn';
import { useAdminToken } from '@/lib/admin-token';
import { pushToast } from '@/lib/toast';
import {
  useBulkAssignOrg,
  useCreateClaim,
  useCreatePerson,
  useDeleteClaim,
  useDeletePerson,
  useIdentityCandidates,
  useIdentityClaims,
  useIdentityPersons,
  useOrgRoster,
  useUpdatePerson,
} from '@/hooks/useIdentity';
import type { IdentityCandidate, IdentityClaim, PersonListItem } from '@/types/contract';
import { AdminTokenDialog } from '@/features/identity/AdminTokenDialog';
import { CandidatePool } from '@/features/identity/CandidatePool';
import { IdentityModeSwitch, type IdentityMode } from '@/features/identity/IdentityModeSwitch';
import { OrgConflictDialog } from '@/features/identity/OrgConflictDialog';
import { OrgMemberPanel } from '@/features/identity/OrgMemberPanel';
import { OrganizationRosterPanel } from '@/features/identity/OrganizationRosterPanel';
import { PersonDetailDrawer } from '@/features/identity/PersonDetailDrawer';
import { PersonRoster } from '@/features/identity/PersonRoster';

/** /admin/identity —— 身份匹配控制台（组织↔开发者 / 自然人↔账号 双模式） */
export function IdentityConsolePage() {
  const [mode, setMode] = useState<IdentityMode>('person');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  /** 认领目标：候选池「认领」动作的唯一对象（与详情抽屉是两个独立状态，见 ADR-0006） */
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  /** 详情抽屉：仅由列表行内「详情」按钮打开，开关不影响认领目标 */
  const [detailPersonId, setDetailPersonId] = useState<string | null>(null);
  const [tokenOpen, setTokenOpen] = useState(false);

  // 自然人模式筛选
  const [personKeyword, setPersonKeyword] = useState('');
  const [personOrgFilter, setPersonOrgFilter] = useState('');

  const token = useAdminToken();

  const roster = useOrgRoster();
  const personsAll = useIdentityPersons();
  const personsFiltered = useIdentityPersons({
    keyword: personKeyword,
    orgId: personOrgFilter,
  });
  const claims = useIdentityClaims();
  const candidates = useIdentityCandidates();

  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const bulkAssign = useBulkAssignOrg();
  const createClaim = useCreateClaim();
  const deleteClaim = useDeleteClaim();

  const isMutating =
    createPerson.isPending ||
    updatePerson.isPending ||
    deletePerson.isPending ||
    bulkAssign.isPending ||
    createClaim.isPending ||
    deleteClaim.isPending;

  const entries = roster.data?.organizations ?? [];

  // 默认选中第一个组织
  useEffect(() => {
    if (selectedOrgId === null && entries.length > 0) {
      setSelectedOrgId(entries[0].organization.orgId);
    }
  }, [entries, selectedOrgId]);

  // 新建即选中（决策见 ADR-0006）：新自然人直接成为认领目标，省去「建完再回列表找一遍」
  useEffect(() => {
    if (createPerson.data) setSelectedPersonId(createPerson.data.personId);
  }, [createPerson.data]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.organization.orgId === selectedOrgId),
    [entries, selectedOrgId],
  );

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) map.set(entry.organization.orgId, entry.organization.name);
    return map;
  }, [entries]);

  const orgOptions = useMemo(
    () => entries.map((entry) => ({ orgId: entry.organization.orgId, name: entry.organization.name })),
    [entries],
  );

  const claimsByKey = useMemo(() => {
    const map = new Map<string, IdentityClaim[]>();
    for (const claim of claims.data ?? []) {
      const key = `${claim.source}:${claim.accountKey}`;
      const list = map.get(key) ?? [];
      list.push(claim);
      map.set(key, list);
    }
    return map;
  }, [claims.data]);

  const candidateIndex = useMemo(() => {
    const map = new Map<string, IdentityCandidate>();
    const data = candidates.data;
    if (!data) return map;
    for (const list of [data.github, data.confluence, data.meeting]) {
      for (const item of list) map.set(`${item.source}:${item.accountKey}`, item);
    }
    return map;
  }, [candidates.data]);

  // 已加载的自然人全集：筛选结果与全集合并，使被筛掉的选中项仍能解析出对象
  const personPool = useMemo(
    () => [...(personsFiltered.data ?? []), ...(personsAll.data ?? [])],
    [personsFiltered.data, personsAll.data],
  );

  /** 认领目标对象：左栏选中项，不随详情抽屉开关变化 */
  const selectedPerson = useMemo(
    () => personPool.find((person) => person.personId === selectedPersonId) ?? null,
    [personPool, selectedPersonId],
  );

  /** 详情对象：与认领目标相互独立 */
  const detailPerson = useMemo(
    () => personPool.find((person) => person.personId === detailPersonId) ?? null,
    [personPool, detailPersonId],
  );

  const detailPersonClaims = useMemo(
    () => (claims.data ?? []).filter((claim) => claim.personId === detailPersonId),
    [claims.data, detailPersonId],
  );

  const targetPerson = selectedPerson
    ? { personId: selectedPerson.personId, displayName: selectedPerson.displayName }
    : null;

  /** 归属冲突待确认：候选的采集归属与认领目标不一致时先弹窗（ADR-0014），确认后继续认领 */
  const [orgConflict, setOrgConflict] = useState<{
    candidate: IdentityCandidate;
    person: PersonListItem;
  } | null>(null);

  const runClaim = (candidate: IdentityCandidate, person: PersonListItem) => {
    createClaim.mutate({
      personId: person.personId,
      personDisplayName: person.displayName,
      personOrgId: person.orgId,
      personOrgName: person.orgId ? (orgNameById.get(person.orgId) ?? person.orgId) : null,
      source: candidate.source,
      accountKey: candidate.accountKey,
      displayName: candidate.displayName,
    });
  };

  const handleClaim = (candidate: IdentityCandidate) => {
    if (!selectedPerson) return;
    // 冲突判定（ADR-0014）：meeting 无采集归属、候选无采集归属时均无可比对象，直接放行
    const accountOrgId = candidate.source === 'meeting' ? null : candidate.orgId;
    if (accountOrgId && accountOrgId !== selectedPerson.orgId) {
      setOrgConflict({ candidate, person: selectedPerson });
      return;
    }
    runClaim(candidate, selectedPerson);
  };

  /** 「认领并归属到该组织」：先认领，认领成功后再改自然人归属（认领被拒则不动归属，避免半成品状态） */
  const handleClaimAndAssign = () => {
    if (!orgConflict || orgConflict.candidate.source === 'meeting') return;
    const { candidate, person } = orgConflict;
    const orgId = candidate.orgId;
    setOrgConflict(null);
    if (!orgId) return;
    createClaim.mutate(
      {
        personId: person.personId,
        personDisplayName: person.displayName,
        personOrgId: person.orgId,
        personOrgName: person.orgId ? (orgNameById.get(person.orgId) ?? person.orgId) : null,
        source: candidate.source,
        accountKey: candidate.accountKey,
        displayName: candidate.displayName,
      },
      { onSuccess: () => updatePerson.mutate({ personId: person.personId, orgId }) },
    );
  };

  /** 抽屉内的物理删除：关闭抽屉，并在删掉的正是当前认领目标时同步归零 */
  const handleDeletePerson = () => {
    if (!detailPerson) return;
    const { personId } = detailPerson;
    deletePerson.mutate(personId);
    setDetailPersonId(null);
    setSelectedPersonId((current) => (current === personId ? null : current));
  };

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="身份匹配"
        title="身份匹配控制台"
        description="以自然人为最基本单位，把 GitHub / Confluence / 例会人名认领到同一自然人，并把开发者收纳进组织档案。两个模式共享同一份归属数据，变更即时落盘。"
        actions={
          <button
            type="button"
            onClick={() => setTokenOpen(true)}
            className="chip-interactive"
            aria-label="管理令牌"
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                token ? 'bg-accent-400 shadow-[0_0_0_3px_rgba(27,196,172,0.18)]' : 'bg-slate-500',
              )}
            />
            <IconKey width={14} height={14} />
            {token ? '令牌已启用' : '配置令牌'}
          </button>
        }
        meta={
          <IdentityModeSwitch
            mode={mode}
            onChange={setMode}
            orgCount={roster.isSuccess ? entries.length : null}
            personCount={personsAll.isSuccess ? (personsAll.data?.length ?? 0) : null}
          />
        }
      />

      {mode === 'org' ? (
        <div className="grid gap-4 lg:h-[calc(100vh-17rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
          <OrganizationRosterPanel
            entries={entries}
            selectedOrgId={selectedOrgId}
            onSelect={setSelectedOrgId}
            isLoading={roster.isLoading}
            isError={roster.isError}
            error={roster.error}
            onRetry={() => roster.refetch()}
          />
          <OrgMemberPanel
            entry={selectedEntry}
            persons={personsAll.data ?? []}
            orgNameById={orgNameById}
            isLoading={personsAll.isLoading}
            isError={personsAll.isError}
            error={personsAll.error}
            onRetry={() => personsAll.refetch()}
            onAssign={(personId) => selectedOrgId && updatePerson.mutate({ personId, orgId: selectedOrgId })}
            onRemove={(personId) => updatePerson.mutate({ personId, orgId: null })}
            onBulkAssign={(personIds) =>
              selectedOrgId && bulkAssign.mutate({ personIds, orgId: selectedOrgId })
            }
            isMutating={isMutating}
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:h-[calc(100vh-17rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
          <PersonRoster
            persons={personsFiltered.data ?? []}
            totalCount={personsAll.isSuccess ? (personsAll.data?.length ?? 0) : null}
            selectedPersonId={selectedPersonId}
            onSelect={setSelectedPersonId}
            onOpenDetail={setDetailPersonId}
            keyword={personKeyword}
            onKeywordChange={setPersonKeyword}
            orgFilter={personOrgFilter}
            onOrgFilterChange={setPersonOrgFilter}
            orgOptions={orgOptions}
            orgNameById={orgNameById}
            isLoading={personsFiltered.isLoading}
            isError={personsFiltered.isError}
            error={personsFiltered.error}
            onRetry={() => personsFiltered.refetch()}
            onCreate={async (displayName) => {
              // 未配置令牌时写接口必然被拒（40101）：直接开令牌弹窗并把原因说清楚，
              // 不让用户对着「点了没反应」的新建按钮猜
              if (!token) {
                setTokenOpen(true);
                pushToast({
                  tone: 'error',
                  title: '写操作未启用',
                  description: '请先填入管理令牌，再重新点击「新建」。',
                });
                throw new Error('admin-token-missing');
              }
              return createPerson.mutateAsync(displayName);
            }}
            isCreating={createPerson.isPending}
          />
          <CandidatePool
            data={candidates.data}
            isLoading={candidates.isLoading}
            isError={candidates.isError}
            error={candidates.error}
            onRetry={() => candidates.refetch()}
            targetPerson={targetPerson}
            claimsByKey={claimsByKey}
            onClaim={handleClaim}
            onUnclaim={(claimId) => deleteClaim.mutate(claimId)}
            isMutating={isMutating}
          />
        </div>
      )}

      <PersonDetailDrawer
        open={Boolean(detailPerson)}
        person={detailPerson}
        orgOptions={orgOptions}
        claims={detailPersonClaims}
        candidateIndex={candidateIndex}
        onClose={() => setDetailPersonId(null)}
        onRename={(displayName) =>
          detailPerson && updatePerson.mutate({ personId: detailPerson.personId, displayName })
        }
        onAssignOrg={(orgId) =>
          detailPerson && updatePerson.mutate({ personId: detailPerson.personId, orgId })
        }
        onDeletePerson={handleDeletePerson}
        onUnclaim={(claimId) => deleteClaim.mutate(claimId)}
        isMutating={isMutating}
      />

      <OrgConflictDialog
        open={Boolean(orgConflict)}
        accountLabel={
          orgConflict ? orgConflict.candidate.displayName || orgConflict.candidate.accountKey : ''
        }
        accountOrgName={
          orgConflict && orgConflict.candidate.source !== 'meeting'
            ? (orgConflict.candidate.orgName ?? orgConflict.candidate.orgId ?? '')
            : ''
        }
        personName={orgConflict?.person.displayName ?? ''}
        personOrgName={
          orgConflict?.person.orgId
            ? (orgNameById.get(orgConflict.person.orgId) ?? orgConflict.person.orgId)
            : null
        }
        isMutating={isMutating}
        onCancel={() => setOrgConflict(null)}
        onClaimOnly={() => {
          if (!orgConflict) return;
          const { candidate, person } = orgConflict;
          setOrgConflict(null);
          runClaim(candidate, person);
        }}
        onClaimAndAssign={handleClaimAndAssign}
      />

      <AdminTokenDialog open={tokenOpen} onClose={() => setTokenOpen(false)} />
    </div>
  );
}
