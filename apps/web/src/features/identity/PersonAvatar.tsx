import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { initialsOf } from '@/lib/format';

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-[0.7rem]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
} as const;

export interface PersonAvatarProps {
  name?: string;
  src?: string;
  fallbackId?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

/** 自然人方形头像：无图/加载失败时降级为姓名首字母渐变块 */
export function PersonAvatar({ name, src, fallbackId, size = 'md', className }: PersonAvatarProps) {
  const [broken, setBroken] = useState(false);
  const url = src?.trim();

  useEffect(() => {
    setBroken(false);
  }, [url]);

  const showImage = Boolean(url) && !broken;

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 font-semibold tracking-wide',
        showImage
          ? 'bg-white/[0.05] text-slate-200'
          : 'bg-gradient-to-br from-brand-400/30 to-violet-400/25 text-brand-100',
        SIZE_CLASSES[size],
        className,
      )}
      title={name || fallbackId}
    >
      {showImage ? (
        <img
          src={url}
          alt={name ?? 'avatar'}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initialsOf(name, fallbackId)
      )}
    </span>
  );
}
