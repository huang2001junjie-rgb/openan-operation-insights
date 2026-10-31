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
import { RepoContributionTable } from '@/features/activity/RepoContributionTable';
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
  useRepoContributions,
} from '@/hooks/useActivity';
import { formatDateTime, rangeEndInstant, rangeStartInstant } from '@/lib/format';

/**
 * 默认**不带区间** ≡ 全量口径（All-time），ADR-0018 决策 2。
 *
 * 刻意不写死年份：区间真正生效后，`from: '2026-01-01'` 这类默认值就是一颗定时炸弹——
 * 跨年那天默认视图会变成全 0 的空榜单，而徽章（只在手改后出现）与 URL（不含 from/to）
 * 都无法解释原因。「看某段时间」因此是一次**显式动作**（预设按钮或手填），
 * 默认视图的数字与激活区间筛选之前完全一致。
 */
const DEFAULT_FILTERS: ActivityFilterState = {
  orgIds: [],
  repoIds: [],
  from: '',
  to: '',
};

const RANGE_HINT =
  'GitHub 侧按事件时间戳（PR=mergedAt、Issue=createdAt）过滤，半开区间 from ≤ 时间 < to、日界按北京时间切；不选区间即全量累计。Confluence 侧落盘的是账号级累计计数、无时间维度明细，恒为全历史——表内标「全历史」的列即此口径。';
const CONFLUENCE_RANGE_HINT =
  'Confluence 侧落盘的是账号级累计计数（需求数 / 专题分享数 / 页面编辑数），没有可切片的时间维度，故本视图恒为全历史累计、不提供区间筛选；补上 Confluence 事件级事实后再开放（见「已知问题」）。';

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

  /**
   * 区间参数（仅 GitHub 侧使用）：日期 → 时刻的翻译在这里完成，
   * 下界含开始日零点、上界含结束日**次日**零点（半开区间，日界按 Asia/Shanghai，ADR-0018 决策 3）。
   */
  const rangeParams = useMemo(
    () => ({
      from: rangeStartInstant(filters.from),
      to: rangeEndInstant(filters.to),
    }),
    [filters.from, filters.to],
  );

  /** Confluence 侧恒为全量口径：区间既不过滤，也不该进它的请求与 query key（否则改区间会白白 refetch） */
  const params = useMemo(
    () => ({ orgIds: filters.orgIds.length > 0 ? filters.orgIds : undefined }),
    [filters.orgIds],
  );

  /** GitHub 侧额外带区间与仓库筛选；Confluence 无仓库概念，wiki / confluence-accounts 不透传这两个参数 */
  const githubParams = useMemo(
    () => ({
      ...params,
      ...rangeParams,
      repoIds: filters.repoIds.length > 0 ? filters.repoIds : undefined,
    }),
    [params, rangeParams, filters.repoIds],
  );

  /** 区间是否真的生效：仅 GitHub 视图、且用户选了区间（用于给 Confluence 列打「全历史」标记） */
  const isRangeActive = isGithub && Boolean(filters.from || filters.to);

  const contributions = useContributions(githubParams, isGithub);
  const summary = useContributionSummary(githubParams, isGithub);
  const contributorContributions = useContributorContributions(githubParams, isGithub);
  const confluenceAccounts = useConfluenceAccounts(params, !isGithub);
  // 组织级成果两套视图共用（GitHub 明细表的 Confluence 列 / Confluence 视图的环图与明细表）
  const wiki = useWiki(params);
  const organizationOptions = useOrganizationOptions();
  /**
   * 仓库维度明细：**随区间变化**（与组织级 / 账号级同口径，恒等式「仓库级求和 ≡ 组织级」才成立），
   * 但**不随 repoIds 变化**（选仓库 = 客户端挑行）。它同时提供筛选候选，故候选随区间收缩。
   */
  const repoContributions = useRepoContributions(rangeParams, isGithub);

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

  /**
   * 仓库筛选候选 = 当前区间内实际出现过的仓库；短名展示，hint 为 owner（可被搜索命中）。
   *
   * 已勾选但区间内无活动的仓库**保留为候选**并标注（ADR-0018 决策 6）：否则该筛选条件会从
   * 下拉与 chip 里双双消失，用户既看不出「我选过它」，也无从取消勾选（只剩「重置」一条路）。
   */
  const repoOptions = useMemo(() => {
    const inRange = (repoContributions.data ?? []).map((row) => ({
      value: row.repoId,
      label: row.repoId.split('/')[1] ?? row.repoId,
      hint: row.repoId.split('/')[0] ?? '',
    }));
    const known = new Set(inRange.map((option) => option.value));
    const stale = filters.repoIds
      .filter((repoId) => !known.has(repoId))
      .map((repoId) => ({
        value: repoId,
        label: repoId.split('/')[1] ?? repoId,
        hint: `${repoId.split('/')[0] ?? ''} · 区间内无活动`,
      }));
    return [...inRange, ...stale];
  }, [repoContributions.data, filters.repoIds]);

  /** 已勾选但在当前区间内无活动的仓库（筛选卡里显式提示，不静默吞掉筛选条件） */
  const staleRepoIds = useMemo(() => {
    if (!isRangeActive) return [];
    const known = new Set((repoContributions.data ?? []).map((row) => row.repoId));
    return filters.repoIds.filter((repoId) => !known.has(repoId));
  }, [repoContributions.data, filters.repoIds, isRangeActive]);

  /** 仓库明细行：全量数据按 repoIds 客户端挑行（空选 ≡ 全选） */
  const repoRows = useMemo(() => {
    const rows = repoContributions.data ?? [];
    return filters.repoIds.length > 0
      ? rows.filter((row) => filters.repoIds.includes(row.repoId))
      : rows;
  }, [repoContributions.data, filters.repoIds]);

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
      repoContributions.isFetching ||
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
        repoOptions={isGithub ? repoOptions : undefined}
        value={filters}
        onChange={handleChange}
        onReset={handleReset}
        rangeHint={isGithub ? RANGE_HINT : CONFLUENCE_RANGE_HINT}
        rangeDisabled={!isGithub}
        staleRepoIds={staleRepoIds}
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
            rangeActive={isRangeActive}
            isLoading={isLoading}
            isError={contributions.isError && wiki.isError}
            error={contributions.error ?? wiki.error}
            onRetry={() => {
              void contributions.refetch();
              void wiki.refetch();
            }}
          />

          <RepoContributionTable
            rows={repoRows}
            isLoading={repoContributions.isLoading}
            isError={repoContributions.isError}
            error={repoContributions.error}
            onRetry={() => void repoContributions.refetch()}
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
