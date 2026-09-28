/**
 * 采集器端到端校验脚本（离线，无需 GITHUB_TOKEN）。
 *
 * 用法：
 *   npm run build -w @openan/api
 *   npm run collect:check -w @openan/api
 *
 * 原理：把**合成种子数据**（scripts/fixtures/seed-data，与 github-records.sample.json 配套）
 * 复制到系统临时目录，用 GITHUB_FIXTURE 跑**真实落盘**，校验全量替换 / 增量叠加 / 幂等 /
 * 伪组织补齐 / 邮箱域名归属等不变量；结束后清理临时目录。
 *
 * 种子数据刻意与仓库 data/ 解耦：真实 data/ 会随每次线上采集而变化，若作为校验输入，
 * 断言将随数据漂移而失效。脚本结尾会逐字节比对，确认真实 data/ 未被改动。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, '..');
/** 校验输入：与 fixture 记录配套的合成种子，不随线上采集漂移 */
const seedDir = resolve(scriptDir, 'fixtures/seed-data');
/** 真实数据目录：仅用于「未被本脚本改动」的隔离性断言 */
const realDataDir = resolve(apiDir, '../../data');
const cliPath = join(apiDir, 'dist/collector/main.js');
const fixture = 'scripts/fixtures/github-records.sample.json';
const DATA_FILES = [
  'github-organizations.json',
  'github-accounts.json',
  'home.json',
  'organizations.json',
  'confluence-organizations.json',
  'summits.json',
];

const realSnapshotBefore = snapshotDir(realDataDir);

let passed = 0;
let failed = 0;
const tempDirs = [];

// ── 断言与工具 ───────────────────────────────────────────────

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}  (${detail})`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}  → ${detail}`);
  }
}

function makeDataDir() {
  const dir = mkdtempSync(join(tmpdir(), 'openan-collector-'));
  tempDirs.push(dir);
  for (const name of DATA_FILES) {
    cpSync(join(seedDir, name), join(dir, name));
  }
  return dir;
}

function runCollector(dataDir, args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: apiDir,
    env: { ...process.env, DATA_DIR: dataDir, GITHUB_FIXTURE: fixture },
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`采集器退出码 ${result.status}\n${output}`);
  }
  return output;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2));
}

function snapshotDir(dir) {
  if (!existsSync(dir)) return '';
  // 只比对普通文件：目录（如 JsonRepository 的 .snapshots 备份目录）跳过，避免 EISDIR
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => `${entry.name}:${readFileSync(join(dir, entry.name), 'utf8')}`)
    .join('\n----\n');
}

function contributionsMap(dir) {
  const envelope = readJson(join(dir, 'github-organizations.json'));
  return new Map(envelope.data.map((item) => [item.orgId, item]));
}

/** 个人维度指标快照：contributorId → github（缺失为 undefined） */
function contributorsGithubMap(dir) {
  const envelope = readJson(join(dir, 'github-accounts.json'));
  return new Map(envelope.data.map((item) => [item.contributorId, item.github]));
}

function sameGithub(actual, expected) {
  if (!actual) return false;
  return (
    actual.pullRequests === expected.pullRequests &&
    (actual.commits ?? 0) === expected.commits &&
    actual.issues === expected.issues &&
    actual.linesChanged === expected.linesChanged &&
    actual.repos === expected.repos
  );
}

function shortGithub(actual) {
  if (!actual) return '(缺失)';
  return `PR ${actual.pullRequests} / 提交 ${actual.commits ?? 0} / Issue ${actual.issues} / 行数 ${actual.linesChanged} / 仓库 ${actual.repos}`;
}

function stripTimestamps(value) {
  if (Array.isArray(value)) return value.map(stripTimestamps);
  if (value && typeof value === 'object') {
    const clone = {};
    for (const [key, inner] of Object.entries(value)) {
      if (key === 'updatedAt') continue;
      clone[key] = stripTimestamps(inner);
    }
    return clone;
  }
  return value;
}

function totalsOf(map) {
  const totals = { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0 };
  map.forEach((item) => {
    totals.pullRequests += item.github.pullRequests;
    totals.commits += item.github.commits ?? 0;
    totals.issues += item.github.issues;
    totals.linesChanged += item.github.linesChanged;
  });
  return totals;
}

/** 未归属组织数：github-accounts.json 中 orgId 为空的条数（04 文档 §3.7 口径） */
function externalDeveloperCount(dir) {
  return readJson(join(dir, 'github-accounts.json')).data.filter((item) => !item.orgId).length;
}

/** 固定数据中出现过的全部邮箱，用于校验「邮箱不落盘」 */
function collectFixtureEmails() {
  const records = readJson(join(apiDir, fixture)).records;
  const emails = new Set();
  records.forEach((record) => {
    if (record.commitEmail) emails.add(record.commitEmail);
    if (record.author?.email) emails.add(record.author.email);
  });
  return [...emails];
}

// ── 用例 ─────────────────────────────────────────────────────

function main() {
  if (!existsSync(cliPath)) {
    console.error(`未找到采集器产物 ${cliPath}，请先执行 npm run build -w @openan/api`);
    process.exit(1);
  }

  console.log('\n[1] 全量 dry-run 只计算不落盘');
  {
    const dir = makeDataDir();
    const before = snapshotDir(dir);
    runCollector(dir, ['--mode=full', '--dry-run']);
    check('dry-run 未改动任何文件', before === snapshotDir(dir), '目录逐字节一致');
  }

  console.log('\n[2] 全量真实写入（整体替换 + 邮箱域名归属 + 提交数累计）');
  const fullDir = makeDataDir();
  {
    const output = runCollector(fullDir, ['--mode=full']);
    const map = contributionsMap(fullDir);
    const ids = [...map.keys()].sort().join(',');
    check(
      '仅保留本轮命中的组织',
      ids === 'lumen-dev,nova-silicon,openan-labs,unattributed',
      `orgIds=${ids}`,
    );
    check(
      'openan-labs = PR2/提交15/Issue1/128行/2仓库',
      sameGithub(map.get('openan-labs')?.github, {
        pullRequests: 2,
        commits: 15,
        issues: 1,
        linesChanged: 128,
        repos: 2,
      }),
      shortGithub(map.get('openan-labs')?.github),
    );
    check(
      'nova-silicon = PR3/提交41/Issue0/304行/2仓库（含邮箱域名命中 2 人）',
      sameGithub(map.get('nova-silicon')?.github, {
        pullRequests: 3,
        commits: 41,
        issues: 0,
        linesChanged: 304,
        repos: 2,
      }),
      shortGithub(map.get('nova-silicon')?.github),
    );
    check(
      'lumen-dev = PR1/提交4/Issue0/16行/1仓库（公开资料邮箱兜底命中）',
      sameGithub(map.get('lumen-dev')?.github, {
        pullRequests: 1,
        commits: 4,
        issues: 0,
        linesChanged: 16,
        repos: 1,
      }),
      shortGithub(map.get('lumen-dev')?.github),
    );
    check(
      'unattributed = PR1/提交2/Issue1/40行/1仓库（github noreply 域名不误判）',
      sameGithub(map.get('unattributed')?.github, {
        pullRequests: 1,
        commits: 2,
        issues: 1,
        linesChanged: 40,
        repos: 1,
      }),
      shortGithub(map.get('unattributed')?.github),
    );

    const contributors = readJson(join(fullDir, 'github-accounts.json')).data;
    const byId = new Map(contributors.map((item) => [item.contributorId, item]));
    check(
      'nora-kim 按 PR 提交邮箱子域（mail.novasilicon.com）归属 nova-silicon',
      byId.get('nora-kim')?.orgId === 'nova-silicon',
      `orgId=${byId.get('nora-kim')?.orgId}`,
    );
    check(
      'pierre-dev 按公开资料邮箱（lumen.dev）归属 lumen-dev',
      byId.get('pierre-dev')?.orgId === 'lumen-dev',
      `orgId=${byId.get('pierre-dev')?.orgId}`,
    );
    check(
      'tomas-x 提交邮箱优先于资料邮箱（novasilicon.com > lumen.dev）',
      byId.get('tomas-x')?.orgId === 'nova-silicon',
      `orgId=${byId.get('tomas-x')?.orgId}`,
    );
    check(
      'solo-hacker / aria-dev 未命中任何域名，兜底独立开发者',
      byId.get('solo-hacker')?.orgId === null && byId.get('aria-dev')?.orgId === null,
      `solo-hacker=${byId.get('solo-hacker')?.orgId} / aria-dev=${byId.get('aria-dev')?.orgId}`,
    );

    const githubById = contributorsGithubMap(fullDir);
    check(
      '个人指标：openan-labs = PR2/提交15/Issue1/128行/2仓库',
      sameGithub(githubById.get('openan-labs'), {
        pullRequests: 2,
        commits: 15,
        issues: 1,
        linesChanged: 128,
        repos: 2,
      }),
      shortGithub(githubById.get('openan-labs')),
    );
    check(
      '个人指标：nova-silicon = PR1/提交30/Issue0/250行/1仓库',
      sameGithub(githubById.get('nova-silicon'), {
        pullRequests: 1,
        commits: 30,
        issues: 0,
        linesChanged: 250,
        repos: 1,
      }),
      shortGithub(githubById.get('nova-silicon')),
    );
    check(
      '个人指标：nora-kim / tomas-x / pierre-dev 各 1 个 PR',
      sameGithub(githubById.get('nora-kim'), { pullRequests: 1, commits: 5, issues: 0, linesChanged: 30, repos: 1 }) &&
        sameGithub(githubById.get('tomas-x'), { pullRequests: 1, commits: 6, issues: 0, linesChanged: 24, repos: 1 }) &&
        sameGithub(githubById.get('pierre-dev'), { pullRequests: 1, commits: 4, issues: 0, linesChanged: 16, repos: 1 }),
      `nora=${shortGithub(githubById.get('nora-kim'))} / tomas=${shortGithub(githubById.get('tomas-x'))} / pierre=${shortGithub(githubById.get('pierre-dev'))}`,
    );
    check(
      '个人指标：solo-hacker 基线被全量替换为 1/2/0/40/1',
      sameGithub(githubById.get('solo-hacker'), {
        pullRequests: 1,
        commits: 2,
        issues: 0,
        linesChanged: 40,
        repos: 1,
      }),
      shortGithub(githubById.get('solo-hacker')),
    );
    check(
      '个人指标：aria-dev 基线被全量替换为 0/0/1/0/1（仅 1 个 Issue）',
      sameGithub(githubById.get('aria-dev'), {
        pullRequests: 0,
        commits: 0,
        issues: 1,
        linesChanged: 0,
        repos: 1,
      }),
      shortGithub(githubById.get('aria-dev')),
    );
    check(
      '全量模式：本轮无记录的 kai-zhou 指标移除、档案保留',
      githubById.get('kai-zhou') === undefined && Boolean(byId.get('kai-zhou')),
      'github 缺失、档案仍在',
    );
    check(
      '纯档案贡献者 lin-chen 不带 github 指标',
      githubById.get('lin-chen') === undefined,
      'github 缺失',
    );

    check(
      '归属判定日志输出邮箱命中人数（3 人）',
      output.includes('3 人通过邮箱域名命中组织'),
      'stdout 命中关键字',
    );

    const home = readJson(join(fullDir, 'home.json'));
    check(
      'externalDeveloperCount = 2（orgId 为空的贡献者数）',
      home.data.externalDeveloperCount.value === 2,
      `value=${home.data.externalDeveloperCount.value}`,
    );
    check(
      'home.json 与 github-accounts.json 口径一致',
      externalDeveloperCount(fullDir) === home.data.externalDeveloperCount.value,
      `contributors 空 orgId=${externalDeveloperCount(fullDir)}`,
    );

    const fixtureEmails = collectFixtureEmails();
    const persisted = ['github-organizations.json', 'github-accounts.json', 'home.json', 'organizations.json']
      .map((name) => readFileSync(join(fullDir, name), 'utf8'))
      .join('\n');
    const leaked = fixtureEmails.filter((email) => persisted.includes(email));
    check(
      '邮箱仅用于内存判定，不写入任何数据文件',
      leaked.length === 0,
      leaked.length === 0 ? `已核对 ${fixtureEmails.length} 个邮箱均未落盘` : `泄漏：${leaked.join(', ')}`,
    );
  }

  console.log('\n[3] 全量幂等：重复运行结果一致');
  {
    const first = stripTimestamps(readJson(join(fullDir, 'github-organizations.json')));
    const firstContributors = stripTimestamps(readJson(join(fullDir, 'github-accounts.json')));
    runCollector(fullDir, ['--mode=full']);
    const second = stripTimestamps(readJson(join(fullDir, 'github-organizations.json')));
    const secondContributors = stripTimestamps(readJson(join(fullDir, 'github-accounts.json')));
    check(
      '重复全量运行贡献内容不变',
      JSON.stringify(first) === JSON.stringify(second),
      '（忽略 updatedAt）',
    );
    check(
      '重复全量运行个人指标不变',
      JSON.stringify(firstContributors) === JSON.stringify(secondContributors),
      '（忽略 updatedAt）',
    );
  }

  console.log('\n[4] 增量叠加：历史累计不被清零');
  {
    const dir = makeDataDir();
    writeJson(join(dir, '.sync-state.json'), {
      schemaVersion: 1,
      lastSyncAt: '2026-08-10T00:00:00Z',
      lastRunAt: '2026-08-10T00:00:00Z',
      lastMode: 'incremental',
      status: 'success',
      etags: {},
      rateLimitRemaining: null,
      unattributedLogins: ['aria-dev', 'solo-hacker'],
      recordCount: 0,
      orgRepos: {},
      personRepos: { 'aria-dev': ['openan-labs/legacy-a'] },
    });

    const output = runCollector(dir, ['--mode=incremental']);
    const map = contributionsMap(dir);
    check('基线组织全部保留（8 个）', map.size === 8, `size=${map.size}`);
    check(
      'openan-labs 基线 486/1420/212/318420/24 叠加为 487/1423/213/318428/24',
      sameGithub(map.get('openan-labs')?.github, {
        pullRequests: 487,
        commits: 1423,
        issues: 213,
        linesChanged: 318428,
        repos: 24,
      }),
      shortGithub(map.get('openan-labs')?.github),
    );
    check(
      'nova-silicon 基线 173/512/68/142880/9 叠加为 175/523/68/142934/9',
      sameGithub(map.get('nova-silicon')?.github, {
        pullRequests: 175,
        commits: 523,
        issues: 68,
        linesChanged: 142934,
        repos: 9,
      }),
      shortGithub(map.get('nova-silicon')?.github),
    );
    check(
      'lumen-dev 基线 37/96/19/21460/3 叠加为 38/100/19/21476/3',
      sameGithub(map.get('lumen-dev')?.github, {
        pullRequests: 38,
        commits: 100,
        issues: 19,
        linesChanged: 21476,
        repos: 3,
      }),
      shortGithub(map.get('lumen-dev')?.github),
    );
    check(
      'unattributed 基线 15/28/9/6800/3 叠加为 16/30/10/6840/3',
      sameGithub(map.get('unattributed')?.github, {
        pullRequests: 16,
        commits: 30,
        issues: 10,
        linesChanged: 6840,
        repos: 3,
      }),
      shortGithub(map.get('unattributed')?.github),
    );
    check(
      '本轮未命中的组织保持原值（harbor-cloud 121/348/54/96540/7）',
      sameGithub(map.get('harbor-cloud')?.github, {
        pullRequests: 121,
        commits: 348,
        issues: 54,
        linesChanged: 96540,
        repos: 7,
      }),
      shortGithub(map.get('harbor-cloud')?.github),
    );

    const githubById = contributorsGithubMap(dir);
    check(
      '个人叠加：aria-dev 基线 3/9/2/300/2 叠加为 3/9/3/300/2',
      sameGithub(githubById.get('aria-dev'), {
        pullRequests: 3,
        commits: 9,
        issues: 3,
        linesChanged: 300,
        repos: 2,
      }),
      shortGithub(githubById.get('aria-dev')),
    );
    check(
      '个人叠加：solo-hacker 基线 5/11/0/220/3 叠加为 6/13/0/260/3（仓库数走兜底下限）',
      sameGithub(githubById.get('solo-hacker'), {
        pullRequests: 6,
        commits: 13,
        issues: 0,
        linesChanged: 260,
        repos: 3,
      }),
      shortGithub(githubById.get('solo-hacker')),
    );
    check(
      '个人叠加：本轮未命中的 kai-zhou 保留既有指标（增量不清零）',
      sameGithub(githubById.get('kai-zhou'), {
        pullRequests: 12,
        commits: 77,
        issues: 8,
        linesChanged: 4200,
        repos: 5,
      }),
      shortGithub(githubById.get('kai-zhou')),
    );
    check(
      '个人叠加：新增贡献者 nora-kim 写入 1/5/0/30/1',
      sameGithub(githubById.get('nora-kim'), {
        pullRequests: 1,
        commits: 5,
        issues: 0,
        linesChanged: 30,
        repos: 1,
      }),
      shortGithub(githubById.get('nora-kim')),
    );

    const totals = totalsOf(map);
    check(
      '合计 = 基线 1006/2867/453/723160 + 增量 5/20/2/118',
      totals.pullRequests === 1011 &&
        totals.commits === 2887 &&
        totals.issues === 455 &&
        totals.linesChanged === 723278,
      `PR ${totals.pullRequests} / 提交 ${totals.commits} / Issue ${totals.issues} / 行数 ${totals.linesChanged}`,
    );

    const state = readJson(join(dir, '.sync-state.json'));
    check(
      '游标推进为 incremental 且状态 success',
      state.lastMode === 'incremental' && state.status === 'success' && Boolean(state.lastSyncAt),
      `status=${state.status}`,
    );
    check(
      'orgRepos 记录本轮命中的仓库集合',
      Array.isArray(state.orgRepos?.['openan-labs']) &&
        state.orgRepos['openan-labs'].includes('openan-labs/core') &&
        state.orgRepos['openan-labs'].includes('openan-labs/docs'),
      JSON.stringify(state.orgRepos?.['openan-labs']),
    );
    check(
      'personRepos 记录个人仓库集合（aria-dev = 基线 ∪ 本轮）',
      Array.isArray(state.personRepos?.['aria-dev']) &&
        state.personRepos['aria-dev'].includes('openan-labs/legacy-a') &&
        state.personRepos['aria-dev'].includes('openan-labs/core'),
      JSON.stringify(state.personRepos?.['aria-dev']),
    );
    check(
      '增量模式不丢弃既有独立开发者名单（并集）',
      Array.isArray(state.unattributedLogins) &&
        state.unattributedLogins.includes('aria-dev') &&
        state.unattributedLogins.includes('solo-hacker'),
      JSON.stringify(state.unattributedLogins),
    );
    check(
      '日志包含增量基线与叠加口径',
      output.includes('增量基线') && output.includes('叠加到基线上'),
      'stdout 命中关键字',
    );
  }

  console.log('\n[5] 缺伪组织时自动补齐档案，且当轮不丢贡献行');
  {
    const dir = makeDataDir();
    const orgFile = join(dir, 'organizations.json');
    const envelope = readJson(orgFile);
    envelope.data = envelope.data.filter((org) => org.orgId !== 'unattributed');
    writeJson(orgFile, envelope);

    const output = runCollector(dir, ['--mode=full']);

    const orgAfter = readJson(orgFile);
    const pseudo = orgAfter.data.find((org) => org.orgId === 'unattributed');
    check('organizations.json 自动补回伪组织', Boolean(pseudo), pseudo ? `name=${pseudo.name}` : '缺失');
    check('伪组织契约字段正确（type=individual）', pseudo?.type === 'individual', `type=${pseudo?.type}`);

    const map = contributionsMap(dir);
    check(
      '同一轮 contributions 仍产出 unattributed 行',
      sameGithub(map.get('unattributed')?.github, {
        pullRequests: 1,
        commits: 2,
        issues: 1,
        linesChanged: 40,
        repos: 1,
      }),
      shortGithub(map.get('unattributed')?.github),
    );
    check(
      '本轮并未丢弃未归属贡献（组织数 4）',
      map.size === 4,
      `size=${map.size}`,
    );
    check(
      '缺档案时邮箱域名归属仍然生效（nova-silicon 命中数不变）',
      sameGithub(map.get('nova-silicon')?.github, {
        pullRequests: 3,
        commits: 41,
        issues: 0,
        linesChanged: 304,
        repos: 2,
      }),
      shortGithub(map.get('nova-silicon')?.github),
    );
    check(
      '日志写入文件包含 organizations.json',
      output.includes('organizations.json'),
      'stdout 命中',
    );
  }

  console.log('\n[6] 隔离性：真实 data/ 与合成种子均未被改动');
  {
    check(
      '仓库 data/ 逐字节未变',
      realSnapshotBefore === snapshotDir(realDataDir),
      '未被本脚本写入',
    );
  }
}

try {
  main();
} catch (error) {
  failed += 1;
  console.error(`  FAIL  脚本异常  → ${error.message}`);
} finally {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n采集器校验结果：${passed}/${passed + failed} 通过`);
process.exit(failed === 0 ? 0 : 1);
