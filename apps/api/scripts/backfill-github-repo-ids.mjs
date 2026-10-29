/**
 * 一次性数据迁移：为 `data/github-accounts.json` 的账号级 github 指标回填仓库清单 `repoIds`
 * （ADR-0017 决策 15，schemaVersion 1 → 2）。
 *
 * 为什么需要：组织级 `repos` 的语义是「参与过的仓库**去重数**」，而组织级自 ADR-0017 起由账号级
 * 按生效归属求和派生——账号级只有计数时，跨账号共用的仓库会被重复计数（实测 huawei 13 → 51，
 * 而采集范围内仓库总数只有 13）。补上清单后派生层才能取并集大小。
 *
 * 数据来源：采集器元信息 `data/.sync-state.json` 的 `personRepos`（login → 仓库全名集合），
 * 它本就是增量累计的个人仓库集合，与业务文件里的 `github.repos` 计数同源，故**无需重跑采集器**。
 *
 * 用法：
 *   npm run backfill:github-repo-ids -- --dry-run   # 只报告，不写盘（默认）
 *   npm run backfill:github-repo-ids -- --write     # 落盘
 *
 * 幂等：已有 `repoIds` 的账号只做一致性核对，不重写。
 * 退出码：任一账号无法解析出仓库集合（元信息缺该 login）时返回 1 —— 此时应重跑 `collect:github`
 * 而不是回填，否则 `repos` 会凭空变小。
 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dataDir = join(projectRoot, 'data');
const accountsPath = join(dataDir, 'github-accounts.json');
const syncStatePath = join(dataDir, '.sync-state.json');

const write = process.argv.includes('--write');
const dryRun = !write;

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const envelope = readJson(accountsPath, null);
if (!envelope || !Array.isArray(envelope.data)) {
  console.error(`[backfill] 无法读取 ${accountsPath}`);
  process.exit(1);
}
const personRepos = readJson(syncStatePath, {}).personRepos ?? {};

const accounts = envelope.data;
const withMetrics = accounts.filter((account) => account.github);
const skipped = withMetrics.filter((account) => Array.isArray(account.github.repoIds));
const pending = withMetrics.filter((account) => !Array.isArray(account.github.repoIds));

const unresolved = [];
const mismatched = [];
let filled = 0;

for (const account of pending) {
  const repoIds = [...(personRepos[account.contributorId] ?? [])].sort();
  if (repoIds.length === 0) {
    unresolved.push(account.contributorId);
    continue;
  }
  if (repoIds.length !== account.github.repos) {
    mismatched.push(`${account.contributorId}: repos=${account.github.repos} 集合=${repoIds.length}`);
  }
  account.github.repoIds = repoIds;
  filled += 1;
}

// 已回填过的账号也要核对不变量，避免脚本重跑时把既有漂移掩盖过去
for (const account of skipped) {
  const { repos, repoIds } = account.github;
  if (repos !== repoIds.length) {
    mismatched.push(`${account.contributorId}: repos=${repos} repoIds=${repoIds.length}（已回填）`);
  }
}

console.log('[backfill] github-accounts.json 仓库清单回填（ADR-0017 决策 15）');
console.log(`  账号总数 ${accounts.length}，带指标 ${withMetrics.length}，待回填 ${pending.length}，已回填 ${skipped.length}`);
console.log(`  信封 schemaVersion ${envelope.schemaVersion} → 2（updatedAt 保持 ${envelope.updatedAt} 不变）`);
if (mismatched.length) console.log(`  ⚠️ repos 与集合大小不一致 ${mismatched.length} 个：\n    ${mismatched.join('\n    ')}`);
if (unresolved.length) {
  console.error(`  ❌ 元信息 personRepos 缺以下账号，无法回填：${unresolved.join(', ')}`);
  console.error('     请改跑 `npm run collect:github -- --incremental --fixture <records.json>` 重建仓库集合。');
}

if (unresolved.length) process.exit(1);

if (dryRun) {
  console.log(`\n[backfill] dry-run：将回填 ${filled} 个账号的 repoIds，未写盘。确认无误后加 --write 落盘。`);
  process.exit(0);
}

envelope.schemaVersion = 2;
// 临时文件 + rename 原子切换，命名与 JsonRepository.writeToDisk 一致（同分区，磁盘上不存在半截 JSON）
const tmpPath = join(dataDir, `.github-accounts.json.${process.pid}.${Date.now()}.tmp`);
writeFileSync(tmpPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf-8');
renameSync(tmpPath, accountsPath);
console.log(`\n[backfill] ✅ 已回填 ${filled} 个账号并写入 ${accountsPath}（schemaVersion 2）`);
