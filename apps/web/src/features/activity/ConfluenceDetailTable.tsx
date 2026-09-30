import { useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { AsyncState } from '@/components/ui/AsyncState';
import { Avatar } from '@/components/ui/Avatar';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { SearchInput } from '@/components/ui/Field';
import { IconExternal, IconFile } from '@/components/icons';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';
import { sortConfluenceRows, type ConfluenceRow, type ConfluenceSortKey } from './merge';
import { UNATTRIBUTED_LABEL, orgBadgeFallback } from './org-display';

const COLUMNS: Array<{ key: ConfluenceSortKey; label: string; align?: 'right' }> = [
  { key: 'orgName', label: '组织' },
  { key: 'requirements', label: '需求', align: 'right' },
  { key: 'topicShares', label: '议题分享', align: 'right' },
  { key: 'edits', label: '编辑', align: 'right' },
];

export interface ConfluenceDetailTableProps {
  rows: ConfluenceRow[];
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/** Confluence 成果明细表：全量组织各占一行，归属为**生效归属**（ADR-0010）。 */
export function ConfluenceDetailTable({ rows, isLoading, isError, error, onRetry }: ConfluenceDetailTableProps) {
  const [sortKey, setSortKey] = useState<ConfluenceSortKey>('requirements');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [keyword, setKeyword] = useState('');

  const visibleRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = kw ? rows.filter((row) => row.orgName.toLowerCase().includes(kw)) : rows;
    return sortConfluenceRows(filtered, sortKey, direction);
  }, [rows, keyword, sortKey, direction]);

  const handleSort = (key: ConfluenceSortKey) => {
    if (key === sortKey) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setDirection(key === 'orgName' ? 'asc' : 'desc');
  };

  const totals = useMemo(
    () => ({
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
          title="组织成果明细"
          description="全量组织参与统计，Confluence 成果按生效归属（人工认领优先）归集，无成果记录的组织按 0 计"
          icon={<IconFile width={16} height={16} />}
          action={
            <SearchInput
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索组织"
              className="w-40 sm:w-56"
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
          emptyTitle={keyword ? '没有匹配的组织' : '暂无成果明细'}
          emptyHint={keyword ? '试试其他关键词。' : '调整筛选条件后再看。'}
          skeleton={<SkeletonTable rows={6} />}
        >
          <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  {COLUMNS.map((column) => {
                    const active = column.key === sortKey;
                    return (
                      <th key={column.key} scope="col" className={cn(column.align === 'right' && 'text-right')}>
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
                        <Avatar
                          src={row.logoUrl}
                          name={row.orgName}
                          size="sm"
                          fallbackText={orgBadgeFallback(row.orgId)}
                        />
                        <div className="flex min-w-0 items-center gap-2">
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
                      </div>
                    </td>
                    <td className="numeric text-right">{formatNumber(row.requirements)}</td>
                    <td className="numeric text-right">{formatNumber(row.topicShares)}</td>
                    <td className="numeric text-right">{formatNumber(row.edits)}</td>
                    <td className="whitespace-nowrap text-right text-xs text-slate-500">
                      {row.updatedAt ? formatDateTime(row.updatedAt) : '—'}
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
            归属为生效归属：人工认领优先于采集口径；未归属账号归入「{UNATTRIBUTED_LABEL}」。
            「编辑」按页面版本数计（含建页那一次），不剔除多人共编的大页，解读时请结合页数看。
          </p>
        </AsyncState>
      </div>
    </Card>
  );
}
