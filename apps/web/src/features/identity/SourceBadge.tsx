import { Badge, type BadgeTone } from '@/components/ui/Badge';
import type { IdentitySource } from '@/types/contract';

const SOURCE_META: Record<string, { label: string; tone: BadgeTone }> = {
  github: { label: 'GitHub', tone: 'neutral' },
  confluence: { label: 'Confluence', tone: 'brand' },
  meeting: { label: '例会', tone: 'violet' },
};

/** 来源徽标：未知来源退化为中性徽标并显示原文（向前兼容新增来源） */
export function SourceBadge({ source }: { source: IdentitySource }) {
  const meta = SOURCE_META[source] ?? { label: source, tone: 'neutral' as BadgeTone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
