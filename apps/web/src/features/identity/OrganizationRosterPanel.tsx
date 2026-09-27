import { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { OrganizationTypeBadge } from '@/components/ui/Badge';
import { SearchInput } from '@/components/ui/Field';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import type { OrgRosterEntry } from '@/types/contract';

export interface OrganizationRosterPanelProps {
  entries: OrgRosterEntry[];
  selectedOrgId: string | null;
  onSelect: (orgId: string) => void;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
}

/** 组织模式 · 左栏：组织列表 + 已收纳人数（只读自组织档案） */
export function OrganizationRosterPanel({
  entries,
  selectedOrgId,
  onSelect,
  isLoading,
  isError,
  error,
  onRetry,
}: OrganizationRosterPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [onlyWithMembers, setOnlyWithMembers] = useState(false);

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return entries.filter((entry) => {
      if (onlyWithMembers && entry.memberCount === 0) return false;
      if (!needle) return true;
      return (
        entry.organization.name.toLowerCase().includes(needle) ||
        entry.organization.orgId.toLowerCase().includes(needle)
      );
    });
  }, [entries, keyword, onlyWithMembers]);

  return (
    <section className="glass-card flex min-h-0 flex-col p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[0.95rem] font-semibold text-white">组织</h2>
          <p className="mt-0.5 text-xs text-slate-500">取自既有组织档案，仅读</p>
        </div>
        <span className="numeric rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300">
          {entries.length}
        </span>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <SearchInput
          value={keyword}
          placeholder="搜索组织名称"
          aria-label="搜索组织"
          onChange={(event) => setKeyword(event.target.value)}
        />
        <button
          type="button"
          aria-pressed={onlyWithMembers}
          onClick={() => setOnlyWithMembers((value) => !value)}
          className={cn('chip-interactive shrink-0 whitespace-nowrap', onlyWithMembers && 'border-brand-400/40 bg-brand-500/12 text-brand-100')}
        >
          仅有成员
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          compact
          skeleton={<SkeletonList rows={5} />}
          isEmpty={filtered.length === 0}
          emptyTitle={entries.length === 0 ? '暂无组织档案' : '无匹配组织'}
          emptyHint={entries.length === 0 ? '组织档案为人工维护，当前清单为空。' : '试试清空关键词或关闭「仅有成员」。'}
        >
          {filtered.map((entry) => {
            const active = entry.organization.orgId === selectedOrgId;
            return (
              <button
                key={entry.organization.orgId}
                type="button"
                onClick={() => onSelect(entry.organization.orgId)}
                aria-pressed={active}
                className={cn(
                  'relative flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-[transform,border-color,background-color] duration-200',
                  active
                    ? 'border-brand-400/45 bg-brand-500/[0.09]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.045]',
                )}
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-400" aria-hidden />
                ) : null}
                <Avatar
                  src={entry.organization.logoUrl}
                  name={entry.organization.name}
                  fallbackId={entry.organization.orgId}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">
                    {entry.organization.name}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5">
                    <OrganizationTypeBadge type={entry.organization.type} />
                  </span>
                </span>
                <span
                  className={cn(
                    'numeric shrink-0 text-xs',
                    entry.memberCount > 0 ? 'text-accent-300' : 'text-slate-500',
                  )}
                >
                  已收纳 {entry.memberCount} 人
                </span>
              </button>
            );
          })}
        </AsyncState>
      </div>
    </section>
  );
}
