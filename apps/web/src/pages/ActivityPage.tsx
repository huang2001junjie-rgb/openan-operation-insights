import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeading } from '@/components/layout/PageHeading';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { IconArrowRight } from '@/components/icons';
import { ActivityFilters, type ActivityFilterState } from '@/features/activity/ActivityFilters';
import {
  ActivitySourceSwitcher,
  type ActivitySource,
} from '@/features/activity/ActivitySourceSwitcher';
import { ActivityTable } from '@/features/activity/ActivityTable';
import { ConfluenceAccountRankCard } from '@/features/activity/ConfluenceAccountRankCard';
import { ConfluenceCompositionCard } from '@/features/activity/ConfluenceCompositionCard';
import { ConfluenceDetailTable } from '@/features/activity/ConfluenceDetailTable';
import { ContributionCompositionCard } from '@/features/activity/ContributionCompositionCard';
import { ContributorRankCard } from '@/features/activity/ContributorRankCard';
import { mergeActivityRows, mergeConfluenceRows } from '@/features/activity/merge';
import {
  ORG_UNATTRIBUTED,
  UNATTRIBUTED_LABEL,
  toDisplayOrgNamedList,
  toDisplayOrganizations,
} from '@/features/activity/org-display';
import {
  useConfluenceAccounts,
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

/** Confluence 视图未认领提示：链到身份控制台并预选 Confluence 候选分组（见 02 §4.2） */
function ConfluenceClaimNotice({ count }: { count: number }) {
  return (
    <Card className="reveal flex flex-wrap items-center justify-between gap-3 border-amber-400/20 bg-amber-500/[0.05]">
      <p className="text-xs leading-relaxed text-amber-100/85">
        有 <span className="numeric font-semibold text-amber-200">{count}</span> 个 Confluence
        账号尚未归属组织，默认归入「{UNATTRIBUTED_LABEL}」；认领后归属即时生效。
      </p>
      <Link
        to="/admin/identity?source=confluence"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:border-amber-300/50 hover:bg-amber-500/20"
      >
        去账号认领
        <IconArrowRight width={14} height={14} />
      </Link>
    </Card>
  );
}

export function ActivityPage() {
  const [filters, setFilters] = useState<ActivityFilterState>(DEFAULT_FILTERS);
  const [isFiltersDirty, setFiltersDirty] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const source: ActivitySource =
    searchParams.get('source') === 'confluence' ? 'confluence' : 'github';
  const isGithub = source === 'github';

  const handleSourceChange = (next: ActivitySource) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'github') params.delete('source');
    else params.set('source', next);
    // replace 语义：来源切换不污染浏览器历史，筛选条件保留在 query 中
    setSearchParams(params, { replace: true });
  };

  const params = useMemo(
    () => ({
      orgIds: filters.orgIds.length > 0 ? filters.orgIds : undefined,
      from: fromDateInput(filters.from),
      to: fromDateInput(filters.to),
    }),
    [filters],
  );

  const contributions = useContributions(params, isGithub);
  const summary = useContributionSummary(params, isGithub);
  const contributorContributions = useContributorContributions(params, isGithub);
  const confluenceAccounts = useConfluenceAccounts(params, !isGithub);
  // 组织级成果两套视图共用（GitHub 明细表的 Confluence 列 / Confluence 视图的环图与明细表）
  const wiki = useWiki(params);
  const organizationOptions = useOrganizationOptions();

  /**
   * 伪组织展示名替换（本页统一）：用 individual 代替「独立开发者」（见 org-display）。
   * 组织档案、GitHub 贡献、Confluence 成果三处数据源的名称都换成展示视图，
   * 下游（筛选下拉 / 环形图 / 明细表 / 排行卡）拿到的即最终展示名。
   */
  const organizations = useMemo(
    () => toDisplayOrganizations(organizationOptions.data ?? []),
    [organizationOptions.data],
  );
  const contributionsData = useMemo(
    () => toDisplayOrgNamedList(contributions.data ?? []),
    [contributions.data],
  );
  const wikiData = useMemo(() => toDisplayOrgNamedList(wiki.data ?? []), [wiki.data]);

  /** 明细表底表：全量组织档案，随 orgIds 筛选收窄（ADR-0002） */
  const organizationRows = useMemo(() => {
    const selected = params.orgIds;
    return selected ? organizations.filter((org) => selected.includes(org.orgId)) : organizations;
  }, [organizations, params.orgIds]);

  const githubRows = useMemo(
    () => mergeActivityRows(contributionsData, wikiData, organizationRows),
    [contributionsData, wikiData, organizationRows],
  );

  const confluenceRows = useMemo(
    () => mergeConfluenceRows(wikiData, organizations),
    [wikiData, organizations],
  );

  const confluenceUpdatedAt = useMemo(() => {
    return wikiData.reduce<string | undefined>(
      (latest, item) => (!latest || Date.parse(item.updatedAt) > Date.parse(latest) ? item.updatedAt : latest),
      undefined,
    );
  }, [wikiData]);

  /** 未认领账号数：生效归属仍为伪组织 `unattributed` 的账号（三态提示依据 02 §4.2） */
  const unattributedCount = useMemo(
    () => (confluenceAccounts.data ?? []).filter((item) => item.effectiveOrgId === ORG_UNATTRIBUTED).length,
    [confluenceAccounts.data],
  );

  const isFetching = isGithub
    ? contributions.isFetching ||
      wiki.isFetching ||
      summary.isFetching ||
      contributorContributions.isFetching ||
      organizationOptions.isFetching
    : wiki.isFetching || confluenceAccounts.isFetching || organizationOptions.isFetching;

  const isLoading = isGithub
    ? contributions.isLoading || wiki.isLoading || organizationOptions.isLoading
    : wiki.isLoading || organizationOptions.isLoading;

  const handleChange = (next: ActivityFilterState) => {
    setFilters(next);
    setFiltersDirty(true);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setFiltersDirty(false);
  };

  const updatedAt = isGithub ? summary.data?.updatedAt : confluenceUpdatedAt;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Community Activity"
        title="社区活跃度"
        description="以组织为单位聚合 GitHub 代码协作与 Confluence 成果文档，衡量各方的共建投入。"
        meta={
          <>
            <Badge tone="brand">{isGithub ? 'GitHub 协作' : 'Confluence 成果'}</Badge>
            {updatedAt ? (
              <span className="text-xs text-slate-500">数据更新于 {formatDateTime(updatedAt)}</span>
            ) : null}
            {isFiltersDirty ? <Badge tone="amber">已应用筛选</Badge> : null}
          </>
        }
      />

      <ActivitySourceSwitcher value={source} onChange={handleSourceChange} />

      <ActivityFilters
        organizations={organizations}
        value={filters}
        onChange={handleChange}
        onReset={handleReset}
        rangeHint={RANGE_HINT}
        isFetching={isFetching}
      />

      {isGithub ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <ContributionCompositionCard
                contributions={contributionsData}
                isLoading={contributions.isLoading}
                isError={contributions.isError}
                error={contributions.error}
                onRetry={() => void contributions.refetch()}
              />
            </div>
            <div className="xl:col-span-3">
              <ContributorRankCard
                contributors={contributorContributions.data}
                organizations={organizations}
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
            rows={githubRows}
            isLoading={isLoading}
            isError={contributions.isError && wiki.isError}
            error={contributions.error ?? wiki.error}
            onRetry={() => {
              void contributions.refetch();
              void wiki.refetch();
            }}
          />
        </>
      ) : (
        <>
          {!confluenceAccounts.isLoading && !confluenceAccounts.isError && unattributedCount > 0 ? (
            <ConfluenceClaimNotice count={unattributedCount} />
          ) : null}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <ConfluenceCompositionCard
                wiki={wikiData}
                isLoading={wiki.isLoading}
                isError={wiki.isError}
                error={wiki.error}
                onRetry={() => void wiki.refetch()}
              />
            </div>
            <div className="xl:col-span-3">
              <ConfluenceAccountRankCard
                accounts={confluenceAccounts.data}
                organizations={organizations}
                isLoading={confluenceAccounts.isLoading}
                isError={confluenceAccounts.isError}
                error={confluenceAccounts.error}
                onRetry={() => void confluenceAccounts.refetch()}
                updatedAt={confluenceUpdatedAt}
              />
            </div>
          </div>

          <ConfluenceDetailTable
            rows={confluenceRows}
            isLoading={isLoading}
            isError={wiki.isError}
            error={wiki.error}
            onRetry={() => void wiki.refetch()}
          />
        </>
      )}
    </div>
  );
}
