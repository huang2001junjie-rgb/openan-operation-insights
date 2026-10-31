/**
 * 采集器端到端校验脚本（离线，无需 GITHUB_TOKEN）。
 *
 * 用法：
 *   npm run build -w @openan/api
 *   npm run collect:github:check -w @openan/api
 *
 * 原理：把**合成种子数据**（scripts/fixtures/seed-data，与 github-records.sample.json 配套）
 * 复制到系统临时目录，用 GITHUB_FIXTURE 跑**真实落盘**，校验全量替换 / 增量叠加 / 幂等 /
 * 伪组织补齐 / 邮箱域名归属 / 事件落盘（github-events.json 幂等键与 D1 恒等式）/
 * 缺时间戳记录整条拒绝（ADR-0018）等不变量；结束后清理临时目录。
 *
 * 种子数据刻意与仓库 data/ 解耦：真实 data/ 会随每次线上采集而变化，若作为校验输入，
 * 断言将随数据漂移而失效。脚本结尾会逐字节比对，确认真实 data/ 未被改动。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, '..');
/** 仓库根：仅用于把日志里的绝对路径收敛成可读相对路径 */
const repoRoot = resolve(apiDir, '../..');
/** 校验输入：与 fixture 记录配套的合成种子，不随线上采集漂移 */
const seedDir = resolve(scriptDir, 'fixtures/seed-data');
/** 真实数据目录：仅用于「未被本脚本改动」的隔离性断言 */
const realDataDir = resolve(apiDir, '../../data');
const cliPath = join(apiDir, 'dist/collector/github/github-main.js');
const fixture = 'scripts/fixtures/github-records.sample.json';
const DATA_FILES = [
  'github-organizations.json',
  'github-accounts.json',
  'home.json',
  'organizations.json',
  'confluence-organizations.json',
  'summits.json',
];

/** 相对仓库根的展示路径（日志里避免绝对路径噪音） */
function relFromRepo(path) {
  return relative(repoRoot, path).replace(/\\/g, '/');
}

/** 打印本次校验的数据来源：上游记录 / 落盘输入 / 真实数据隔离 */
function logDataSources() {
  console.log('');
  console.log('数据来源 ─────────────────────────────────────────────');
  console.log('  采集器  : GitHub（dist/collector/github/github-main.js）');
  console.log(
    `  上游记录: fixture → ${relFromRepo(join(apiDir, fixture))}（合成 PR / Issue 记录，离线、无需 token）`,
  );
  console.log(`  落盘输入: ${relFromRepo(seedDir)}（合成种子，非真实 data/）`);
  console.log(`  真实数据: ${relFromRepo(realDataDir)} 只读，仅用于「未被改动」逐字节断言`);
  console.log('───────────────────────────────────────────────────────');
}

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

/** 跑一次采集器；`fixturePath` 缺省用主 fixture，个别场景（如 Bot 作者）传自造的临时 fixture */
function runCollector(dataDir, args, fixturePath = fixture) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: apiDir,
    env: { ...process.env, DATA_DIR: dataDir, GITHUB_FIXTURE: fixturePath },
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) {
    throw new Error(`采集器退出码 ${result.status}\n${output}`);
  }
  // 采集器自身会打印「采集开始：mode=… source=…」：回显出来，本次跑的是哪份数据一目了然
  // （Nest Logger 会带 ANSI 颜色码，去掉后便于阅读与比对）
  const sourceLine = output.match(/采集开始：[^\n]*/)?.[0];
  if (sourceLine) console.log(`  · ${sourceLine.replace(/\u001b\[[0-9;]*m/g, '')}`);
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

/** repoIds 不变量的诊断摘要：`id:repos/repoIds.length`，纯档案账号（无指标）标注出来 */
function repoIdsSummary(githubById) {
  return [...githubById.entries()]
    .map(([id, metrics]) =>
      metrics ? `${id}:${metrics.repos}/${metrics.repoIds?.length ?? '缺 repoIds'}` : `${id}:(无 github)`,
    )
    .join(' ');
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

// ── 事件明细（github-events.json，D1：GitHub 侧唯一原子事实）─────────

function eventsOf(dir) {
  return readJson(join(dir, 'github-events.json')).data;
}

/**
 * API 侧结构校验器（dist 产物）：断言采集器写出的事件文件**能被读路径接受**。
 *
 * 这条断言不是形式主义：写侧与校验器一旦不一致（曾发生——Bot 作者的 `githubId / name`
 * 在 GraphQL 响应中缺键，透传成 `undefined` 后被 JSON 序列化丢弃），线上表现是
 * `github-events.json data 结构校验未通过`，**所有** GitHub 派生接口（含首页汇总）返回 50001。
 * 离线阶段用同一个校验器把关，才能在采集前拦住。
 */
const { isGithubContributionEventArray } = await import(
  pathToFileURL(join(apiDir, 'dist/repositories/validators.js')).href
);

function checkEventsValid(events, label) {
  const invalid = events.filter((event) => !isGithubContributionEventArray([event]));
  check(
    `事件明细通过 API 侧结构校验器（${label}）`,
    invalid.length === 0,
    invalid.length === 0
      ? `${events.length} 条全部合法`
      : `非法 ${invalid.length} 条，首个=${JSON.stringify(invalid[0])}`,
  );
}

/** 事件幂等键：与采集器 `GithubCollectorService.eventKey` 同构 */
function eventKey(event) {
  return `${event.kind}|${event.repository}|${event.number}`;
}

/** 四项计数求和：入参为 `{pullRequests, commits, issues, linesChanged}` 数组 */
function sumMetrics(list) {
  return list.reduce(
    (acc, item) => ({
      pullRequests: acc.pullRequests + item.pullRequests,
      commits: acc.commits + (item.commits ?? 0),
      issues: acc.issues + item.issues,
      linesChanged: acc.linesChanged + item.linesChanged,
    }),
    { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0 },
  );
}

/** 事件级四项求和：PR / Issue 按 kind 计数，提交数取 commitCount（Issue 恒 0） */
function eventTotals(events) {
  return sumMetrics(
    events.map((event) => ({
      pullRequests: event.kind === 'pullRequest' ? 1 : 0,
      commits: event.commitCount ?? 0,
      issues: event.kind === 'issue' ? 1 : 0,
      linesChanged: event.linesChanged,
    })),
  );
}

/** 仓库维度分桶：repoId → { 事件, 贡献账号 login 集合 }（仓库表读时派生的离线对照） */
function repoBuckets(events) {
  const buckets = new Map();
  for (const event of events) {
    const bucket = buckets.get(event.repository) ?? {
      repoId: event.repository,
      items: [],
      logins: new Set(),
    };
    bucket.items.push(event);
    if (event.author?.login) bucket.logins.add(event.author.login.toLowerCase());
    buckets.set(event.repository, bucket);
  }
  return buckets;
}

/** 分桶摘要：`repoId=PR/提交/Issue/行数/人数`，便于失败时一眼定位 */
function repoSummary(events) {
  return [...repoBuckets(events).values()]
    .map((bucket) => {
      const totals = eventTotals(bucket.items);
      return `${bucket.repoId}=${totals.pullRequests}/${totals.commits}/${totals.issues}/${totals.linesChanged}/${bucket.logins.size}`;
    })
    .sort()
    .join(' ');
}

function shortTotals(totals) {
  return `PR ${totals.pullRequests} / 提交 ${totals.commits} / Issue ${totals.issues} / 行数 ${totals.linesChanged}`;
}

/**
 * 增量游标种子（[4] 叠加口径 / [6] 事件幂等 共用）。
 *
 * `personRepos` 刻意留空：个人仓库集合自 v2 起由业务文件的 `github.repoIds` 自持
 * （ADR-0017 决策 15），元信息缺失也不该让个人仓库数退化（组织维度仍依赖 orgRepos，故另测）。
 */
function writeIncrementalState(dir) {
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
    personRepos: {},
  });
}

/**
 * **采集口径**下未归属账号数：github-accounts.json 中 `orgId` 为空的条数。
 *
 * ⚠️ 这不是对外展示口径（ADR-0017）：展示口径是**生效归属**（人工认领优先），由 API 读时派生。
 * 本函数只用于断言「该计数不再落盘到 home.json」。
 */
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

  logDataSources();

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
      '账号级 repoIds 落盘且 repos 恒等于其长度（ADR-0017 决策 15）',
      [...githubById.values()]
        .filter(Boolean)
        .every((metrics) => Array.isArray(metrics.repoIds) && metrics.repos === metrics.repoIds.length),
      repoIdsSummary(githubById),
    );
    check(
      '全量模式 repoIds = 本轮命中的仓库去重升序（aria-dev = openan-labs/core）',
      JSON.stringify(githubById.get('aria-dev')?.repoIds) === JSON.stringify(['openan-labs/core']),
      JSON.stringify(githubById.get('aria-dev')?.repoIds),
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

    // 独立开发者人数自此**不由采集器回填**（ADR-0017 决策 13）：改为 API 读时派生，
    // home.json 已移除该字段并升至 schemaVersion 2。这里断言「采集器根本没碰 home.json」。
    const home = readJson(join(fullDir, 'home.json'));
    const homeSeed = readJson(join(seedDir, 'home.json'));
    check(
      '采集器不再写 home.json（内容与合成种子完全一致）',
      JSON.stringify(home) === JSON.stringify(homeSeed),
      `schemaVersion=${home.schemaVersion}、data 键=${Object.keys(home.data).join('/')}`,
    );
    check(
      'home.json 无 externalDeveloperCount；采集口径未归属账号数 = 2（仅存于账号级，不落首页）',
      !('externalDeveloperCount' in home.data) && externalDeveloperCount(fullDir) === 2,
      `orgId 为空的账号数=${externalDeveloperCount(fullDir)}`,
    );

    const fixtureEmails = collectFixtureEmails();
    const persisted = [
      'github-organizations.json',
      'github-accounts.json',
      'home.json',
      'organizations.json',
      'github-events.json',
    ]
      .map((name) => readFileSync(join(fullDir, name), 'utf8'))
      .join('\n');
    const leaked = fixtureEmails.filter((email) => persisted.includes(email));
    check(
      '邮箱仅用于内存判定，不写入任何数据文件',
      leaked.length === 0,
      leaked.length === 0 ? `已核对 ${fixtureEmails.length} 个邮箱均未落盘` : `泄漏：${leaked.join(', ')}`,
    );

    // ── 事件落盘（D1：组织级 / 账号级 / 仓库级读路径的唯一原子事实）──
    const events = eventsOf(fullDir);
    const keys = new Set(events.map(eventKey));
    check('事件整体替换：落盘 9 条（= fixture 记录数）', events.length === 9, `events=${events.length}`);
    check('事件幂等键唯一（kind|repository|number）', keys.size === events.length, `unique=${keys.size}`);
    check(
      '事件只保留派生所需字段（author 内无 email，事件无 commitEmail / url）',
      events.every(
        (event) =>
          Object.keys(event).sort().join(',') ===
            'author,commitCount,kind,linesChanged,number,repository,timestamp' &&
          Object.keys(event.author ?? {}).sort().join(',') === 'avatarUrl,githubId,login,name',
      ),
      `事件字段=${Object.keys(events[0] ?? {}).join(',')} / author 字段=${Object.keys(events[0]?.author ?? {}).join(',')}`,
    );
    checkEventsValid(events, '全量');
    check(
      '全量日志输出事件统计（共 9 / 新增 9 / 跳过 0）',
      output.includes('共 9 条（本轮新增 9，幂等跳过 0）'),
      'stdout 命中关键字',
    );

    // ⚠️ 这条比对**只在全量口径下成立**：基线快照 github-organizations.json 是采集器写死的累计值，
    // 不带任何区间。若拿它去对区间切片后的事件合计，必然「漂移」——那不是数据坏了，是口径错了。
    // 区间口径下的同一条恒等式由 identity-check [7] 覆盖（组织级 ≡ 账号级 ≡ 仓库级，同一区间内）。
    const totalsFromEvents = eventTotals(events);
    const totalsFromAccounts = sumMetrics([...githubById.values()].filter(Boolean));
    check(
      'D1 恒等式（全量口径）：事件级 = 组织级 = 账号级四项合计（PR7/提交62/Issue2/488 行）',
      shortTotals(totalsFromEvents) === 'PR 7 / 提交 62 / Issue 2 / 行数 488' &&
        JSON.stringify(totalsOf(map)) === JSON.stringify(totalsFromEvents) &&
        JSON.stringify(totalsFromAccounts) === JSON.stringify(totalsFromEvents),
      `事件 ${shortTotals(totalsFromEvents)} / 组织 ${shortTotals(totalsOf(map))} / 账号 ${shortTotals(totalsFromAccounts)}`,
    );
    check(
      '仓库维度可派生：core=5/28/1/222/5 人，docs=1/4/1/16/2 人，kernel=1/30/0/250/1 人',
      repoSummary(events) ===
        'openan-labs/core=5/28/1/222/5 openan-labs/docs=1/4/1/16/2 openan-labs/kernel=1/30/0/250/1',
      repoSummary(events),
    );
  }

  console.log('\n[3] 全量幂等：重复运行结果一致');
  {
    const first = stripTimestamps(readJson(join(fullDir, 'github-organizations.json')));
    const firstContributors = stripTimestamps(readJson(join(fullDir, 'github-accounts.json')));
    const firstEvents = stripTimestamps(readJson(join(fullDir, 'github-events.json')));
    runCollector(fullDir, ['--mode=full']);
    const second = stripTimestamps(readJson(join(fullDir, 'github-organizations.json')));
    const secondContributors = stripTimestamps(readJson(join(fullDir, 'github-accounts.json')));
    const secondEvents = stripTimestamps(readJson(join(fullDir, 'github-events.json')));
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
    check(
      '重复全量运行事件明细不变（整体替换，无重复键）',
      JSON.stringify(firstEvents) === JSON.stringify(secondEvents) &&
        secondEvents.data.length === 9 &&
        new Set(secondEvents.data.map(eventKey)).size === 9,
      `events=${secondEvents.data.length}`,
    );
  }

  console.log('\n[4] 增量叠加：历史累计不被清零');
  {
    const dir = makeDataDir();
    writeIncrementalState(dir);

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
      '个人叠加：solo-hacker 基线 5/11/0/220/3 叠加为 6/13/0/260/3（仓库数 = 基线 repoIds ∪ 本轮）',
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
    check(
      '增量 repoIds = 基线 ∪ 本轮（aria-dev 2 / solo-hacker 3 / kai-zhou 保留 5）',
      JSON.stringify(githubById.get('aria-dev')?.repoIds) ===
        JSON.stringify(['openan-labs/core', 'openan-labs/legacy-a']) &&
        githubById.get('solo-hacker')?.repoIds.length === 3 &&
        githubById.get('kai-zhou')?.repoIds.length === 5,
      `aria=${JSON.stringify(githubById.get('aria-dev')?.repoIds)} solo=${githubById.get('solo-hacker')?.repoIds.length} kai=${githubById.get('kai-zhou')?.repoIds.length}`,
    );
    check(
      '增量下 repos 仍恒等于 repoIds.length（个人维度不依赖 personRepos 兜底）',
      [...githubById.values()]
        .filter(Boolean)
        .every((metrics) => Array.isArray(metrics.repoIds) && metrics.repos === metrics.repoIds.length),
      repoIdsSummary(githubById),
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
      'personRepos 记录个人仓库集合（aria-dev = 基线 repoIds ∪ 本轮，不依赖状态文件）',
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

  console.log('\n[6] 事件增量：时间窗内全落、重复运行按幂等键跳过、基线残缺可补齐');
  {
    const dir = makeDataDir();
    writeIncrementalState(dir);
    check(
      '增量前无事件基线（首次增量按空基线处理）',
      !existsSync(join(dir, 'github-events.json')),
      'github-events.json 不存在',
    );

    // 游标 2026-08-10 之后的 7 条记录（#101 / #201 早于游标，被时间窗排除）
    const firstOutput = runCollector(dir, ['--mode=incremental']);
    check(
      '首次增量：时间窗内 7 条事件全部落入',
      eventsOf(dir).length === 7,
      `events=${eventsOf(dir).length}（${repoSummary(eventsOf(dir))}）`,
    );
    check(
      '首次增量日志：新增 7 / 跳过 0',
      firstOutput.includes('共 7 条（本轮新增 7，幂等跳过 0）'),
      'stdout 命中关键字',
    );
    checkEventsValid(eventsOf(dir), '增量');

    // 把游标拨回同一位置重跑：同一批记录再次到达，应被幂等键全数跳过（聚合仍照常叠加）
    const baseline = stripTimestamps(readJson(join(dir, 'github-events.json')));
    writeIncrementalState(dir);
    const secondOutput = runCollector(dir, ['--mode=incremental']);
    const afterRerun = stripTimestamps(readJson(join(dir, 'github-events.json')));
    check(
      '重复增量：幂等键去重，事件仍为 7 条且内容不变',
      afterRerun.data.length === 7 && JSON.stringify(afterRerun) === JSON.stringify(baseline),
      `events=${afterRerun.data.length}`,
    );
    check(
      '重复增量日志：新增 0 / 跳过 7',
      secondOutput.includes('共 7 条（本轮新增 0，幂等跳过 7）'),
      'stdout 命中关键字',
    );

    // 追加语义（非重算）：基线被裁到 2 条后重跑，只补回缺失的 5 条，不产生重复键
    const truncated = readJson(join(dir, 'github-events.json'));
    truncated.data = truncated.data.slice(0, 2);
    writeJson(join(dir, 'github-events.json'), truncated);
    writeIncrementalState(dir);
    runCollector(dir, ['--mode=incremental']);
    const restored = eventsOf(dir);
    check(
      '基线残缺后按幂等键补齐（2 + 5 = 7，键仍唯一）',
      restored.length === 7 && new Set(restored.map(eventKey)).size === 7,
      `events=${restored.length} / unique=${new Set(restored.map(eventKey)).size}`,
    );
  }

  console.log('\n[7] Bot / 无作者：事件 author 键齐全，缺失字段落为 null 而非被 JSON 丢键');
  {
    const dir = makeDataDir();
    // 真实形态复刻：dependabot 是 GitHub App（Bot），`AUTHOR_FIELDS` 的 `... on User` 片段不匹配，
    // 响应里 `databaseId / name / email` **键都不存在**（不是 null）。曾经原样透传成 undefined，
    // 落盘时被 JSON.stringify 丢键 → github-events.json 结构校验失败 → 所有 GitHub 派生接口 50001。
    const botFixture = join(dir, 'bot-records.json');
    writeJson(botFixture, {
      records: [
        {
          kind: 'pullRequest',
          repository: 'openan-labs/core',
          number: 900,
          author: {
            login: 'dependabot',
            url: 'https://github.com/apps/dependabot',
            avatarUrl: 'https://avatars.githubusercontent.com/in/29110?v=4',
          },
          linesChanged: 4,
          timestamp: '2026-09-18T09:25:07Z',
          commitEmail: null,
          commitCount: 1,
        },
        {
          kind: 'issue',
          repository: 'openan-labs/core',
          number: 901,
          // 已注销账号：author 整体为 null，同样必须落盘且合法
          author: null,
          linesChanged: 0,
          timestamp: '2026-09-19T09:25:07Z',
          commitCount: 0,
        },
      ],
    });

    runCollector(dir, ['--mode=full'], botFixture);
    const events = eventsOf(dir);
    const botEvent = events.find((event) => event.author?.login === 'dependabot');
    check(
      'Bot 事件 author 四键齐全（githubId / name 为 null，而非缺键）',
      !!botEvent &&
        Object.keys(botEvent.author).sort().join(',') === 'avatarUrl,githubId,login,name' &&
        botEvent.author.githubId === null &&
        botEvent.author.name === null,
      botEvent ? `author=${JSON.stringify(botEvent.author)}` : 'dependabot 事件缺失',
    );
    check(
      '作者已注销（author=null）的事件照样落盘',
      events.some((event) => event.number === 901 && event.author === null),
      `events=${events.length}`,
    );
    checkEventsValid(events, 'Bot / 无作者');
    check(
      '负向对照：缺 githubId / name 的 author 确会被校验器拒绝（证明上面的断言不是空转）',
      !isGithubContributionEventArray([
        {
          kind: 'pullRequest',
          repository: 'a/b',
          number: 1,
          author: { login: 'x', avatarUrl: '' },
          linesChanged: 0,
          timestamp: null,
          commitCount: 0,
        },
      ]),
      '缺键 author → 非法',
    );

    const botAccount = readJson(join(dir, 'github-accounts.json')).data.find(
      (item) => item.contributorId === 'dependabot',
    );
    check(
      '账号档案：Bot 的 name 回落为 login，指标照常计入',
      botAccount?.name === 'dependabot' &&
        botAccount?.github?.pullRequests === 1 &&
        botAccount?.github?.commits === 1,
      botAccount ? `name=${botAccount.name} / ${shortGithub(botAccount.github)}` : 'dependabot 档案缺失',
    );
  }

  console.log('\n[8] 缺时间戳的记录整条拒绝：不落事件、不进聚合、WARN + 游标计数（ADR-0018 决策 4）');
  {
    const dir = makeDataDir();
    // 真通道结构上产不出这种记录（PR 只查 states: MERGED ⇒ mergedAt 必存在，Issue 必有 createdAt），
    // 它只可能来自数据源回归或 fixture。落盘契约要求事件 timestamp 必填，故采集期整条拒绝：
    // 若放进聚合，基线快照会计入它而事件派生不会，两边凭空漂移（[5] 的漂移告警就会误报）。
    const untimedFixture = join(dir, 'untimed-records.json');
    // 作者用组织账号本身：登录名别名直接命中 openan-labs 桶，聚合断言不必再关心归属规则
    const author = {
      login: 'openan-labs',
      githubId: 1001,
      name: 'OpenAN Labs',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1001?v=4',
      url: 'https://github.com/openan-labs',
    };
    writeJson(untimedFixture, {
      records: [
        {
          kind: 'pullRequest',
          repository: 'openan-labs/core',
          number: 910,
          author,
          linesChanged: 12,
          timestamp: '2026-09-20T00:00:00Z',
          commitEmail: null,
          commitCount: 4,
        },
        {
          // 缺 mergedAt（数据源回归形态）
          kind: 'pullRequest',
          repository: 'openan-labs/core',
          number: 911,
          author,
          linesChanged: 3,
          timestamp: null,
          commitEmail: null,
          commitCount: 9,
        },
        {
          // 空串同样视为缺时间
          kind: 'issue',
          repository: 'openan-labs/core',
          number: 912,
          author,
          linesChanged: 0,
          timestamp: '',
          commitCount: 0,
        },
      ],
    });

    const output = runCollector(dir, ['--mode=full'], untimedFixture);
    const events = eventsOf(dir);
    const map = contributionsMap(dir);
    const state = readJson(join(dir, '.sync-state.json'));

    check(
      '只有带合法时间戳的记录落盘为事件（3 条抓取 → 1 条落盘）',
      events.length === 1 &&
        events[0].number === 910 &&
        events[0].timestamp === '2026-09-20T00:00:00Z',
      `events=${events.map((event) => `#${event.number}`).join(',') || '空'}`,
    );
    check(
      '被拒记录不进聚合：提交 4（而非 13）、Issue 0（而非 1）、行数 12（而非 15）',
      sameGithub(map.get('openan-labs')?.github, {
        pullRequests: 1,
        commits: 4,
        issues: 0,
        linesChanged: 12,
        repos: 1,
      }),
      shortGithub(map.get('openan-labs')?.github),
    );
    check(
      '游标记录累计拒绝数 untimedEvents=2，recordCount 仍为抓取数 3',
      state.untimedEvents === 2 && state.recordCount === 3,
      `untimedEvents=${state.untimedEvents} / recordCount=${state.recordCount}`,
    );
    check(
      '拒绝必须 WARN 到日志（不静默丢），并带上累计数与样例定位',
      output.includes('拒绝 2 条缺时间戳的记录') &&
        output.includes('untimedEvents=2') &&
        output.includes('pullRequest openan-labs/core#911'),
      'stdout/stderr 命中 WARN 关键字',
    );
    check(
      '负向对照：事件校验器拒绝 null / 空串 / 纯日期，接受 ISO 时刻（拒绝发生在落盘之前）',
      !isGithubContributionEventArray([{ ...events[0], timestamp: null }]) &&
        !isGithubContributionEventArray([{ ...events[0], timestamp: '' }]) &&
        !isGithubContributionEventArray([{ ...events[0], timestamp: '2026-09-20' }]) &&
        isGithubContributionEventArray([{ ...events[0], timestamp: '2026-09-20T00:00:00Z' }]),
      'null / 空串 / 日期 → 非法；ISO 时刻 → 合法',
    );
    checkEventsValid(events, '缺时间戳拒绝');
  }

  console.log('\n[9] 隔离性：真实 data/ 与合成种子均未被改动');
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
