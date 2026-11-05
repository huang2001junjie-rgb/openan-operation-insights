import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export interface SegmentedProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/** 分段控件：滑块指示器 + 键盘可达（role=tablist） */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 rounded-xl border border-ink-950/10 bg-ink-950/[0.03] p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-300',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[0.8rem]',
              active
                ? 'bg-gradient-to-b from-brand-500/85 to-brand-600/85 text-white shadow-[0_8px_20px_-12px_rgba(36,114,245,0.9)]'
                : 'text-slate-400 hover:bg-ink-950/[0.05] hover:text-slate-100',
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  'numeric rounded-md px-1.5 py-px text-[0.68rem]',
                  active ? 'bg-ink-950/20 text-slate-50' : 'bg-ink-950/[0.07] text-slate-400',
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
