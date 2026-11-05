import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { IconAlert, IconInbox, IconRefresh } from '@/components/icons';

export function EmptyState({
  title,
  hint,
  icon,
  action,
  className,
}: {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-950/10 bg-ink-950/[0.015] px-6 py-12 text-center',
        className,
      )}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-ink-950/10 bg-ink-950/[0.04] text-slate-400">
        {icon ?? <IconInbox width={22} height={22} />}
      </span>
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {hint ? <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/** 错误码 → 面向用户的可读文案（与 03 文档 7.2 错误码表对齐） */
function describeError(error: unknown): { title: string; hint: string } {
  if (error instanceof ApiError) {
    if (error.code === 50001) {
      return {
        title: '数据源暂不可用',
        hint: '后端数据文件校验未通过，运维正在修复；其余页面不受影响。',
      };
    }
    if (error.code === -1) {
      return { title: '无法连接后端服务', hint: '请确认 API 已在 :3000 启动，或检查网络与代理配置。' };
    }
    return { title: error.message || '请求失败', hint: `错误码：${error.code}` };
  }

  return {
    title: '加载失败',
    hint: error instanceof Error ? error.message : '未知错误，请稍后重试。',
  };
}

export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const { title, hint } = describeError(error);

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-500/[0.06] px-5',
        compact ? 'py-4' : 'py-6',
        className,
      )}
    >
      <div className="flex items-center gap-2.5 text-rose-600">
        <IconAlert width={18} height={18} />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="text-xs leading-relaxed text-rose-700/70">{hint}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-950/12 bg-ink-950/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-ink-950/25 hover:bg-ink-950/[0.09]"
        >
          <IconRefresh width={14} height={14} />
          重新加载
        </button>
      ) : null}
    </div>
  );
}
