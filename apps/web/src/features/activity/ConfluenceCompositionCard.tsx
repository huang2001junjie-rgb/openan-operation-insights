import { useMemo } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonChart } from '@/components/ui/Skeleton';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatNumber } from '@/lib/format';
import { IconLayers } from '@/components/icons';
import type { OrganizationWiki } from '@/types/contract';
import { buildComposition } from './composition';

export interface ConfluenceCompositionCardProps {
  /** 组织级 Confluence 成果（已按生效归属求和，见 ADR-0010） */
  wiki: OrganizationWiki[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/**
 * Confluence 成果分布：按 `confluence.requirements` 统计各组织（**生效归属**）占比，
 * 未归属账号聚合为伪组织「独立开发者」，与 GitHub 视图构成卡共用 `buildComposition` 口径。
 */
export function ConfluenceCompositionCard({
  wiki,
  isLoading,
  isError,
  error,
  onRetry,
}: ConfluenceCompositionCardProps) {
  const { slices, orgCount, total } = useMemo(
    () =>
      buildComposition(
        (wiki ?? []).map((item) => ({ name: item.orgName, value: item.confluence.requirements ?? 0 })),
      ),
    [wiki],
  );

  const isEmpty = slices.length === 0;

  return (
    <Card className="reveal flex h-full flex-col">
      <CardTitle
        title="成果贡献分布"
        description="按需求数统计各组织（生效归属）的成果占比"
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
          emptyTitle="当前条件下没有 Confluence 成果数据"
          emptyHint="试试放宽筛选条件，或在身份控制台认领账号后再看。"
          skeleton={<SkeletonChart />}
        >
          <>
            <DonutChart
              slices={slices}
              height={248}
              centerLabel="需求总数"
              ariaLabel="组织 Confluence 需求数分布环形图"
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
