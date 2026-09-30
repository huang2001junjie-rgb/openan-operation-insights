import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { initialsOf } from '@/lib/format';

export interface AvatarProps {
  src?: string;
  name?: string;
  fallbackId?: string;
  /** 无图降级徽标显示的自定义文案；缺省按姓名首字母（initialsOf） */
  fallbackText?: string;
  size?: 'sm' | 'md' | 'lg' | 'banner';
  className?: string;
}

/** 横版徽标（3:1）：banner 撑满容器宽度，其余按固定高度推导宽度 */
const SIZE_CLASSES = {
  sm: 'h-9 aspect-[3/1] text-[0.65rem]',
  md: 'h-11 aspect-[3/1] text-xs',
  lg: 'h-14 aspect-[3/1] text-sm',
  banner: 'w-full aspect-[3/1] text-xl',
} as const;

/** 组织 Logo 横版头像（3:1）：logoUrl 缺失或加载失败时降级为姓名首字母（或 fallbackText）的渐变徽标 */
export function Avatar({ src, name, fallbackId, fallbackText, size = 'md', className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const url = src?.trim();

  useEffect(() => {
    setBroken(false);
  }, [url]);

  const showImage = Boolean(url) && !broken;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 font-semibold tracking-wide text-slate-200',
        showImage ? 'bg-white/[0.05]' : 'bg-gradient-to-br from-brand-400/25 to-accent-400/20 text-brand-100',
        SIZE_CLASSES[size],
        className,
      )}
      title={name || fallbackId}
    >
      {showImage ? (
        <img
          src={url}
          alt={name ?? 'logo'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain p-1"
          onError={() => setBroken(true)}
        />
      ) : (
        fallbackText ?? initialsOf(name, fallbackId)
      )}
    </span>
  );
}
