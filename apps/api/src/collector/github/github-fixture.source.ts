import { readFile } from 'node:fs/promises';
import { SEARCH_RESULT_LIMIT } from './github.constants';
import {
  GithubContributionRecord,
  GithubFetchOptions,
  GithubFetchResult,
  GithubSource,
} from './github-source.port';

interface FixtureFile {
  records: GithubContributionRecord[];
}

/**
 * 离线采集源：从固定 JSON 读取归一化记录。
 *
 * 用途：在没有 GITHUB_TOKEN 的环境下验证「聚合 → 归属映射 → 落盘 → 原子写」全链路，
 * 以及回归测试；不发起任何网络请求。
 */
export class GithubFixtureSource implements GithubSource {
  readonly label = 'github-fixture';

  constructor(private readonly filePath: string) {}

  async fetch(options: GithubFetchOptions): Promise<GithubFetchResult> {
    const raw = await readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as FixtureFile;

    if (!Array.isArray(parsed.records)) {
      throw new Error(`固定数据文件缺少 records 数组：${this.filePath}`);
    }

    const since = options.mode === 'incremental' ? options.since : null;
    const matched = since
      ? parsed.records.filter((record) => this.isAfter(record.timestamp, since))
      : parsed.records;

    return {
      records: matched,
      reportedTotalCount: matched.length,
      truncated: matched.length >= SEARCH_RESULT_LIMIT,
      requestCount: 0,
      rateLimitRemaining: null,
    };
  }

  private isAfter(timestamp: string | null, since: string): boolean {
    if (!timestamp) return false;
    return Date.parse(timestamp) > Date.parse(since);
  }
}
