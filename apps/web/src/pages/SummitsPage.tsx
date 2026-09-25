import { useEffect, useMemo, useState } from 'react';
import { PageHeading } from '@/components/layout/PageHeading';
import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { Segmented, type SegmentedOption } from '@/components/ui/Segmented';
import { SkeletonMetricCard } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { ErrorState } from '@/components/ui/States';
import { IconCalendar, IconLayers, IconSparkle, IconUsers } from '@/components/icons';
import { SummitAnchorBar } from '@/features/summits/SummitAnchorBar';
import { SummitDetailPanel } from '@/features/summits/SummitDetailPanel';
import { SummitTimeline } from '@/features/summits/SummitTimeline';
import { isSummitDetail, useSummitDetail, useSummits } from '@/hooks/useSummits';
import type { SummitSummary } from '@/types/contract';

const ALL_YEARS = 'all';

function yearOf(iso: string): number | null {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

export function SummitsPage() {
  const [year, setYear] = useState<string>(ALL_YEARS);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** 全量（含详情）—— 用于年份分布、规模指标与锚点条 */
  const overview = useSummits({ includeDetail: true, pageSize: 100 });
  const overviewRows = overview.data?.items ?? [];

  const details = useMemo(() => overviewRows.filter(isSummitDetail), [overviewRows]);

  const yearOptions = useMemo(() => {
    const counts = new Map<number, number>();
    for (const summit of overviewRows) {
      const value = yearOf(summit.startDate);
      if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [overviewRows]);

  const stats = useMemo(() => {
    const attending = new Set<string>();
    let attendees = 0;
    for (const summit of details) {
      attendees += summit.attendeeCount;
      for (const org of summit.attendingOrganizations) attending.add(org);
    }
    return {
      total: overviewRows.length,
      attendees,
      organizationCount: attending.size,
      upcoming: overviewRows.filter((summit) => summit.isUpcoming).length,
    };
  }, [overviewRows, details]);

  /** 时间线：走服务端的 year 筛选参数 */
  const list = useSummits({
    year: year === ALL_YEARS ? undefined : Number(year),
    pageSize: 100,
  });
  const summits = list.data?.items ?? [];

  useEffect(() => {
    if (summits.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && summits.some((summit) => summit.id === current) ? current : summits[0].id,
    );
  }, [summits]);

  const detail = useSummitDetail(selectedId);

  const segmentOptions = useMemo<Array<SegmentedOption<string>>>(() => {
    return [
      { value: ALL_YEARS, label: '全部', count: overviewRows.length },
      ...yearOptions.map(([value, count]) => ({ value: String(value), label: `${value} 年`, count })),
    ];
  }, [overviewRows.length, yearOptions]);

  const handleAnchorSelect = (summit: SummitSummary) => {
    setSelectedId(summit.id);
    const targetYear = yearOf(summit.startDate);
    const isVisible = summits.some((item) => item.id === summit.id);
    if (!isVisible && targetYear !== null) setYear(String(targetYear));
  };

  const handleFilterChange = (next: string) => {
    setYear(next);
    if (next === ALL_YEARS) setSelectedId(null);
  };

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Community Summits"
        title="社区参展"
        description="社区峰会与全体峰会的台账：会期、参会规模、参会组织名单与峰会成果。"
        meta={
          <>
            <Badge tone="violet">峰会台账</Badge>
            {overview.data ? (
              <span className="text-xs text-slate-500">
                共 <span className="numeric font-semibold text-slate-300">{overview.data.total}</span> 场峰会
                {yearOptions.length > 0 ? `，覆盖 ${yearOptions.length} 个年度` : ''}
              </span>
            ) : null}
            {list.isFetching ? <span className="text-xs text-slate-500">同步中…</span> : null}
          </>
        }
      />

      {/* ── 峰会规模指标 ───────────────────────────────── */}
      <section aria-label="峰会指标">
        {overview.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <SkeletonMetricCard key={index} delay={index * 70} />
            ))}
          </div>
        ) : overview.isError ? (
          <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="峰会场次"
              metric={{ value: stats.total, unit: '场' }}
              icon={<IconCalendar width={17} height={17} />}
              tone="brand"
              hint="含峰会与全体峰会"
              delay={0}
            />
            <StatCard
              label="累计参会人次"
              metric={{ value: stats.attendees, unit: '人次' }}
              icon={<IconUsers width={17} height={17} />}
              tone="accent"
              hint="按各场峰会登记人数累加"
              delay={70}
            />
            <StatCard
              label="参会组织"
              metric={{ value: stats.organizationCount, unit: '家' }}
              icon={<IconLayers width={17} height={17} />}
              tone="violet"
              hint="至少参与过一场峰会的组织（去重）"
              delay={140}
            />
            <StatCard
              label="即将召开"
              metric={{ value: stats.upcoming, unit: '场' }}
              icon={<IconSparkle width={17} height={17} />}
              tone="amber"
              hint="已登记的未来社区活动"
              delay={210}
            />
          </div>
        )}
      </section>

      {/* ── 锚点条 ─────────────────────────────────────── */}
      <section aria-label="峰会锚点">
        <SummitAnchorBar
          summits={overviewRows}
          selectedId={selectedId}
          onSelect={handleAnchorSelect}
          className="reveal"
        />
      </section>

      {/* ── 时间线 + 详情 ──────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="reveal self-start">
          <CardTitle
            title="峰会时间线"
            description="按召开时间倒序排列，点击任意一场查看详情。"
            icon={<IconCalendar width={16} height={16} />}
            action={
              segmentOptions.length > 1 ? (
                <Segmented
                  options={segmentOptions}
                  value={year}
                  onChange={handleFilterChange}
                  size="sm"
                />
              ) : null
            }
          />
          <div className="mt-5">
            <SummitTimeline
              summits={summits}
              selectedId={selectedId}
              onSelect={setSelectedId}
              isLoading={list.isLoading}
              isError={list.isError}
              error={list.error}
              onRetry={() => void list.refetch()}
            />
          </div>
        </Card>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <SummitDetailPanel
            summit={detail.data}
            isLoading={detail.isLoading && Boolean(selectedId)}
            isError={detail.isError}
            error={detail.error}
            onRetry={() => void detail.refetch()}
          />
        </div>
      </div>
    </div>
  );
}
