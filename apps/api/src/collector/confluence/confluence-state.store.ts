import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { CONFLUENCE_STATE_FILE } from './confluence.constants';

/**
 * 未归属账号：在正文里被 @ 到（因此产生了计数），但账号没落到任何组织。
 *
 * 这是**运营补数据的输入**：据 accountId 在 identity-claims.json 补一条
 * `{ source: "confluence", accountKey: <accountId>, personId: <已归属的自然人> }`，
 * 重跑采集即可归属。带 displayName 与各维度的量是为了让人能直接判断优先级。
 */
export interface UnattributedAccount {
  accountId: string;
  displayName: string;
  requirements: number;
  topicShares: number;
  /** 页面版本作者条数（含创建版本，见 ADR-0011） */
  edits: number;
}

/**
 * 未能解析的联系人：正文里写着**纯文本** `@某人` 而不是真正的提及。
 *
 * 两个来源：需求页 Contacts 单元格（`source: "requirements"`，带行号与需求标题）、
 * 会议纪要 Agenda 段（`source: "minutes"`，无行号）。这类提及解析不出 accountId，
 * 既不猜也不丢 —— 原样暴露给运营，把纯文本改成提及后重跑。
 */
export interface UnresolvedContact {
  pageId: string;
  pageTitle: string;
  /** 来源维度：需求表格行 / 会议纪要 Agenda 段 */
  source: 'requirements' | 'minutes';
  /** 需求表格里的数据行序号（1 起，便于人工定位）；纪要段没有行号，为 null */
  rowIndex: number | null;
  /** 所在行的需求标题（需求页辅助定位；纪要页为空串） */
  requirementTitle: string;
  /** 出现的纯文本 handle（只取 `@` 后的第一段词，如 `@someone` → `someone`） */
  handles: string[];
}

/**
 * Confluence 采集元信息。
 *
 * **独立文件**：GitHub 的 GithubSyncStateStore.write() 会整体覆盖 .sync-state.json，
 * 直接复用会清掉 GitHub 游标，故 Confluence 另立一份（删除即触发全量）。
 *
 * 字段取舍：这里只放**口径自检与运营待办**，不放原始正文（正文快照另存，见 ADR）。
 */
export interface ConfluenceSyncState {
  schemaVersion: 2;
  /** 时间游标：下次增量采集的起点 */
  lastSyncAt: string | null;
  lastRunAt: string | null;
  lastMode: 'incremental' | 'full' | null;
  status: 'success' | 'partial' | 'failed';
  pageCount: number;
  requestCount: number;
  /** 账号级条目数（confluence-accounts.json，组织级即由其派生） */
  accountCount: number;
  spaces: string[];
  /** 命中的「需求」来源页数（为 0 说明页面结构选择器与实际不符） */
  requirementPageCount: number;
  /** 命中的会议纪要页数（为 0 说明标题/父页模式与实际不符） */
  minutesPageCount: number;
  /** 版本历史总条数（编辑量口径自检：为 0 说明版本接口不可用，见 ADR-0011） */
  editVersionCount: number;
  /** 会议纪要里找不到 Agenda 段的页标题（口径自检：应该是空数组） */
  minutesWithoutAgenda: string[];
  /** 未命中任何组织的账号，供运营补身份认领边 */
  unattributedAccounts: UnattributedAccount[];
  /** 未能解析成提及的纯文本联系人，供运营修正正文 */
  unresolvedContacts: UnresolvedContact[];
  lastError?: string;
}

const EMPTY_STATE: ConfluenceSyncState = {
  schemaVersion: 2,
  lastSyncAt: null,
  lastRunAt: null,
  lastMode: null,
  status: 'success',
  pageCount: 0,
  requestCount: 0,
  accountCount: 0,
  spaces: [],
  requirementPageCount: 0,
  minutesPageCount: 0,
  editVersionCount: 0,
  minutesWithoutAgenda: [],
  unattributedAccounts: [],
  unresolvedContacts: [],
};

/**
 * 原子读写 .sync-state.confluence.json。
 * 文件缺失或损坏时按「无游标」处理 —— 由调用方回退到 CONFLUENCE_LOOKBACK_DAYS 兜底窗口。
 */
export class ConfluenceStateStore {
  readonly label = CONFLUENCE_STATE_FILE;

  private readonly logger = new Logger('ConfluenceStateStore');
  private readonly filePath: string;

  constructor(dataDir: string, fileName: string = CONFLUENCE_STATE_FILE) {
    this.filePath = isAbsolute(fileName) ? fileName : join(dataDir, fileName);
  }

  get path(): string {
    return this.filePath;
  }

  async read(): Promise<ConfluenceSyncState> {
    if (!existsSync(this.filePath)) {
      return { ...EMPTY_STATE };
    }

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ConfluenceSyncState>;
      return {
        ...EMPTY_STATE,
        ...parsed,
        spaces: Array.isArray(parsed.spaces) ? parsed.spaces : [],
        minutesWithoutAgenda: Array.isArray(parsed.minutesWithoutAgenda)
          ? parsed.minutesWithoutAgenda
          : [],
        // edits 为后加维度：旧状态文件里没有该字段，按 0 补齐以免日志出现 undefined
        unattributedAccounts: Array.isArray(parsed.unattributedAccounts)
          ? parsed.unattributedAccounts.map((item) => ({ ...item, edits: item.edits ?? 0 }))
          : [],
        unresolvedContacts: Array.isArray(parsed.unresolvedContacts)
          ? parsed.unresolvedContacts
          : [],
      };
    } catch (error) {
      this.logger.warn(
        `状态文件不可用，按游标缺失处理（将回退兜底回溯窗口）：${(error as Error).message}`,
      );
      return { ...EMPTY_STATE };
    }
  }

  async write(state: ConfluenceSyncState): Promise<void> {
    const dir = dirname(this.filePath);
    const tmpPath = `${this.filePath}.${process.pid}.tmp`;

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(tmpPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      // rename 在同分区为原子操作，磁盘上不会出现半截 JSON
      await rename(tmpPath, this.filePath);
      this.logger.log(`wrote ${this.label}`);
    } catch (error) {
      await rm(tmpPath, { force: true }).catch(() => undefined);
      this.logger.error(`写入 ${this.label} 失败：${(error as Error).message}`);
      throw error;
    }
  }
}
