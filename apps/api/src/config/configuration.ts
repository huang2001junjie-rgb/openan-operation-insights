import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 解析 JSON 数据目录。
 * 优先取 DATA_DIR；未配置时回退到仓库根的 data/ 目录
 * （dev 时进程 cwd 为 apps/api，故上溯两级）。
 */
function resolveDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) {
    return resolve(process.cwd(), fromEnv);
  }

  const candidates = [
    resolve(process.cwd(), '../../data'),
    resolve(process.cwd(), '../data'),
    resolve(process.cwd(), 'data'),
    resolve(__dirname, '../../../../data'),
  ];

  return candidates.find((dir) => existsSync(dir)) ?? candidates[0];
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** GitHub 采集配置（见 05 文档第 2 章） */
export interface GithubConfig {
  token: string;
  /** 组织白名单；GITHUB_REPOS 为空时由其枚举仓库 */
  orgs: string[];
  /** 仓库白名单（nameWithOwner）；非空时仅采集列表内仓库 */
  repos: string[];
  /** 兜底回溯窗口（天）：仅当本地游标缺失/损坏时生效 */
  lookbackDays: number;
  endpoint?: string;
}

/**
 * Confluence 采集配置（见 05 文档第 3 章）。
 *
 * 归属（账号 → 组织）不在此处硬编码：Confluence 内的组织信号以真实数据为准，
 * 配置只负责"从哪取、取哪些空间、按什么结构选页"。
 *
 * 口径项（页面结构选择器与列名）全部为**留空取内置默认**：
 * 真实空间改版（标题改名、列改名、年份滚动）时可用环境变量就地校正，不必改代码发版；
 * 默认值集中在 collector.constants.ts，改一处即可。
 */
export interface ConfluenceConfig {
  /** 站点根地址（不含 /wiki 后缀），如 https://example.atlassian.net */
  baseUrl: string;
  /** 个人访问令牌（Bearer 认证） */
  token: string;
  /** 目标空间 key 白名单（本项目 Confluence 采集的唯一单位） */
  spaces: string[];
  /** 「需求」来源页标题（留空取默认 `Requirement Proposal`） */
  requirementPageTitle: string;
  /** 「需求」来源页必须位于该祖先标题之下（留空取默认 `Release Planning`） */
  requirementAncestorTitle: string;
  /** 需求表格里联系人列的列名（留空取默认 `Contacts`） */
  requirementContactColumn: string;
  /** 需求表格里标题列的列名（留空取默认 `Requirement Title`） */
  requirementTitleColumn: string;
  /** 会议纪要父页标题正则（留空取默认 `^\d{4} - TSC Minutes$`） */
  minutesParentPattern: string;
  /** 会议纪要页标题正则（留空取默认 `^\d{4}-\d{2}-\d{2} TSC Minutes$`） */
  minutesTitlePattern: string;
  /** 「议题分享」所取的标题段名（留空取默认 `Agenda`） */
  minutesAgendaHeading: string;
  /**
   * 兜底回溯窗口（天）。**当前未被使用**：Confluence 侧恒全量重算
   * （聚合是全量替换语义，增量需按页账本，见 ADR-0007）。
   * 保留该项仅为将来启用按页账本的增量模式时不必改环境变量面。
   */
  lookbackDays: number;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  dataDir: string;
  /** 例会台账（Excel）源文件路径：仅供采集脚本使用，API 不读取（见 03 文档 §7） */
  meetingsSourcePath: string;
  corsOrigins: string[];
  cacheTtlSeconds: number;
  logLevel: string;
  /**
   * 身份匹配控制台写接口令牌（04 §5.1）。
   * 为空表示写功能整体禁用（写接口返回 40301）；仅比对、不落盘、不记日志。
   */
  adminToken: string;
  github: GithubConfig;
  confluence: ConfluenceConfig;
}

/** 例会台账源文件：MEETINGS_SOURCE_PATH 优先，否则默认 <dataDir>/source/meetings.xlsx */
function resolveMeetingsSourcePath(dataDir: string): string {
  const fromEnv = process.env.MEETINGS_SOURCE_PATH?.trim();
  return fromEnv ? resolve(process.cwd(), fromEnv) : resolve(dataDir, 'source', 'meetings.xlsx');
}

export default (): AppConfig => {
  const dataDir = resolveDataDir();

  return {
    nodeEnv: process.env.NODE_ENV?.trim() || 'development',
    port: toNumber(process.env.PORT, 3000),
    dataDir,
    meetingsSourcePath: resolveMeetingsSourcePath(dataDir),
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    cacheTtlSeconds: toNumber(process.env.CACHE_TTL_SECONDS, 300),
    logLevel: process.env.LOG_LEVEL?.trim() || 'log',
    adminToken: process.env.ADMIN_TOKEN?.trim() ?? '',
    github: {
      token: process.env.GITHUB_TOKEN?.trim() ?? '',
      orgs: splitList(process.env.GITHUB_ORGS),
      repos: splitList(process.env.GITHUB_REPOS),
      lookbackDays: toNumber(process.env.GITHUB_LOOKBACK_DAYS, 3650),
      endpoint: process.env.GITHUB_API_ENDPOINT?.trim() || undefined,
    },
    confluence: {
      // 去掉尾部斜杠：调用侧统一拼接 `${baseUrl}/wiki/...`
      baseUrl: (process.env.CONFLUENCE_BASE_URL?.trim() ?? '').replace(/\/+$/, ''),
      token: process.env.CONFLUENCE_TOKEN?.trim() ?? '',
      spaces: splitList(process.env.CONFLUENCE_SPACES),
      requirementPageTitle: process.env.CONFLUENCE_REQUIREMENT_PAGE_TITLE?.trim() ?? '',
      requirementAncestorTitle:
        process.env.CONFLUENCE_REQUIREMENT_ANCESTOR_TITLE?.trim() ?? '',
      requirementContactColumn:
        process.env.CONFLUENCE_REQUIREMENT_CONTACT_COLUMN?.trim() ?? '',
      requirementTitleColumn: process.env.CONFLUENCE_REQUIREMENT_TITLE_COLUMN?.trim() ?? '',
      minutesParentPattern: process.env.CONFLUENCE_MINUTES_PARENT_PATTERN?.trim() ?? '',
      minutesTitlePattern: process.env.CONFLUENCE_MINUTES_TITLE_PATTERN?.trim() ?? '',
      minutesAgendaHeading: process.env.CONFLUENCE_MINUTES_AGENDA_HEADING?.trim() ?? '',
      lookbackDays: toNumber(process.env.CONFLUENCE_LOOKBACK_DAYS, 3650),
    },
  };
};
