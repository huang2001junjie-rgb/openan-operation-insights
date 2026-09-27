import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button, SearchInput } from '@/components/ui/Field';
import { AsyncState } from '@/components/ui/AsyncState';
import { EmptyState } from '@/components/ui/States';
import { SkeletonList } from '@/components/ui/Skeleton';
import { IconMinus, IconPlus, IconUsers } from '@/components/icons';
import { cn } from '@/lib/cn';
import type { OrgRosterEntry, PersonListItem } from '@/types/contract';
import { PersonAvatar } from './PersonAvatar';

export interface OrgMemberPanelProps {
  entry?: OrgRosterEntry;
  persons: PersonListItem[];
  orgNameById: Map<string, string>;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  onAssign: (personId: string) => void;
  onRemove: (personId: string) => void;
  onBulkAssign: (personIds: string[]) => void;
  isMutating: boolean;
}

/** 组织模式 · 右栏：把开发者（自然人）收纳进所选组织 / 移出，支持批量 */
export function OrgMemberPanel({
  entry,
  persons,
  orgNameById,
  isLoading,
  isError,
  error,
  onRetry,
  onAssign,
  onRemove,
  onBulkAssign,
  isMutating,
}: OrgMemberPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return persons;
    return persons.filter(
      (person) =>
        person.displayName.toLowerCase().includes(needle) ||
        person.personId.toLowerCase().includes(needle),
    );
  }, [persons, keyword]);

  const toggle = (personId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const bulkCandidates = useMemo(
    () =>
      [...selected].filter((personId) => {
        const person = persons.find((item) => item.personId === personId);
        return person && person.orgId !== entry?.organization.orgId;
      }),
    [selected, persons, entry],
  );

  if (!entry) {
    return (
      <section className="glass-card flex min-h-0 flex-col p-4">
        <EmptyState
          title="请选择左侧的组织"
          hint="选中组织后，即可把开发者逐个或批量收纳进去；归属为派生视图，无需额外维护。"
          icon={<IconUsers width={22} height={22} />}
          className="flex-1"
        />
      </section>
    );
  }

  const orgId = entry.organization.orgId;

  return (
    <section className="glass-card flex min-h-0 flex-col p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[0.95rem] font-semibold text-white">
            收纳进「{entry.organization.name}」
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            当前已收纳 <span className="numeric text-accent-300">{entry.memberCount}</span> 人（派生）
          </p>
        </div>
        {bulkCandidates.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" className="h-8 px-3 text-xs" onClick={clearSelection}>
              清空
            </Button>
            <Button
              variant="primary"
              className="h-8 px-3 text-xs"
              disabled={isMutating}
              onClick={() => {
                onBulkAssign(bulkCandidates);
                clearSelection();
              }}
            >
              <IconPlus width={14} height={14} />
              批量收纳 {bulkCandidates.length}
            </Button>
          </div>
        ) : null}
      </header>

      <div className="mt-3">
        <SearchInput
          value={keyword}
          placeholder="搜索开发者姓名或标识"
          aria-label="搜索开发者"
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          compact
          skeleton={<SkeletonList rows={6} />}
          isEmpty={filtered.length === 0}
          emptyTitle={persons.length === 0 ? '暂无自然人' : '无匹配开发者'}
          emptyHint={persons.length === 0 ? '先在「自然人 ↔ 账号」模式新建自然人。' : '试试清空搜索关键词。'}
        >
          {filtered.map((person) => {
            const inThisOrg = person.orgId === orgId;
            const checked = selected.has(person.personId);
            const orgLabel = person.orgId ? orgNameById.get(person.orgId) ?? person.orgId : null;
            return (
              <div
                key={person.personId}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-200',
                  checked ? 'border-brand-400/40 bg-brand-500/[0.07]' : 'border-white/[0.07] bg-white/[0.02]',
                  inThisOrg && 'opacity-65',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  aria-label={`选择 ${person.displayName}`}
                  onChange={() => toggle(person.personId)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-brand-500"
                />
                <PersonAvatar name={person.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-100">{person.displayName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {orgLabel ? <Badge tone="neutral">{orgLabel}</Badge> : <Badge tone="neutral">未归属</Badge>}
                    {person.claimCount > 0 ? <Badge tone="brand">已认领 {person.claimCount}</Badge> : null}
                  </div>
                </div>
                {inThisOrg ? (
                  <Button
                    variant="ghost"
                    className="h-8 shrink-0 px-3 text-xs"
                    disabled={isMutating}
                    onClick={() => onRemove(person.personId)}
                  >
                    <IconMinus width={14} height={14} />
                    移出
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="h-8 shrink-0 px-3 text-xs"
                    disabled={isMutating}
                    onClick={() => onAssign(person.personId)}
                  >
                    <IconPlus width={14} height={14} />
                    收纳
                  </Button>
                )}
              </div>
            );
          })}
        </AsyncState>
      </div>
    </section>
  );
}
