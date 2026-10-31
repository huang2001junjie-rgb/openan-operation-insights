import { Card } from '@/components/ui/Card';
import { DateInput, Field } from '@/components/ui/Field';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/MultiSelect';
import { IconFilter, IconRefresh } from '@/components/icons';
import { toLocalDateInput } from '@/lib/format';
import type { Organization } from '@/types/contract';

export interface ActivityFilterState {
  orgIds: string[];
  /** 仓库组合筛选（owner/repo 全名）；空 ≡ 全选（不过滤） */
  repoIds: string[];
  /** YYYY-MM-DD；空 ≡ 该侧无界（ADR-0018：区间是显式动作，默认全量口径） */
  from: string;
  to: string;
}

/**
 * 区间预设（ADR-0018 决策 2）：默认**不带区间**（全量口径），「看某段时间」是一次显式动作，
 * 预设只是把常用窗口一键填上。刻意不硬编码年份——写死 `2026-01-01` 的默认值在跨年那天
 * 会把页面变成一个全 0 的空视图，而用户看不出原因。
 */
const RANGE_PRESETS = [
  { key: 'all', label: '全部时间' },
  { key: 'year', label: '本年' },
  { key: 'recent90', label: '近 90 天' },
] as const;

type PresetKey = (typeof RANGE_PRESETS)[number]['key'];

const MS_PER_DAY = 86_400_000;

function presetRange(key: PresetKey): Pick<ActivityFilterState, 'from' | 'to'> {
  if (key === 'all') return { from: '', to: '' };
  const today = new Date();
  if (key === 'year') {
    return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` };
  }
  // 近 90 天 = 含今天在内的 90 个整天（上界由页面翻成次日零点，见 rangeEndInstant）
  return {
    from: toLocalDateInput(new Date(today.getTime() - 89 * MS_PER_DAY)),
    to: toLocalDateInput(today),
  };
}

export interface ActivityFiltersProps {
  organizations: Organization[];
  /** 仓库筛选候选（仅 GitHub 视图传入；Confluence 无仓库概念，不渲染该筛选器） */
  repoOptions?: MultiSelectOption[];
  value: ActivityFilterState;
  onChange: (next: ActivityFilterState) => void;
  onReset: () => void;
  /** 口径说明文案 */
  rangeHint?: string;
  /**
   * 禁用区间筛选器（Confluence 视图）：该侧落盘的是账号级累计计数，无时间维度可切，
   * 摆一个不生效的日期框等于对用户撒谎，故整块换成说明文案（ADR-0018 决策 5）。
   */
  rangeDisabled?: boolean;
  /** 已勾选但在当前区间内无活动的仓库：显式提示，不让筛选条件静默消失（ADR-0018 决策 6） */
  staleRepoIds?: string[];
  isFetching?: boolean;
}

export function ActivityFilters({
  organizations,
  repoOptions,
  value,
  onChange,
  onReset,
  rangeHint,
  rangeDisabled = false,
  staleRepoIds = [],
  isFetching,
}: ActivityFiltersProps) {
  const options = organizations.map((org) => ({ value: org.orgId, label: org.name }));
  const activePreset = RANGE_PRESETS.find((preset) => {
    const range = presetRange(preset.key);
    return range.from === value.from && range.to === value.to;
  })?.key;

  return (
    <Card className="reveal">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex items-center gap-2 pb-2.5 text-slate-400 lg:pb-2.5">
          <IconFilter width={16} height={16} />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            筛选
          </span>
        </div>

        <Field label="组织" className="lg:w-64">
          <MultiSelect
            options={options}
            value={value.orgIds}
            onChange={(orgIds) => onChange({ ...value, orgIds })}
            placeholder="全部组织"
          />
        </Field>

        {repoOptions ? (
          <Field label="仓库" className="lg:w-64">
            <MultiSelect
              options={repoOptions}
              value={value.repoIds}
              onChange={(repoIds) => onChange({ ...value, repoIds })}
              placeholder="全部仓库"
              searchPlaceholder="搜索仓库"
              // 一键全选 = 勾选全部候选；行为上与不过滤等价（页面侧全量勾选时不带 repoIds 参数）
              onSelectAll={() => onChange({ ...value, repoIds: repoOptions.map((o) => o.value) })}
            />
          </Field>
        ) : null}

        {rangeDisabled ? (
          <Field label="时间区间" className="lg:w-72">
            <p className="flex h-10 items-center rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 text-[0.72rem] leading-snug text-slate-500">
              恒为全历史累计：Confluence 侧无时间维度明细
            </p>
          </Field>
        ) : (
          <>
            <Field label="开始日期" className="lg:w-44">
              <DateInput
                value={value.from}
                max={value.to || undefined}
                onChange={(event) => onChange({ ...value, from: event.target.value })}
              />
            </Field>

            <Field label="结束日期" className="lg:w-44">
              <DateInput
                value={value.to}
                min={value.from || undefined}
                onChange={(event) => onChange({ ...value, to: event.target.value })}
              />
            </Field>

            <div className="flex items-center gap-1.5 pb-0.5">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => onChange({ ...value, ...presetRange(preset.key) })}
                  aria-pressed={activePreset === preset.key}
                  className={
                    activePreset === preset.key
                      ? 'inline-flex h-10 items-center rounded-xl border border-brand-400/40 bg-brand-500/15 px-3 text-xs font-medium text-brand-200 transition'
                      : 'inline-flex h-10 items-center rounded-xl border border-white/12 bg-white/[0.04] px-3 text-xs text-slate-300 transition hover:border-white/25 hover:bg-white/[0.08]'
                  }
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-2 lg:ml-auto">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 text-sm text-slate-200 transition hover:border-white/25 hover:bg-white/[0.08]"
          >
            <IconRefresh width={15} height={15} className={isFetching ? 'animate-spin' : undefined} />
            重置
          </button>
        </div>
      </div>

      {staleRepoIds.length > 0 ? (
        <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/[0.05] px-3.5 py-2.5 text-[0.72rem] leading-relaxed text-amber-100/80">
          已选仓库在当前区间内无活动：<span className="numeric">{staleRepoIds.join('、')}</span>
          （区间内没有事件的仓库不出行；放宽区间或取消勾选后恢复）
        </p>
      ) : null}

      {rangeHint ? (
        <p className="mt-4 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-[0.72rem] leading-relaxed text-slate-500">
          口径说明：{rangeHint}
        </p>
      ) : null}
    </Card>
  );
}
