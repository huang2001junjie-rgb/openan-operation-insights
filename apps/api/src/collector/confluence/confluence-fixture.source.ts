import { readFile } from 'node:fs/promises';
import { extractRenderedUserNames } from './confluence-content.parser';
import type {
  ConfluenceBodyFetchResult,
  ConfluenceFetchOptions,
  ConfluenceFetchResult,
  ConfluencePageRecord,
  ConfluencePageVersionFetchResult,
  ConfluencePageVersionRecord,
  ConfluenceSource,
  ConfluenceUserNameFetchResult,
} from './confluence-source.port';

interface FixtureFile {
  records: ConfluencePageRecord[];
  /**
   * pageId → 版本历史（可选；缺省时该页编辑量按 0 计）。
   * 用于离线验证编辑量口径：每条含 `number` / `authorId` / `createdAt`。
   */
  versions?: Record<string, ConfluencePageVersionRecord[]>;
  /** pageId → storage 正文（可选；缺省时按"无正文"处理） */
  bodies?: Record<string, string>;
  /**
   * pageId → 渲染视图 HTML（`body.view` 形态，可选）。
   * 展示名从中解析（`extractRenderedUserNames`），与真实源同一条代码路径。
   */
  views?: Record<string, string>;
  /** accountId → 展示名，模拟 `/rest/api/user` 查询（可选；缺省时展示名降级为 accountId） */
  users?: Record<string, string>;
}

/**
 * 离线采集源：从固定 JSON 读取页面事实、正文与账号展示名。
 *
 * 用途：在没有 CONFLUENCE_TOKEN 的环境下验证「取数 → 口径解析 → 归属映射 → 落盘」全链路，
 * 以及回归测试；不发起任何网络请求。
 */
export class ConfluenceFixtureSource implements ConfluenceSource {
  readonly label = 'confluence-fixture';

  constructor(private readonly filePath: string) {}

  async fetch(options: ConfluenceFetchOptions): Promise<ConfluenceFetchResult> {
    const fixture = await this.load();

    const wantedSpaces = new Set(
      options.spaces.map((key) => key.trim()).filter((key) => key.length > 0),
    );

    // 空间过滤与真实源一致；未配置空间时不筛（便于离线全量自检）
    const inScope =
      wantedSpaces.size > 0
        ? fixture.records.filter((record) => wantedSpaces.has(record.spaceKey))
        : fixture.records;

    const matched = options.since
      ? inScope.filter((record) => this.isAfter(record.lastModified, options.since as string))
      : inScope;

    return { pages: matched, requestCount: 0, spaces: [...wantedSpaces] };
  }

  async fetchPageBodies(pageIds: string[]): Promise<ConfluenceBodyFetchResult> {
    const fixture = await this.load();
    const bodies = new Map<string, string>();

    for (const pageId of pageIds) {
      const id = pageId.trim();
      const value = fixture.bodies[id];
      if (typeof value === 'string') bodies.set(id, value);
    }

    // 与真实源同形：展示名随正文一起返回，且走**同一个**解析函数（真实源码自 body.view）
    const renderedUserNames = new Map<string, string>();
    for (const pageId of pageIds) {
      const view = fixture.views[pageId.trim()];
      if (typeof view !== 'string') continue;
      for (const [accountId, name] of extractRenderedUserNames(view)) {
        if (!renderedUserNames.has(accountId)) renderedUserNames.set(accountId, name);
      }
    }

    return { bodies, renderedUserNames, requestCount: 0 };
  }

  async fetchPageVersions(pageIds: string[]): Promise<ConfluencePageVersionFetchResult> {
    const fixture = await this.load();
    const versions = new Map<string, ConfluencePageVersionRecord[]>();

    for (const pageId of pageIds) {
      const id = pageId.trim();
      const list = fixture.versions[id];
      if (!Array.isArray(list) || list.length === 0) continue;
      versions.set(
        id,
        list.map((item) => ({
          number: item.number,
          authorId: item.authorId ?? null,
          createdAt: item.createdAt ?? null,
        })),
      );
    }

    return { versions, requestCount: 0 };
  }

  async fetchUserNames(accountIds: string[]): Promise<ConfluenceUserNameFetchResult> {
    const fixture = await this.load();
    const names = new Map<string, string>();

    for (const accountId of accountIds) {
      const id = accountId.trim();
      const value = fixture.users[id];
      if (typeof value === 'string') names.set(id, value);
    }

    return { names, requestCount: 0 };
  }

  private async load(): Promise<{
    records: ConfluencePageRecord[];
    versions: Record<string, ConfluencePageVersionRecord[]>;
    bodies: Record<string, string>;
    views: Record<string, string>;
    users: Record<string, string>;
  }> {
    const raw = await readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<FixtureFile>;

    if (!Array.isArray(parsed.records)) {
      throw new Error(`固定数据文件缺少 records 数组：${this.filePath}`);
    }

    return {
      records: parsed.records,
      versions: parsed.versions ?? {},
      bodies: parsed.bodies ?? {},
      views: parsed.views ?? {},
      users: parsed.users ?? {},
    };
  }

  private isAfter(timestamp: string | null, since: string): boolean {
    if (!timestamp) return false;
    return Date.parse(timestamp) > Date.parse(since);
  }
}
