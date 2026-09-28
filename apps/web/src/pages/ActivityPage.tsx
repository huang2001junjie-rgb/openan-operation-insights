import { useMemo, useState } from 'react';
import { PageHeading } from '@/components/layout/PageHeading';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ActivityFilters, type ActivityFilterState } from '@/features/activity/ActivityFilters';
import { ActivityTable } from '@/features/activity/ActivityTable';
import { ContributionCompositionCard } from '@/features/activity/ContributionCompositionCard';
import { ContributorRankCard } from '@/features/activity/ContributorRankCard';
import { mergeActivityRows } from '@/features/activity/merge';
import {
  useContributions,
  useContributionSummary,
  useContributorContributions,
  useWiki,
  useOrganizationOptions,
} from '@/hooks/useActivity';
import { fromDateInput, formatDateTime } from '@/lib/format';

const DEFAULT_FILTERS: ActivityFilterState = {
  orgIds: [],
  from: '2026-01-01',
  to: '2026-12-31',
};

const RANGE_HINT =
  '阶段一的本地种子数据不含时间维度明细，时间区间参数会被后端接收但不做过滤；接入 GitHub / Confluence 后（阶段三）区间筛选自动生效。';

export function ActivityPage() {
  const [filters, setFilters] = useState<ActivityFilterState>(DEFAULT_FILTERS);
  const [isFiltersDirty, setFiltersDirty] = useState(false);

  const params = useMemo(
    () => ({
      orgIds: filters.orgIds.length > 0 ? filters.orgIds : undefined,
      from: fromDateInput(filters.from),
      to: fromDateInput(filters.to),
    }),
    [filters],
  );

  const contributions = useContributions(params);
  const wiki = useWiki(params);
  const summary = useContributionSummary(params);
  const contributorContributions = useContributorContributions(params);
  const organizationOptions = useOrganizationOptions();

  /** 明细表底表：全量组织档案，随 orgIds 筛选收窄（ADR-0002） */
  const organizationRows = useMemo(() => {
    const orgs = organizationOptions.data ?? [];
    const selected = params.orgIds;
    return selected ? orgs.filter((org) => selected.includes(org.orgId)) : orgs;
  }, [organizationOptions.data, params.orgIds]);

  const rows = useMemo(
    () => mergeActivityRows(contributions.data ?? [], wiki.data ?? [], organizationRows),
    [contributions.data, wiki.data, organizationRows],
  );

  const isFetching =
    contributions.isFetching ||
    wiki.isFetching ||
    summary.isFetching ||
    contributorContributions.isFetching ||
    organizationOptions.isFetching;
  const isLoading =
    contributions.isLoading || wiki.isLoading || organizationOptions.isLoading;

  const handleChange = (next: ActivityFilterState) => {
    setFilters(next);
    setFiltersDirty(true);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setFiltersDirty(false);
  };

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Community Activity"
        title="社区活跃度"
        description="以组织为单位聚合 GitHub 代码协作与 Confluence 成果文档，衡量各方的共建投入。"
        meta={
          <>
            <Badge tone="brand">GitHub + Confluence</Badge>
            {summary.data ? (
              <span className="text-xs text-slate-500">
                数据更新于 {formatDateTime(summary.data.updatedAt)}
              </span>
            ) : null}
            {isFiltersDirty ? <Badge tone="amber">已应用筛选</Badge> : null}
          </>
        }
      />

      <ActivityFilters
        organizations={organizationOptions.data ?? []}
        value={filters}
        onChange={handleChange}
        onReset={handleReset}
        rangeHint={RANGE_HINT}
        isFetching={isFetching}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <ContributionCompositionCard
            contributions={contributions.data}
            isLoading={contributions.isLoading}
            isError={contributions.isError}
            error={contributions.error}
            onRetry={() => void contributions.refetch()}
          />
        </div>
        <div className="xl:col-span-3">
          <ContributorRankCard
            contributors={contributorContributions.data}
            organizations={organizationOptions.data ?? []}
            isLoading={contributorContributions.isLoading}
            isError={contributorContributions.isError}
            error={contributorContributions.error}
            onRetry={() => void contributorContributions.refetch()}
            updatedAt={summary.data?.updatedAt}
          />
        </div>
      </div>

      {contributions.isError !== wiki.isError ? (
        <Card className="reveal border-amber-400/20 bg-amber-500/[0.05]">
          <p className="text-xs leading-relaxed text-amber-100/80">
            数据源部分可用：{contributions.isError ? 'GitHub 贡献数据' : 'Confluence 成果数据'}
            加载失败，当前表格中该部分指标按 0 展示。
          </p>
        </Card>
      ) : null}

      <ActivityTable
        rows={rows}
        isLoading={isLoading}
        isError={contributions.isError && wiki.isError}
        error={contributions.error ?? wiki.error}
        onRetry={() => {
          void contributions.refetch();
          void wiki.refetch();
        }}
      />
    </div>
  );
}
