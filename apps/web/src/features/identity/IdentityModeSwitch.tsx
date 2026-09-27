import { Segmented } from '@/components/ui/Segmented';

export type IdentityMode = 'org' | 'person';

export interface IdentityModeSwitchProps {
  mode: IdentityMode;
  onChange: (mode: IdentityMode) => void;
  orgCount: number | null;
  personCount: number | null;
}

/** 双模式切换：组织↔开发者 / 自然人↔账号（两个模式共享同一份归属数据） */
export function IdentityModeSwitch({ mode, onChange, orgCount, personCount }: IdentityModeSwitchProps) {
  return (
    <Segmented<IdentityMode>
      value={mode}
      onChange={onChange}
      options={[
        { value: 'person', label: '自然人 ↔ 账号', count: personCount ?? undefined },
        { value: 'org', label: '组织 ↔ 开发者', count: orgCount ?? undefined },
      ]}
    />
  );
}
