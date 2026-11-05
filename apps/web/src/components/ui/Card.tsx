import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padded?: boolean;
}

export function Card({ className, interactive = false, padded = true, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'glass-card text-slate-200',
        interactive && 'glass-card--hover',
        padded && 'p-5 sm:p-6',
        className,
      )}
      {...rest}
    />
  );
}

/** 标题字号档位：`md` 是既有默认（全站其它卡片按它验收过），`lg` 目前只给个人模式三张卡用 */
const TITLE_SIZE = {
  md: 'text-[0.95rem]',
  lg: 'text-lg',
} as const;

export interface CardTitleProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  size?: keyof typeof TITLE_SIZE;
  className?: string;
}

export function CardTitle({ title, description, action, icon, size = 'md', className }: CardTitleProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink-950/10 bg-ink-950/[0.05] text-brand-600">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className={cn('truncate font-semibold text-slate-50', TITLE_SIZE[size])}>{title}</h3>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
