import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CollectorModule } from '../collector.module';
import { GithubCollectOptions, GithubCollectorService } from './github-collector.service';
import { RateLimitFloorError } from './github-graphql.source';
import { GithubSyncState, GithubSyncStateStore } from './github-sync-state.store';

type RequestedMode = 'auto' | 'incremental' | 'full';

interface CliArgs {
  mode: RequestedMode;
  dryRun: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv: string[]): CliArgs {
  const modeArg = argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length) ?? 'auto';
  if (!['auto', 'incremental', 'full'].includes(modeArg)) {
    throw new Error(`--mode 只能是 auto / incremental / full，当前值：${modeArg}`);
  }
  return { mode: modeArg as RequestedMode, dryRun: argv.includes('--dry-run') };
}

/**
 * 模式解析（见 05 文档 2.4）：
 * - auto：有游标 → 增量；游标缺失/损坏 → 全量
 * - 显式指定则尊重入参
 */
function resolveMode(requested: RequestedMode, state: GithubSyncState): 'incremental' | 'full' {
  if (requested !== 'auto') return requested;
  return state.lastSyncAt ? 'incremental' : 'full';
}

/**
 * 增量起点：优先游标；游标缺失时才回退到兜底回溯窗口。
 * GITHUB_LOOKBACK_DAYS 只在无游标场景生效，不参与正常增量。
 */
function resolveSince(
  mode: 'incremental' | 'full',
  state: GithubSyncState,
  lookbackDays: number,
): string | null {
  if (mode === 'full') return null;
  if (state.lastSyncAt) return state.lastSyncAt;
  return new Date(Date.now() - lookbackDays * DAY_MS).toISOString();
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Collector');
  const args = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(CollectorModule, {
    logger: ['error', 'warn', 'log'],
  });

  const collector = app.get(GithubCollectorService);
  const syncState = app.get(GithubSyncStateStore);
  const config = app.get(ConfigService);

  const previous = await syncState.read();
  const lookbackDays = config.get<number>('github.lookbackDays') ?? 3650;
  const mode = resolveMode(args.mode, previous);
  const since = resolveSince(mode, previous, lookbackDays);

  if (mode === 'incremental' && !previous.lastSyncAt) {
    logger.warn(
      `游标缺失，回退到兜底回溯窗口 ${lookbackDays} 天（since=${String(since)}）`,
    );
  }

  const options: GithubCollectOptions = { mode, since, dryRun: args.dryRun };

  try {
    const outcome = await collector.run(options);

    logger.log('── 采集结果 ──────────────────────────────');
    logger.log(`模式        : ${outcome.mode}`);
    logger.log(`记录数      : ${outcome.recordCount}`);
    logger.log(`GraphQL 请求: ${outcome.requestCount}`);
    logger.log(`组织数      : ${outcome.orgCount}（含独立开发者伪组织）`);
    logger.log(`贡献者      : ${outcome.personCount} 人带 GitHub 指标`);
    logger.log(`独立开发者  : ${outcome.unattributedCount} 人`);
    logger.log(`邮箱归属    : ${outcome.emailAttributedCount} 人通过邮箱域名命中组织`);
    logger.log(
      `合计        : PR ${outcome.totals.pullRequests} / 提交 ${outcome.totals.commits} / Issue ${outcome.totals.issues} / 行数 ${outcome.totals.linesChanged}`,
    );
    logger.log(`截断风险    : ${outcome.truncated ? '是（status=partial）' : '否'}`);
    logger.log(`写入文件    : ${outcome.written.length > 0 ? outcome.written.join(', ') : '(dry-run)'}`);
    logger.log('─────────────────────────────────────────');

    await app.close();
    process.exit(0);
  } catch (error) {
    const failure = error as Error;

    if (failure instanceof RateLimitFloorError) {
      logger.error(`配额不足，已中止且未改动任何业务数据：${failure.message}`);
    } else {
      logger.error(`采集失败，既有数据保持不变：${failure.message}`);
    }

    try {
      await collector.recordFailure(options, failure);
    } catch (stateError) {
      logger.error(`写入失败状态时出错：${(stateError as Error).message}`);
    }

    await app.close();
    process.exit(1);
  }
}

void bootstrap();
