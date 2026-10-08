import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ContributionLevel, OrganizationType } from '@/types/contract';

export type BadgeTone = 'neutral' | 'brand' | 'accent' | 'violet' | 'amber' | 'rose';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'border-white/10 bg-white/[0.05] text-slate-300',
  brand: 'border-brand-400/30 bg-brand-500/12 text-brand-200',
  accent: 'border-accent-400/30 bg-accent-500/12 text-accent-300',
  violet: 'border-violet-400/30 bg-violet-500/12 text-violet-300',
  amber: 'border-amber-400/30 bg-amber-500/12 text-amber-200',
  rose: 'border-rose-400/30 bg-rose-500/12 text-rose-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium leading-5',
        TONE_CLASSES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

const LEVEL_META: Record<ContributionLevel, { label: string; tone: BadgeTone }> = {
  high: { label: '高贡献', tone: 'accent' },
  medium: { label: '中贡献', tone: 'brand' },
  low: { label: '起步中', tone: 'neutral' },
};

export function ContributionLevelBadge({ level }: { level?: ContributionLevel }) {
  if (!level) return null;
  const meta = LEVEL_META[level];
  return (
    <Badge tone={meta.tone}>
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          level === 'high' ? 'bg-accent-400' : level === 'medium' ? 'bg-brand-400' : 'bg-slate-400',
        )}
      />
      {meta.label}
    </Badge>
  );
}

const TYPE_LABEL: Record<OrganizationType, string> = {
  tsc: 'TSC 成员单位',
  participant: '参与单位',
  individual: '独立开发者',
};

export function OrganizationTypeBadge({ type }: { type: OrganizationType }) {
  const tone: BadgeTone = type === 'tsc' ? 'violet' : 'neutral';
  return <Badge tone={tone}>{TYPE_LABEL[type]}</Badge>;
}
