import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { IconCalendar, IconChevronDown, IconPin } from '@/components/icons';
import { formatDateRange } from '@/lib/format';
import type { SummitSummary } from '@/types/contract';

export interface SummitTimelineProps {
  summits: SummitSummary[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

function monthDay(iso: string): { day: string; month: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: '--', month: '--' };
  return {
    day: String(date.getUTCDate()).padStart(2, '0'),
    month: `${date.getUTCMonth() + 1}月`,
  };
}

export function SummitTimeline({
  summits,
  selectedId,
  onSelect,
  isLoading = false,
  isError = false,
  error,
  onRetry,
  className,
}: SummitTimelineProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)} aria-busy>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 rounded-2xl border border-ink-950/[0.05] bg-ink-950/[0.02] p-4"
          >
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }

  if (summits.length === 0) {
    return (
      <EmptyState
        title="没有符合条件的峰会"
        hint="换一个年份查看，或等待下一场社区活动登记入库。"
      />
    );
  }

  return (
    <ol className={cn('relative', className)}>
      {summits.map((summit, index) => {
        const active = summit.id === selectedId;
        const isLast = index === summits.length - 1;
        const { day, month } = monthDay(summit.startDate);

        return (
          <li key={summit.id} className="relative flex gap-4 pb-3 last:pb-0">
            {/* 时间线轨道 */}
            <div className="relative flex w-4 shrink-0 justify-center pt-5">
              {isLast ? null : (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-ink-950/[0.16] to-ink-950/[0.05]"
                />
              )}
              <span
                aria-hidden
                className={cn(
                  'relative z-10 h-3 w-3 rounded-full border-2 transition-colors duration-300',
                  active
                    ? 'border-brand-300 bg-brand-500 shadow-[0_0_0_4px_rgba(36,114,245,0.16)]'
                    : summit.isUpcoming
                      ? 'border-accent-400/70 bg-ink-900'
                      : 'border-ink-950/25 bg-ink-900',
                )}
              />
            </div>

            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(summit.id)}
              style={{ '--d': `${index * 45}ms` } as CSSProperties}
              className={cn(
                'reveal group flex-1 rounded-2xl border p-4 text-left transition-all duration-300',
                active
                  ? 'border-brand-400/40 bg-brand-500/[0.09] shadow-[0_20px_44px_-30px_rgba(36,114,245,0.95)]'
                  : 'border-ink-950/[0.07] bg-ink-950/[0.02] hover:border-ink-950/[0.15] hover:bg-ink-950/[0.045]',
              )}
            >
              <div className="flex items-center gap-4">
                <span
                  className={cn(
                    'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border transition-colors duration-300',
                    active ? 'border-brand-400/35 bg-brand-500/12' : 'border-ink-950/[0.08] bg-ink-950/[0.03]',
                  )}
                >
                  <span className="numeric text-[0.95rem] font-semibold leading-none text-slate-50">
                    {day}
                  </span>
                  <span className="mt-0.5 text-[0.6rem] text-slate-500">{month}</span>
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-50">{summit.name}</span>
                    {summit.isUpcoming ? <Badge tone="accent">即将召开</Badge> : null}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.72rem] text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <IconCalendar width={13} height={13} className="text-slate-500" />
                      {formatDateRange(summit.startDate, summit.endDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <IconPin width={13} height={13} className="text-slate-500" />
                      {summit.location}
                    </span>
                  </span>
                </span>

                <IconChevronDown
                  width={16}
                  height={16}
                  className={cn(
                    'shrink-0 transition-transform duration-300',
                    active ? 'rotate-180 text-brand-600' : 'text-slate-500 group-hover:text-slate-300',
                  )}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
