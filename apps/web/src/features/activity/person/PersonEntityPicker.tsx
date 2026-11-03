import { Select } from '@/components/ui/Field';
import type { PersonCandidatesData } from '@/types/contract';

/** 面板选中的实体：自然人优先；或某一来源下的具体账号（深链可编码进 URL） */
export type PersonSelection =
  | { kind: 'person'; personId: string }
  | { kind: 'account'; source: 'github' | 'confluence'; accountKey: string };

export function encodeSelection(selection: PersonSelection): string {
  return selection.kind === 'person'
    ? `person:${selection.personId}`
    : `${selection.source}:${selection.accountKey}`;
}

export function selectionOf(params: URLSearchParams): PersonSelection | null {
  const personId = params.get('person');
  if (personId) return { kind: 'person', personId };
  const account = params.get('account');
  if (account) {
    const source = params.get('acctSrc') === 'confluence' ? 'confluence' : 'github';
    return { kind: 'account', source, accountKey: account };
  }
  return null;
}

/**
 * 个人模式实体选择器。候选池由 `/person-candidates` 读时派生：
 * 只列「有任一来源贡献」的自然人与账号；账号条目标注未认领/多认领/bot。
 */
export function PersonEntityPicker({
  candidates,
  selection,
  onChange,
  isLoading,
}: {
  candidates: PersonCandidatesData | undefined;
  selection: PersonSelection | null;
  onChange: (selection: PersonSelection) => void;
  isLoading: boolean;
}) {
  return (
    <Select
      aria-label="选择自然人或账号"
      className="min-w-0 flex-1"
      value={selection ? encodeSelection(selection) : ''}
      disabled={isLoading}
      onChange={(event) => {
        const raw = event.target.value;
        if (!raw) return;
        const sep = raw.indexOf(':');
        const head = raw.slice(0, sep);
        const key = raw.slice(sep + 1);
        if (head === 'person') onChange({ kind: 'person', personId: key });
        else if (head === 'github' || head === 'confluence') {
          onChange({ kind: 'account', source: head, accountKey: key });
        }
      }}
    >
      <option value="">{isLoading ? '加载候选中…' : '选择自然人或账号…'}</option>
      <optgroup label="自然人">
        {(candidates?.persons ?? []).map((person) => (
          <option key={person.personId} value={`person:${person.personId}`}>
            {person.displayName}
            {person.orgName ? `（${person.orgName}）` : ''}
            {person.github && person.confluence ? ' · 双来源' : person.confluence ? ' · Confluence' : ''}
          </option>
        ))}
      </optgroup>
      <optgroup label="GitHub 账号（未认领/多认领）">
        {(candidates?.githubAccounts ?? []).map((account) => (
          <option key={account.accountKey} value={`github:${account.accountKey}`}>
            {account.displayName ?? account.accountKey}
            {account.isBot ? ' · bot' : ''}
            {account.persons.length === 0 ? ' · 未认领' : account.persons.length > 1 ? ' · 多认领' : ''}
          </option>
        ))}
      </optgroup>
      <optgroup label="Confluence 账号（未认领/多认领）">
        {(candidates?.confluenceAccounts ?? []).map((account) => (
          <option key={account.accountKey} value={`confluence:${account.accountKey}`}>
            {account.displayName ?? account.accountKey}
            {account.persons.length === 0 ? ' · 未认领' : account.persons.length > 1 ? ' · 多认领' : ''}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
