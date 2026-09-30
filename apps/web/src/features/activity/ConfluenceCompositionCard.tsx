import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { Segmented } from '@/components/ui/Segmented';
import { SkeletonChart } from '@/components/ui/Skeleton';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatNumber } from '@/lib/format';
import { IconLayers } from '@/components/icons';
import type { OrganizationWiki } from '@/types/contract';
import { buildComposition } from './composition';

type MetricKey = 'requirements' | 'topicShares' | 'edits';

const METRIC_OPTIONS: Array<{ value: MetricKey; label: string }> = [
  { value: 'requirements', label: '需求' },
  { value: 'topicShares', label: '议题分享' },
  { value: 'edits', label: '编辑' },
];

/** 环形图圆心文案（与所选口径一致，避免读成固定是需求） */
const METRIC_CENTER: Record<MetricKey, string> = {
  requirements: '需求总数',
  topicShares: '议题分享总数',
  edits: '编辑总数',
};

/** 口径中文名（用于描述句） */
const METRIC_LABEL: Record<MetricKey, string> = {
  requirements: '需求数',
  topicShares: '议题分享数',
  edits: '编辑量',
};

export interface ConfluenceCompositionCardProps {
  /** 组织级 Confluence 成果（已按生效归属求和，见 ADR-0010） */
  wiki: OrganizationWiki[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/**
 * Confluence 成果分布：按所选口径（需求 / 议题分享 / **编辑量**）统计各组织（**生效归属**）占比，
 * 未归属账号聚合为伪组织（展示名 individual，见 org-display），与 GitHub 视图构成卡共用 `buildComposition` 口径。
 *
 * 编辑量口径见 ADR-0011（按版本条数计、含建页那次、不剔除多人共编大页）。
 */
export function ConfluenceCompositionCard({
  wiki,
  isLoading,
  isError,
  error,
  onRetry,
}: ConfluenceCompositionCardProps) {
  const [metric, setMetric] = useState<MetricKey>('requirements');

  const { slices, orgCount, total } = useMemo(
    () =>
      buildComposition(
        (wiki ?? []).map((item) => ({
          name: item.orgName,
          value: item.confluence[metric] ?? 0,
        })),
      ),
    [wiki, metric],
  );

  const isEmpty = slices.length === 0;

  return (
    <Card className="reveal flex h-full flex-col">
      <CardTitle
        title="成果贡献分布"
        description={`按${METRIC_LABEL[metric]}统计各组织（生效归属）的成果占比${
          orgCount > 0 ? `，共 ${orgCount} 家组织` : ''
        }`}
        icon={<IconLayers width={16} height={16} />}
        action={<Segmented options={METRIC_OPTIONS} value={metric} onChange={setMetric} size="sm" />}
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
              centerLabel={METRIC_CENTER[metric]}
              ariaLabel={`组织 Confluence ${METRIC_LABEL[metric]}分布环形图`}
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
