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
  };
};
