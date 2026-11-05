import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { daysUntil, formatDateRange } from '@/lib/format';
import { IconArrowRight, IconCalendar, IconExternal, IconPin } from '@/components/icons';
import type { SummitSummary } from '@/types/contract';

/**
 * 下一场峰会横条（首页改版：去卡片化）：
 * - 无玻璃卡片，上下各一条 hairline，信息单行排开；
 * - 倒计时数字加大，作为横条的视觉锚点；
 * - 全静态渲染，无进场动画。
 */
export function NextSummitBanner({ summit, isLoading = false }: { summit: SummitSummary | null; isLoading?: boolean }) {
  if (isLoading) {
    return (
      <section aria-label="下一次峰会" className="border-y border-ink-950/[0.07] py-5">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-56 max-w-full" />
          <Skeleton className="ml-auto h-6 w-40 max-w-full" />
        </div>
      </section>
    );
  }

  if (!summit) {
    return (
      <section aria-label="下一次峰会" className="border-y border-ink-950/[0.07] py-5">
        <p className="flex items-center gap-2.5 text-sm text-slate-500">
          <IconCalendar width={15} height={15} className="shrink-0 text-slate-600" />
          暂无已排期的峰会；summits.json 出现未结束的峰会后，这里会显示最近一场的信息与倒计时。
        </p>
      </section>
    );
  }

  const countdown = daysUntil(summit.startDate);

  return (
    <section aria-label="下一次峰会" className="border-y border-ink-950/[0.07] py-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Badge tone="accent">下一次峰会</Badge>
        <h3 className="text-lg font-semibold tracking-tight text-slate-50">{summit.name}</h3>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
          <IconCalendar width={14} height={14} className="text-slate-500" />
          {formatDateRange(summit.startDate, summit.endDate)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
          <IconPin width={14} height={14} className="text-slate-500" />
          {summit.location}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
          {countdown > 0 ? (
            <span className="flex items-baseline gap-1.5 text-sm text-slate-400">
              距开始
              <span className="numeric text-3xl font-semibold leading-none text-slate-50">{countdown}</span>
              天
            </span>
          ) : (
            <span className="text-sm text-slate-400">峰会进行中</span>
          )}

          <Link
            to="/summits"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:from-brand-400 hover:to-brand-500"
          >
            查看社区参展
            <IconArrowRight width={15} height={15} />
          </Link>
          {summit.websiteUrl ? (
            <a
              href={summit.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink-950/12 bg-ink-950/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-ink-950/25 hover:bg-ink-950/[0.08]"
            >
              峰会主页
              <IconExternal width={14} height={14} />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
