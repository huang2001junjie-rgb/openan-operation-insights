/**
 * 个人模式（Person Mode，ADR-0020）读时派生端到端校验（离线，无需启动服务）。
 *
 * 用法：npm run build -w @openan/api && npm run person:check -w @openan/api
 *
 * 原理：把合成种子数据写入系统临时目录，直接用编译产物（dist）实例化
 * JsonRepository 与 PersonInsightService，断言四个 /api/person-* 端点背后的
 * 读时派生不变量。仓库 data/ 不被触碰。
 *
 * 断言覆盖：① 自然人画像四项 GitHub 计数 ≡ 名下账号求和、repos ≡ repoIds 并集
 * （dev-alpha/dev-beta 共用 openan/core 锁死求和陷阱）；② 半开区间 [from, to)；
 * ③ 多认领 many-to-many（画像取首条认领边，候选池全列）；④ 组织兜底
 * （person.orgId 为空 → unattributed/account）；⑤ 事件明细排序/截断/双键
 * （login + githubId）/URL 读时派生；⑥ 需求级事实明细与缺失文件「待采集」降级；
 * ⑦ 候选池只列有贡献实体、bot 徽标。需求事实**写入侧**的去重由
 * collect:wiki:check 的 ADR-0021 段负责（同行同账号去重 / 按账号恒等）。
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(import.meta.url), '..');
const dist = resolve(scriptDir, '../dist');

const { JsonRepository } = await import(pathTo('repositories/json-repository.js'));
const validators = await import(pathTo('repositories/validators.js'));
const { PersonInsightService } = await import(pathTo('modules/person/person-insight.service.js'));
const dtos = await import(pathTo('modules/person/dto/person-query.dto.js'));

function pathTo(rel) {
  return new URL(`file://${join(dist, rel).replace(/\\/g, '/')}`).href;
}

// 错误码（与 src/common/constants/error-code.ts 对齐，identity-check 同款硬编码）
const CODE = { VALIDATION_FAILED: 40001, INVALID_DATE_RANGE: 40002, PERSON_NOT_FOUND: 40403 };

let passed = 0;
let failed = 0;
const tempDirs = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}  (${detail})`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}  → ${detail}`);
  }
}

function codeOf(fn) {
  try {
    fn();
    return 0;
  } catch (error) {
    return error?.code;
  }
}

async function expectCode(label, fn, code) {
  try {
    await fn();
    check(label, false, `期望抛出 ${code}，实际成功`);
  } catch (error) {
    check(label, error?.code === code, `code=${error?.code}`);
  }
}

function envelope(data, schemaVersion = 1) {
  return { schemaVersion, updatedAt: '2026-09-30T00:00:00.000Z', data };
}

// ── 合成种子 ──────────────────────────────────────────────────────────
const ORGS = [
  { orgId: 'huawei', name: 'Huawei', logoUrl: '', homepageUrl: '', type: 'participant', tags: [] },
  { orgId: 'orange', name: 'Orange', logoUrl: '', homepageUrl: '', type: 'participant', tags: [] },
  { orgId: 'unattributed', name: '独立开发者', logoUrl: '', homepageUrl: '', type: 'individual', tags: [] },
];

const PERSONS = [
  { personId: 'zhang-wei', displayName: '张伟', orgId: 'huawei', avatarUrl: 'https://example.com/zw.png', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { personId: 'li-na', displayName: '李娜', orgId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { personId: 'wang-fang', displayName: '王芳', orgId: 'orange', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  { personId: 'solo-chen', displayName: '陈独', orgId: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
];

// dev-shared 被两人认领（many-to-many）；数组顺序即优先级，zhang-wei 在前 → 画像归属他
const CLAIMS = [
  { claimId: 'clm_01', personId: 'zhang-wei', source: 'github', accountKey: '1001', createdAt: '2026-01-02T00:00:00Z' },
  { claimId: 'clm_02', personId: 'zhang-wei', source: 'github', accountKey: '1002', createdAt: '2026-01-02T00:00:00Z' },
  { claimId: 'clm_03', personId: 'li-na', source: 'github', accountKey: '1003', createdAt: '2026-01-02T00:00:00Z' },
  { claimId: 'clm_07', personId: 'zhang-wei', source: 'github', accountKey: '1005', createdAt: '2026-01-02T00:00:00Z' },
  { claimId: 'clm_08', personId: 'li-na', source: 'github', accountKey: '1005', createdAt: '2026-01-03T00:00:00Z' },
  { claimId: 'clm_04', personId: 'zhang-wei', source: 'confluence', accountKey: 'acc-zw', createdAt: '2026-01-02T00:00:00Z' },
  { claimId: 'clm_05', personId: 'li-na', source: 'confluence', accountKey: 'acc-lina', createdAt: '2026-01-02T00:00:00Z' },
  { claimId: 'clm_06', personId: 'wang-fang', source: 'confluence', accountKey: 'acc-wf', createdAt: '2026-01-02T00:00:00Z' },
];

const CONTRIBUTORS = [
  { contributorId: 'dev-alpha', githubId: 1001, name: 'Dev Alpha', orgId: null, avatarUrl: 'https://example.com/a.png', github: { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0, repos: 0, repoIds: [] } },
  { contributorId: 'dev-beta', githubId: 1002, name: 'Dev Beta', orgId: null, github: { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0, repos: 0, repoIds: [] } },
  { contributorId: 'dev-gamma', githubId: 1003, name: 'Dev Gamma', orgId: null, github: { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0, repos: 0, repoIds: [] } },
  { contributorId: 'dev-shared', githubId: 1005, name: 'Dev Shared', orgId: null, github: { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0, repos: 0, repoIds: [] } },
  { contributorId: 'dep-bot', githubId: 0, name: 'dep-bot', orgId: null, github: { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0, repos: 0, repoIds: [] } },
  { contributorId: 'unclaimed-x', githubId: 1006, name: 'Unclaimed X', orgId: null, github: { pullRequests: 0, commits: 0, issues: 0, linesChanged: 0, repos: 0, repoIds: [] } },
];

const CONFLUENCE_ACCOUNTS = [
  { accountId: 'acc-zw', displayName: 'ZW', orgId: null, orgSource: 'unattributed', personId: null, confluence: { requirements: 2, topicShares: 1, edits: 0 }, updatedAt: '2026-09-01T00:00:00Z' },
  { accountId: 'acc-lina', displayName: 'Lina', orgId: null, orgSource: 'unattributed', personId: null, confluence: { requirements: 2, topicShares: 0, edits: 3 }, updatedAt: '2026-09-05T00:00:00Z' },
  { accountId: 'acc-wf', displayName: 'WF', orgId: null, orgSource: 'unattributed', personId: null, confluence: { requirements: 1, topicShares: 2, edits: 1 }, updatedAt: '2026-09-03T00:00:00Z' },
];

// 事件表（github-events.json v2）：#9 恰在 from 整点、#2 恰在 to 整点、#6 在 from 前一秒
const EV = (kind, repository, number, login, githubId, timestamp, commits = 0, lines = 0) => ({
  kind, repository, number,
  author: { login, githubId, name: login, avatarUrl: '' },
  linesChanged: lines, timestamp, commitCount: commits,
});
const EVENTS = [
  EV('pullRequest', 'openan/core', 101, 'dev-alpha', 1001, '2026-07-15T00:00:00Z', 5, 100),
  EV('pullRequest', 'openan/docs', 102, 'dev-alpha', 1001, '2026-08-01T00:00:00Z', 3, 60),
  EV('pullRequest', 'openan/core', 103, 'dev-beta', 1002, '2026-07-20T00:00:00Z', 2, 40),
  EV('issue', 'openan/kernel', 104, 'dev-beta', 1002, '2026-07-25T00:00:00Z'),
  EV('issue', 'openan/docs', 105, 'dev-gamma', 1003, '2026-07-10T00:00:00Z'),
  EV('pullRequest', 'openan/kernel', 106, 'dev-gamma', 1003, '2026-06-30T23:59:59Z', 4, 80),
  EV('pullRequest', 'openan/core', 107, 'dep-bot', 0, '2026-07-18T00:00:00Z', 1, 5),
  EV('issue', 'openan/core', 108, 'unclaimed-x', 1006, '2026-07-05T00:00:00Z'),
  EV('pullRequest', 'openan/core', 109, 'dev-alpha', 1001, '2026-07-01T00:00:00.000Z', 1, 10),
  EV('pullRequest', 'openan/blog', 110, 'dev-shared', 1005, '2026-07-08T00:00:00Z', 2, 20),
];

const REQUIREMENT_FACTS = [
  { accountId: 'acc-zw', requirementTitle: 'NPU 适配', pageId: '7001', pageTitle: 'Requirement Proposal', release: '26.12.R1', rowIndex: 1 },
  { accountId: 'acc-zw', requirementTitle: '编译加速', pageId: '7001', pageTitle: 'Requirement Proposal', release: '26.12.R1', rowIndex: 2 },
  { accountId: 'acc-lina', requirementTitle: '边缘部署', pageId: '7002', pageTitle: 'Requirement Proposal', release: null, rowIndex: 1 },
  { accountId: 'acc-lina', requirementTitle: '数据面接入', pageId: '7002', pageTitle: 'Requirement Proposal', release: null, rowIndex: 2 },
  { accountId: 'acc-wf', requirementTitle: '文档体系', pageId: '7003', pageTitle: 'Requirement Proposal', release: '27.03.R2', rowIndex: 1 },
];

const BASE_URL = 'https://wiki.example.net';

function makeDataDir(withRequirements = true) {
  const dir = mkdtempSync(join(tmpdir(), 'openan-person-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'persons.json'), JSON.stringify(envelope(PERSONS), null, 2));
  writeFileSync(join(dir, 'identity-claims.json'), JSON.stringify(envelope(CLAIMS), null, 2));
  writeFileSync(join(dir, 'organizations.json'), JSON.stringify(envelope(ORGS), null, 2));
  writeFileSync(join(dir, 'github-accounts.json'), JSON.stringify(envelope(CONTRIBUTORS, 2), null, 2));
  writeFileSync(join(dir, 'confluence-accounts.json'), JSON.stringify(envelope(CONFLUENCE_ACCOUNTS), null, 2));
  writeFileSync(join(dir, 'github-events.json'), JSON.stringify(envelope(EVENTS, 2), null, 2));
  if (withRequirements) {
    writeFileSync(join(dir, 'confluence-requirements.json'), JSON.stringify(envelope(REQUIREMENT_FACTS), null, 2));
  }
  return dir;
}

function makeService(dir, baseUrl = BASE_URL) {
  const repo = (fileName, isValidData, schemaVersion = 1) =>
    new JsonRepository(join(dir, fileName), { fileName, schemaVersion, isValidData });
  const config = { get: (key) => (key === 'confluence.baseUrl' ? baseUrl : undefined) };
  return new PersonInsightService(
    repo('github-events.json', validators.isGithubContributionEventArray, 2),
    repo('github-accounts.json', validators.isContributorArray, 2),
    repo('confluence-accounts.json', validators.isConfluenceAccountArray),
    repo('confluence-requirements.json', validators.isConfluenceRequirementEventArray),
    repo('identity-claims.json', validators.isIdentityClaimArray),
    repo('persons.json', validators.isPersonArray),
    repo('organizations.json', validators.isOrganizationArray),
    config,
  );
}
// ── 场景 1：自然人统一画像（无区间 ≡ 全量）──────────────────────────
async function scenarioContributions() {
  console.log('\n[1] 自然人统一画像：计数恒等 / repos 并集 / 账号分解');
  const svc = makeService(makeDataDir());

  const data = await svc.getPersonContributions({ personId: 'zhang-wei' });
  check('person 原样返回 + orgName', data.person.personId === 'zhang-wei' && data.orgName === 'Huawei', `${data.person.personId}/${data.orgName}`);
  check('自然人生效归属：orgId 非空取档案值（person）', data.effectiveOrgId === 'huawei' && data.orgSource === 'person', `${data.effectiveOrgId}/${data.orgSource}`);

  const m = data.github.metrics;
  check('GitHub 四项计数（13 提交 / 5 PR / 1 Issue / 230 行）', m.commits === 13 && m.pullRequests === 5 && m.issues === 1 && m.linesChanged === 230, JSON.stringify(m));
  check(
    'repos 取并集 = 4（dev-alpha {core,docs} ∪ dev-beta {core,kernel} ∪ dev-shared {blog}；求和会是 5）',
    m.repos === 4 && data.github.repoIds.join(',') === 'openan/blog,openan/core,openan/docs,openan/kernel',
    data.github.repoIds.join(','),
  );
  const breakdown = data.github.repoBreakdown;
  check(
    'repoBreakdown 按 commits 降序（core 8 / docs 3 / blog 2 / kernel 0）',
    breakdown.map((r) => `${r.repoId}:${r.github.commits}`).join(' ') === 'openan/core:8 openan/docs:3 openan/blog:2 openan/kernel:0',
    breakdown.map((r) => `${r.repoId}:${r.github.commits}`).join(' '),
  );
  check('breakdown 不含 repos 字段、commits 合计 ≡ 画像计数', breakdown.every((r) => !('repos' in r.github)) && breakdown.reduce((s, r) => s + r.github.commits, 0) === m.commits, 'identity');
  check('github.updatedAt 取事件文件时间戳', data.github.updatedAt === '2026-09-30T00:00:00.000Z', String(data.github.updatedAt));

  const cf = data.confluence;
  check('Confluence 恒全历史 ≡ acc-zw（2 需求 / 1 议题 / 0 编辑）', cf.metrics.requirements === 2 && cf.metrics.topicShares === 1 && cf.metrics.edits === 0, JSON.stringify(cf.metrics));
  check('confluence.updatedAt 取名下账号最新', cf.updatedAt === '2026-09-01T00:00:00Z', String(cf.updatedAt));

  const accounts = data.accounts;
  check('账号分解 4 条（3 GitHub + 1 Confluence）', accounts.length === 4 && accounts.filter((a) => a.source === 'github').length === 3, `len=${accounts.length}`);
  check(
    'GitHub 账号按 commits 降序（alpha 9 / beta 2 / shared 2，并列按 PR→Issue→键）',
    accounts.slice(0, 3).map((a) => a.accountKey).join(',') === 'dev-alpha,dev-beta,dev-shared',
    accounts.map((a) => a.accountKey).join(','),
  );
  const alpha = accounts[0];
  check(
    '账号条目：认领优先 + bot 徽标 + 跨来源归属展示',
    alpha.effectiveOrgId === 'huawei' && alpha.orgSource === 'claim' && alpha.isBot === false &&
      alpha.displayName === 'Dev Alpha' && alpha.avatarUrl === 'https://example.com/a.png' &&
      alpha.github.commits === 9 && Array.isArray(alpha.github.repoIds),
    JSON.stringify({ org: alpha.effectiveOrgId, src: alpha.orgSource, bot: alpha.isBot }),
  );
  const zw = accounts[3];
  check(
    'Confluence 账号条目（source/生效归属 claim/恒全历史指标）',
    zw.source === 'confluence' && zw.accountKey === 'acc-zw' && zw.effectiveOrgId === 'huawei' &&
      zw.orgSource === 'claim' && zw.confluence.requirements === 2 && zw.isBot === false && !('github' in zw),
    JSON.stringify({ src: zw.source, org: zw.effectiveOrgId }),
  );
  check(
    '恒等式：Σ 账号分解 ≡ 画像四项计数（commits/PRs/issues/lines 逐维）',
    [ ['commits', 13], ['pullRequests', 5], ['issues', 1], ['linesChanged', 230] ].every(
      ([dim, total]) => accounts.reduce((s, a) => s + (a.github?.[dim] ?? 0), 0) === total,
    ),
    'sum(accounts) === metrics',
  );

  await expectCode('自然人不存在 → 40403', () => svc.getPersonContributions({ personId: 'ghost' }), CODE.PERSON_NOT_FOUND);
}

// ── 场景 2：区间口径（ADR-0018 半开）────────────────────────────────
async function scenarioRange() {
  console.log('\n[2] 区间切片：半开边界 / 区间内 repos 并集 / 缺省 ≡ 全量');
  const svc = makeService(makeDataDir());

  const july = await svc.getPersonContributions({ personId: 'zhang-wei', from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' });
  const m = july.github.metrics;
  check('区间 [7-01, 8-01)：10 提交 / 4 PR / 1 Issue / 170 行', m.commits === 10 && m.pullRequests === 4 && m.issues === 1 && m.linesChanged === 170, JSON.stringify(m));
  check(
    '半开下界含上界不含：ts==from 的 #109 计入（含 core），ts==to 的 #102 不计（docs 消失）',
    m.repos === 3 && july.github.repoIds.join(',') === 'openan/blog,openan/core,openan/kernel',
    july.github.repoIds.join(','),
  );
  check('区间内 repos 仍是并集（3；求和会是 4）', m.repos === 3, `repos=${m.repos}`);

  const all = await svc.getPersonContributions({ personId: 'zhang-wei' });
  check('不带区间 ≡ 全量（与场景 1 恒等）', all.github.metrics.commits === 13 && all.github.metrics.repos === 4, `commits=${all.github.metrics.commits}`);

  const inverted = new dtos.PersonContributionsQueryDto();
  inverted.from = '2026-08-01T00:00:00Z';
  inverted.to = '2026-07-01T00:00:00Z';
  check('from > to → 40002（DTO assertRange）', codeOf(() => inverted.assertRange()) === CODE.INVALID_DATE_RANGE, String(codeOf(() => inverted.assertRange())));
}

// ── 场景 3：多认领 many-to-many ──────────────────────────────────────
async function scenarioMultiClaim() {
  console.log('\n[3] 多认领：画像取首条认领边 / 候选池全列');
  const svc = makeService(makeDataDir());

  const zw = await svc.getPersonContributions({ personId: 'zhang-wei' });
  check('dev-shared 计入首条认领人 zhang-wei（commits 13 含其 2）', zw.github.metrics.commits === 13 && zw.accounts.some((a) => a.accountKey === 'dev-shared'), 'first-claim');

  const ln = await svc.getPersonContributions({ personId: 'li-na' });
  check('li-na 画像只含 dev-gamma（dev-shared 不重复计入）', ln.accounts.length === 2 && ln.accounts.every((a) => a.accountKey !== 'dev-shared'), ln.accounts.map((a) => a.accountKey).join(','));
  check('li-na GitHub 计数 ≡ dev-gamma（4 提交 / 1 PR / 1 Issue / 80 行）', ln.github.metrics.commits === 4 && ln.github.metrics.pullRequests === 1 && ln.github.metrics.issues === 1 && ln.github.metrics.linesChanged === 80, JSON.stringify(ln.github.metrics));
  check('li-na repos 并集 {kernel,docs}（#106 在 from 前仍属全量口径）', ln.github.repoIds.join(',') === 'openan/docs,openan/kernel', ln.github.repoIds.join(','));
}

// ── 场景 4：组织兜底与空画像 ──────────────────────────────────────────
async function scenarioOrgFallback() {
  console.log('\n[4] 组织兜底（orgSource=account）/ 空画像 / Confluence-only');
  const svc = makeService(makeDataDir());

  const ln = await svc.getPersonContributions({ personId: 'li-na' });
  check('person.orgId 为空 → effectiveOrgId=unattributed、orgSource=account、orgName=null', ln.effectiveOrgId === 'unattributed' && ln.orgSource === 'account' && ln.orgName === null, `${ln.effectiveOrgId}/${ln.orgSource}`);
  check('名下账号仍各自展示生效归属（dev-gamma 认领自无归属人 → 回落 unattributed）', ln.accounts.every((a) => a.effectiveOrgId === 'unattributed'), ln.accounts.map((a) => `${a.accountKey}:${a.effectiveOrgId}`).join(' '));

  const solo = await svc.getPersonContributions({ personId: 'solo-chen' });
  check('零贡献自然人：四项全 0、repoIds 空、accounts 空', solo.github.metrics.commits === 0 && solo.github.metrics.repos === 0 && solo.github.repoIds.length === 0 && solo.accounts.length === 0, JSON.stringify(solo.github.metrics));
  check('零贡献自然人：github/confluence updatedAt 均为 null（不伪造时间）', solo.github.updatedAt === null && solo.confluence.updatedAt === null, `${solo.github.updatedAt}/${solo.confluence.updatedAt}`);
  check('零贡献自然人：org 兜底同样生效', solo.effectiveOrgId === 'unattributed' && solo.orgSource === 'account', `${solo.effectiveOrgId}/${solo.orgSource}`);

  const wf = await svc.getPersonContributions({ personId: 'wang-fang' });
  check('Confluence-only 自然人：GitHub 全 0 且 updatedAt=null', wf.github.metrics.commits === 0 && wf.github.updatedAt === null, JSON.stringify(wf.github));
  check('Confluence-only 自然人：指标 ≡ acc-wf（1 需求 / 2 议题 / 1 编辑）', wf.confluence.metrics.requirements === 1 && wf.confluence.metrics.topicShares === 2 && wf.confluence.metrics.edits === 1, JSON.stringify(wf.confluence.metrics));
  check('Confluence-only 自然人：accounts 只有 1 条 Confluence 条目', wf.accounts.length === 1 && wf.accounts[0].source === 'confluence' && wf.accounts[0].accountKey === 'acc-wf', wf.accounts.map((a) => a.accountKey).join(','));
}
// ── 场景 5：GitHub 事件明细端点 ──────────────────────────────────────
async function scenarioGithubEvents() {
  console.log('\n[5] person-github-events：排序 / 半开 / 截断 / 双键 / URL / 守卫');
  const svc = makeService(makeDataDir());

  const full = await svc.getPersonGithubEvents({ personId: 'zhang-wei' });
  check('无区间 personId 模式命中 6 条（3 账号并集，去重天然）', full.total === 6 && full.events.length === 6 && full.truncated === false, `total=${full.total}`);

  const limited = await svc.getPersonGithubEvents({ personId: 'zhang-wei', limit: 3 });
  check('limit=3 → truncated=true、total 仍 6、只取前 3 条', limited.truncated === true && limited.total === 6 && limited.events.length === 3, `total=${limited.total} truncated=${limited.truncated}`);
  check(
    '事件按时间倒序：#2(8-01) → #4(7-25) → #3(7-20)',
    limited.events.map((e) => e.number).join(',') === '102,104,103',
    limited.events.map((e) => `${e.repository}#${e.number}`).join(' '),
  );
  check(
    'URL 读时派生：PR → /pull/、Issue → /issues/',
    limited.events.map((e) => e.url).join(' | ') ===
      'https://github.com/openan/docs/pull/102 | https://github.com/openan/kernel/issues/104 | https://github.com/openan/core/pull/103',
    limited.events.map((e) => e.url).join(' | '),
  );

  const july = await svc.getPersonGithubEvents({ personId: 'zhang-wei', from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' });
  check('半开区间 total=5：含 ts==from 的 #109、排除 ts==to 的 #102', july.total === 5 && july.events.some((e) => e.number === 109) && !july.events.some((e) => e.number === 102), `total=${july.total}`);

  const byLogin = await svc.getPersonGithubEvents({ account: 'dev-alpha' });
  check('account=登录名模式：total=3（#101/#102/#109）', byLogin.total === 3, `total=${byLogin.total}`);
  const byGithubId = await svc.getPersonGithubEvents({ account: '1001' });
  check('account=githubId 字符串（双键）：total=3，与登录名一致', byGithubId.total === 3 && byGithubId.events.length === 3, `total=${byGithubId.total}`);
  const mixed = await svc.getPersonGithubEvents({ account: 'openan' });
  check('account 命中登录名子串也按前缀归一（不跨账号误伤）', mixed.total === 0, `total=${mixed.total}`);

  const ghostAccount = await svc.getPersonGithubEvents({ account: 'ghost' });
  check('account 模式不做人物存在性检查（无 40403）', ghostAccount.total === 0 && ghostAccount.events.length === 0, `total=${ghostAccount.total}`);

  const both = new dtos.PersonGithubEventsQueryDto();
  both.personId = 'zhang-wei';
  both.account = 'dev-alpha';
  check('personId + account 同传 → 40001（二选一）', codeOf(() => both.assertValid()) === CODE.VALIDATION_FAILED, String(codeOf(() => both.assertValid())));
  const neither = new dtos.PersonGithubEventsQueryDto();
  check('personId / account 都不传 → 40001', codeOf(() => neither.assertValid()) === CODE.VALIDATION_FAILED, String(codeOf(() => neither.assertValid())));
  const inverted = new dtos.PersonGithubEventsQueryDto();
  inverted.personId = 'zhang-wei';
  inverted.from = '2026-08-01T00:00:00Z';
  inverted.to = '2026-07-01T00:00:00Z';
  check('from > to → 40002', codeOf(() => inverted.assertValid()) === CODE.INVALID_DATE_RANGE, String(codeOf(() => inverted.assertValid())));

  await expectCode('personId=ghost → 40403', () => svc.getPersonGithubEvents({ personId: 'ghost' }), CODE.PERSON_NOT_FOUND);
}

// ── 场景 6：Confluence 需求级事实明细端点 ────────────────────────────
async function scenarioConfluenceRequirements() {
  console.log('\n[6] person-confluence-requirements：事实明细 / URL / 缺失降级');
  const svc = makeService(makeDataDir());

  const zw = await svc.getPersonConfluenceRequirements({ personId: 'zhang-wei' });
  check('zhang-wei → acc-zw 的 2 条事实（恒全历史，无区间参数）', zw.total === 2 && zw.requirements.length === 2, `total=${zw.total}`);
  const f1 = zw.requirements[0];
  check(
    '事实字段完整：标题/页/行号/Release 原样/展示名',
    f1.requirementTitle === 'NPU 适配' && f1.pageId === '7001' && f1.pageTitle === 'Requirement Proposal' && f1.release === '26.12.R1' && f1.rowIndex === 1 && f1.displayName === 'ZW',
    JSON.stringify(f1),
  );
  check(
    'URL 读时派生：baseUrl + wiki/pages/viewpage.action?pageId=',
    zw.requirements.every((f) => f.url === `${BASE_URL}/wiki/pages/viewpage.action?pageId=${f.pageId}`),
    f1.url,
  );
  check('恒等式：人物事实条数 ≡ 名下账号 requirements 指标（2 ≡ 2）', zw.total === 2 && zw.requirements.every((f) => f.accountId === 'acc-zw'), 'identity');

  const lina = await svc.getPersonConfluenceRequirements({ account: 'acc-lina' });
  check('account 模式：release=null 原样保留（「无 Release」仍可核对）', lina.total === 2 && lina.requirements.every((f) => f.release === null), `total=${lina.total}`);

  const upper = await svc.getPersonConfluenceRequirements({ account: 'ACC-ZW' });
  check('account 大小写归一（ACCOUNT_KEY_RE）→ total=2', upper.total === 2, `total=${upper.total}`);

  const wf = await svc.getPersonConfluenceRequirements({ personId: 'wang-fang' });
  check('wang-fang → 1 条（acc-wf 的 27.03.R2）', wf.total === 1 && wf.requirements[0].release === '27.03.R2', `total=${wf.total}`);

  await expectCode('personId=ghost → 40403', () => svc.getPersonConfluenceRequirements({ personId: 'ghost' }), CODE.PERSON_NOT_FOUND);

  const bare = makeService(makeDataDir(), '');
  const noBase = await bare.getPersonConfluenceRequirements({ account: 'acc-zw' });
  check('baseUrl 未配置 → url 降级为空串（不拼错链）', noBase.total === 2 && noBase.requirements.every((f) => f.url === ''), 'empty url');

  const degraded = makeService(makeDataDir(false));
  const missing = await degraded.getPersonConfluenceRequirements({ personId: 'zhang-wei' });
  check('需求事实文件缺失 → 待采集降级：空列表 + updatedAt=null + 不抛错', missing.total === 0 && missing.requirements.length === 0 && missing.updatedAt === null, `total=${missing.total}`);
}

// ── 场景 7：候选池端点 ────────────────────────────────────────────────
async function scenarioCandidates() {
  console.log('\n[7] person-candidates：只列有贡献 / 多认领全列 / bot 徽标');
  const svc = makeService(makeDataDir());

  const data = await svc.getPersonCandidates();
  check('updatedAt 取事件文件时间戳', data.updatedAt === '2026-09-30T00:00:00.000Z', String(data.updatedAt));

  check('自然人候选 3 人：solo-chen 零贡献被排除', data.persons.length === 3 && !data.persons.some((p) => p.personId === 'solo-chen'), data.persons.map((p) => p.personId).join(','));
  const zw = data.persons.find((p) => p.personId === 'zhang-wei');
  check('自然人候选条目：双来源贡献 + 档案头像', zw.github === true && zw.confluence === true && zw.avatarUrl === 'https://example.com/zw.png', JSON.stringify(zw));
  const ln = data.persons.find((p) => p.personId === 'li-na');
  check('li-na 候选：双来源 true（githubId 认领边解析回 login 后命中）', ln.github === true && ln.confluence === true, JSON.stringify(ln));
  const wf = data.persons.find((p) => p.personId === 'wang-fang');
  check('Confluence-only 自然人：github=false / confluence=true', wf.github === false && wf.confluence === true, JSON.stringify(wf));

  check('GitHub 账号候选 6 条（含 bot 与未认领）', data.githubAccounts.length === 6, `len=${data.githubAccounts.length}`);
  const shared = data.githubAccounts.find((a) => a.accountKey === 'dev-shared');
  check('多认领账号「所属自然人」全列（zhang-wei, li-na）', shared.persons.map((p) => p.personId).join(',') === 'zhang-wei,li-na', shared.persons.map((p) => p.personId).join(','));
  const alpha = data.githubAccounts.find((a) => a.accountKey === 'dev-alpha');
  check('单认领账号 persons 单元素（含展示名）', alpha.persons.length === 1 && alpha.persons[0].personId === 'zhang-wei' && alpha.persons[0].displayName === '张伟', alpha.persons.map((p) => p.personId).join(','));
  const bot = data.githubAccounts.find((a) => a.accountKey === 'dep-bot');
  check('bot 徽标（githubId=0 → isBot=true）', bot !== undefined && bot.isBot === true, `isBot=${bot?.isBot}`);
  const unclaimed = data.githubAccounts.find((a) => a.accountKey === 'unclaimed-x');
  check('未认领账号 persons 为空数组', Array.isArray(unclaimed.persons) && unclaimed.persons.length === 0, `persons=${unclaimed.persons.length}`);

  check('Confluence 账号候选 3 条，认领关系正确', data.confluenceAccounts.length === 3 && data.confluenceAccounts.find((a) => a.accountKey === 'acc-zw').persons[0].personId === 'zhang-wei', data.confluenceAccounts.map((a) => a.accountKey).join(','));
}

// ── 运行 ──────────────────────────────────────────────────────────────
const startedAt = Date.now();
await scenarioContributions();
await scenarioRange();
await scenarioMultiClaim();
await scenarioOrgFallback();
await scenarioGithubEvents();
await scenarioConfluenceRequirements();
await scenarioCandidates();

for (const dir of tempDirs) {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n[person-check] ${passed} 通过 / ${failed} 失败（耗时 ${Date.now() - startedAt}ms）`);
if (failed > 0 || passed === 0) {
  process.exitCode = 1;
}
