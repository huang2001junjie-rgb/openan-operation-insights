import { useSyncExternalStore } from 'react';

/**
 * 管理令牌的会话级存储（04 §5.2）。
 * - 仅存于 `sessionStorage`，**不写入 URL**、不落 `localStorage`、不上报；
 * - 关闭标签页即失效；
 * - 通过订阅机制驱动 UI（令牌状态圆点、写操作可用性）即时刷新。
 */
const STORAGE_KEY = 'openan.admin-token';

function readInitial(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

let token = readInitial();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getAdminToken(): string {
  return token;
}

export function hasAdminToken(): boolean {
  return token.length > 0;
}

export function setAdminToken(next: string): void {
  const value = next.trim();
  token = value;
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 隐私模式等场景下 sessionStorage 不可用：仅保留内存态
  }
  emit();
}

export function clearAdminToken(): void {
  setAdminToken('');
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 订阅当前令牌；返回空串表示未配置 */
export function useAdminToken(): string {
  return useSyncExternalStore(subscribe, getAdminToken, getAdminToken);
}
