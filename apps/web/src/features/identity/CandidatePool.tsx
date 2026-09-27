import { useMemo, useState } from 'react';
import { SearchInput } from '@/components/ui/Field';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { IconAlert, IconChevronDown, IconInfo, IconUserPlus } from '@/components/icons';
import { cn } from '@/lib/cn';
import type { IdentityCandidate, IdentityCandidatesData, IdentityClaim } from '@/types/contract';
import type { ClaimTarget } from './ClaimRow';
import { ClaimRow } from './ClaimRow';
import { SourceBadge } from './SourceBadge';

type GroupKey = 'github' | 'confluence' | 'meeting';

const GROUPS: Array<{ key: GroupKey; emptyLabel: string }> = [
  { key: 'github', emptyLabel: 'GitHub 账户取自贡献者档案，当前为空。' },
  { key: 'confluence', emptyLabel: '当前来源暂无数据（待接入账号级采集）。' },
  { key: 'meeting', emptyLabel: '例会人名取自参会矩阵表头，当前为空。' },
];

export interface CandidatePoolProps {
  data?: IdentityCandidatesData;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  targetPerson: ClaimTarget | null;
  claimsByKey: Map<string, IdentityClaim[]>;
  onClaim: (candidate: IdentityCandidate) => void;
  onUnclaim: (claimId: string) => void;
  isMutating: boolean;
}

/** 自然人模式 · 右栏：按来源分组的候选池，未认领聚合为「待认领」 */
export function CandidatePool({
  data,
  isLoading,
  isError,
  error,
  onRetry,
  targetPerson,
  claimsByKey,
  onClaim,
  onUnclaim,
  isMutating,
}: CandidatePoolProps) {
  const [keyword, setKeyword] = useState('');
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(new Set());

  const needle = keyword.trim().toLowerCase();

  const grouped = useMemo(() => {
    const result = new Map<GroupKey, { claimed: IdentityCandidate[]; pending: IdentityCandidate[] }>();
    for (const group of GROUPS) {
      const list = data?.[group.key] ?? [];
      const filtered = needle
        ? list.filter(
            (item) =>
              item.displayName.toLowerCase().includes(needle) || item.accountKey.toLowerCase().includes(needle),
          )
        : list;
      result.set(group.key, {
        claimed: filtered.filter((item) => item.claimedBy.length > 0),
        pending: filtered.filter((item) => item.claimedBy.length === 0),
      });
    }
    return result;
  }, [data, needle]);

  const toggleCollapse = (key: GroupKey) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const totalPending = useMemo(
    () => GROUPS.reduce((sum, group) => sum + (grouped.get(group.key)?.pending.length ?? 0), 0),
    [grouped],
  );

  return (
    <section className="glass-card flex min-h-0 flex-col p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[0.95rem] font-semibold text-white">候选账号池</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            待认领 <span className="numeric text-accent-300">{totalPending}</span> 项 · 派生自既有数据
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
            targetPerson
              ? 'border-accent-400/30 bg-accent-500/10 text-accent-300'
              : 'border-amber-400/30 bg-amber-500/10 text-amber-200',
          )}
        >
          <IconUserPlus width={13} height={13} />
          {targetPerson ? `认领目标：${targetPerson.displayName}` : '请先在左侧选择自然人'}
        </span>
      </header>

      <div className="mt-3">
        <SearchInput
          value={keyword}
          placeholder="搜索候选账号或人名"
          aria-label="搜索候选账号"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      {data && data.warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          {data.warnings.map((warning) => (
            <p key={warning} className="flex items-center gap-2 text-[0.7rem] text-slate-400">
              <IconInfo width={13} height={13} className="shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          compact
          skeleton={<SkeletonList rows={6} />}
        >
          {GROUPS.map((group) => {
            const bucket = grouped.get(group.key) ?? { claimed: [], pending: [] };
            const isCollapsed = collapsed.has(group.key);
            const rowCount = bucket.claimed.length + bucket.pending.length;
            return (
              <div key={group.key} className="rounded-2xl border border-white/[0.07] bg-white/[0.015]">
                <button
                  type="button"
                  onClick={() => toggleCollapse(group.key)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5"
                >
                  <IconChevronDown
                    width={15}
                    height={15}
                    className={cn('text-slate-400 transition-transform duration-200', isCollapsed && '-rotate-90')}
                  />
                  <SourceBadge source={group.key} />
                  <span className="numeric text-xs text-slate-500">
                    待认领 {bucket.pending.length}
                    {bucket.claimed.length > 0 ? ` · 已认领 ${bucket.claimed.length}` : ''}
                  </span>
                </button>

                {!isCollapsed ? (
                  <div className="space-y-2 px-3 pb-3">
                    {rowCount === 0 ? (
                      <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
                        {needle ? '无匹配候选' : group.emptyLabel}
                      </p>
                    ) : null}

                    {bucket.claimed.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
                          已认领
                        </p>
                        {bucket.claimed.map((candidate) => (
                          <ClaimRow
                            key={candidate.accountKey}
                            candidate={candidate}
                            claims={claimsByKey.get(`${candidate.source}:${candidate.accountKey}`) ?? []}
                            targetPerson={targetPerson}
                            onClaim={onClaim}
                            onUnclaim={onUnclaim}
                            isMutating={isMutating}
                          />
                        ))}
                      </div>
                    ) : null}

                    {bucket.pending.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
                          待认领
                        </p>
                        {bucket.pending.map((candidate) => (
                          <ClaimRow
                            key={candidate.accountKey}
                            candidate={candidate}
                            claims={claimsByKey.get(`${candidate.source}:${candidate.accountKey}`) ?? []}
                            targetPerson={targetPerson}
                            onClaim={onClaim}
                            onUnclaim={onUnclaim}
                            isMutating={isMutating}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {data && data.warnings.some((warning) => warning.includes('不可用')) ? (
            <p className="flex items-center gap-2 text-[0.7rem] text-amber-200/80">
              <IconAlert width={13} height={13} />
              部分来源已降级为空，页面其余内容不受影响。
            </p>
          ) : null}
        </AsyncState>
      </div>
    </section>
  );
}
