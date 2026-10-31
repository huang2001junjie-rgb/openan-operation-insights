/**
 * 一次性数据迁移：把 `data/github-events.json` 的信封 `schemaVersion` 从 1 提升到 2
 * （ADR-0018 决策 4：事件 `timestamp` 由 `string | null` 收紧为**必填**）。
 *
 * 为什么需要：区间口径（`from <= timestamp < to`）以事件时间戳为唯一切片依据，读路径不再
 * 需要「无时间的事件该算哪边」这种分支；于是 `validators.isGithubContributionEvent` 与
 * `GITHUB_EVENTS_REPOSITORY` 的期望版本同步收紧。存量数据实测**零 null**（PR 只采
 * `states: MERGED` ⇒ `mergedAt` 必存在；Issue 必有 `createdAt`），因此迁移只是改信封版本号，
 * **无需重跑采集器**（重跑要打外部 API，还会把 `updatedAt` 改成采集时刻，掩盖真实采集时间）。
 *
 * 与 backfill 脚本同构的安全设计：
 * - 默认 dry-run，`--write` 才落盘；
 * - 临时文件 + rename 原子切换，命名与 `JsonRepository.writeToDisk` 一致；
 * - `updatedAt` 原样保留（它记录的是**采集时刻**，不是迁移时刻）；
 * - 幂等：已是 v2 时直接返回，不重写文件。
 *
 * 退出码：任一事件的时间戳缺失或不可解析时返回 1 —— 此时应重跑
 * `npm run collect:github:full` 重建事件文件，而不是强行提升版本号（否则读路径会把
 * 脏数据当作合法事实，区间筛选静默漏算）。
 *
 * 用法：
 *   npm run migrate:github-events-v2 -- --dry-run   # 只报告，不写盘（默认）
 *   npm run migrate:github-events-v2 -- --write     # 落盘
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_SCHEMA_VERSION = 2;
/** 与 validators.ts 的 ISO_INSTANT_PATTERN 保持一致：ISO 8601 时刻（UTC 或带偏移） */
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dataDir = join(projectRoot, 'data');
const eventsPath = join(dataDir, 'github-events.json');

const write = process.argv.includes('--write');
const dryRun = !write;

if (!existsSync(eventsPath)) {
  console.error(`[migrate] 无法读取 ${eventsPath}`);
  process.exit(1);
}

const envelope = JSON.parse(readFileSync(eventsPath, 'utf-8'));
if (!envelope || !Array.isArray(envelope.data)) {
  console.error('[migrate] github-events.json 结构非法：顶层必须是 { schemaVersion, updatedAt, data[] }');
  process.exit(1);
}

const events = envelope.data;
const untimed = [];
for (const [index, event] of events.entries()) {
  const timestamp = event?.timestamp;
  const ok =
    typeof timestamp === 'string' &&
    timestamp.length > 0 &&
    ISO_INSTANT_PATTERN.test(timestamp) &&
    !Number.isNaN(Date.parse(timestamp));
  if (!ok) {
    untimed.push(
      `#${index} ${event?.kind ?? '?'} ${event?.repository ?? '?'}/#${event?.number ?? '?'} timestamp=${JSON.stringify(timestamp)}`,
    );
  }
}

const timestamps = events.map((event) => event.timestamp).filter((value) => typeof value === 'string').sort();
const byKind = events.reduce((acc, event) => {
  acc[event.kind] = (acc[event.kind] ?? 0) + 1;
  return acc;
}, {});

console.log('[migrate] github-events.json schemaVersion 1 → 2（ADR-0018 决策 4：timestamp 必填）');
console.log(
  `  事件 ${events.length} 条（${Object.entries(byKind)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(' / ')}）`,
);
console.log(`  时间跨度 ${timestamps[0] ?? '(空)'} ～ ${timestamps[timestamps.length - 1] ?? '(空)'}`);
console.log(`  信封 schemaVersion ${envelope.schemaVersion} → ${TARGET_SCHEMA_VERSION}（updatedAt 保持 ${envelope.updatedAt} 不变）`);

if (envelope.schemaVersion === TARGET_SCHEMA_VERSION) {
  console.log(`\n[migrate] 已是 v${TARGET_SCHEMA_VERSION}，无需迁移（幂等退出）。`);
  process.exit(0);
}
if (envelope.schemaVersion !== 1) {
  console.error(`\n[migrate] ❌ 意外的 schemaVersion=${envelope.schemaVersion}（只处理 v1 → v${TARGET_SCHEMA_VERSION}），未写盘。`);
  process.exit(1);
}

if (untimed.length) {
  console.error(`\n[migrate] ❌ ${untimed.length} 条事件的时间戳缺失或不可解析，无法提升版本：`);
  for (const line of untimed.slice(0, 10)) console.error(`     ${line}`);
  if (untimed.length > 10) console.error(`     …（其余 ${untimed.length - 10} 条略）`);
  console.error('     请改跑 `npm run collect:github:full` 重建事件文件（缺时间的事件会在采集期被拒绝并 WARN）。');
  process.exit(1);
}

if (dryRun) {
  console.log(`\n[migrate] dry-run：${events.length} 条事件全部带合法时间戳，可安全提升版本，未写盘。确认无误后加 --write 落盘。`);
  process.exit(0);
}

envelope.schemaVersion = TARGET_SCHEMA_VERSION;
// 临时文件 + rename 原子切换，命名与 JsonRepository.writeToDisk 一致（同分区，磁盘上不存在半截 JSON）
const tmpPath = join(dataDir, `.github-events.json.${process.pid}.${Date.now()}.tmp`);
writeFileSync(tmpPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf-8');
renameSync(tmpPath, eventsPath);
console.log(`\n[migrate] ✅ 已写入 ${eventsPath}（schemaVersion ${TARGET_SCHEMA_VERSION}，${events.length} 条事件不变）`);
