import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { SearchInput } from '@/components/ui/Field';
import { IconExternal, IconFile, IconPullRequest } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';
import { sortRows, type ActivityRow, type SortKey } from './merge';

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'right' }> = [
  { key: 'orgName', label: '组织' },
  { key: 'pullRequests', label: '合并 PR', align: 'right' },
  { key: 'commits', label: '提交数', align: 'right' },
  { key: 'issues', label: 'Issue', align: 'right' },
  { key: 'linesChanged', label: '代码行数', align: 'right' },
  { key: 'requirements', label: '需求文档', align: 'right' },
  { key: 'topicShares', label: '议题分享', align: 'right' },
  { key: 'edits', label: '编辑', align: 'right' },
];

export interface ActivityTableProps {
  rows: ActivityRow[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

export function ActivityTable({ rows, isLoading, isError, error, onRetry }: ActivityTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('pullRequests');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [keyword, setKeyword] = useState('');

  const visibleRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = kw
      ? rows.filter((row) => row.orgName.toLowerCase().includes(kw))
      : rows;
    return sortRows(filtered, sortKey, direction);
  }, [rows, keyword, sortKey, direction]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDirection(key === 'orgName' ? 'asc' : 'desc');
  };

  const totals = useMemo(
    () => ({
      pullRequests: visibleRows.reduce((sum, row) => sum + row.pullRequests, 0),
      commits: visibleRows.reduce((sum, row) => sum + row.commits, 0),
      issues: visibleRows.reduce((sum, row) => sum + row.issues, 0),
      linesChanged: visibleRows.reduce((sum, row) => sum + row.linesChanged, 0),
      requirements: visibleRows.reduce((sum, row) => sum + row.requirements, 0),
      topicShares: visibleRows.reduce((sum, row) => sum + row.topicShares, 0),
      edits: visibleRows.reduce((sum, row) => sum + row.edits, 0),
    }),
    [visibleRows],
  );

  return (
    <Card className="reveal" padded={false}>
      <div className="p-5 sm:p-6">
        <CardTitle
          title="组织贡献明细"
          description="全量组织参与统计，GitHub 协作指标与 Confluence 成果按组织合并展示，无贡献记录的指标按 0 计"
          icon={<IconPullRequest width={16} height={16} />}
          action={
            <SearchInput
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索组织"
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
          emptyTitle={keyword ? '没有匹配的组织' : '暂无贡献明细'}
          emptyHint={keyword ? '试试其他关键词。' : '调整筛选条件后再看。'}
          skeleton={<SkeletonTable rows={6} />}
        >
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="data-table min-w-[1040px]">
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
                  <th scope="col" className="text-right">
                    数据更新
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.orgId}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar src={row.logoUrl} name={row.orgName} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-slate-100">{row.orgName}</span>
                            {row.homepageUrl ? (
                              <a
                                href={row.homepageUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-slate-500 transition hover:text-brand-300"
                                aria-label={`打开 ${row.orgName} 主页`}
                              >
                                <IconExternal width={13} height={13} />
                              </a>
                            ) : null}
                          </div>
                          <span className="text-[0.7rem] text-slate-500">
                            {row.repos > 0 ? `${row.repos} 个仓库` : '—'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="numeric text-right">{formatNumber(row.pullRequests)}</td>
                    <td className="numeric text-right">{formatNumber(row.commits)}</td>
                    <td className="numeric text-right">{formatNumber(row.issues)}</td>
                    <td className="numeric text-right">{formatNumber(row.linesChanged)}</td>
                    <td className="numeric text-right">{formatNumber(row.requirements)}</td>
                    <td className="numeric text-right">{formatNumber(row.topicShares)}</td>
                    <td className="numeric text-right">{formatNumber(row.edits)}</td>
                    <td className="whitespace-nowrap text-right text-xs text-slate-500">
                      {formatDateTime(row.updatedAt)}
                    </td>
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
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totals.requirements)}
                  </td>
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totals.topicShares)}
                  </td>
                  <td className="numeric px-4 py-3 text-right font-semibold text-slate-100">
                    {formatNumber(totals.edits)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-slate-500">
            <IconFile width={13} height={13} />
            点击表头可切换排序；合计行随筛选与搜索实时变化。
          </p>
        </AsyncState>
      </div>
    </Card>
  );
}
