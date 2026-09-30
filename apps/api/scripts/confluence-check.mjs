/**
 * Confluence 采集离线自检（不联网、不需要 token）。
 *
 * 做法：把仓库真实 data/ 的无关文件复制进临时目录，用 seed-data 覆盖
 * organizations / wiki / accounts / persons / identity-claims 五份档案，再以
 * CONFLUENCE_FIXTURE 指向合成页面记录 + 合成正文跑**编译产物**，
 * 逐项断言选页口径、两维度解析、归属、校验与幂等。
 *
 * 断言覆盖：
 *   1. 选页口径：需求页须「标题精确 + 祖先含 Release Planning」（同名模板页被排除）；
 *      会议纪要页须「标题匹配 + 直接父页匹配」（父页年份用模式，跨年仍命中）
 *   2. 需求口径：只取 Contacts 单元格的 @（同行去重、每个联系人各 1 条），
 *      表格外提及与纯文本 @人都不计入
 *   3. 议题分享口径：取 Agenda 段内**全部** @（段落里的与表格行里的都算），并按期去重；
 *      段外（出席签到段、行动项）的 @ 一律不计
 *   4. 四种归属路径（aliases 展示名命中、身份认领边命中、aliases 空间 key 命中、
 *      展示名兜底为 accountId）与兜底独立开发者
 *   4b. 展示名兜底顺序：渲染视图 body.view → 正文 ri:username → 创建者展示名 →
 *      /rest/api/user 查询 → accountId（样例里五档各有一个账号）
 *   5. 空间白名单在源层生效（空间外页面不得进入统计）
 *   6. 组织全覆盖（与 organizations.json 条目等长，不含空洞）
 *   7. 账号级落盘（confluence-accounts.json）：条目数、accountId 稳定键、orgId / personId
 *      的派生来源、与组织级**两个维度都求和不一致即失败**、整体替换与稳定排序
 *   8. 幂等：连续两次全量重算结果一致（组织级 + 账号级）
 *   9. --dry-run 不落盘（组织级 + 账号级）
 *  10. 空值兜底：无一页命中口径时中止写入、保留既有 confluence-organizations.json
 *      与 confluence-accounts.json，并在状态文件标记 failed
 *  11. 仓库真实 data/ 未被触碰
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APPS_API = resolve(HERE, '..');
const REPO_ROOT = resolve(APPS_API, '../..');
const DIST_ENTRY = join(APPS_API, 'dist', 'collector', 'confluence', 'confluence-main.js');
const SEED_DIR = join(HERE, 'fixtures', 'seed-data');
const SAMPLE_FIXTURE = join(HERE, 'fixtures', 'confluence-records.sample.json');
const NONE_FIXTURE = join(HERE, 'fixtures', 'confluence-records.none.json');
const REAL_DATA_DIR = join(REPO_ROOT, 'data');

const SPACES = 'OPENAN,ORBIT';

/** 相对仓库根的展示路径（日志里避免绝对路径噪音） */
function relFromRepo(path) {
  return relative(REPO_ROOT, path).replace(/\\/g, '/');
}

/** 打印本次校验的数据来源：上游记录 / 落盘输入 / 真实数据隔离 */
function logDataSources() {
  console.log('');
  console.log('数据来源 ─────────────────────────────────────────────');
  console.log('  采集器  : Confluence（dist/collector/confluence/confluence-main.js）');
  console.log(
    `  上游记录: fixture → ${relFromRepo(SAMPLE_FIXTURE)}（合成页面 + 正文，离线、不联网）`,
  );
  console.log(`            空场景 → ${relFromRepo(NONE_FIXTURE)}`);
  console.log(`  落盘输入: ${relFromRepo(SEED_DIR)}（${SEED_FILES.length} 份合成档案，非真实 data/）`);
  console.log(`  补齐文件: 真实 data/ 的 ${OPTIONAL_FILES.join(', ')}`);
  console.log('  真实数据: 只读，3 个文件以 sha256 断言未被触碰');
  console.log('───────────────────────────────────────────────────────');
}

const require = createRequire(import.meta.url);
/** 直接断言编译产物里的解析函数（展示名抽取） */
const { extractRenderedUserNames } = require(
  join(APPS_API, 'dist', 'collector', 'confluence', 'confluence-content.parser.js'),
);

/**
 * 照抄真实 `body.view` 响应形态的渲染片段：
 * 真名锚点（含嵌套标签）、占位文本、空文本各一处。
 */
const RENDERED_VIEW_SAMPLE = [
  '<p><a class="confluence-userlink user-mention" data-account-id="5da82cb11a43fe0ddbb47e83"',
  ' href="https://lf-networking.atlassian.net/wiki/people/5da82cb11a43fe0ddbb47e83?ref=confluence"',
  ' data-linked-resource-type="userinfo">FeiGuo</a>',
  '<a class="confluence-userlink user-mention" data-account-id="acct-html-1"',
  ' href="https://x.atlassian.net/wiki/people/acct-html-1"><span>Ada</span> Lovelace</a>',
  '<a class="confluence-userlink user-mention" data-account-id="acct-unknown-1"',
  ' href="https://x.atlassian.net/wiki/people/acct-unknown-1">Unknown user</a>',
  '<a class="confluence-userlink user-mention" data-account-id="acct-empty-1"',
  ' href="https://x.atlassian.net/wiki/people/acct-empty-1"></a></p>',
].join('');

/** 用 seed-data 覆盖的档案（Confluence 归属链路的输入） */
const SEED_FILES = [
  'organizations.json',
  'confluence-organizations.json',
  'confluence-accounts.json',
  'persons.json',
  'identity-claims.json',
];

/** 其余数据文件从真实 data/ 复制，保证启动期自检的数据面完整 */
const OPTIONAL_FILES = [
  'home.json',
  'github-organizations.json',
  'github-accounts.json',
  'summits.json',
  'meetings.json',
];

const results = [];
let failed = 0;

function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ ok, name, detail });
  if (!ok) failed += 1;
  return ok;
}

function hashFile(path) {
  if (!existsSync(path)) return '(missing)';
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

function writeEnvelope(path, data) {
  writeFileSync(
    path,
    `${JSON.stringify({ schemaVersion: 1, updatedAt: new Date().toISOString(), data }, null, 2)}\n`,
    'utf8',
  );
}

/** 准备临时 DATA_DIR：seed 档案打底 + 真实文件补齐 */
function prepareDataDir() {
  const dir = mkdtempSync(join(tmpdir(), 'confluence-check-'));

  for (const file of SEED_FILES) {
    cpSync(join(SEED_DIR, file), join(dir, file));
  }
  for (const file of OPTIONAL_FILES) {
    const from = join(REAL_DATA_DIR, file);
    if (existsSync(from)) {
      cpSync(from, join(dir, file));
    } else {
      writeEnvelope(join(dir, file), []);
    }
  }

  return dir;
}

/** 跑一次编译产物；返回 { status, output } */
function runCli(dataDir, { fixture, spaces = SPACES, args = [] }) {
  const result = spawnSync(process.execPath, [DIST_ENTRY, ...args], {
    cwd: APPS_API,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATA_DIR: dataDir,
      CONFLUENCE_FIXTURE: fixture,
      CONFLUENCE_SPACES: spaces,
      CONFLUENCE_LOOKBACK_DAYS: '3650',
    },
  });

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  // 采集器自身会打印「采集开始：mode=… source=…」：回显出来，本次跑的是哪份数据一目了然
  // （Nest Logger 会带 ANSI 颜色码，去掉后便于阅读与比对）
  const sourceLine = output.match(/采集开始：[^\n]*/)?.[0];
  if (sourceLine) console.log(`  · ${sourceLine.replace(/\u001b\[[0-9;]*m/g, '')}`);
  return { status: result.status, output };
}

function readWiki(dataDir) {
  return JSON.parse(readFileSync(join(dataDir, 'confluence-organizations.json'), 'utf8'));
}

function readAccounts(dataDir) {
  return JSON.parse(readFileSync(join(dataDir, 'confluence-accounts.json'), 'utf8'));
}

function readState(dataDir) {
  return JSON.parse(readFileSync(join(dataDir, '.sync-state.confluence.json'), 'utf8'));
}

/** 某一维度的账号级合计（组织级必须逐维度等于它） */
function accountTotalOf(accounts, dimension) {
  return accounts.data.reduce((sum, item) => sum + item.confluence[dimension], 0);
}

function wikiTotalOf(wiki, dimension) {
  return wiki.data.reduce((sum, item) => sum + item.confluence[dimension], 0);
}

function accountsByKey(accounts) {
  return Object.fromEntries(accounts.data.map((item) => [item.accountId, item]));
}

function metricsOf(wiki, orgId) {
  return wiki.data.find((item) => item.orgId === orgId)?.confluence;
}

/** 去掉时间戳后序列化，用于跨轮幂等比较（updatedAt 每轮必然变化） */
function stableAccounts(accounts) {
  return JSON.stringify(
    accounts.data.map(({ accountId, displayName, orgId, orgSource, personId, confluence }) => ({
      accountId,
      displayName,
      orgId,
      orgSource,
      personId,
      confluence,
    })),
  );
}

function stableWiki(wiki) {
  return JSON.stringify(wiki.data.map(({ orgId, confluence }) => ({ orgId, confluence })));
}

function main() {
  if (!existsSync(DIST_ENTRY)) {
    console.error(`✗ 未找到编译产物：${DIST_ENTRY}\n  请先执行：npm run build -w @openan/api`);
    process.exit(1);
  }

  logDataSources();

  // ── 0. 单元断言：渲染视图抽取展示名 ────────────────────────
  const renderedNames = extractRenderedUserNames(RENDERED_VIEW_SAMPLE);
  check('渲染视图抽展示名：data-account-id 锚点取文本（嵌套标签按纯文本）',
    renderedNames.get('5da82cb11a43fe0ddbb47e83') === 'FeiGuo' &&
      renderedNames.get('acct-html-1') === 'Ada Lovelace',
    JSON.stringify([...renderedNames]));
  check('渲染视图抽展示名：占位文本（Unknown user）与空文本锚点一律跳过',
    !renderedNames.has('acct-unknown-1') && !renderedNames.has('acct-empty-1'),
    JSON.stringify([...renderedNames]));

  const realWikiHash = hashFile(join(REAL_DATA_DIR, 'confluence-organizations.json'));
  const realStateHash = hashFile(join(REAL_DATA_DIR, '.sync-state.confluence.json'));
  const realAccountsHash = hashFile(join(REAL_DATA_DIR, 'confluence-accounts.json'));

  const dataDir = prepareDataDir();

  try {
    // ── 1. 正常全量采集 ────────────────────────────────────────
    const first = runCli(dataDir, { fixture: SAMPLE_FIXTURE });
    check('首次全量采集退出码为 0', first.status === 0, `status=${first.status}`);

    const wiki = readWiki(dataDir);
    const orgCount = JSON.parse(
      readFileSync(join(SEED_DIR, 'organizations.json'), 'utf8'),
    ).data.length;

    check(
      'wiki 条目数 = organizations.json 条数（无空洞）',
      wiki.data.length === orgCount,
      `实际 ${wiki.data.length} vs 期望 ${orgCount}`,
    );
    check('wiki envelope 已提升到 schemaVersion 3', wiki.schemaVersion === 3,
      `实际 ${wiki.schemaVersion}`);

    // ── 选页口径 ──────────────────────────────────────────────
    check('需求页只选「标题 + 祖先含 Release Planning」的两页', 
      first.output.includes('需求页 2 页'),
      first.output.match(/页面选择：[^\n]*/)?.[0] ?? '');
    check('同名但不含 Release Planning 祖先的模板页被排除（delta-node 为 0）',
      metricsOf(wiki, 'delta-node')?.requirements === 0,
      JSON.stringify(metricsOf(wiki, 'delta-node')));
    check('父页不匹配的会议页被排除（标题像 TSC Minutes 但父页是 PAC）',
      first.output.includes('会议纪要页 3 页'),
      first.output.match(/页面选择：[^\n]*/)?.[0] ?? '');
    check('跨年父页（2025 - TSC Minutes）仍命中会议纪要选择器',
      first.output.includes('会议纪要页 3 页'));

    // ── 需求维度：只取 Contacts 单元格，每个 @ 各 1 条 ──────────
    check('需求表格 5 行 → 7 条（含一行两位联系人，各自各计 1 条）',
      first.output.includes('需求表格：5 行 → 7 条'),
      first.output.match(/需求表格：[^\n]*/)?.[0] ?? '');
    check('组织级需求合计 = 7', wikiTotalOf(wiki, 'requirements') === 7,
      `实际 ${wikiTotalOf(wiki, 'requirements')}`);
    check('表格外提及不计入（acct-openan-1 未出现在账号级）',
      !readAccounts(dataDir).data.some((x) => x.accountId === 'acct-openan-1'));

    // ── 议题分享维度：Agenda 段内全部 @（段落 + 表格行），按期去重 ──
    check('Agenda 段内 @ 全取并按期去重（4 处 3 人 + 另一期 1 人 = 4 次）',
      first.output.includes('会议议题：4 次分享'),
      first.output.match(/会议议题：[^\n]*/)?.[0] ?? '');
    check('Agenda 段内原始 @ 处数被记录（4 + 1 = 5 处，多于去重后的 4 次）',
      first.output.includes('段内原始 5 处'),
      first.output.match(/会议议题：[^\n]*/)?.[0] ?? '');
    check('组织级议题分享合计 = 4', wikiTotalOf(wiki, 'topicShares') === 4,
      `实际 ${wikiTotalOf(wiki, 'topicShares')}`);
    check('Agenda 段内「段落」里的 @ 也计入（acct-solo-1 议题分享 1）',
      readAccounts(dataDir).data.find((x) => x.accountId === 'acct-solo-1')?.confluence
        .topicShares === 1,
      JSON.stringify(readAccounts(dataDir).data.find((x) => x.accountId === 'acct-solo-1')));
    check('出席签到段与行动项的 @ 不计入（acct-tsc-1 未出现在账号级）',
      !readAccounts(dataDir).data.some((x) => x.accountId === 'acct-tsc-1'));
    check('行动项段（Agenda 段外）的 @ 不计入议题分享（acct-ghost-1 议题分享 0）',
      readAccounts(dataDir).data.find((x) => x.accountId === 'acct-ghost-1')?.confluence
        .topicShares === 0,
      JSON.stringify(readAccounts(dataDir).data.find((x) => x.accountId === 'acct-ghost-1')));

    // ── 归属路径（采集口径，ADR-0010：认领边不参与裁决）──────────
    check('认领边不参与采集口径归属裁决 → nova-silicon 组织级为 0',
      metricsOf(wiki, 'nova-silicon')?.requirements === 0 &&
        metricsOf(wiki, 'nova-silicon')?.topicShares === 0,
      JSON.stringify(metricsOf(wiki, 'nova-silicon')));
    check('aliases 展示名命中 → lumen-dev（需求 1 / 议题分享 2）',
      metricsOf(wiki, 'lumen-dev')?.requirements === 1 &&
        metricsOf(wiki, 'lumen-dev')?.topicShares === 2,
      JSON.stringify(metricsOf(wiki, 'lumen-dev')));
    check('aliases 空间 key 命中（空间兜底）→ orbit-data（需求 2 / 议题分享 0）',
      metricsOf(wiki, 'orbit-data')?.requirements === 2 &&
        metricsOf(wiki, 'orbit-data')?.topicShares === 0,
      JSON.stringify(metricsOf(wiki, 'orbit-data')));
    check('无别名无空间命中的账号（含只有认领边的）→ 全部兜底独立开发者（需求 4 / 议题分享 2）',
      metricsOf(wiki, 'unattributed')?.requirements === 4 &&
        metricsOf(wiki, 'unattributed')?.topicShares === 2,
      JSON.stringify(metricsOf(wiki, 'unattributed')));
    check('空间外页面未计入任何组织',
      ['harbor-cloud', 'stellar-foundry', 'openan-labs'].every(
        (orgId) => metricsOf(wiki, orgId)?.requirements === 0,
      ),
      JSON.stringify(wiki.data.map((x) => [x.orgId, x.confluence])),
    );

    // ── 2. 账号级（原子事实）⇄ 组织级（派生投影）────────────────
    const accounts = readAccounts(dataDir);
    const byKey = accountsByKey(accounts);
    const accountsStable = stableAccounts(accounts);
    const wikiStable = stableWiki(wiki);

    check('账号级 envelope 已提升到 schemaVersion 4', accounts.schemaVersion === 4,
      `实际 ${accounts.schemaVersion}`);
    check('账号级条目数 = 5', accounts.data.length === 5, `实际 ${accounts.data.length}`);
    check(
      '账号级排序：需求降序 → 议题分享降序 → 编辑量降序 → accountId 升序',
      JSON.stringify(accounts.data.map((x) => x.accountId)) ===
        JSON.stringify([
          'acct-nova-001',
          'acct-orbit-1',
          'acct-lumen-9',
          'acct-solo-1',
          'acct-ghost-1',
        ]),
      JSON.stringify(accounts.data.map((x) => x.accountId)),
    );
    for (const dimension of ['requirements', 'topicShares', 'edits']) {
      check(
        `账号级 ${dimension} 合计 = 组织级合计（组织级必须由账号级派生）`,
        accountTotalOf(accounts, dimension) === wikiTotalOf(wiki, dimension),
        `账号级 ${accountTotalOf(accounts, dimension)} vs 组织级 ${wikiTotalOf(wiki, dimension)}`,
      );
      check(
        `账号级 ${dimension} 覆盖每个账号且非负整数`,
        accounts.data.every(
          (x) => Number.isInteger(x.confluence[dimension]) && x.confluence[dimension] >= 0,
        ),
      );
    }
    check('账号级：认领边只写 personId 快照，不改写采集口径 orgId（ADR-0010）',
      byKey['acct-nova-001']?.orgId === null &&
        byKey['acct-nova-001']?.orgSource === 'unattributed' &&
        byKey['acct-nova-001']?.personId === 'nora-kim',
      JSON.stringify(byKey['acct-nova-001']));
    check('账号级：aliases 展示名命中 → lumen-dev（personId 未认领）',
      byKey['acct-lumen-9']?.orgId === 'lumen-dev' && byKey['acct-lumen-9']?.personId === null,
      JSON.stringify(byKey['acct-lumen-9']));
    check('账号级：空间兜底命中 → orbit-data',
      byKey['acct-orbit-1']?.orgId === 'orbit-data',
      JSON.stringify(byKey['acct-orbit-1']));
    check('账号级：无别名无认领边 → orgId / personId 均为 null（只到账号）',
      byKey['acct-ghost-1']?.orgId === null && byKey['acct-ghost-1']?.personId === null,
      JSON.stringify(byKey['acct-ghost-1']));
    check('账号级：认领边用了别的 accountId 不得误命中（acct-solo-1 仍为 null）',
      byKey['acct-solo-1']?.orgId === null,
      JSON.stringify(byKey['acct-solo-1']));
    check(
      '展示名兜底顺序：渲染视图 → 正文 username → 创建者 → 账号查询 → accountId（五档各一个账号）',
      byKey['acct-solo-1']?.displayName === 'Solo Hacker' && // 渲染视图（优先于 users 里的登录名 solo-hacker）
        byKey['acct-lumen-9']?.displayName === 'Lumen' && // 正文 ri:username
        byKey['acct-nova-001']?.displayName === 'Nora Kim' && // 创建者展示名
        byKey['acct-orbit-1']?.displayName === 'Orbit Person' && // /rest/api/user 查询
        byKey['acct-ghost-1']?.displayName === 'acct-ghost-1', // 占位文本跳过 → accountId 兜底
      JSON.stringify(accounts.data.map((x) => [x.accountId, x.displayName])),
    );
    check('展示名来源可观测：日志按来源分档计数（渲染 1｜username 1｜创建者 1｜查询 1｜兜底 1）',
      first.output.includes(
        '展示名来源：渲染视图 1｜正文 username 1｜创建者 1｜账号查询 1｜降级 accountId 1',
      ),
      first.output.match(/展示名来源：[^\n]*/)?.[0] ?? '');
    check('账号级：整体替换（既有陈旧条目已被清除）', byKey['acct-stale-001'] === undefined);
    check('账号级：orgId / personId / orgSource 字段显式存在',
      accounts.data.every((x) => 'orgId' in x && 'personId' in x && 'orgSource' in x));
    check('账号级：orgSource 与归属路径一致（alias / space / unattributed）',
      byKey['acct-lumen-9']?.orgSource === 'alias' &&
        byKey['acct-orbit-1']?.orgSource === 'space' &&
        byKey['acct-nova-001']?.orgSource === 'unattributed' &&
        byKey['acct-solo-1']?.orgSource === 'unattributed' &&
        byKey['acct-ghost-1']?.orgSource === 'unattributed',
      JSON.stringify(accounts.data.map((x) => [x.accountId, x.orgSource])));

    // ── 状态文件：口径自检与运营待办 ────────────────────────────
    const state = readState(dataDir);
    check('状态文件记录成功', state.status === 'success', `status=${state.status}`);
    check('状态文件页面总数 = 7（空间过滤后）', state.pageCount === 7,
      `pageCount=${state.pageCount}`);
    check('状态文件记录账号级条目数 = 5', state.accountCount === 5,
      `accountCount=${state.accountCount}`);
    check('状态文件记录需求页数 = 2', state.requirementPageCount === 2,
      `requirementPageCount=${state.requirementPageCount}`);
    check('状态文件记录会议页数 = 3', state.minutesPageCount === 3,
      `minutesPageCount=${state.minutesPageCount}`);
    check('状态文件暴露无 Agenda 段的会议页',
      state.minutesWithoutAgenda.length === 1 &&
        state.minutesWithoutAgenda[0] === '2026-08-11 TSC Minutes',
      JSON.stringify(state.minutesWithoutAgenda));
    check('状态文件暴露未归属账号（accountId + 展示名 + 三维度量，含仅有认领边的）',
      state.unattributedAccounts.map((x) => x.accountId).join(',') ===
        'acct-nova-001,acct-solo-1,acct-ghost-1' &&
        state.unattributedAccounts[0].requirements === 2 &&
        state.unattributedAccounts[0].topicShares === 1 &&
        state.unattributedAccounts[0].edits === 0 &&
        state.unattributedAccounts[1].topicShares === 1 &&
        state.unattributedAccounts[2].topicShares === 0,
      JSON.stringify(state.unattributedAccounts));
    check('状态文件暴露未能解析的纯文本 @人（需求行 + 纪要段，供运营修正正文）',
      state.unresolvedContacts.length === 2 &&
        state.unresolvedContacts[0].pageId === '900001' &&
        state.unresolvedContacts[0].source === 'requirements' &&
        state.unresolvedContacts[0].rowIndex === 3 &&
        state.unresolvedContacts[0].handles.join(',') === 'mystery-person' &&
        state.unresolvedContacts[0].requirementTitle === '调度优化' &&
        state.unresolvedContacts[1].pageId === '900004' &&
        state.unresolvedContacts[1].source === 'minutes' &&
        state.unresolvedContacts[1].rowIndex === null &&
        state.unresolvedContacts[1].handles.join(',') === 'pending-speaker',
      JSON.stringify(state.unresolvedContacts));
    check('默认不落原始快照（避免目录累积）', !existsSync(join(dataDir, 'source')),
      '期望不存在 source/ 目录');

    // ── 3. 幂等 ────────────────────────────────────────────────
    const second = runCli(dataDir, { fixture: SAMPLE_FIXTURE });
    check('二次全量采集退出码为 0', second.status === 0, `status=${second.status}`);
    check('幂等：二次组织级结果与首次一致（时间戳外）',
      stableWiki(readWiki(dataDir)) === wikiStable);
    check('幂等：二次账号级结果与首次一致（时间戳外）',
      stableAccounts(readAccounts(dataDir)) === accountsStable);

    // ── 4. dry-run 不落盘 ──────────────────────────────────────
    const beforeDryWiki = hashFile(join(dataDir, 'confluence-organizations.json'));
    const beforeDryAccounts = hashFile(join(dataDir, 'confluence-accounts.json'));
    const dry = runCli(dataDir, { fixture: SAMPLE_FIXTURE, args: ['--dry-run'] });
    check('dry-run 退出码为 0', dry.status === 0, `status=${dry.status}`);
    check('dry-run 不写 confluence-organizations.json',
      hashFile(join(dataDir, 'confluence-organizations.json')) === beforeDryWiki);
    check('dry-run 不写 confluence-accounts.json',
      hashFile(join(dataDir, 'confluence-accounts.json')) === beforeDryAccounts);
    check('dry-run 明确提示未写入', dry.output.includes('未写入任何文件'));

    // ── 5. --report-only 只落快照、不写契约文件 ─────────────────
    const beforeReportWiki = hashFile(join(dataDir, 'confluence-organizations.json'));
    const report = runCli(dataDir, { fixture: SAMPLE_FIXTURE, args: ['--report-only'] });
    check('report-only 退出码为 0', report.status === 0, `status=${report.status}`);
    check('report-only 不写 confluence-organizations.json',
      hashFile(join(dataDir, 'confluence-organizations.json')) === beforeReportWiki);
    const snapshotDir = join(dataDir, 'source', 'confluence');
    const snapshots = existsSync(snapshotDir) ? readdirSync(snapshotDir) : [];
    check('report-only 落抽取快照（含 derived 行级事实）', snapshots.length === 1,
      JSON.stringify(snapshots));
    if (snapshots.length === 1) {
      const snapshot = JSON.parse(readFileSync(join(snapshotDir, snapshots[0]), 'utf8'));
      check('快照记录本轮生效口径',
        typeof snapshot.criteria === 'string' && snapshot.criteria.includes('Release Planning'),
        String(snapshot.criteria));
      check('快照 derived 记录需求页联系人',
        snapshot.derived.requirementPages.length === 2 &&
          snapshot.derived.requirementPages.some((page) => page.pageId === '900001' &&
            page.contacts.includes('acct-nova-001') &&
            page.contacts.includes('acct-lumen-9')),
        JSON.stringify(snapshot.derived.requirementPages));
      check('快照 derived 记录议题分享人',
        snapshot.derived.minutesPages.some((page) => page.pageId === '900004' &&
          page.topicSharers.join(',') === 'acct-solo-1,acct-nova-001,acct-lumen-9'),
        JSON.stringify(snapshot.derived.minutesPages));
    }

    // ── 6. 空值兜底：无一页命中口径 ────────────────────────────
    const beforeEmpty = readFileSync(join(dataDir, 'confluence-organizations.json'), 'utf8');
    const beforeEmptyAccounts = readFileSync(join(dataDir, 'confluence-accounts.json'), 'utf8');
    const empty = runCli(dataDir, { fixture: NONE_FIXTURE });
    check('空结果采集以非 0 退出（中止写入）', empty.status !== 0, `status=${empty.status}`);
    check('空结果保留既有 confluence-organizations.json（未被清零）',
      readFileSync(join(dataDir, 'confluence-organizations.json'), 'utf8') === beforeEmpty);
    check('空结果保留既有 confluence-accounts.json（未被清零）',
      readFileSync(join(dataDir, 'confluence-accounts.json'), 'utf8') === beforeEmptyAccounts);
    check('空结果给出可操作线索', empty.output.includes('未选到任何需求页'));
    check('空结果在状态文件标记 failed', readState(dataDir).status === 'failed',
      `status=${readState(dataDir).status}`);

    // ── 7. 未配置空间时快速失败 ────────────────────────────────
    const noSpaces = runCli(dataDir, { fixture: SAMPLE_FIXTURE, spaces: '' });
    check('未配置 CONFLUENCE_SPACES 时非 0 退出', noSpaces.status !== 0,
      `status=${noSpaces.status}`);

    // ── 8. 仓库真实数据未被触碰 ────────────────────────────────
    check('真实 data/confluence-organizations.json 未被改动',
      hashFile(join(REAL_DATA_DIR, 'confluence-organizations.json')) === realWikiHash);
    check('真实 data/.sync-state.confluence.json 未被改动',
      hashFile(join(REAL_DATA_DIR, '.sync-state.confluence.json')) === realStateHash);
    check('真实 data/confluence-accounts.json 未被改动',
      hashFile(join(REAL_DATA_DIR, 'confluence-accounts.json')) === realAccountsHash);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }

  // ── 输出 ────────────────────────────────────────────────────
  console.log('');
  for (const item of results) {
    console.log(
      `${item.ok ? '✓' : '✗'} ${item.name}${item.ok || !item.detail ? '' : `  → ${item.detail}`}`,
    );
  }
  console.log('');
  console.log(failed === 0 ? `全部通过（${results.length} 项）` : `失败 ${failed} / ${results.length} 项`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
