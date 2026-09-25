import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { daysUntil, formatDateRange } from '@/lib/format';
import { IconArrowRight, IconCalendar, IconClock, IconExternal, IconPin } from '@/components/icons';
import type { SummitSummary } from '@/types/contract';

export function NextSummitBanner({ summit }: { summit: SummitSummary | null }) {
  if (!summit) {
    return (
      <Card className="reveal" padded={false}>
        <EmptyState
          className="border-0 bg-transparent"
          icon={<IconCalendar width={22} height={22} />}
          title="暂无已排期的峰会"
          hint="当 summits.json 中存在未结束的峰会时，这里会展示最近一场的信息与倒计时。"
        />
      </Card>
    );
  }

  const countdown = daysUntil(summit.startDate);

  return (
    <Card className="reveal overflow-hidden p-0">
      {/* 顶部渐变条：提示"进行中/即将开始" */}
      <div className="h-1 w-full bg-gradient-to-r from-brand-500 via-accent-400 to-violet-500 opacity-80" />

      <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">
              <IconClock width={12} height={12} />
              下一次峰会
            </Badge>
            {countdown > 0 ? (
              <span className="text-[0.72rem] text-slate-400">
                距开始还有 <span className="numeric font-semibold text-slate-200">{countdown}</span> 天
              </span>
            ) : (
              <span className="text-[0.72rem] text-slate-400">峰会进行中</span>
            )}
          </div>

          <h3 className="mt-3 truncate text-lg font-semibold tracking-tight text-white sm:text-xl">
            {summit.name}
          </h3>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <IconCalendar width={14} height={14} className="text-slate-500" />
              {formatDateRange(summit.startDate, summit.endDate)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconPin width={14} height={14} className="text-slate-500" />
              {summit.location}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          <Link
            to="/summits"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_30px_-16px_rgba(36,114,245,0.95)] transition hover:from-brand-400 hover:to-brand-500"
          >
            查看社区参展
            <IconArrowRight width={16} height={16} />
          </Link>
          {summit.websiteUrl ? (
            <a
              href={summit.websiteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/[0.08]"
            >
              峰会主页
              <IconExternal width={15} height={15} />
            </a>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
