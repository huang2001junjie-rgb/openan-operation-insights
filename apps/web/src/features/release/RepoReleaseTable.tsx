import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { SearchInput } from '@/components/ui/Field';
import { IconFile, IconTag } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { RepoReleaseSummary } from '@/types/contract';

type ReleaseSortKey = 'repoId' | 'releaseCount' | 'latestPublishedAt';

const SORTABLE_COLUMNS: Array<{ key: ReleaseSortKey; label: string; align?: 'right' }> = [
  { key: 'repoId', label: '组件' },
  { key: 'releaseCount', label: '发布次数', align: 'right' },
  { key: 'latestPublishedAt', label: '最近发布时间', align: 'right' },
];

/** 取仓库短名（owner/repo → repo），全名保留在 tooltip 与副标题 */
const shortName = (repoId: string) => repoId.split('/')[1] ?? repoId;
const ownerName = (repoId: string) => repoId.split('/')[0] ?? '';

const DAY_MS = 24 * 60 * 60 * 1000;
/** 距今天数（0 表示当天）——与后端 daysUntil 同为整日口径 */
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / DAY_MS));

const valueOf = (row: RepoReleaseSummary, key: ReleaseSortKey): number | string => {
  if (key === 'repoId') return row.repoId.toLowerCase();
  if (key === 'releaseCount') return row.releaseCount;
  return Date.parse(row.latest.publishedAt);
};

function sortReleaseRows(
  rows: RepoReleaseSummary[],
  key: ReleaseSortKey,
  direction: 'asc' | 'desc',
): RepoReleaseSummary[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = valueOf(left, key);
    const b = valueOf(right, key);
    if (a === b) return left.repoId.localeCompare(right.repoId);
    return (typeof a === 'string' ? a.localeCompare(b as string) : (a as number) - (b as number)) * factor;
  });
}

export interface RepoReleaseTableProps {
  /** 仅含「有 Release」的组件（服务端已按最近发布倒序） */
  rows: RepoReleaseSummary[];
  /** 无 Release 的仓库全名（声明行展示口径分母） */
  reposWithoutReleases: string[];
  updatedAt?: string;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/**
 * 组件发布明细（ADR-0019：github-releases.json 读时派生，不落盘）。
 * 仅列出有 GitHub Release 的组件；无 Release 仓库以表格下方声明行列出。
 * 「最新版本」按 publishedAt 最新取，tag 原样展示；点击组件名跳转该仓库 Releases 页。
 */
export function RepoReleaseTable({
  rows,
  reposWithoutReleases,
  updatedAt,
  isLoading,
  isError,
  error,
  onRetry,
}: RepoReleaseTableProps) {
  const [sortKey, setSortKey] = useState<ReleaseSortKey>('latestPublishedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [keyword, setKeyword] = useState('');

  const visibleRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = kw ? rows.filter((row) => row.repoId.toLowerCase().includes(kw)) : rows;
    return sortReleaseRows(filtered, sortKey, direction);
  }, [rows, keyword, sortKey, direction]);

  const handleSort = (key: ReleaseSortKey) => {
    if (key === sortKey) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDirection(key === 'repoId' ? 'asc' : 'desc');
  };

  const totalReleaseCount = useMemo(
    () => visibleRows.reduce((sum, row) => sum + row.releaseCount, 0),
    [visibleRows],
  );

  return (
    <Card className="reveal" padded={false}>
      <div className="p-5 sm:p-6">
        <CardTitle
          title="组件发布明细"
          description="仅列出有 GitHub Release 的组件；「最新版本」按发布时间取最新，tag 原样展示"
          icon={<IconTag width={16} height={16} />}
          action={
            <SearchInput
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索组件"
              className="h-9 w-40 sm:w-56"
            />
          }
        />
      </div>

      <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        <AsyncState
          isLoading={isLoading}
          isError={isError}
          error={error}
          isEmpty={visibleRows.length === 0}
          onRetry={onRetry}
          compact
          emptyTitle={keyword ? '没有匹配的组件' : '暂无有 Release 的组件'}
          emptyHint={keyword ? '试试其他关键词。' : '需先运行一次 collect:github:full 采集 Releases。'}
          skeleton={<SkeletonTable rows={6} />}
        >
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="data-table min-w-[860px]">
              <thead>
                <tr>
                  {SORTABLE_COLUMNS.map((column) => {
                    const active = column.key === sortKey;
                    return (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(column.align === 'right' && 'text-right')}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort(column.key)}
                          className={cn(
                            'inline-flex items-center gap-1.5 transition-colors hover:text-slate-100',
                            column.align === 'right' && 'flex-row-reverse',
                            active && 'text-brand-200',
                          )}
                        >
                          {column.label}
                          <span
                            className={cn(
                              'text-[0.6rem] transition-opacity',
                              active ? 'opacity-100' : 'opacity-30',
                            )}
                          >
                            {active && direction === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="text-right">最新版本</th>
                  <th className="text-right">距今天数</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => {
                  const latest = row.latest;
                  const showName = latest.name !== '' && latest.name !== latest.tag;
                  return (
                    <tr key={row.repoId}>
                      <td>
                        <div className="flex items-center gap-2" title={row.repoId}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <a
                                href={`https://github.com/${row.repoId}/releases`}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="truncate font-medium text-slate-100 transition hover:text-brand-300"
                              >
                                {shortName(row.repoId)}
                              </a>
                            </div>
                            <span className="text-[0.7rem] text-slate-500">{ownerName(row.repoId)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="numeric text-right">{formatNumber(row.releaseCount)}</td>
                      <td className="numeric text-right">{formatDateTime(latest.publishedAt)}</td>
                      <td className="text-right">
                        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[0.72rem] text-brand-200">
                          {latest.tag}
                        </code>
                        {showName ? (
                          <span className="mt-0.5 block truncate text-[0.7rem] text-slate-500" title={latest.name}>
                            {latest.name}
                          </span>
                        ) : null}
                      </td>
                      <td className="numeric text-right">{daysSince(latest.publishedAt)} 天</td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    合计（当前视图）
                  </td>
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totalReleaseCount)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">—</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">—</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">—</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 text-[0.7rem] leading-5 text-slate-500">
            <IconFile width={13} height={13} className="mr-1.5 inline-block shrink-0 align-[-2px]" />
            仅列出有 GitHub Release 的组件；
            {reposWithoutReleases.length > 0
              ? `其余 ${reposWithoutReleases.length} 个仓库暂无 Release：${reposWithoutReleases.join('、')}。`
              : '采集范围内仓库均有 Release。'}
            {updatedAt ? `数据更新于 ${formatDateTime(updatedAt)}。` : ''}
          </p>
        </AsyncState>
      </div>
    </Card>
  );
}
