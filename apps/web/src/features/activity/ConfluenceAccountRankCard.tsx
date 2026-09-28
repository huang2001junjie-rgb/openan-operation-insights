import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { Segmented } from '@/components/ui/Segmented';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconBolt } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, initialsOf } from '@/lib/format';
import type { ConfluenceAccountView, Organization } from '@/types/contract';

type MetricKey = 'requirements' | 'topicShares';

const METRIC_OPTIONS: Array<{ value: MetricKey; label: string }> = [
  { value: 'requirements', label: '需求' },
  { value: 'topicShares', label: '议题分享' },
];

const METRIC_UNIT: Record<MetricKey, string> = {
  requirements: '项需求',
  topicShares: '次分享',
};

/** 独立开发者伪组织（与后端 effective-org / organizations.json 一致） */
const ORG_UNATTRIBUTED = 'unattributed';

const TOP_N = 8;

export interface ConfluenceAccountRankCardProps {
  /** 账号级 Confluence 明细（含生效归属，见 ADR-0010） */
  accounts?: ConfluenceAccountView[];
  /** 组织档案：用于把 effectiveOrgId 解析成组织名；未归属显示为伪组织「独立开发者」 */
  organizations: Organization[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** 数据更新时间（来自组织级/wiki）用于卡脚口径说明 */
  updatedAt?: string;
}

/** 个人维度 Confluence 成果排行：按账号聚合，归属为**生效归属**（人工认领优先）。 */
export function ConfluenceAccountRankCard({
  accounts,
  organizations,
  isLoading,
  isError,
  error,
  onRetry,
  updatedAt,
}: ConfluenceAccountRankCardProps) {
  const [metric, setMetric] = useState<MetricKey>('requirements');

  const ranking = useMemo(
    () =>
      [...(accounts ?? [])]
        .map((item) => ({ item, value: item.confluence[metric] ?? 0 }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, TOP_N),
    [accounts, metric],
  );

  const orgNames = useMemo(
    () => new Map(organizations.map((org) => [org.orgId, org.name])),
    [organizations],
  );

  const maxValue = ranking[0]?.value ?? 0;

  return (
    <Card className="reveal flex h-full flex-col">
      <CardTitle
        title="个人成果排行"
        description={`按所选指标展示前 ${TOP_N} 位 Confluence 账号`}
        icon={<IconBolt width={16} height={16} />}
        action={<Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} size="sm" />}
      />

      <div className="mt-5 flex-1">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={ranking.length === 0}
          onRetry={onRetry}
          compact
          emptyTitle="当前条件下暂无 Confluence 账号数据"
          emptyHint="切换其他指标，或调整组织筛选后再看。"
          skeleton={
            <div className="space-y-3.5 pt-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4" style={{ width: `${86 - index * 9}%` }} />
                    <Skeleton className="h-1.5 rounded-full" style={{ width: `${68 - index * 9}%` }} />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <ol className="space-y-1.5" aria-label="个人 Confluence 成果排行">
            {ranking.map(({ item, value }, index) => {
              const isUnattributed = item.effectiveOrgId === ORG_UNATTRIBUTED;
              const orgLabel = isUnattributed
                ? (orgNames.get(ORG_UNATTRIBUTED) ?? '独立开发者')
                : (orgNames.get(item.effectiveOrgId) ?? item.effectiveOrgId);
              const ratio = maxValue > 0 ? (value / maxValue) * 100 : 0;

              return (
                <li key={item.accountId}>
                  <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors duration-200 hover:bg-white/[0.045] motion-reduce:transition-none">
                    <span
                      className={cn(
                        'numeric w-5 shrink-0 text-center text-xs font-semibold',
                        index === 0
                          ? 'text-brand-200'
                          : index < 3
                            ? 'text-brand-300/80'
                            : 'text-slate-500',
                      )}
                    >
                      {index + 1}
                    </span>

                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-gradient-to-br from-brand-400/25 to-violet-400/20 text-[0.7rem] font-semibold tracking-wide text-brand-100"
                      title={item.displayName}
                    >
                      {initialsOf(item.displayName, item.accountId)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="truncate text-[0.82rem] font-medium text-slate-100"
                          title={item.displayName}
                        >
                          {item.displayName}
                        </span>
                        {item.orgSource === 'claim' ? (
                          <Badge tone="accent" className="shrink-0">
                            已认领
                          </Badge>
                        ) : null}
                        <span
                          className={cn(
                            'shrink-0 truncate text-[0.68rem]',
                            isUnattributed
                              ? 'rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-px text-slate-400'
                              : 'text-slate-500',
                          )}
                          title={orgLabel}
                        >
                          {orgLabel}
                        </span>
                      </div>

                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-600 to-accent-400 transition-[width] duration-700 ease-out group-hover:from-brand-500 group-hover:to-accent-400 motion-reduce:transition-none"
                          style={{ width: `${Math.max(ratio, 2)}%` }}
                        />
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="numeric text-sm font-semibold text-white">
                        {formatNumber(value)}
                      </div>
                      <div className="text-[0.66rem] text-slate-500">{METRIC_UNIT[metric]}</div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </AsyncState>
      </div>

      <p className="mt-4 border-t border-white/[0.06] pt-3 text-[0.68rem] leading-relaxed text-slate-500">
        口径：Confluence 成果按账号聚合，归属为生效归属（人工认领优先于采集口径）；未归属账号归入「独立开发者」；阶段一时间区间筛选暂不生效。
        {updatedAt ? <span className="ml-1">数据更新于 {formatDateTime(updatedAt)}。</span> : null}
      </p>
    </Card>
  );
}
