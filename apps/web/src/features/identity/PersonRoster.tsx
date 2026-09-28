import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button, SearchInput, Select, TextInput } from '@/components/ui/Field';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { IconChevronRight, IconPlus } from '@/components/icons';
import { cn } from '@/lib/cn';
import { pushToast } from '@/lib/toast';
import type { PersonListItem } from '@/types/contract';
import type { OrgOption } from './OrgAssignSelect';
import { PersonAvatar } from './PersonAvatar';

export interface PersonRosterProps {
  persons: PersonListItem[];
  /** 已加载时为数量；加载中 / 出错时为 null，避免把"不可用"误显示为 0 */
  totalCount: number | null;
  selectedPersonId: string | null;
  /** 选中为认领目标（不打开抽屉） */
  onSelect: (personId: string) => void;
  /** 打开详情抽屉（不改变认领目标） */
  onOpenDetail: (personId: string) => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  orgFilter: string;
  onOrgFilterChange: (value: string) => void;
  orgOptions: OrgOption[];
  orgNameById: Map<string, string>;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry: () => void;
  /** 新建自然人；成功即清空输入，失败由上层提示并保留输入便于重试 */
  onCreate: (displayName: string) => Promise<unknown>;
  isCreating: boolean;
}

/** 自然人模式 · 左栏：可检索的自然人花名册 */
export function PersonRoster({
  persons,
  totalCount,
  selectedPersonId,
  onSelect,
  onOpenDetail,
  keyword,
  onKeywordChange,
  orgFilter,
  onOrgFilterChange,
  orgOptions,
  orgNameById,
  isLoading,
  isError,
  error,
  onRetry,
  onCreate,
  isCreating,
}: PersonRosterProps) {
  const [draftName, setDraftName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  /**
   * 空名点击**不再静默返回**：早先按钮在空名时即被 `disabled`，而 `Button` 没有禁用态样式，
   * 外观与可用态一致，点击毫无反馈（易被误判为按钮失效）。
   * 现在空名走「提示 + 聚焦」，只有提交在途时才禁用。
   */
  const submitCreate = () => {
    if (isCreating) return;
    const value = draftName.trim();
    if (!value) {
      pushToast({
        tone: 'info',
        title: '请先输入展示名',
        description: '展示名用于生成 personId，是自然人的唯一标识。',
      });
      nameInputRef.current?.focus();
      return;
    }
    // 仅在成功后清空：先清空再提交时，一旦失败则输入框已空、按钮回到禁用态，
    // 表现为「点过一次之后彻底没反应」
    onCreate(value).then(
      () => setDraftName(''),
      () => undefined,
    );
  };

  return (
    <section className="glass-card flex min-h-0 flex-col p-4">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[0.95rem] font-semibold text-white">自然人</h2>
          <p className="mt-0.5 text-xs text-slate-500">身份匹配的最基本单位</p>
        </div>
        <span className="numeric rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-slate-300">
          {totalCount ?? '—'}
        </span>
      </header>

      <div className="mt-3 flex items-center gap-2">
        <TextInput
          ref={nameInputRef}
          value={draftName}
          placeholder="输入展示名新建自然人"
          aria-label="新建自然人"
          maxLength={64}
          onChange={(event) => setDraftName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitCreate();
          }}
        />
        {/* 空名不再禁用：禁用态与可用态外观一致时点击毫无反馈，会被误判为「按钮失效」 */}
        <Button
          variant="primary"
          className="h-10 shrink-0 px-3"
          disabled={isCreating}
          onClick={submitCreate}
        >
          <IconPlus width={15} height={15} />
          新建
        </Button>
      </div>

      <div className="mt-3 space-y-2">
        <SearchInput
          value={keyword}
          placeholder="搜索姓名或标识"
          aria-label="搜索自然人"
          onChange={(event) => onKeywordChange(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Select
            aria-label="按归属筛选"
            className="h-9 text-xs"
            value={orgFilter}
            onChange={(event) => onOrgFilterChange(event.target.value)}
          >
            <option value="" className="bg-ink-850 text-slate-100">
              全部归属
            </option>
            <option value="none" className="bg-ink-850 text-slate-100">
              未归属
            </option>
            {orgOptions.map((option) => (
              <option key={option.orgId} value={option.orgId} className="bg-ink-850 text-slate-100">
                {option.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          onRetry={onRetry}
          compact
          skeleton={<SkeletonList rows={6} />}
          isEmpty={persons.length === 0}
          emptyTitle="暂无自然人"
          emptyHint="在上方输入展示名即可新建。"
        >
          {persons.map((person) => {
            const active = person.personId === selectedPersonId;
            const orgLabel = person.orgId ? orgNameById.get(person.orgId) ?? person.orgId : null;
            return (
              <div
                key={person.personId}
                className={cn(
                  'relative overflow-hidden rounded-xl border transition-[transform,border-color,background-color] duration-200',
                  active
                    ? 'border-brand-400/45 bg-brand-500/[0.09]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]',
                )}
              >
                {active ? (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-400" aria-hidden />
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelect(person.personId)}
                  aria-pressed={active}
                  className="flex w-full items-center gap-3 px-3 py-2.5 pr-12 text-left"
                >
                  <PersonAvatar name={person.displayName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-100">
                        {person.displayName}
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      {orgLabel ? <Badge tone="brand">{orgLabel}</Badge> : <Badge tone="neutral">未归属</Badge>}
                      <Badge tone="neutral">账号 {person.claimCount}</Badge>
                    </span>
                  </span>
                </button>

                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 bg-gradient-to-l from-ink-900/90 via-ink-900/70 to-transparent pl-6">
                  <button
                    type="button"
                    title="详情"
                    aria-label={`查看 ${person.displayName} 详情`}
                    onClick={() => onOpenDetail(person.personId)}
                    className="rounded-lg border border-white/10 bg-white/[0.06] p-1.5 text-slate-300 transition hover:border-brand-400/40 hover:text-brand-200"
                  >
                    <IconChevronRight width={14} height={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </AsyncState>
      </div>
    </section>
  );
}
