import { Badge } from '@/components/ui/Badge';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonList } from '@/components/ui/Skeleton';
import { IconBolt, IconChevronDown, IconChevronRight } from '@/components/icons';
import { KeyMetricsStrip } from '@/features/home/KeyMetricsStrip';
import { NextSummitBanner } from '@/features/home/NextSummitBanner';
import { OrganizationWall } from '@/features/home/OrganizationWall';
import { useContributingOrganizations, useHomeSummary } from '@/hooks/useHomeSummary';
import { formatDateTime } from '@/lib/format';
import { APP_VERSION } from '@/lib/version';

/** 指标口径条目（首页口径说明，默认折叠）；口径变更须同步修改后端契约与前端类型 */
const METRIC_DEFINITIONS: Array<{ term: string; def: string }> = [
  {
    term: '伙伴单位',
    def: 'home.json 中运营维护的计数（partnerCount），口径为 organizations.json 内的 TSC 成员单位、参与单位与运营单位（即 type !== individual，与组织墙在榜数一致）',
  },
  {
    term: '独立开发者',
    def: '生效归属为伪组织 unattributed（type=individual）、且非机器账号的 GitHub 贡献者数；生效归属 = 人工认领优先于采集推断，改完即时生效（不落盘、不等采集）',
  },
  { term: '社区峰会', def: 'summits.json 中全部峰会条目数' },
  { term: '应用案例', def: '年度案例登记表中通过评审的案例数' },
  {
    term: '贡献组织',
    def: '全部组织档案按运营人工排位的展示顺序（displayOrder）升序排列，同值/缺失按名称升序兜底；两项贡献量均为 0 的组织显示「暂无贡献」',
  },
  {
    term: '代码贡献量',
    def: '已合并 PR 内的提交总数（github.commits）；组织级由账号级按生效归属求和（读时派生、覆盖全部组织档案，未命中记 0），top3 为组织内按提交数降序的前三位真人贡献者（机器账号不计入人物榜，其提交量仍计入合计）。本页恒为累计值（全量口径）',
  },
  {
    term: 'Confluence 贡献量',
    def: '编辑量，即作为页面版本作者的版本条数（含创建那一次，ADR-0011）；top3 为组织内按编辑量降序的前三位账号。本页恒为累计值（全量口径）',
  },
  {
    term: '时间口径',
    def: '本页（首页）所有数字恒为**全量口径**（累计），没有区间筛选器；活跃度页的 GitHub 数字可按时间区间（半开区间 from ≤ 事件时间 < to，日界按北京时间）过滤，未选区间时同为全量口径。Confluence 侧无时间维度明细，任何视图下都是全量累计',
  },
];

export function HomePage() {
  const summary = useHomeSummary();
  const organizations = useContributingOrganizations();

  return (
    <div className="space-y-10">
      {/* ── Hero：大字排版，版本号即主视觉 ─────────────── */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-brand-400/90">
            Operation Insights
          </p>
          <h1 className="text-gradient-brand mt-3 text-[3.25rem] font-bold leading-[0.95] tracking-tight sm:text-7xl lg:text-[5.5rem]">
            {APP_VERSION}
          </h1>
          <p className="mt-5 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">社区运营概览</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:flex-col lg:items-end">
          <Badge tone="brand">数据契约 v1</Badge>
          {summary.data ? (
            <span className="text-xs text-slate-500">
              数据更新于 {formatDateTime(summary.data.updatedAt)}
            </span>
          ) : null}
          {summary.isFetching ? <span className="text-xs text-slate-500">同步中…</span> : null}
        </div>
      </header>

      {/* ── 关键指标：去卡片「天际线」排版 ─────────────── */}
      <section aria-label="关键指标">
        <KeyMetricsStrip
          summary={summary.data}
          isLoading={summary.isLoading}
          isError={summary.isError}
          error={summary.error}
          onRetry={() => void summary.refetch()}
        />
      </section>

      {/* ── 下一次峰会：无框横条 ─────────────────────── */}
      <NextSummitBanner summit={summary.data?.nextSummit ?? null} isLoading={summary.isLoading} />

      {/* ── 贡献组织卡片墙 ───────────────────────────── */}
      <section aria-label="贡献组织" className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Contributing Organizations
            </p>
            <h2 className="mt-2 flex items-center gap-2.5 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
              <IconBolt width={20} height={20} className="text-accent-600" />
              贡献组织
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-400">
              展示全部在榜组织，按运营指定的展示顺序排列；卡片直出代码贡献量、Confluence
              贡献量与各维度 top3 贡献者。
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
            <div className="glass-card p-5">
              <SkeletonList rows={4} />
            </div>
          }
        >
          <OrganizationWall
            organizations={organizations.data ?? []}
            individualCount={summary.data?.externalDeveloperCount.value}
          />
        </AsyncState>
      </section>

      {/* ── 指标口径：默认折叠 ───────────────────────── */}
      <section aria-label="指标口径">
        <details className="group border-t border-ink-950/[0.07] pt-5">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 text-sm font-medium text-slate-400 transition-colors hover:text-slate-200 [&::-webkit-details-marker]:hidden">
            <IconChevronRight
              width={14}
              height={14}
              className="shrink-0 text-slate-600 group-open:hidden"
            />
            <IconChevronDown
              width={14}
              height={14}
              className="hidden shrink-0 text-slate-600 group-open:block"
            />
            指标口径
            <span className="hidden text-xs font-normal text-slate-600 sm:inline">
              数据只读展示；口径变更须同步修改后端契约与前端类型
            </span>
          </summary>
          <dl className="details-body mt-5 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            {METRIC_DEFINITIONS.map((item) => (
              <div key={item.term} className="rounded-xl border border-ink-950/[0.07] bg-ink-950/[0.02] p-3.5">
                <dt className="font-semibold text-slate-200">{item.term}</dt>
                <dd className="mt-1.5 leading-relaxed text-slate-500">{item.def}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
    </div>
  );
}
