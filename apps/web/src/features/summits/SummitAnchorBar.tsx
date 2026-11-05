import { cn } from '@/lib/cn';
import type { SummitSummary } from '@/types/contract';

export interface SummitAnchorBarProps {
  summits: SummitSummary[];
  selectedId?: string | null;
  onSelect: (summit: SummitSummary) => void;
  className?: string;
}

function anchorLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--/--';
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}/${day}`;
}

/** 峰会锚点条：横向滚动的快捷入口，点击直接定位到对应峰会 */
export function SummitAnchorBar({
  summits,
  selectedId,
  onSelect,
  className,
}: SummitAnchorBarProps) {
  if (summits.length === 0) return null;

  return (
    <div className={cn('relative', className)}>
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
        {summits.map((summit) => {
          const active = summit.id === selectedId;
          return (
            <button
              key={summit.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(summit)}
              className={cn(
                'group inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-all duration-300',
                active
                  ? 'border-brand-400/45 bg-brand-500/[0.12] text-white shadow-[0_14px_30px_-22px_rgba(36,114,245,0.95)]'
                  : 'border-ink-950/[0.07] bg-ink-950/[0.02] text-slate-400 hover:border-ink-950/[0.16] hover:bg-ink-950/[0.05] hover:text-slate-100',
              )}
            >
              <span
                className={cn(
                  'numeric text-[0.68rem] font-semibold',
                  active ? 'text-brand-700' : 'text-slate-500 group-hover:text-slate-400',
                )}
              >
                {anchorLabel(summit.startDate)}
              </span>
              <span className="max-w-[12rem] truncate font-medium">{summit.name}</span>
              {summit.isUpcoming ? (
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-accent-400" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-400" />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-ink-950 to-transparent" />
    </div>
  );
}
