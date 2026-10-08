import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { ErrorState } from '@/components/ui/States';
import { SkeletonList, SkeletonMetricCard } from '@/components/ui/Skeleton';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeading } from '@/components/layout/PageHeading';
import { NextSummitBanner } from '@/features/home/NextSummitBanner';
import { OrganizationWall } from '@/features/home/OrganizationWall';
import { useContributingOrganizations, useHomeSummary } from '@/hooks/useHomeSummary';
import { formatDateTime } from '@/lib/format';
import {
  IconBolt,
  IconBuilding,
  IconLayers,
  IconSparkle,
  IconUsers,
} from '@/components/icons';

export function HomePage() {
  const summary = useHomeSummary();
  const organizations = useContributingOrganizations();

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Operation Insights"
        title="社区运营概览"
        description="伙伴共建规模、社区贡献与峰会参与的统一视图。所有数字均来自后端 JSON 数据源，前端只做呈现。"
        meta={
          <>
            <Badge tone="brand">数据契约 v1</Badge>
            {summary.data ? (
              <span className="text-xs text-slate-500">
                数据更新于 {formatDateTime(summary.data.updatedAt)}
              </span>
            ) : null}
            {summary.isFetching ? (
              <span className="text-xs text-slate-500">同步中…</span>
            ) : null}
          </>
        }
      />

      {/* ── 四项关键指标 ───────────────────────────────── */}
      <section aria-label="关键指标">
        {summary.isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <SkeletonMetricCard key={index} delay={index * 70} />
            ))}
          </div>
        ) : summary.isError ? (
          <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
        ) : summary.data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="伙伴单位"
              metric={summary.data.partnerCount}
              icon={<IconBuilding width={17} height={17} />}
              tone="brand"
              hint="签署共建协议的组织"
              delay={0}
            />
            <StatCard
              label="外部开发者"
              metric={summary.data.externalDeveloperCount}
              icon={<IconUsers width={17} height={17} />}
              tone="accent"
              hint="参与过社区贡献的外部开发者"
              delay={70}
            />
            <StatCard
              label="社区峰会"
              metric={summary.data.summitCount}
              icon={<IconSparkle width={17} height={17} />}
              tone="violet"
              hint="含峰会与全体峰会"
              delay={140}
            />
            <StatCard
              label="应用案例"
              metric={summary.data.useCaseCount}
              icon={<IconLayers width={17} height={17} />}
              tone="amber"
              hint="社区沉淀的可运行案例"
              delay={210}
            />
          </div>
        ) : null}
      </section>

      {/* ── 下一次峰会 ─────────────────────────────────── */}
      <section aria-label="下一次峰会">
        {summary.isLoading ? (
          <Card className="reveal h-[136px] animate-pulse" />
        ) : summary.isError ? null : (
          <NextSummitBanner summit={summary.data?.nextSummit ?? null} />
        )}
      </section>

      {/* ── 贡献组织卡片墙 ─────────────────────────────── */}
      <section aria-label="贡献组织" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-white">
              <IconBolt width={17} height={17} className="text-accent-300" />
              贡献组织
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              展示全部社区组织，按综合贡献分降序排列；分数由代码协作行为、成果文档数量加权得出。
            </p>
          </div>
          {organizations.data ? (
            <span className="text-xs text-slate-500">
              共{' '}
              <span className="numeric font-semibold text-slate-300">
                {organizations.data.filter((org) => org.type !== 'individual').length}
              </span>{' '}
              家组织在榜
              {organizations.data.some((org) => org.type === 'individual') ? (
                <>
                  ，另有{' '}
                  <span className="numeric font-semibold text-slate-300">
                    {summary.data?.externalDeveloperCount.value ?? 0}
                  </span>{' '}
                  位独立开发者
                </>
              ) : null}
            </span>
          ) : null}
        </div>

        <AsyncState
          isLoading={organizations.isLoading}
          isError={organizations.isError}
          error={organizations.error}
          isEmpty={organizations.data?.length === 0}
          onRetry={() => void organizations.refetch()}
          emptyTitle="暂无组织档案"
          emptyHint="仅当 organizations.json 中没有任何组织档案时才会出现此空态；组织展示不依赖贡献数据（ADR-0001）。"
          skeleton={
            <Card>
              <SkeletonList rows={4} />
            </Card>
          }
        >
          <OrganizationWall
            organizations={organizations.data ?? []}
            individualCount={summary.data?.externalDeveloperCount.value}
          />
        </AsyncState>
      </section>

      {/* ── 口径说明 ───────────────────────────────────── */}
      <section aria-label="指标口径">
        <Card className="reveal">
          <CardTitle
            title="指标口径"
            description="数据只读展示；口径变更须同步修改后端契约与前端类型。"
            icon={<IconSparkle width={16} height={16} />}
          />
          <dl className="mt-5 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            {[
              { term: '伙伴单位', def: 'home.json 中运营维护的伙伴单位计数（partnerCount），口径为签署共建协议的组织' },
              { term: '外部开发者', def: 'github-accounts.json 中 orgId 为空的贡献者数' },
              {
                term: '独立开发者',
                def: '未归属到任何组织的贡献者；贡献归入伪组织 unattributed（type=individual）',
              },
              { term: '社区峰会', def: 'summits.json 中全部峰会条目数' },
              { term: '应用案例', def: '年度案例登记表中通过评审的案例数' },
              {
                term: '贡献组织',
                def: '全部组织档案按综合贡献分降序排列；0 分组织显示「暂无贡献」',
              },
            ].map((item) => (
              <div key={item.term} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <dt className="font-semibold text-slate-200">{item.term}</dt>
                <dd className="mt-1.5 leading-relaxed text-slate-500">{item.def}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </section>
    </div>
  );
}
