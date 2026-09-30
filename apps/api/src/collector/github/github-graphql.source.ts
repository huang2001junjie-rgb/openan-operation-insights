import { Logger } from '@nestjs/common';
import {
  MAX_PAGES,
  REQUEST_SPACING_MS,
} from '../collector.constants';
import {
  PAGE_SIZE,
  RATE_LIMIT_FLOOR,
  SEARCH_RESULT_LIMIT,
} from './github.constants';
import type {
  GithubAuthorRef,
  GithubContributionRecord,
  GithubFetchOptions,
  GithubFetchResult,
  GithubSource,
} from './github-source.port';

export interface GithubGraphqlSourceConfig {
  token: string;
  /** 组织白名单：GITHUB_REPOS 为空时，仓库列表由这些组织枚举得出 */
  orgs: string[];
  /** 仓库白名单（nameWithOwner）；非空时仅采集列表内仓库 */
  repos: string[];
  endpoint?: string;
}

/** 配额触底：必须中止本轮采集，保留上一次成功落盘的数据 */
export class RateLimitFloorError extends Error {
  constructor(readonly remaining: number | null) {
    super(`GitHub 剩余配额不足（remaining=${String(remaining)} < ${RATE_LIMIT_FLOOR}），本轮采集中止`);
    this.name = 'RateLimitFloorError';
  }
}

interface RateLimitPayload {
  rateLimit?: { remaining: number; resetAt: string };
}

/** PR 提交节点：用于同时取首提交作者邮箱（归属信号）与提交总数（指标） */
interface PrCommitsConnection {
  totalCount: number;
  nodes: { commit: { author: { email: string | null } | null } | null }[];
}

interface SearchNode {
  __typename: string;
  mergedAt?: string | null;
  createdAt?: string | null;
  additions?: number;
  deletions?: number;
  author?: GithubAuthorRef | null;
  repository?: { nameWithOwner: string } | null;
  commits?: PrCommitsConnection | null;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface SearchPagePayload {
  search: {
    issueCount: number;
    pageInfo: PageInfo;
    nodes: SearchNode[];
  };
}

interface RepositoryPullRequestsPayload {
  repository: {
    pullRequests: { nodes: SearchNode[]; pageInfo: PageInfo };
  } | null;
}

interface RepositoryIssuesPayload {
  repository: {
    issues: { nodes: SearchNode[]; pageInfo: PageInfo };
  } | null;
}

interface OrganizationRepositoriesPayload {
  organization: {
    repositories: { nodes: { nameWithOwner: string }[]; pageInfo: PageInfo };
  } | null;
}

const AUTHOR_FIELDS = `
  login
  url
  avatarUrl
  ... on User { githubId: databaseId name email }
`;

/**
 * PR 内提交：一次嵌套同时取提交总数（commits 指标）与首提交作者邮箱（域名归属信号）。
 * 提交邮箱公开可见且多为企业邮箱，是贡献者归属的主要来源。
 */
const PR_COMMITS_FIELDS = `
  commits(first: 1) {
    totalCount
    nodes { commit { author { email } } }
  }
`;

const SEARCH_QUERY = `
query ($q: String!, $after: String) {
  rateLimit { remaining resetAt }
  search(query: $q, type: ISSUE, first: ${PAGE_SIZE}, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on PullRequest {
        mergedAt
        additions
        deletions
        author { ${AUTHOR_FIELDS} }
        repository { nameWithOwner }
        ${PR_COMMITS_FIELDS}
      }
      ... on Issue {
        createdAt
        author { ${AUTHOR_FIELDS} }
        repository { nameWithOwner }
      }
    }
  }
}
`;

const REPOSITORY_PRS_QUERY = `
query ($owner: String!, $name: String!, $after: String) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) {
    pullRequests(states: MERGED, first: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        mergedAt
        additions
        deletions
        author { ${AUTHOR_FIELDS} }
        ${PR_COMMITS_FIELDS}
      }
    }
  }
}
`;

const REPOSITORY_ISSUES_QUERY = `
query ($owner: String!, $name: String!, $after: String) {
  rateLimit { remaining resetAt }
  repository(owner: $owner, name: $name) {
    issues(first: ${PAGE_SIZE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        createdAt
        author { ${AUTHOR_FIELDS} }
      }
    }
  }
}
`;

const ORGANIZATION_REPOS_QUERY = `
query ($login: String!, $after: String) {
  rateLimit { remaining resetAt }
  organization(login: $login) {
    repositories(first: ${PAGE_SIZE}, after: $after, isFork: false) {
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner }
    }
  }
}
`;

/**
 * 真实 GitHub 采集通道（GraphQL，见 05 文档 2.2）。
 *
 * 通道分工：
 * - 增量：`search`（限定 merged/created > since），一次覆盖全部仓库，成本低；
 * - 全量：逐仓库 `repository.pullRequests(states: MERGED)` 遍历，**规避搜索接口单查询 1000 条上限**。
 */
export class GithubGraphqlSource implements GithubSource {
  readonly label = 'github-graphql';

  private readonly logger = new Logger(GithubGraphqlSource.name);
  private readonly endpoint: string;

  private requestCount = 0;
  private rateLimitRemaining: number | null = null;
  private lastRequestAt = 0;
  private resolvedRepos: string[] | null = null;

  constructor(private readonly config: GithubGraphqlSourceConfig) {
    if (!config.token) {
      throw new Error('缺少 GITHUB_TOKEN，无法启用 GitHub 采集通道');
    }
    this.endpoint = config.endpoint ?? 'https://api.github.com/graphql';
  }

  async fetch(options: GithubFetchOptions): Promise<GithubFetchResult> {
    this.requestCount = 0;
    this.rateLimitRemaining = null;

    if (options.mode === 'incremental') {
      return this.fetchIncremental(options.since);
    }
    return this.fetchFull();
  }

  // ── 增量通道（search）──────────────────────────────────────

  private async fetchIncremental(since: string | null): Promise<GithubFetchResult> {
    if (!since) {
      throw new Error('增量采集缺少游标（lastSyncAt），请改用全量模式');
    }

    const scope = this.scopeQualifiers();
    const prQuery = `${scope} is:pr is:merged merged:>${since}`;
    const issueQuery = `${scope} is:issue created:>${since}`;

    const prResult = await this.searchAll(prQuery);
    const issueResult = await this.searchAll(issueQuery);

    const reportedTotalCount = prResult.totalCount + issueResult.totalCount;
    const truncated = prResult.truncated || issueResult.truncated;

    if (truncated) {
      this.logger.warn(
        `搜索结果已达单查询上限 ${SEARCH_RESULT_LIMIT} 条（PR ${prResult.totalCount} / Issue ${issueResult.totalCount}），` +
          '增量结果可能被静默截断；请改用全量逐仓库遍历（--mode=full）',
      );
    }

    return {
      records: [...prResult.records, ...issueResult.records],
      reportedTotalCount,
      truncated,
      requestCount: this.requestCount,
      rateLimitRemaining: this.rateLimitRemaining,
    };
  }

  private async searchAll(queryString: string): Promise<{
    records: GithubContributionRecord[];
    totalCount: number;
    truncated: boolean;
  }> {
    const records: GithubContributionRecord[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload: SearchPagePayload = await this.request<SearchPagePayload>(
        SEARCH_QUERY,
        { q: queryString, after: cursor },
      );

      const { search } = payload;
      search.nodes.forEach((node) => {
        const record = this.toRecord(node);
        if (record) records.push(record);
      });

      // 搜索接口单查询最多 1000 条：达到上限即为截断，继续翻页也无结果
      if (search.issueCount >= SEARCH_RESULT_LIMIT) {
        return { records, totalCount: search.issueCount, truncated: true };
      }

      if (!search.pageInfo.hasNextPage) {
        return { records, totalCount: search.issueCount, truncated: false };
      }
      cursor = search.pageInfo.endCursor;
    }

    this.logger.warn(`搜索翻页达到上限 ${MAX_PAGES} 页，提前结束`);
    return { records, totalCount: records.length, truncated: true };
  }

  // ── 全量通道（逐仓库遍历，无 1000 上限）────────────────────

  private async fetchFull(): Promise<GithubFetchResult> {
    const repos = await this.resolveRepos();
    const records: GithubContributionRecord[] = [];

    for (const fullName of repos) {
      const [owner, name] = fullName.split('/');
      if (!owner || !name) {
        this.logger.warn(`跳过非法仓库名：${fullName}`);
        continue;
      }

      records.push(...(await this.fetchRepositoryPullRequests(owner, name)));
      records.push(...(await this.fetchRepositoryIssues(owner, name)));
    }

    return {
      records,
      reportedTotalCount: null,
      truncated: false,
      requestCount: this.requestCount,
      rateLimitRemaining: this.rateLimitRemaining,
    };
  }

  private async fetchRepositoryPullRequests(
    owner: string,
    name: string,
  ): Promise<GithubContributionRecord[]> {
    const records: GithubContributionRecord[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload: RepositoryPullRequestsPayload =
        await this.request<RepositoryPullRequestsPayload>(REPOSITORY_PRS_QUERY, {
          owner,
          name,
          after: cursor,
        });

      if (!payload.repository) {
        this.logger.warn(`仓库不可访问（权限/不存在）：${owner}/${name}`);
        return records;
      }

      const connection = payload.repository.pullRequests;
      connection.nodes.forEach((node) => {
        records.push({
          kind: 'pullRequest',
          repository: `${owner}/${name}`,
          author: node.author ?? null,
          linesChanged: (node.additions ?? 0) + (node.deletions ?? 0),
          timestamp: node.mergedAt ?? null,
          commitEmail: node.commits?.nodes?.[0]?.commit?.author?.email ?? null,
          commitCount: node.commits?.totalCount ?? 0,
        });
      });

      if (!connection.pageInfo.hasNextPage) return records;
      cursor = connection.pageInfo.endCursor;
    }

    this.logger.warn(`${owner}/${name} 的 PR 翻页达到上限 ${MAX_PAGES} 页`);
    return records;
  }

  private async fetchRepositoryIssues(
    owner: string,
    name: string,
  ): Promise<GithubContributionRecord[]> {
    const records: GithubContributionRecord[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload: RepositoryIssuesPayload =
        await this.request<RepositoryIssuesPayload>(REPOSITORY_ISSUES_QUERY, {
          owner,
          name,
          after: cursor,
        });

      if (!payload.repository) return records;

      const connection = payload.repository.issues;
      connection.nodes.forEach((node) => {
        records.push({
          kind: 'issue',
          repository: `${owner}/${name}`,
          author: node.author ?? null,
          linesChanged: 0,
          timestamp: node.createdAt ?? null,
          commitCount: 0,
        });
      });

      if (!connection.pageInfo.hasNextPage) return records;
      cursor = connection.pageInfo.endCursor;
    }

    return records;
  }

  // ── 仓库枚举 ───────────────────────────────────────────────

  private async resolveRepos(): Promise<string[]> {
    if (this.resolvedRepos) return this.resolvedRepos;

    if (this.config.repos.length > 0) {
      this.resolvedRepos = [...this.config.repos];
      return this.resolvedRepos;
    }

    if (this.config.orgs.length === 0) {
      throw new Error('GITHUB_REPOS 与 GITHUB_ORGS 均为空，无法确定采集范围');
    }

    const repos = new Set<string>();
    for (const login of this.config.orgs) {
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const payload: OrganizationRepositoriesPayload =
          await this.request<OrganizationRepositoriesPayload>(ORGANIZATION_REPOS_QUERY, {
            login,
            after: cursor,
          });

        if (!payload.organization) {
          this.logger.warn(`组织不可访问或不存在：${login}`);
          break;
        }

        const connection = payload.organization.repositories;
        connection.nodes.forEach((node) => repos.add(node.nameWithOwner));

        if (!connection.pageInfo.hasNextPage) break;
        cursor = connection.pageInfo.endCursor;
      }
    }

    this.resolvedRepos = [...repos].sort();
    this.logger.log(`枚举到 ${this.resolvedRepos.length} 个仓库（来源：GITHUB_ORGS）`);
    return this.resolvedRepos;
  }

  /** 搜索限定符：优先仓库白名单，否则按组织（多个限定符之间为 OR） */
  private scopeQualifiers(): string {
    if (this.config.repos.length > 0) {
      return this.config.repos.map((repo) => `repo:${repo}`).join(' ');
    }
    if (this.config.orgs.length > 0) {
      return this.config.orgs.map((org) => `org:${org}`).join(' ');
    }
    throw new Error('GITHUB_REPOS 与 GITHUB_ORGS 均为空，无法构造查询范围');
  }

  private toRecord(node: SearchNode): GithubContributionRecord | null {
    const repository = node.repository?.nameWithOwner;
    if (!repository) return null;

    if (node.__typename === 'PullRequest') {
      return {
        kind: 'pullRequest',
        repository,
        author: node.author ?? null,
        linesChanged: (node.additions ?? 0) + (node.deletions ?? 0),
        timestamp: node.mergedAt ?? null,
        commitEmail: node.commits?.nodes?.[0]?.commit?.author?.email ?? null,
        commitCount: node.commits?.totalCount ?? 0,
      };
    }

    return {
      kind: 'issue',
      repository,
      author: node.author ?? null,
      linesChanged: 0,
      timestamp: node.createdAt ?? null,
      commitCount: 0,
    };
  }

  // ── 请求层：串行 + 间隔 + 配额守卫 + 退避重试 ───────────────

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (this.rateLimitRemaining !== null && this.rateLimitRemaining < RATE_LIMIT_FLOOR) {
        throw new RateLimitFloorError(this.rateLimitRemaining);
      }

      await this.throttle();

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          authorization: `bearer ${this.config.token}`,
          'content-type': 'application/json',
          'user-agent': 'openan-operation-insights-collector',
        },
        body: JSON.stringify({ query, variables }),
      });

      this.requestCount += 1;
      const text = await response.text();

      if (!response.ok) {
        if (attempt < maxAttempts && this.isRetryable(response.status)) {
          const delay = this.retryDelay(response, attempt);
          this.logger.warn(`GitHub 返回 ${response.status}，${delay}ms 后重试（第 ${attempt} 次）`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`GitHub API 请求失败：HTTP ${response.status} ${text.slice(0, 200)}`);
      }

      const payload = JSON.parse(text) as {
        data?: T & RateLimitPayload;
        errors?: { message: string }[];
      };

      if (payload.data?.rateLimit) {
        this.rateLimitRemaining = payload.data.rateLimit.remaining;
      }

      if (payload.errors?.length) {
        throw new Error(`GitHub GraphQL 错误：${payload.errors.map((e) => e.message).join('; ')}`);
      }
      if (!payload.data) {
        throw new Error('GitHub GraphQL 响应缺少 data 字段');
      }

      return payload.data;
    }

    throw new Error('GitHub API 请求重试次数已用尽');
  }

  private isRetryable(status: number): boolean {
    return status === 403 || status === 429 || status >= 500;
  }

  private retryDelay(response: Response, attempt: number): number {
    const resetHeader = response.headers.get('x-ratelimit-reset');
    if (resetHeader) {
      const resetAt = Number.parseInt(resetHeader, 10) * 1000;
      const wait = resetAt - Date.now();
      if (Number.isFinite(wait) && wait > 0 && wait < 60_000) {
        return wait;
      }
    }
    const base = 2 ** attempt * 500;
    return base + Math.floor(Math.random() * 250);
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const wait = REQUEST_SPACING_MS - elapsed;
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestAt = Date.now();
  }
}
