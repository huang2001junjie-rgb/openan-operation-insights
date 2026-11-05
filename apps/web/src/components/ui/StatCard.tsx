import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatDelta, formatNumber } from '@/lib/format';
import { useCountUp } from '@/hooks/useCountUp';
import { IconMinus, IconTrendDown, IconTrendUp } from '@/components/icons';
import type { DeltaDirection, MetricValue } from '@/types/contract';

export type StatTone = 'brand' | 'accent' | 'violet' | 'amber';

const TONE_RING: Record<StatTone, string> = {
  brand: 'border-brand-400/25 bg-brand-500/12 text-brand-700',
  accent: 'border-accent-400/25 bg-accent-500/12 text-accent-600',
  violet: 'border-violet-400/25 bg-violet-500/12 text-violet-600',
  amber: 'border-amber-400/25 bg-amber-500/12 text-amber-700',
};

const TONE_GLOW: Record<StatTone, string> = {
  brand: 'from-brand-500/[0.10]',
  accent: 'from-accent-500/[0.10]',
  violet: 'from-violet-500/[0.10]',
  amber: 'from-amber-500/[0.10]',
};

function TrendPill({ delta, direction }: { delta: number; direction?: DeltaDirection }) {
  const resolved: DeltaDirection = direction ?? (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
  const Icon = resolved === 'up' ? IconTrendUp : resolved === 'down' ? IconTrendDown : IconMinus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[0.7rem] font-semibold',
        resolved === 'up'
          ? 'border-accent-400/25 bg-accent-500/12 text-accent-600'
          : resolved === 'down'
            ? 'border-rose-400/25 bg-rose-500/12 text-rose-600'
            : 'border-ink-950/10 bg-ink-950/[0.05] text-slate-400',
      )}
    >
      <Icon width={12} height={12} />
      <span className="numeric">{formatDelta(delta)}</span>
    </span>
  );
}

export interface StatCardProps {
  label: string;
  metric: MetricValue;
  icon: ReactNode;
  tone?: StatTone;
  hint?: string;
  delay?: number;
}

export function StatCard({ label, metric, icon, tone = 'brand', hint, delay = 0 }: StatCardProps) {
  const animated = useCountUp(metric.value);
  const delta = metric.delta ?? 0;

  return (
    <div
      className="glass-card glass-card--hover reveal group overflow-hidden p-5"
      style={{ '--d': `${delay}ms` } as CSSProperties}
    >
      {/* 角落光晕：仅数值卡使用，避免整页花哨 */}
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-60',
          TONE_GLOW[tone],
        )}
      />

      <div className="relative flex items-start justify-between">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-xl border',
            TONE_RING[tone],
          )}
        >
          {icon}
        </span>
        {metric.delta !== undefined ? (
          <TrendPill delta={delta} direction={metric.deltaDirection} />
        ) : null}
      </div>

      <p className="relative mt-5 text-[0.78rem] font-medium tracking-wide text-slate-400">{label}</p>

      <p className="relative mt-1.5 flex items-baseline gap-1.5">
        <span className="numeric text-[2rem] font-semibold leading-none text-slate-50">
          {formatNumber(animated)}
        </span>
        {metric.unit ? (
          <span className="text-sm font-medium text-slate-400">{metric.unit}</span>
        ) : null}
      </p>

      {hint ? <p className="relative mt-3 text-[0.72rem] text-slate-500">{hint}</p> : null}
    </div>
  );
}
