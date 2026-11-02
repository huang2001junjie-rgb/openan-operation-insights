import type { ReactNode } from 'react';
import { AsyncState } from '@/components/ui/AsyncState';
import { IconActivity, IconCalendar, IconClock, IconTag } from '@/components/icons';
import { PageHeading } from '@/components/layout/PageHeading';
import { SkeletonMetricCard, SkeletonTable } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { Card } from '@/components/ui/Card';
import { RepoReleaseTable } from '@/features/release/RepoReleaseTable';
import { useRepoReleases } from '@/hooks/useRepoReleases';
import type { RepoReleasesData } from '@/types/contract';

function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 距今天数（0 表示当天）——整日口径，与表格列一致 */
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY_MS));

function ReleasesStatGrid({ data }: { data: RepoReleasesData }) {
  return (
    <StatRow>
      <StatCard
        label="有 Release 的组件"
        metric={{ value: data.repos.length }}
        icon={<IconTag width={16} height={16} />}
        hint={`采集范围内共 ${data.totalInScope} 个仓库`}
      />
      <StatCard
        label="近 90 天发布"
        metric={{ value: data.recent90dCount }}
        icon={<IconActivity width={16} height={16} />}
        tone="accent"
        hint="采集范围内全部 Release 计数"
      />
      <StatCard
        label="最近一次发布"
        metric={{
          value: data.latestRelease ? daysSince(data.latestRelease.publishedAt) : 0,
          unit: '天前',
        }}
        icon={<IconClock width={16} height={16} />}
        tone="violet"
        hint={data.latestRelease ? `${data.latestRelease.repoId} · ${data.latestRelease.tag}` : '暂无发布'}
      />
      <StatCard
        label="平均发布周期"
        metric={{ value: data.avgDaysBetweenReleases ?? 0, unit: '天' }}
        icon={<IconCalendar width={16} height={16} />}
        tone="amber"
        hint={
          data.avgDaysBetweenReleases != null
            ? '各组件发布间隔均值（按组件等权）'
            : '需至少 2 次发布才能计算'
        }
      />
    </StatRow>
  );
}

/**
 * 版本发布页（ADR-0019）：统计采集范围内各组件的 GitHub Release 发布情况。
 * 顶部汇总卡片 + 组件明细表；只列有 Release 的组件，无 Release 仓库在表尾声明行列出。
 */
export function ReleasesPage() {
  const query = useRepoReleases();
  const { data, isLoading, isError, error, refetch } = query;

  return (
    <div className="page-enter space-y-6">
      <PageHeading
        eyebrow="版本发布"
        title="组件版本发布情况"
        description="统计采集范围内各 GitHub 仓库的 Release 发布情况。「最新版本」按发布时间（publishedAt）取最新、tag 原样展示；数据由 collect:github 采集落盘（ADR-0019）。"
      />

      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        skeleton={
          <StatRow>
            <SkeletonMetricCard />
            <SkeletonMetricCard delay={60} />
            <SkeletonMetricCard delay={120} />
            <SkeletonMetricCard delay={180} />
          </StatRow>
        }
      >
        {data ? <ReleasesStatGrid data={data} /> : null}
      </AsyncState>

      <AsyncState
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        skeleton={
          <Card padded={false}>
            <SkeletonTable rows={8} />
          </Card>
        }
      >
        {data ? (
          <RepoReleaseTable
            rows={data.repos}
            reposWithoutReleases={data.reposWithoutReleases}
            updatedAt={data.updatedAt}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={() => void refetch()}
          />
        ) : null}
      </AsyncState>

      {data ? (
        <p className="reveal flex items-center gap-1.5 text-[0.7rem] text-slate-600">
          <IconTag width={12} height={12} />
          版本发布页（ADR-0019）：GitHub Releases 原子事实读时派生，collect:github 每次采集整体更新。
        </p>
      ) : null}
    </div>
  );
}
