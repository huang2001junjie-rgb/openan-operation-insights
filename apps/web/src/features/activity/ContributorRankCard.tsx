import { useEffect, useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { Segmented } from '@/components/ui/Segmented';
import { Skeleton } from '@/components/ui/Skeleton';
import { IconBolt } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, initialsOf } from '@/lib/format';
import type { ContributorContribution, Organization } from '@/types/contract';
import { ORG_UNATTRIBUTED, UNATTRIBUTED_LABEL } from './org-display';

type MetricKey = 'pullRequests' | 'commits' | 'issues' | 'linesChanged';

const METRIC_OPTIONS: Array<{ value: MetricKey; label: string }> = [
  { value: 'pullRequests', label: '合并 PR' },
  { value: 'commits', label: '提交数' },
  { value: 'issues', label: 'Issue' },
  { value: 'linesChanged', label: '代码行数' },
];

const METRIC_UNIT: Record<MetricKey, string> = {
  pullRequests: '个 PR',
  commits: '次提交',
  issues: '个 Issue',
  linesChanged: '行变更',
};

const TOP_N = 8;

/** 个人圆形头像：avatarUrl 缺失或加载失败时降级为姓名首字母色块（与首页 Logo 降级策略一致） */
function ContributorAvatar({
  src,
  name,
  fallbackId,
}: {
  src?: string;
  name: string;
  fallbackId: string;
}) {
  const [broken, setBroken] = useState(false);
  const url = src?.trim();

  useEffect(() => {
    setBroken(false);
  }, [url]);

  const showImage = Boolean(url) && !broken;

  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[0.7rem] font-semibold tracking-wide',
        showImage
          ? 'border-white/12 bg-white/[0.05]'
          : 'border-brand-400/25 bg-gradient-to-br from-brand-400/30 to-accent-400/20 text-brand-100',
      )}
      title={name}
    >
      {showImage ? (
        <img
          src={url}
          alt={`${name} 的 GitHub 头像`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsOf(name, fallbackId)
      )}
    </span>
  );
}

export interface ContributorRankCardProps {
  contributors?: ContributorContribution[];
  /** 组织档案：用于把 orgId 解析成组织名，独立开发者（orgId 为空）显示为伪组织名 */
  organizations: Organization[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** 数据更新时间（来自 /contributions/summary），用于卡脚口径说明 */
  updatedAt?: string;
}

export function ContributorRankCard({
  contributors,
  organizations,
  isLoading,
  isError,
  error,
  onRetry,
  updatedAt,
}: ContributorRankCardProps) {
  const [metric, setMetric] = useState<MetricKey>('commits');

  const ranking = useMemo(
    () =>
      [...(contributors ?? [])]
        .map((item) => ({ item, value: item.github[metric] ?? 0 }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, TOP_N),
    [contributors, metric],
  );

  const orgNames = useMemo(
    () => new Map(organizations.map((org) => [org.orgId, org.name])),
    [organizations],
  );

  const maxValue = ranking[0]?.value ?? 0;

  return (
    <Card className="reveal flex h-full flex-col">
      <CardTitle
        title="个人贡献排行"
        description={`按所选指标展示前 ${TOP_N} 位贡献者`}
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
          emptyTitle="当前条件下暂无个人贡献数据"
          emptyHint="切换其他指标，或调整组织筛选后再看。"
          skeleton={
            <div className="space-y-3.5 pt-1">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4" style={{ width: `${86 - index * 9}%` }} />
                    <Skeleton className="h-1.5 rounded-full" style={{ width: `${68 - index * 9}%` }} />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <ol className="space-y-1.5" aria-label="个人贡献排行">
            {ranking.map(({ item, value }, index) => {
              const orgLabel = item.orgId
                ? (orgNames.get(item.orgId) ?? item.orgId)
                : (orgNames.get(ORG_UNATTRIBUTED) ?? UNATTRIBUTED_LABEL);
              const isIndependent = !item.orgId;
              const ratio = maxValue > 0 ? (value / maxValue) * 100 : 0;

              return (
                <li key={item.contributorId}>
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

                    <ContributorAvatar
                      src={item.avatarUrl}
                      name={item.name}
                      fallbackId={item.contributorId}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="truncate text-[0.82rem] font-medium text-slate-100"
                          title={item.name}
                        >
                          {item.name}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 truncate text-[0.68rem]',
                            isIndependent
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
                          className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-[width] duration-700 ease-out group-hover:from-brand-500 group-hover:to-accent-400 motion-reduce:transition-none"
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
        口径：GitHub 公开协作数据按个人聚合，未归属组织者归入「{UNATTRIBUTED_LABEL}」；阶段一时间区间筛选暂不生效。
        {updatedAt ? <span className="ml-1">数据更新于 {formatDateTime(updatedAt)}。</span> : null}
      </p>
    </Card>
  );
}
