import { Segmented } from '@/components/ui/Segmented';
import { cn } from '@/lib/cn';

/** 活跃来源：GitHub 代码协作 / Confluence 成果文档（见 02 文档 §4.1/§4.2） */
export type ActivitySource = 'github' | 'confluence';

export interface ActivitySourceSwitcherProps {
  value: ActivitySource;
  onChange: (value: ActivitySource) => void;
  className?: string;
}

const OPTIONS: Array<{ value: ActivitySource; label: string }> = [
  { value: 'github', label: 'GitHub 协作' },
  { value: 'confluence', label: 'Confluence 成果' },
];

/** 活跃来源切换器：切换仅改写 URL query `?source=`（`github` 为默认值可省略），筛选条件保留 */
export function ActivitySourceSwitcher({ value, onChange, className }: ActivitySourceSwitcherProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">活跃来源</span>
      <Segmented options={OPTIONS} value={value} onChange={onChange} />
    </div>
  );
}
