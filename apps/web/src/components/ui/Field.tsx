import { forwardRef } from 'react';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';
import { IconChevronDown, IconSearch } from '@/components/icons';

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
      {hint ? <span className="text-[0.7rem] text-slate-500">{hint}</span> : null}
    </label>
  );
}

const CONTROL_CLASSES =
  'h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-100 transition ' +
  'placeholder:text-slate-500 hover:border-white/20 hover:bg-white/[0.06] focus:border-brand-400/60 focus:bg-white/[0.07] ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-50';

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <span className="relative block">
      <select className={cn(CONTROL_CLASSES, 'cursor-pointer appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <IconChevronDown
        width={15}
        height={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
    </span>
  );
}

/** 转发 ref：调用方可在校验失败时把焦点交还给输入框 */
export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }
>(function TextInput({ className, icon, ...rest }, ref) {
  return (
    <span className="relative block">
      {icon ? (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
          {icon}
        </span>
      ) : null}
      <input
        ref={ref}
        className={cn(CONTROL_CLASSES, icon ? 'pl-9' : undefined, className)}
        {...rest}
      />
    </span>
  );
});

export function SearchInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput icon={<IconSearch width={15} height={15} />} {...props} />;
}

export function DateInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="date" className={cn(CONTROL_CLASSES, 'appearance-none')} {...props} />;
}

export function Button({
  children,
  variant = 'ghost',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition',
        // 禁用态必须有可见差异：否则禁用的按钮与可用态外观、悬停反馈完全一致，
        // 用户看到的「点了没反应」其实是按钮处于 disabled（见 06 已知问题）
        'disabled:pointer-events-none disabled:opacity-45',
        variant === 'primary'
          ? 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_10px_28px_-14px_rgba(36,114,245,0.95)] hover:from-brand-400 hover:to-brand-500'
          : 'border border-white/12 bg-white/[0.04] text-slate-200 hover:border-white/25 hover:bg-white/[0.08]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
