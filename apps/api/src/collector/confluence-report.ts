import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFLUENCE_SNAPSHOT_DIR } from './collector.constants';
import type { ConfluencePageRecord } from './confluence-source.types';

/** 单一维度的计数项 */
export interface Tally {
  name: string;
  count: number;
}

/**
 * 取数观察报告（阶段一产物）。
 *
 * 目的：在定标签口径与归属规则之前，先把空间里**真实存在**的标签、创建者、
 * 页面树层级摊开给人看；Confluence 里有没有"组织"这个信号，由这份报告回答。
 */
export interface ConfluenceReport {
  pageCount: number;
  spaceTally: Tally[];
  labelTally: Tally[];
  creatorTally: Tally[];
  topLevelTally: Tally[];
  editorTally: Tally[];
  /** 无任何标签的页面数（标签口径是否可用的关键指标） */
  unlabeledCount: number;
  createdRange: { from: string | null; to: string | null };
}

/** 按 keyFn 计数并降序排列（同数按名称升序，保证报告可复现） */
function tally<T>(items: T[], keyFn: (item: T) => string | string[] | null): Tally[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const keys = keyFn(item);
    if (keys === null) continue;
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function buildConfluenceReport(pages: ConfluencePageRecord[]): ConfluenceReport {
  const created = pages
    .map((page) => page.createdDate)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    pageCount: pages.length,
    spaceTally: tally(pages, (page) => page.spaceKey || '(未知空间)'),
    labelTally: tally(pages, (page) => (page.labels.length > 0 ? page.labels : null)),
    creatorTally: tally(pages, (page) => page.creatorDisplayName || '(unknown)'),
    topLevelTally: tally(pages, (page) =>
      page.ancestorTitles.length === 0 ? '(无父页)' : page.ancestorTitles[0],
    ),
    editorTally: tally(pages, (page) =>
      page.lastModifiedByDisplayName ? page.lastModifiedByDisplayName : null,
    ),
    unlabeledCount: pages.filter((page) => page.labels.length === 0).length,
    createdRange: {
      from: created[0] ?? null,
      to: created[created.length - 1] ?? null,
    },
  };
}

function renderTally(title: string, items: Tally[], limit: number): string[] {
  const lines = [`  ${title}（${items.length} 项）`];
  if (items.length === 0) {
    lines.push('    （空）');
    return lines;
  }
  for (const item of items.slice(0, limit)) {
    lines.push(`    ${String(item.count).padStart(5)}  ${item.name}`);
  }
  if (items.length > limit) {
    lines.push(`    … 其余 ${items.length - limit} 项已省略`);
  }
  return lines;
}

/** 渲染为可读文本行（交由 Logger 输出，避免在服务里拼字符串） */
export function renderConfluenceReport(
  report: ConfluenceReport,
  criteria: string,
  limit = 25,
): string[] {
  const span = `${report.createdRange.from?.slice(0, 10) ?? '-'} → ${report.createdRange.to?.slice(0, 10) ?? '-'}`;
  const lines = [
    `  页面总数 ${report.pageCount}（创建时间 ${span}）`,
    `  需求判定口径：${criteria}`,
    `  无任何标签的页面：${report.unlabeledCount}`,
  ];

  lines.push(...renderTally('空间分布', report.spaceTally, limit));
  lines.push(...renderTally('标签分布', report.labelTally, limit));
  lines.push(...renderTally('创建者分布', report.creatorTally, limit));
  lines.push(...renderTally('顶层页面分布（页面树）', report.topLevelTally, limit));
  return lines;
}

/** 快照里附带的抽取结果（行级事实）—— 口径变了可以据此比对，而不必翻正文 */
export interface ConfluenceSnapshotDerived {
  requirementPages: Array<{ pageId: string; title: string; contacts: string[] }>;
  minutesPages: Array<{ pageId: string; title: string; topicSharers: string[] }>;
  /**
   * pageId → 该页版本作者（编辑量口径的行级事实，升序去重）。
   *
   * 编辑量是**全空间**口径（不止需求页/纪要页），故单独留一份；含创建那一次。
   */
  pageEdits: Array<{ pageId: string; title: string; editors: string[] }>;
}

/**
 * 落抽取快照到 <dataDir>/source/confluence/。
 *
 * 快照是**原料**（非契约、接口与前端不可见）：记录了当轮选中的页与解析出的账号，
 * 便于事后复核"这个数字是怎么来的"。命名带时间戳，多次运行互不覆盖
 * （副作用：目录会累积，需人工清理，已在 ADR 记录）。
 */
export async function writeConfluenceSnapshot(params: {
  dataDir: string;
  pages: ConfluencePageRecord[];
  spaces: string[];
  /** 本轮生效的口径描述（便于从快照推出是哪个口径算出来的） */
  criteria: string;
  derived: ConfluenceSnapshotDerived;
}): Promise<string> {
  const { dataDir, pages, spaces, criteria, derived } = params;
  const dir = join(dataDir, CONFLUENCE_SNAPSHOT_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const scope = spaces.length > 0 ? spaces.join('+') : 'all';
  const filePath = join(dir, `${scope}.pages.${stamp}.json`);

  const payload = {
    capturedAt: new Date().toISOString(),
    spaces,
    criteria,
    pageCount: pages.length,
    report: buildConfluenceReport(pages),
    derived,
    pages,
  };

  await mkdir(dir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}
