import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/components/ui/States';
import { Card, CardTitle } from '@/components/ui/Card';
import { DateInput, Field } from '@/components/ui/Field';
import { IconUserPlus } from '@/components/icons';
import { rangeEndInstant, rangeStartInstant, toLocalDateInput } from '@/lib/format';
import {
  usePersonCandidates,
  usePersonConfluenceRequirements,
  usePersonContributions,
  usePersonGithubEvents,
} from '@/hooks/usePerson';
import type { Organization } from '@/types/contract';
import { PersonConfluenceRequirementsCard } from './PersonConfluenceRequirementsCard';
import { PersonEntityPicker, selectionOf, type PersonSelection } from './PersonEntityPicker';
import { PersonGithubEventsCard } from './PersonGithubEventsCard';
import { PersonProfileCard } from './PersonProfileCard';

const MS_PER_DAY = 86_400_000;

const RANGE_PRESETS = [
  { key: 'all', label: '全部时间' },
  { key: 'year', label: '本年' },
  { key: 'recent90', label: '近 90 天' },
] as const;

type PresetKey = (typeof RANGE_PRESETS)[number]['key'];

function presetRange(key: PresetKey): { from: string; to: string } {
  if (key === 'all') return { from: '', to: '' };
  const today = new Date();
  if (key === 'year') {
    return { from: `${today.getFullYear()}-01-01`, to: toLocalDateInput(today) };
  }
  return {
    from: toLocalDateInput(new Date(today.getTime() - 89 * MS_PER_DAY)),
    to: toLocalDateInput(today),
  };
}

/** GitHub 事件明细默认取数上限：与后端上限 1000 留出余量，截断时卡片会显式提示 */
const EVENTS_LIMIT = 500;

/**
 * 个人模式（ADR-0020）：自然人/账号维度下钻。
 * 全部数字由后端读时派生，前端只做选择与展示；选择状态编码进 URL（person / account+acctSrc），可深链分享。
 * 时间区间沿用组织模式的半开口径（[from, to)），但**只作用于 GitHub 事件明细**：
 * 画像是全历史累计、Confluence 事实没有可切片的时间维度。
 */
export function PersonModePanel({ organizations = [] }: { organizations?: Organization[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = selectionOf(searchParams);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const fromIso = range.from ? rangeStartInstant(range.from) : undefined;
  const toIso = range.to ? rangeEndInstant(range.to) : undefined;

  const personId = selection?.kind === 'person' ? selection.personId : '';
  const accountKey = selection?.kind === 'account' ? selection.accountKey : '';
  const accountSource = selection?.kind === 'account' ? selection.source : null;

  const candidatesQuery = usePersonCandidates();
  const contributionsQuery = usePersonContributions(
    { personId, from: fromIso, to: toIso },
    selection?.kind === 'person',
  );
  const githubEventsQuery = usePersonGithubEvents(
    {
      ...(selection?.kind === 'person'
        ? { personId }
        : accountSource === 'github'
          ? { account: accountKey }
          : {}),
      from: fromIso,
      to: toIso,
      limit: EVENTS_LIMIT,
    },
    selection?.kind === 'person' || accountSource === 'github',
  );
  const requirementsQuery = usePersonConfluenceRequirements(
    selection?.kind === 'person'
      ? { personId }
      : accountSource === 'confluence'
        ? { account: accountKey }
        : {},
    selection?.kind === 'person' || accountSource === 'confluence',
  );

  const applySelection = (next: PersonSelection) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('mode', 'person');
      params.delete('person');
      params.delete('account');
      params.delete('acctSrc');
      if (next.kind === 'person') {
        params.set('person', next.personId);
      } else {
        params.set('account', next.accountKey);
        params.set('acctSrc', next.source);
      }
      return params;
    });
  };

  const activePreset = RANGE_PRESETS.find((preset) => {
    const expected = presetRange(preset.key);
    return expected.from === range.from && expected.to === range.to;
  })?.key;

  const githubEventsTitle =
    selection?.kind === 'account' ? `GitHub 账号 · ${selection.accountKey}` : 'GitHub 事件明细';
  const requirementsTitle =
    selection?.kind === 'account' ? `Confluence 账号 · ${selection.accountKey}` : 'Confluence 需求事实';

  return (
    <div className="space-y-6">
      <Card padded={false} className="reveal">
        <div className="p-5 sm:p-6">
          <CardTitle
            title="个人模式"
            description="选自然人看统一画像，或选单个账号直接下钻；候选含未认领/多认领账号"
            icon={<IconUserPlus width={16} height={16} />}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3 px-5 pb-5 sm:px-6 sm:pb-6">
          <PersonEntityPicker
            candidates={candidatesQuery.data}
            selection={selection}
            onChange={applySelection}
            isLoading={candidatesQuery.isLoading}
          />

          <Field label="区间起点" className="w-40">
            <DateInput
              aria-label="区间起点"
              value={range.from}
              onChange={(event) => setRange((prev) => ({ ...prev, from: event.target.value }))}
            />
          </Field>
          <Field label="区间终点" className="w-40">
            <DateInput
              aria-label="区间终点"
              value={range.to}
              onChange={(event) => setRange((prev) => ({ ...prev, to: event.target.value }))}
            />
          </Field>

          <div className="flex items-center gap-1.5 pb-0.5">
            {RANGE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setRange(presetRange(preset.key))}
                aria-pressed={activePreset === preset.key}
                className={
                  activePreset === preset.key
                    ? 'inline-flex h-10 items-center rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 text-xs font-medium text-brand-700 transition'
                    : 'inline-flex h-10 items-center rounded-xl border border-ink-950/12 bg-ink-950/[0.04] px-3 text-xs text-slate-300 transition hover:border-ink-950/25 hover:bg-ink-950/[0.08]'
                }
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <p className="border-t border-ink-950/[0.06] px-5 py-3 text-[0.7rem] text-slate-500 sm:px-6">
          口径：区间沿用半开 [from, to)，但仅作用于 GitHub 事件明细；画像是全历史累计，Confluence 事实恒全历史（无可切片时间维度）。
        </p>
      </Card>

      {!selection ? (
        <Card className="reveal">
          <EmptyState
            title="先选一个自然人或账号"
            hint="自然人展示跨来源统一画像与两类明细；单个账号直接跳到对应来源的明细。候选池来自服务端读时派生，认领变更后自动刷新。"
          />
        </Card>
      ) : null}

      {selection?.kind === 'person' ? (
        <PersonProfileCard
          data={contributionsQuery.data}
          isLoading={contributionsQuery.isLoading}
          isError={contributionsQuery.isError}
          error={contributionsQuery.error}
          onRetry={() => void contributionsQuery.refetch()}
          organizations={organizations}
        />
      ) : null}

      {selection && (selection.kind === 'person' || selection.source === 'github') ? (
        <PersonGithubEventsCard
          title={githubEventsTitle}
          data={githubEventsQuery.data}
          isLoading={githubEventsQuery.isLoading}
          isError={githubEventsQuery.isError}
          error={githubEventsQuery.error}
          onRetry={() => void githubEventsQuery.refetch()}
        />
      ) : null}

      {selection && (selection.kind === 'person' || selection.source === 'confluence') ? (
        <PersonConfluenceRequirementsCard
          title={requirementsTitle}
          data={requirementsQuery.data}
          isLoading={requirementsQuery.isLoading}
          isError={requirementsQuery.isError}
          error={requirementsQuery.error}
          onRetry={() => void requirementsQuery.refetch()}
        />
      ) : null}
    </div>
  );
}
