import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { IconChevronDown, IconSearch } from '@/components/icons';

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}

/** 轻量多选下拉：按钮 + 浮层 + 搜索 + 复选框列表（无第三方依赖） */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = '全部',
  searchable = true,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // 宿主玻璃卡片因 backdrop-blur 形成独立层叠上下文，浮层的 z-30 无法越过
  // DOM 顺序靠后的兄弟卡片；展开期间临时抬升宿主层级（30 < TopNav 的 40），
  // 关闭后还原，保证下拉浮层覆盖页面其余内容。
  useEffect(() => {
    if (!open) return;
    const host = containerRef.current?.closest<HTMLElement>('.glass-card');
    if (!host) return;
    const previous = host.style.zIndex;
    host.style.zIndex = '30';
    return () => {
      host.style.zIndex = previous;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return options;
    return options.filter((option) => option.label.toLowerCase().includes(kw));
  }, [options, keyword]);

  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  };

  const buttonLabel =
    value.length === 0 ? placeholder : value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? '1 项') : `已选 ${value.length} 项`;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border px-3 text-sm transition',
          value.length > 0
            ? 'border-brand-400/40 bg-brand-500/[0.09] text-brand-100'
            : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]',
        )}
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {value.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onChange([]);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.stopPropagation();
                  onChange([]);
                }
              }}
              className="rounded-md px-1 text-[0.68rem] text-slate-400 transition hover:bg-white/10 hover:text-slate-100"
            >
              清除
            </span>
          ) : null}
          <IconChevronDown
            width={15}
            height={15}
            className={cn('text-slate-400 transition-transform duration-200', open && 'rotate-180')}
          />
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="animate-fade-in absolute z-30 mt-2 w-full min-w-[15rem] overflow-hidden rounded-xl border border-white/10 bg-ink-850/95 shadow-[0_28px_60px_-24px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        >
          {searchable ? (
            <div className="border-b border-white/[0.07] p-2">
              <span className="relative block">
                <IconSearch
                  width={14}
                  height={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  autoFocus
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="搜索组织"
                  className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-brand-400/50 focus:outline-none"
                />
              </span>
            </div>
          ) : null}

          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-slate-500">无匹配项</li>
            ) : (
              filtered.map((option) => {
                const checked = value.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      onClick={() => toggle(option.value)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition hover:bg-white/[0.05]"
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition',
                          checked
                            ? 'border-brand-400 bg-brand-500 text-white'
                            : 'border-white/20 bg-white/[0.03]',
                        )}
                      >
                        {checked ? (
                          <svg viewBox="0 0 24 24" width={11} height={11} aria-hidden>
                            <path
                              d="m5 12.8 4.2 4.2L19 7.4"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-200">{option.label}</span>
                      {option.hint ? (
                        <span className="shrink-0 text-[0.68rem] text-slate-500">{option.hint}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
