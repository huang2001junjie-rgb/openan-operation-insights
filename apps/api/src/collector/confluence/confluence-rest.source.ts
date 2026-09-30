import { Logger } from '@nestjs/common';
import { REQUEST_SPACING_MS } from '../collector.constants';
import {
  CONFLUENCE_MAX_PAGES,
  CONFLUENCE_PAGE_SIZE,
  CONFLUENCE_VERSION_MAX_PAGES,
  CONFLUENCE_VERSION_PAGE_SIZE,
} from './confluence.constants';
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

export interface ConfluenceRestSourceOptions {
  /** 站点根地址（不含 /wiki 后缀） */
  baseUrl: string;
  /** 个人访问令牌（Bearer） */
  token: string;
  /** 单页条数，默认 100（Confluence v1 search 上限） */
  pageSize?: number;
  /** 串行请求间隔（毫秒），默认复用 REQUEST_SPACING_MS */
  spacingMs?: number;
}

/** HTTP 层失败（非 2xx）：携带状态码便于区分鉴权问题与限流 */
export class ConfluenceRequestError extends Error {
  constructor(
    readonly status: number,
    readonly label: string,
    body: string,
  ) {
    super(`Confluence 请求失败 ${status} ${label}：${body.slice(0, 300)}`);
    this.name = 'ConfluenceRequestError';
  }
}

/** v1 search 返回体（只声明用到的字段） */
interface RawPage {
  id?: string;
  title?: string;
  status?: string;
  space?: { key?: string };
  metadata?: { labels?: { results?: Array<{ name?: string }> } };
  history?: {
    createdDate?: string;
    createdBy?: { accountId?: string; displayName?: string; accountType?: string };
  };
  version?: {
    number?: number;
    when?: string;
    by?: { accountId?: string; displayName?: string };
  };
  ancestors?: Array<{ title?: string }>;
}

interface RawSearchResponse {
  results?: RawPage[];
  _links?: { next?: string };
}

/** 单页正文返回体（`/rest/api/content/{id}?expand=body.storage,body.view`） */
interface RawPageBody {
  id?: string;
  body?: {
    /** 存储格式：提及只有 `ri:account-id`，是口径解析的唯一原料 */
    storage?: { value?: string };
    /** 渲染视图：服务端已把 mention 换成了带展示名的 `<a data-account-id>`，用于取展示名 */
    view?: { value?: string };
  };
}

/** 账号信息返回体（`/rest/api/user?accountId=...`） */
interface RawUser {
  accountId?: string;
  displayName?: string;
}

/** v2 版本历史返回体（`/api/v2/pages/{id}/versions`；只声明用到的字段） */
interface RawVersionList {
  results?: Array<{ number?: number; authorId?: string; createdAt?: string }>;
  _links?: { next?: string };
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * CQL 里的日期字面量（站点时区解释）：
 * Confluence 只接受 `yyyy-MM-dd` 或 `yyyy-MM-dd HH:mm`，ISO 8601 的 `T`/`Z` 会报错。
 */
export function toCqlDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无法解析的增量游标：${iso}`);
  }
  return date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * 真实 Confluence 采集源（只读）。
 *
 * - 认证：`Authorization: Bearer <token>`；错误信息与日志**绝不**包含 token 值
 * - 检索：CQL `space in (...) and type=page [and lastmodified >= "..."]`
 * - 分页：`_links.next` 游标，单页 CONFLUENCE_PAGE_SIZE，最多 CONFLUENCE_MAX_PAGES 页
 * - 限流：串行 + 固定间隔；429/5xx 退避重试（尊重 Retry-After）
 */
export class ConfluenceRestSource implements ConfluenceSource {
  readonly label: string;

  private readonly logger = new Logger('ConfluenceRestSource');
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly pageSize: number;
  private readonly spacingMs: number;
  private requestCount = 0;
  /** 展示名查询一旦因权限失败就整体停用，避免逐账号重复撞墙（不影响计数与归属） */
  private userLookupDisabled = false;

  constructor(options: ConfluenceRestSourceOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
    this.pageSize = options.pageSize ?? CONFLUENCE_PAGE_SIZE;
    this.spacingMs = options.spacingMs ?? REQUEST_SPACING_MS;
    this.label = `confluence-rest(${this.baseUrl || '(未配置 BASE_URL)'})`;
  }

  async fetch(options: ConfluenceFetchOptions): Promise<ConfluenceFetchResult> {
    if (!this.baseUrl) {
      throw new Error('缺少 CONFLUENCE_BASE_URL，无法发起采集');
    }
    if (!this.token) {
      throw new Error('缺少 CONFLUENCE_TOKEN，无法发起采集');
    }

    const spaces = options.spaces.map((key) => key.trim()).filter((key) => key.length > 0);
    if (spaces.length === 0) {
      throw new Error('CONFLUENCE_SPACES 为空，无法确定采集范围');
    }

    this.requestCount = 0;
    const cql = this.buildCql(spaces, options.since);
    this.logger.log(`CQL：${cql}`);

    const raw = await this.searchAll(cql);
    const pages = raw.map((page) => this.toRecord(page));

    this.logger.log(
      `取到 ${pages.length} 个页面（请求 ${this.requestCount} 次，空间 ${spaces.join(', ')}）`,
    );

    return { pages, requestCount: this.requestCount, spaces };
  }

  /**
   * 按页取正文：逐页 `GET /rest/api/content/{id}?expand=body.storage,body.view`。
   *
   * 一次请求同时拿两样东西：`storage` 是口径解析的原料，`view` 用来换展示名 ——
   * 因此展示名**不额外发请求**，也不依赖"读用户资料"权限（实测该权限对采集令牌为 403）。
   *
   * 每个 id 一次请求（N 很小：需求页 + 会议纪要页，量级为十几），且串行 + 固定间隔；
   * 单页失败只降级该页（记警告、不放进 Map），不因一页异常中断整轮。
   */
  async fetchPageBodies(pageIds: string[]): Promise<ConfluenceBodyFetchResult> {
    const before = this.requestCount;
    const bodies = new Map<string, string>();
    const renderedUserNames = new Map<string, string>();

    for (const pageId of pageIds) {
      const id = pageId.trim();
      if (!id) continue;

      try {
        const page = await this.get<RawPageBody>(
          `/rest/api/content/${encodeURIComponent(id)}?expand=body.storage,body.view`,
        );

        const value = page.body?.storage?.value;
        if (typeof value === 'string') {
          bodies.set(id, value);
        } else {
          this.logger.warn(`页面 ${id} 未返回 storage 正文（可能无权限或已删除），本轮按缺页处理`);
        }

        // 渲染视图缺失不影响口径（storage 已在手），只是这一页拿不到展示名
        const view = page.body?.view?.value;
        if (typeof view === 'string') {
          for (const [accountId, name] of extractRenderedUserNames(view)) {
            if (!renderedUserNames.has(accountId)) renderedUserNames.set(accountId, name);
          }
        }
      } catch (error) {
        this.logger.warn(`取页面 ${id} 正文失败，本轮按缺页处理：${(error as Error).message}`);
      }
    }

    if (renderedUserNames.size > 0) {
      this.logger.log(`渲染视图换出 ${renderedUserNames.size} 个账号展示名（附带取回，不额外发请求）`);
    }

    return { bodies, renderedUserNames, requestCount: this.requestCount - before };
  }

  /**
   * 按页取版本历史：逐页 `GET /wiki/api/v2/pages/{id}/versions`（**编辑量**口径，见 ADR-0011）。
   *
   * 用 v2 而不复用 v1：v2 版本接口是官方文档中的稳定端点，字段即 `authorId` —— 归属唯一真相。
   * 展示名**不在这里取**（v2 版本不返回），由 `fetchPageBodies` 的渲染视图统一补。
   *
   * 每页一次请求（实测 53 页），串行 + 固定间隔；单页失败只降级该页（记警告、不放进 Map），
   * 不因一页异常中断整轮。单页版本数超一页容量时按 `_links.next` 游标翻页。
   */
  async fetchPageVersions(pageIds: string[]): Promise<ConfluencePageVersionFetchResult> {
    const before = this.requestCount;
    const versions = new Map<string, ConfluencePageVersionRecord[]>();

    for (const pageId of pageIds) {
      const id = pageId.trim();
      if (!id) continue;

      try {
        const list = await this.versionsAll(id);
        if (list.length > 0) {
          versions.set(id, list);
        } else {
          this.logger.warn(
            `页面 ${id} 返回 0 个版本（任何存活页面都该有创建版本），该页编辑量按 0 计`,
          );
        }
      } catch (error) {
        this.logger.warn(`取页面 ${id} 版本历史失败，该页编辑量按 0 计：${(error as Error).message}`);
      }
    }

    const list = [...versions.values()];
    const versionCount = list.reduce((sum, items) => sum + items.length, 0);
    const authorCount = new Set(
      list.flat().map((item) => item.authorId).filter((id): id is string => Boolean(id)),
    ).size;
    this.logger.log(
      `版本历史：${versions.size}/${pageIds.length} 页共 ${versionCount} 个版本（${authorCount} 位作者）`,
    );

    return { versions, requestCount: this.requestCount - before };
  }

  /** 单页版本历史全量：按 `_links.next` 游标翻页，直到取尽或触及翻页上限 */
  private async versionsAll(pageId: string): Promise<ConfluencePageVersionRecord[]> {
    const out: ConfluencePageVersionRecord[] = [];
    // 不传 sort：v2 版本接口的 sort 只接受 modified-date / -modified-date，传 number 会 400
    // （Invalid sort order）。编辑量只按版本条数计，与顺序无关，故取默认序、翻页后再自行升序。
    let path = `/api/v2/pages/${encodeURIComponent(pageId)}/versions?limit=${CONFLUENCE_VERSION_PAGE_SIZE}`;

    let guard = 0;
    while (path && guard < CONFLUENCE_VERSION_MAX_PAGES) {
      const body = await this.get<RawVersionList>(path);
      guard += 1;

      for (const item of body.results ?? []) {
        const number = typeof item.number === 'number' ? item.number : 0;
        if (number <= 0) continue;
        const authorId = item.authorId?.trim();
        out.push({
          number,
          authorId: authorId ? authorId : null,
          createdAt: item.createdAt ?? null,
        });
      }

      // next 形如 /wiki/api/v2/pages/{id}/versions?...；去掉 /wiki 前缀以拼回 baseUrl
      const next = body._links?.next;
      path = next ? next.replace(/^\/wiki/, '') : '';
    }

    if (path) {
      this.logger.warn(
        `页面 ${pageId} 已达版本翻页上限 ${CONFLUENCE_VERSION_MAX_PAGES} 页，编辑量可能被截断`,
      );
    }

    // 口径要求按版本号升序（与接口返回顺序解耦，保证结果稳定）
    out.sort((a, b) => a.number - b.number);
    return out;
  }

  /**
   * 按 accountId 取展示名：逐账号 `GET /rest/api/user?accountId=...`（**末端兜底**）。
   *
   * 展示名通常已由 `body.view` 渲染视图给出；这里只补漏。实测真实站点对采集令牌返回
   * 403（`User not permitted to view user profiles`）—— 401/403 时一次性停用后续查询，
   * 全部降级为 accountId，因为展示名只用于可读性，不值得让它把整轮采集搅黄。
   */
  async fetchUserNames(accountIds: string[]): Promise<ConfluenceUserNameFetchResult> {
    const before = this.requestCount;
    const names = new Map<string, string>();

    if (this.userLookupDisabled) {
      return { names, requestCount: 0 };
    }

    for (const accountId of accountIds) {
      const id = accountId.trim();
      if (!id) continue;

      try {
        const user = await this.get<RawUser>(`/rest/api/user?accountId=${encodeURIComponent(id)}`);
        if (user.displayName?.trim()) names.set(id, user.displayName.trim());
      } catch (error) {
        const status = error instanceof ConfluenceRequestError ? error.status : 0;
        if (status === 401 || status === 403) {
          this.userLookupDisabled = true;
          this.logger.warn(
            '账号展示名查询无权限（401/403）：展示名统一降级为 accountId，不影响计数与归属',
          );
          break;
        }
        this.logger.warn(`账号 ${id} 展示名查询失败，降级为 accountId：${(error as Error).message}`);
      }
    }

    return { names, requestCount: this.requestCount - before };
  }

  /**
   * CQL 构造：空间 + 类型为 page；有游标时按 lastmodified 过滤。
   * 标签不在 CQL 侧过滤 —— 采集层只负责"取全"，口径收敛在聚合层，便于事后重算。
   */
  private buildCql(spaces: string[], since: string | null): string {
    const spaceList = spaces.map((key) => `"${key}"`).join(',');
    // 注意：CQL 的 `order by` 是独立子句，不能用 `and` 连接（会报 Could not parse cql）
    const filters = [`space in (${spaceList})`, 'type=page'];
    if (since) {
      filters.push(`lastmodified >= "${toCqlDate(since)}"`);
    }
    return `${filters.join(' and ')} order by created asc`;
  }

  /** 按 `_links.next` 游标翻页，直到取尽或触及翻页上限 */
  private async searchAll(cql: string): Promise<RawPage[]> {
    const out: RawPage[] = [];
    // 必须显式 expand space：v1 search 默认不回传 space，否则 spaceKey 全为空
    let path =
      `/rest/api/content/search?cql=${encodeURIComponent(cql)}` +
      `&limit=${this.pageSize}&expand=space,version,history,metadata.labels,ancestors`;

    let guard = 0;
    while (path && guard < CONFLUENCE_MAX_PAGES) {
      const body = await this.get<RawSearchResponse>(path);
      guard += 1;

      out.push(...(body.results ?? []));
      this.logger.log(`已拉取 ${out.length} 个页面（第 ${guard} 页）`);

      // next 形如 /wiki/rest/api/content/search?...；去掉 /wiki 前缀以拼回 baseUrl
      const next = body._links?.next;
      path = next ? next.replace(/^\/wiki/, '') : '';
    }

    if (path) {
      this.logger.warn(
        `已达翻页上限 ${CONFLUENCE_MAX_PAGES} 页，结果可能被截断（当前 ${out.length} 条）`,
      );
    }

    return out;
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/wiki${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (this.requestCount > 0 && this.spacingMs > 0) {
        await sleep(this.spacingMs);
      }
      this.requestCount += 1;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        });
      } catch (error) {
        // 网络层错误（DNS / 超时 / 连接重置）：退避后重试
        lastError = error as Error;
        this.logger.warn(`请求异常，第 ${attempt + 1} 次重试：${(error as Error).message}`);
        await this.backoff(attempt, null);
        continue;
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      const body = await response.text().catch(() => '');
      const error = new ConfluenceRequestError(response.status, path.split('?')[0], body);

      if (!RETRYABLE_STATUS.has(response.status)) {
        // 401/403 属于配置问题，快速失败并给出可操作提示
        if (response.status === 401 || response.status === 403) {
          this.logger.error(
            '鉴权失败：请确认 CONFLUENCE_TOKEN 有效且账号对目标空间有浏览权限',
          );
        }
        throw error;
      }

      lastError = error;
      this.logger.warn(`限流/服务端错误 ${response.status}，第 ${attempt + 1} 次重试`);
      await this.backoff(attempt, response.headers.get('retry-after'));
    }

    throw lastError ?? new Error(`Confluence 请求失败：${path}`);
  }

  private async backoff(attempt: number, retryAfterHeader: string | null): Promise<void> {
    const retryAfterSeconds = Number.parseInt(retryAfterHeader ?? '', 10);
    const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : Math.min(500 * 2 ** attempt, 5000);
    await sleep(waitMs);
  }

  /** 归一化：字段缺失一律降级为 null / 空，不因单页结构异常中断整轮 */
  private toRecord(page: RawPage): ConfluencePageRecord {
    const creator = page.history?.createdBy;
    const editor = page.version?.by;

    return {
      pageId: page.id ?? '',
      title: page.title ?? '',
      spaceKey: page.space?.key ?? '',
      status: page.status ?? '',
      labels: (page.metadata?.labels?.results ?? [])
        .map((label) => label.name ?? '')
        .filter((name) => name.length > 0),
      creatorAccountId: creator?.accountId ?? null,
      creatorDisplayName: creator?.displayName ?? '(unknown)',
      creatorAccountType: creator?.accountType ?? null,
      createdDate: page.history?.createdDate ?? null,
      lastModified: page.version?.when ?? null,
      lastModifiedByAccountId: editor?.accountId ?? null,
      lastModifiedByDisplayName: editor?.displayName ?? null,
      versionNumber: page.version?.number ?? null,
      ancestorTitles: (page.ancestors ?? [])
        .map((ancestor) => ancestor.title ?? '')
        .filter((title) => title.length > 0),
    };
  }
}
