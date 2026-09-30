import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * 采集元信息（见 05 文档 1.2 / 2.4）。
 * 独立存放于 data/.sync-state.json，**不污染**业务数据文件。
 */
export interface GithubSyncState {
  schemaVersion: 1;
  /** 时间游标：下次增量采集的起点（单游标制） */
  lastSyncAt: string | null;
  lastRunAt: string | null;
  lastMode: 'incremental' | 'full' | null;
  status: 'success' | 'partial' | 'failed';
  /** REST ETag 缓存（REST 通道启用后生效） */
  etags: Record<string, string>;
  rateLimitRemaining: number | null;
  /** 未匹配到组织的 login，供运营人工补充 aliases 映射 */
  unattributedLogins: string[];
  recordCount: number;
  /**
   * 各组织已累计的仓库集合。
   * 增量模式需要它与增量记录**求并集**才能算出准确的仓库数
   * （业务文件只存数量、不存集合，故集合存放于此元信息文件）。
   */
  orgRepos: Record<string, string[]>;
  /**
   * 各贡献者已累计的仓库集合（ADR-0003，语义同 orgRepos）。
   * 旧状态文件缺失该字段时按空集合处理，仓库数退化为已入库的 github.repos 兜底。
   */
  personRepos?: Record<string, string[]>;
  lastError?: string;
}

const EMPTY_STATE: GithubSyncState = {
  schemaVersion: 1,
  lastSyncAt: null,
  lastRunAt: null,
  lastMode: null,
  status: 'success',
  etags: {},
  rateLimitRemaining: null,
  unattributedLogins: [],
  recordCount: 0,
  orgRepos: {},
};

/**
 * 原子读写 .sync-state.json。
 * 文件缺失或损坏时按「无游标」处理 —— 由调用方回退到 GITHUB_LOOKBACK_DAYS 兜底窗口。
 */
export class GithubSyncStateStore {
  readonly label = '.sync-state.json';

  private readonly logger = new Logger('GithubSyncStateStore');
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, this.label);
  }

  async read(): Promise<GithubSyncState> {
    if (!existsSync(this.filePath)) {
      return { ...EMPTY_STATE };
    }

    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<GithubSyncState>;
      return {
        ...EMPTY_STATE,
        ...parsed,
        etags: parsed.etags ?? {},
        unattributedLogins: Array.isArray(parsed.unattributedLogins)
          ? parsed.unattributedLogins
          : [],
        orgRepos: parsed.orgRepos ?? {},
        personRepos: parsed.personRepos ?? {},
      };
    } catch (error) {
      this.logger.warn(
        `同步状态文件不可用，按游标缺失处理（将回退兜底回溯窗口）：${(error as Error).message}`,
      );
      return { ...EMPTY_STATE };
    }
  }

  async write(state: GithubSyncState): Promise<void> {
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
