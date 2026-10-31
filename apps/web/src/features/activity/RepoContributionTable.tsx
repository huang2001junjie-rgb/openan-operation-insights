import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { SearchInput } from '@/components/ui/Field';
import { IconCode, IconExternal, IconFile } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';
import type { RepoContribution } from '@/types/contract';

type RepoSortKey =
  | 'repoId'
  | 'pullRequests'
  | 'commits'
  | 'issues'
  | 'linesChanged'
  | 'contributors'
  | 'orgs';

const COLUMNS: Array<{ key: RepoSortKey; label: string; align?: 'right' }> = [
  { key: 'repoId', label: '仓库' },
  { key: 'pullRequests', label: '合并 PR', align: 'right' },
  { key: 'commits', label: '提交数', align: 'right' },
  { key: 'issues', label: 'Issue', align: 'right' },
  { key: 'linesChanged', label: '代码行数', align: 'right' },
  { key: 'contributors', label: '贡献者数', align: 'right' },
  { key: 'orgs', label: '参与组织数', align: 'right' },
];

/** 取仓库短名（owner/repo → repo），全名保留在 tooltip 与副标题 */
const shortName = (repoId: string) => repoId.split('/')[1] ?? repoId;
const ownerName = (repoId: string) => repoId.split('/')[0] ?? '';

const valueOf = (row: RepoContribution, key: RepoSortKey): number | string => {
  if (key === 'repoId') return row.repoId.toLowerCase();
  if (key === 'contributors') return row.contributors;
  if (key === 'orgs') return row.orgs;
  return row.github[key];
};

function sortRepoRows(
  rows: RepoContribution[],
  key: RepoSortKey,
  direction: 'asc' | 'desc',
): RepoContribution[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = valueOf(left, key);
    const b = valueOf(right, key);
    if (a === b) return left.repoId.localeCompare(right.repoId);
    return (typeof a === 'string' ? a.localeCompare(b as string) : (a as number) - (b as number)) * factor;
  });
}

export interface RepoContributionTableProps {
  /** 已按仓库筛选收窄的行（页面侧完成，见 ActivityPage） */
  rows: RepoContribution[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/**
 * 仓库维度贡献明细（D1：由 github-events.json 读时派生，不落盘）。
 * 口径混合：四项计数含机器账号；贡献者数为人物口径（排除 bot）；参与组织数按生效归属去重。
 * 去重口径不可加，故合计行仅汇总四项计数。
 */
export function RepoContributionTable({
  rows,
  isLoading,
  isError,
  error,
  onRetry,
}: RepoContributionTableProps) {
  const [sortKey, setSortKey] = useState<RepoSortKey>('commits');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [keyword, setKeyword] = useState('');

  const visibleRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = kw ? rows.filter((row) => row.repoId.toLowerCase().includes(kw)) : rows;
    return sortRepoRows(filtered, sortKey, direction);
  }, [rows, keyword, sortKey, direction]);

  const handleSort = (key: RepoSortKey) => {
    if (key === sortKey) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDirection(key === 'repoId' ? 'asc' : 'desc');
  };

  const totals = useMemo(
    () => ({
      pullRequests: visibleRows.reduce((sum, row) => sum + row.github.pullRequests, 0),
      commits: visibleRows.reduce((sum, row) => sum + row.github.commits, 0),
      issues: visibleRows.reduce((sum, row) => sum + row.github.issues, 0),
      linesChanged: visibleRows.reduce((sum, row) => sum + row.github.linesChanged, 0),
    }),
    [visibleRows],
  );

  const updatedAt = visibleRows[0]?.updatedAt;

  return (
    <Card className="reveal" padded={false}>
      <div className="p-5 sm:p-6">
        <CardTitle
          title="仓库维度明细"
          description="以仓库为单位的 GitHub 协作投入；四项计数含机器账号，贡献者数与参与组织数为人物/归属去重口径"
          icon={<IconCode width={16} height={16} />}
          action={
            <SearchInput
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索仓库"
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
          emptyTitle={keyword ? '没有匹配的仓库' : '暂无仓库贡献'}
          emptyHint={keyword ? '试试其他关键词。' : '需先运行一次全量采集生成事件明细。'}
          skeleton={<SkeletonTable rows={6} />}
        >
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  {COLUMNS.map((column) => {
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
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.repoId}>
                    <td>
                      <div className="flex items-center gap-2" title={row.repoId}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-slate-100">
                              {shortName(row.repoId)}
                            </span>
                            <a
                              href={`https://github.com/${row.repoId}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="shrink-0 text-slate-500 transition hover:text-brand-300"
                              aria-label={`打开 ${row.repoId} 仓库`}
                            >
                              <IconExternal width={13} height={13} />
                            </a>
                          </div>
                          <span className="text-[0.7rem] text-slate-500">{ownerName(row.repoId)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="numeric text-right">{formatNumber(row.github.pullRequests)}</td>
                    <td className="numeric text-right">{formatNumber(row.github.commits)}</td>
                    <td className="numeric text-right">{formatNumber(row.github.issues)}</td>
                    <td className="numeric text-right">{formatNumber(row.github.linesChanged)}</td>
                    <td className="numeric text-right">{formatNumber(row.contributors)}</td>
                    <td className="numeric text-right">{formatNumber(row.orgs)}</td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-white/[0.02]">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    合计（当前视图）
                  </td>
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totals.pullRequests)}
                  </td>
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totals.commits)}
                  </td>
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totals.issues)}
                  </td>
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totals.linesChanged)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">—</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-500">—</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-slate-500">
            <IconFile width={13} height={13} />
            贡献者数 / 参与组织数为去重口径，不可跨仓库相加，故合计行以「—」表示
            {updatedAt ? `；数据更新于 ${formatDateTime(updatedAt)}` : ''}。
          </p>
        </AsyncState>
      </div>
    </Card>
  );
}
