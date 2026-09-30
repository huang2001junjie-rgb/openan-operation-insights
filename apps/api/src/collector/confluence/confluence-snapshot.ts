import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONFLUENCE_SNAPSHOT_DIR } from './confluence.constants';
import { buildConfluenceReport } from './confluence-report';
import type { ConfluencePageRecord } from './confluence-source.port';

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
