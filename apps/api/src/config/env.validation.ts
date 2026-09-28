/**
 * 启动期环境变量校验（fail-fast）。
 * 本期所有变量均非必填，仅校验"提供了就必须合法"的项，
 * 以及阶段三接入时才会强制的成对约束。
 */
export function validateEnv(raw: Record<string, unknown>): Record<string, unknown> {
  const errors: string[] = [];

  const port = raw.PORT;
  if (port !== undefined && port !== '') {
    const parsed = Number.parseInt(String(port), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      errors.push(`PORT 必须是 1-65535 之间的整数，当前值：${String(port)}`);
    }
  }

  const ttl = raw.CACHE_TTL_SECONDS;
  if (ttl !== undefined && ttl !== '') {
    const parsed = Number.parseInt(String(ttl), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      errors.push(`CACHE_TTL_SECONDS 必须是非负整数，当前值：${String(ttl)}`);
    }
  }

  const lookback = raw.GITHUB_LOOKBACK_DAYS;
  if (lookback !== undefined && lookback !== '') {
    const parsed = Number.parseInt(String(lookback), 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      errors.push(`GITHUB_LOOKBACK_DAYS 必须是正整数，当前值：${String(lookback)}`);
    }
  }

  // 身份匹配写接口令牌：提供则必须足够长，避免弱口令直接开启写通道
  const adminToken = raw.ADMIN_TOKEN;
  if (adminToken !== undefined && String(adminToken).trim() !== '') {
    if (String(adminToken).trim().length < 8) {
      errors.push('ADMIN_TOKEN 至少 8 个字符；留空表示禁用身份匹配写功能');
    }
  }

  const nodeEnv = raw.NODE_ENV;
  if (nodeEnv !== undefined && !['development', 'production', 'test'].includes(String(nodeEnv))) {
    errors.push(`NODE_ENV 只能是 development / production / test，当前值：${String(nodeEnv)}`);
  }

  // 口径选择器里的正则：提供了就必须能编译，否则在采集期才炸
  for (const key of ['CONFLUENCE_MINUTES_PARENT_PATTERN', 'CONFLUENCE_MINUTES_TITLE_PATTERN']) {
    const value = raw[key];
    if (value === undefined || String(value).trim() === '') continue;
    try {
      new RegExp(String(value));
    } catch (error) {
      errors.push(`${key} 不是合法正则：${(error as Error).message}`);
    }
  }

  // 阶段三成对约束：只配置了一半即为配置错误，提前暴露而不是运行时报错。
  if (raw.GITHUB_TOKEN && !raw.GITHUB_ORGS && !raw.GITHUB_REPOS) {
    errors.push('已配置 GITHUB_TOKEN，但 GITHUB_ORGS 与 GITHUB_REPOS 均为空，无法确定采集范围');
  }
  if (raw.CONFLUENCE_TOKEN && !raw.CONFLUENCE_BASE_URL) {
    errors.push('已配置 CONFLUENCE_TOKEN，但缺少 CONFLUENCE_BASE_URL');
  }
  if (raw.CONFLUENCE_TOKEN && !String(raw.CONFLUENCE_SPACES ?? '').trim()) {
    errors.push('已配置 CONFLUENCE_TOKEN，但 CONFLUENCE_SPACES 为空，无法确定采集范围');
  }

  const confluenceLookback = raw.CONFLUENCE_LOOKBACK_DAYS;
  if (confluenceLookback !== undefined && confluenceLookback !== '') {
    const parsed = Number.parseInt(String(confluenceLookback), 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      errors.push(`CONFLUENCE_LOOKBACK_DAYS 必须是正整数，当前值：${String(confluenceLookback)}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`环境变量校验失败：\n  - ${errors.join('\n  - ')}`);
  }

  return raw;
}
