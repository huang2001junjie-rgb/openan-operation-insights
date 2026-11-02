import { readFile } from 'node:fs/promises';
import { SEARCH_RESULT_LIMIT } from './github.constants';
import {
  GithubContributionRecord,
  GithubFetchOptions,
  GithubFetchResult,
  GithubReleaseFetchResult,
  GithubSource,
} from './github-source.port';

/** releases / repositories 为可选字段：旧 fixture 文件无 Releases 数据时返回 null（不落盘） */
interface FixtureRelease {
  repository?: string;
  tag?: string;
  name?: string | null;
  publishedAt?: string | null;
  url?: string;
  isDraft?: boolean;
}

interface FixtureFile {
  records: GithubContributionRecord[];
  repositories?: string[];
  releases?: FixtureRelease[];
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

  /**
   * 离线 Releases：fixture 文件显式提供 `releases` 时按真实源同样的口径归一化（draft 过滤、
   * 缺 tag/publishedAt 跳过）；未提供时返回 null——调用方跳过落盘，避免空数据覆盖真实文件。
   */
  async fetchReleases(): Promise<GithubReleaseFetchResult | null> {
    const raw = await readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as FixtureFile;

    if (!Array.isArray(parsed.releases)) return null;

    const repositories = Array.isArray(parsed.repositories) ? parsed.repositories : [];
    const releases = parsed.releases
      .filter(
        (release) =>
          !release.isDraft &&
          typeof release.repository === 'string' &&
          typeof release.tag === 'string' &&
          typeof release.publishedAt === 'string',
      )
      .map((release) => ({
        repository: release.repository as string,
        tag: release.tag as string,
        name: release.name ?? '',
        publishedAt: release.publishedAt as string,
        url: release.url ?? '',
      }));

    return { repositories, releases };
  }
}
