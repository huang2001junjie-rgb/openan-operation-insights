import { ErrorState } from '@/components/ui/States';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { HomeSummary, MetricValue } from '@/types/contract';

/**
 * 首页关键指标条（首页改版：去卡片化）：
 * - 只保留运营指定的三个关键指标：伙伴单位 / 社区峰会 / 应用案例
 *  （「独立开发者」从关键指标撤下，仍由组织墙的独立开发者卡带出人数）；
 * - 非对称「天际线」排版：三项底部对齐在同一基线上，字号刻意错开
 *  （伙伴单位 8rem 渐变 > 社区峰会 6xl > 应用案例 4xl），落差形成视觉节奏；
 * - 无卡片、无背景框，项间只用 1px hairline 分隔（桌面竖向 / 移动横向）；
 * - 口径 hint 并入标签行且单行截断，保证三块头部严格同高、数字真正共基线；
 * - 全静态渲染：无 count-up、无进场动画（首页改版「零动效」决策）。
 */

interface MetricDef {
  key: 'partnerCount' | 'summitCount' | 'useCaseCount';
  label: string;
  hint: string;
  sizeClass: string;
  skeletonClass: string;
  gradient?: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: 'partnerCount',
    label: '伙伴单位',
    hint: 'TSC 成员单位与参与单位',
    sizeClass: 'text-[7rem] sm:text-[8rem]',
    skeletonClass: 'h-[7rem] w-40 sm:h-[8rem]',
    gradient: true,
  },
  {
    key: 'summitCount',
    label: '社区峰会',
    hint: '含峰会与全体峰会',
    sizeClass: 'text-5xl sm:text-6xl',
    skeletonClass: 'h-12 w-24 sm:h-14',
  },
  {
    key: 'useCaseCount',
    label: '应用案例',
    hint: '社区沉淀的可运行案例',
    sizeClass: 'text-3xl sm:text-4xl',
    skeletonClass: 'h-9 w-20 sm:h-10',
  },
];

/** 项间分隔线：桌面端竖向贯通、移动端横向（纯装饰） */
function MetricDivider() {
  return <div aria-hidden className="bg-ink-950/[0.07] max-sm:h-px max-sm:w-full sm:w-px sm:self-stretch" />;
}

function MetricFigure({ def, metric }: { def: MetricDef; metric?: MetricValue }) {
  return (
    <div className="min-w-0 flex-1">
      {/* 标签行：label + 口径 hint 同行、hint 单行截断；三块的头部严格同高，数字才能真正共基线 */}
      <div className="flex min-w-0 items-baseline gap-x-2 text-xs">
        <span className="shrink-0 font-semibold uppercase tracking-[0.16em] text-slate-300">
          {def.label}
        </span>
        <span className="truncate text-slate-500">{def.hint}</span>
      </div>
      <p
        className={cn(
          'numeric mt-4 font-semibold leading-none tracking-tight',
          def.sizeClass,
          def.gradient ? 'text-gradient-brand' : 'text-slate-50',
        )}
      >
        {metric ? formatNumber(metric.value) : '—'}
        {metric?.unit ? (
          <span className="ml-2 text-sm font-medium tracking-normal text-slate-500">{metric.unit}</span>
        ) : null}
      </p>
    </div>
  );
}

function MetricSkeleton({ def }: { def: MetricDef }) {
  return (
    <div className="min-w-0 flex-1">
      <Skeleton className="h-3.5 w-44 max-w-full" />
      <Skeleton className={cn('mt-4', def.skeletonClass)} />
    </div>
  );
}

export interface KeyMetricsStripProps {
  summary?: HomeSummary;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

export function KeyMetricsStrip({ summary, isLoading, isError, error, onRetry }: KeyMetricsStripProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-10" aria-hidden>
        <MetricSkeleton def={METRICS[0]} />
        <MetricDivider />
        <MetricSkeleton def={METRICS[1]} />
        <MetricDivider />
        <MetricSkeleton def={METRICS[2]} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState error={error} onRetry={onRetry} compact />;
  }

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-10">
      <MetricFigure def={METRICS[0]} metric={summary?.partnerCount} />
      <MetricDivider />
      <MetricFigure def={METRICS[1]} metric={summary?.summitCount} />
      <MetricDivider />
      <MetricFigure def={METRICS[2]} metric={summary?.useCaseCount} />
    </div>
  );
}
