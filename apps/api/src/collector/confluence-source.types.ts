/**
 * Confluence 采集源抽象：把「数据从哪来」与「怎么聚合落盘」解耦。
 *
 * - ConfluenceRestSource：真实 Confluence REST（v1 search + CQL）
 * - FixtureConfluenceSource：离线固定数据，用于无 token 环境下的端到端验证
 *
 * 记录刻意**保留全部可能有归属价值的信号**（创建者 / 编辑者 / 标签 / 祖先层级）：
 * Confluence 空间内是否存在"组织"概念、以何种形式存在，以真实数据为准，
 * 采集层不做预判、不丢字段。
 */

/** 一门页面的原始事实（仅内存聚合与快照使用；不直接落契约文件） */
export interface ConfluencePageRecord {
  pageId: string;
  title: string;
  spaceKey: string;
  status: string;
  /** 页面标签原文（不做规范化、不筛白名单，筛选留到聚合层） */
  labels: string[];
  /** 创建者稳定标识（归属判定的主信号；取不到时为 null） */
  creatorAccountId: string | null;
  creatorDisplayName: string;
  /** 账户类型：atlassian / app / customer / unknown */
  creatorAccountType: string | null;
  createdDate: string | null;
  lastModified: string | null;
  lastModifiedByAccountId: string | null;
  lastModifiedByDisplayName: string | null;
  versionNumber: number | null;
  /** 祖先标题链（顶层 → 直接父页），用于观察页面树的组织方式 */
  ancestorTitles: string[];
}

export interface ConfluenceFetchOptions {
  /** 增量游标（ISO 8601）；null 表示全量 */
  since: string | null;
  /** 目标空间 key；为空表示未配置（由调用方提前拦截） */
  spaces: string[];
}

export interface ConfluenceFetchResult {
  pages: ConfluencePageRecord[];
  /** 本轮实际发出的 HTTP 请求数（用于观测与限流评估） */
  requestCount: number;
  /** 实际参与查询的空间 */
  spaces: string[];
}

/** 按页取正文的结果（正文是口径解析的原料，只有目标页才需要） */
export interface ConfluenceBodyFetchResult {
  /** pageId → storage 格式正文；取不到的页面**不出现**在 Map 里（调用方按缺失降级） */
  bodies: Map<string, string>;
  /**
   * accountId → 展示名，取自同一请求的 `body.view` 渲染视图。
   *
   * 这是**唯一实测有效的展示名来源**：storage 正文只有 accountId，`/rest/api/user` 返回 403，
   * 而渲染视图由服务端按查看者权限换好了名字。只影响可读性，不影响计数与归属。
   */
  renderedUserNames: Map<string, string>;
  /** 本次发出的请求数（增量，不含此前 fetch 的请求） */
  requestCount: number;
}

/** 账号展示名查询结果 */
export interface ConfluenceUserNameFetchResult {
  /** accountId → displayName；查不到的账号不出现 */
  names: Map<string, string>;
  requestCount: number;
}

export interface ConfluenceSource {
  readonly label: string;
  fetch(options: ConfluenceFetchOptions): Promise<ConfluenceFetchResult>;
  /**
   * 按页取正文（storage 格式）。
   *
   * 为何**按页**而不是全量展开：正文体积远大于元数据（实测单页 5~11 KB），
   * 空间里绝大多数页面与口径无关，全量展开是纯浪费且放大被限流的风险。
   */
  fetchPageBodies(pageIds: string[]): Promise<ConfluenceBodyFetchResult>;
  /**
   * 按 accountId 取展示名（`/rest/api/user`）。
   *
   * 已成**末端兜底**：渲染视图（`fetchPageBodies` 的 `body.view`）先给出名字，这里只补漏，
   * 而真实站点对采集令牌返回 403。展示名**只影响可读性**（状态文件里的待办清单、日志），
   * 不影响任何计数与归属；因此无权限或查询失败时降级为空而不抛错。
   */
  fetchUserNames(accountIds: string[]): Promise<ConfluenceUserNameFetchResult>;
}
