import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CollectorModule } from '../collector.module';
import {
  ConfluenceCollectorService,
  ConfluenceCollectOptions,
} from './confluence-collector.service';


type RequestedMode = 'auto' | 'full' | 'incremental';

interface CliArgs {
  mode: RequestedMode;
  dryRun: boolean;
  reportOnly: boolean;
  snapshot: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const modeArg = argv.find((arg) => arg.startsWith('--mode='))?.slice('--mode='.length) ?? 'auto';
  if (!['auto', 'full', 'incremental'].includes(modeArg)) {
    throw new Error(`--mode 只能是 auto / full / incremental，当前值：${modeArg}`);
  }
  return {
    mode: modeArg as RequestedMode,
    dryRun: argv.includes('--dry-run'),
    reportOnly: argv.includes('--report-only'),
    snapshot: argv.includes('--snapshot'),
  };
}

/**
 * 模式解析：恒为 full。
 *
 * **为什么不做增量**：Confluence 的聚合结果是**全量替换**语义（按 orgId 整体重写 confluence-organizations.json）。
 * 若只取增量页面再聚合，会把未变更页面的计数一起洗掉 —— 实测触发过：状态文件写入游标后
 * auto 走增量，CQL 过滤出 0 页，被空值校验拦下才没污染数据。
 *
 * 要安全地增量，需要一份"已计入页面"的按页账本（避免重复计数），页面量级（数十~数百）
 * 尚不支持这个复杂度，故先全量重算（见 ADR-0007）。显式传入 incremental 直接报错，
 * 而不是静默降级，避免误以为增量已生效。
 */
function resolveMode(requested: RequestedMode): 'full' {
  if (requested === 'incremental') {
    throw new Error(
      'Confluence 聚合为全量替换语义，增量需先实现按页账本（尚未实现，见 ADR-0007）；请使用 --mode=full 或不传 --mode',
    );
  }
  return 'full';
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('ConfluenceCollector');
  const args = parseArgs(process.argv.slice(2));

  const app = await NestFactory.createApplicationContext(CollectorModule, {
    logger: ['error', 'warn', 'log'],
  });

  const collector = app.get(ConfluenceCollectorService);
  const config = app.get(ConfigService);

  const spaces = config.get<string[]>('confluence.spaces') ?? [];
  if (spaces.length === 0) {
    logger.error('未配置 CONFLUENCE_SPACES，无法确定采集范围');
    await app.close();
    process.exitCode = 1;
    return;
  }

  const options: ConfluenceCollectOptions = {
    mode: resolveMode(args.mode),
    dryRun: args.dryRun,
    reportOnly: args.reportOnly,
    writeSnapshot: args.snapshot || args.reportOnly,
  };

  try {
    const outcome = await collector.run(options);

    logger.log('── 采集结果 ──────────────────────────────');
    logger.log(`模式        : ${outcome.mode}`);
    logger.log(`页面总数    : ${outcome.pageCount}`);
    logger.log(`HTTP 请求   : ${outcome.requestCount}`);
    logger.log(
      `需求        : ${outcome.requirementPageCount} 页 / ${outcome.requirementRowCount} 行 / ${outcome.totals.requirements} 条`,
    );
    logger.log(
      `议题分享    : ${outcome.minutesPageCount} 期会议 / ${outcome.totals.topicShares} 次` +
        (outcome.minutesWithoutAgendaCount > 0
          ? `（另有 ${outcome.minutesWithoutAgendaCount} 页无 Agenda 段，已跳过）`
          : ''),
    );
    logger.log(
      `独立开发者  : 需求 ${outcome.unattributed.requirements} / 议题分享 ${outcome.unattributed.topicShares}`,
    );
    logger.log(
      `账号数      : ${outcome.accountCount}（其中未归属 ${outcome.unattributedAccountCount}）`,
    );
    logger.log(`组织数      : ${outcome.orgCount}`);
    logger.log(`待修正提及  : ${outcome.unresolvedContactCount} 处（纯文本 @人，见状态文件）`);
    logger.log(`写入文件    : ${outcome.written.length > 0 ? outcome.written.join(', ') : '(未写入)'}`);
    logger.log('─────────────────────────────────────────');

    // 不用 process.exit：Windows 下在日志句柄仍打开时强退会触发 libuv 断言
    process.exitCode = 0;
  } catch (error) {
    const failure = error as Error;
    logger.error(`采集失败，既有数据保持不变：${failure.message}`);

    try {
      await collector.recordFailure(options, failure);
    } catch (stateError) {
      logger.error(`写入失败状态时出错：${(stateError as Error).message}`);
    }

    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
