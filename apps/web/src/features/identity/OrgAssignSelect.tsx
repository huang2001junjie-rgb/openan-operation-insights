import { Select } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

export interface OrgOption {
  orgId: string;
  name: string;
}

export interface OrgAssignSelectProps {
  value: string | null;
  options: OrgOption[];
  onChange: (orgId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

/** 归属组织下拉：已排除伪组织，含「未归属」空值项 */
export function OrgAssignSelect({
  value,
  options,
  onChange,
  disabled,
  className,
}: OrgAssignSelectProps) {
  return (
    <Select
      value={value ?? ''}
      disabled={disabled}
      aria-label="归属组织"
      className={cn(className)}
      onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
    >
      <option value="" className="bg-ink-850 text-slate-100">
        未归属（独立开发者）
      </option>
      {options.map((option) => (
        <option key={option.orgId} value={option.orgId} className="bg-ink-850 text-slate-100">
          {option.name}
        </option>
      ))}
    </Select>
  );
}
