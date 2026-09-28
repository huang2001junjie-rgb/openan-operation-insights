import { useMemo } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonChart } from '@/components/ui/Skeleton';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatNumber } from '@/lib/format';
import { IconLayers } from '@/components/icons';
import type { OrganizationContribution } from '@/types/contract';
import { buildComposition } from './composition';

export interface ContributionCompositionCardProps {
  contributions: OrganizationContribution[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/** 组织贡献分布（ADR-0003）：按 github.commits 统计各组织占比，口径见 `buildComposition`。 */
export function ContributionCompositionCard({
  contributions,
  isLoading,
  isError,
  error,
  onRetry,
}: ContributionCompositionCardProps) {
  const { slices, orgCount, total } = useMemo(
    () =>
      buildComposition(
        (contributions ?? []).map((item) => ({ name: item.orgName, value: item.github.commits ?? 0 })),
      ),
    [contributions],
  );

  const isEmpty = slices.length === 0;

  return (
    <Card className="reveal flex h-full flex-col">
      <CardTitle
        title="组织贡献分布"
        description="按提交数量统计各组织的贡献占比"
        icon={<IconLayers width={16} height={16} />}
        action={
          orgCount > 0 ? (
            <span className="text-[0.7rem] text-slate-500">
              <span className="numeric font-semibold text-slate-300">{orgCount}</span> 家组织
            </span>
          ) : null
        }
      />

      <div className="mt-4 flex-1">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={isEmpty}
          onRetry={onRetry}
          compact
          emptyTitle="当前条件下没有提交数据"
          emptyHint="试试放宽筛选条件或清除组织筛选。"
          skeleton={<SkeletonChart />}
        >
          <>
            <DonutChart
              slices={slices}
              height={248}
              centerLabel="提交总数"
              ariaLabel="组织提交数分布环形图"
            />

            <dl className="mt-5 space-y-2.5">
              {slices.map((slice) => {
                const percent = total > 0 ? (slice.value / total) * 100 : 0;
                return (
                  <div key={slice.name} className="flex items-center justify-between text-xs">
                    <dt className="flex items-center gap-2 text-slate-400">
                      <span className="h-2 w-2 rounded-full" style={{ background: slice.color }} />
                      {slice.name}
                    </dt>
                    <dd className="numeric font-semibold text-slate-200">
                      {formatNumber(slice.value)}
                      <span className="ml-1.5 font-normal text-slate-500">{percent.toFixed(1)}%</span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        </AsyncState>
      </div>
    </Card>
  );
}
