/**
 * 身份匹配控制台端到端校验（离线，无需启动服务）。
 *
 * 用法：
 *   npm run build -w @openan/api
 *   npm run identity:check -w @openan/api
 *
 * 原理：把**合成种子数据**写入系统临时目录，直接用编译产物（dist）实例化
 * JsonRepository 与三个 Service，断言 slug 生成 / 跨文件顺序 / 删除级联 /
 * 候选池降级 / 组织花名册派生 / 令牌守卫等不变量。仓库 data/ 不被触碰。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = resolve(fileURLToPath(import.meta.url), '..');
const dist = resolve(scriptDir, '../dist');

const { JsonRepository } = await import(pathTo('repositories/json-repository.js'));
const validators = await import(pathTo('repositories/validators.js'));
const { PersonService } = await import(pathTo('modules/identity/person.service.js'));
const { CandidateService } = await import(pathTo('modules/identity/candidate.service.js'));
const { OrgRosterService } = await import(pathTo('modules/identity/org-roster.service.js'));
const { IdentityAuditService } = await import(pathTo('modules/identity/identity-audit.service.js'));
const { AdminTokenGuard } = await import(pathTo('common/guards/admin-token.guard.js'));

function pathTo(rel) {
  return new URL(`file://${join(dist, rel).replace(/\\/g, '/')}`).href;
}

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

function envelope(data) {
  return { schemaVersion: 1, updatedAt: new Date().toISOString(), data };
}

function makeRepo(dir, fileName, isValidData) {
  return new JsonRepository(join(dir, fileName), { fileName, schemaVersion: 1, isValidData });
}

function makeRepos(dir, seed) {
  return {
    persons: makeRepo(dir, 'persons.json', validators.isPersonArray),
    claims: makeRepo(dir, 'identity-claims.json', validators.isIdentityClaimArray),
    organizations: makeRepo(dir, 'organizations.json', validators.isOrganizationArray),
    contributors: makeRepo(dir, 'github-accounts.json', validators.isContributorArray),
    wiki: makeRepo(dir, 'confluence-organizations.json', validators.isWikiArray),
    meetings: makeRepo(dir, 'meetings.json', validators.isMeetingAttendanceMatrix),
    seed,
  };
}

const ORGS = [
  { orgId: 'huawei', name: 'Huawei', logoUrl: '', homepageUrl: '', type: 'partner', tags: [] },
  { orgId: 'orange', name: 'Orange', logoUrl: '', homepageUrl: '', type: 'partner', tags: [] },
  { orgId: 'unattributed', name: '独立开发者', logoUrl: '', homepageUrl: '', type: 'individual', tags: [] },
];
const CONTRIBUTORS = [
  { contributorId: 'chuanyuchen', githubId: 22441124, name: 'Chuanyu Chen', orgId: 'huawei', avatarUrl: 'https://example.com/a.png' },
  { contributorId: 'cnafan', githubId: 9312901, name: 'cnafan', orgId: null },
];
const MEETINGS = { columns: ['张三', '张三', 'Chuanyu Chen'], rows: [{ date: '2026-06-09', attendance: [true, false, true] }] };

function makeDataDir(withSources = true) {
  const dir = mkdtempSync(join(tmpdir(), 'openan-identity-'));
  tempDirs.push(dir);
  writeFileSync(join(dir, 'persons.json'), JSON.stringify(envelope([]), null, 2));
  writeFileSync(join(dir, 'identity-claims.json'), JSON.stringify(envelope([]), null, 2));
  writeFileSync(join(dir, 'organizations.json'), JSON.stringify(envelope(ORGS), null, 2));
  if (withSources) {
    writeFileSync(join(dir, 'github-accounts.json'), JSON.stringify(envelope(CONTRIBUTORS), null, 2));
    writeFileSync(join(dir, 'confluence-organizations.json'), JSON.stringify(envelope([]), null, 2));
    writeFileSync(join(dir, 'meetings.json'), JSON.stringify(envelope(MEETINGS), null, 2));
  }
  return dir;
}

function makePersonService(repos) {
  const audit = new IdentityAuditService({ getOrThrow: () => repos.dir });
  return new PersonService(repos.persons, repos.claims, repos.organizations, audit);
}

async function expectCode(label, fn, code) {
  try {
    await fn();
    check(label, false, `期望抛出 ${code}，实际成功`);
  } catch (error) {
    check(label, error?.code === code, `code=${error?.code}`);
  }
}

// ── 场景 1：自然人 CRUD 与 slug ─────────────────────────────────────
async function scenarioPersons() {
  console.log('\n[1] 自然人 CRUD / slug / 归属');
  const dir = makeDataDir();
  const repos = makeRepos(dir);
  repos.dir = dir;
  const svc = makePersonService(repos);

  const alice = await svc.createPerson({ displayName: 'Alice Wang' });
  check('创建自然人生成 slug', alice.personId === 'alice-wang' && alice.orgId === null, alice.personId);

  const alice2 = await svc.createPerson({ displayName: 'Alice Wang' });
  check('重名追加序号', alice2.personId === 'alice-wang-2', alice2.personId);

  const zhangsan = await svc.createPerson({ displayName: '张三' });
  check('非 ASCII 退化为 person', zhangsan.personId === 'person', zhangsan.personId);

  await expectCode('归属伪组织 → 40004', () => svc.updatePerson(alice.personId, { orgId: 'unattributed' }), 40004);
  await expectCode('归属不存在组织 → 40401', () => svc.updatePerson(alice.personId, { orgId: 'nope' }), 40401);
  await expectCode('空更新 → 40000', () => svc.updatePerson(alice.personId, {}), 40000);

  const assigned = await svc.updatePerson(alice.personId, { orgId: 'huawei' });
  check('设置归属', assigned.orgId === 'huawei', String(assigned.orgId));
  const renamed = await svc.updatePerson(alice.personId, { displayName: 'Alice W.' });
  check('重命名保留归属', renamed.displayName === 'Alice W.' && renamed.orgId === 'huawei', renamed.displayName);

  const list = await svc.listPersons({});
  check('列表返回 3 人', list.length === 3, `len=${list.length}`);
  const unassignedList = await svc.listPersons({ orgId: 'none' });
  check('orgId=none 只取未归属', unassignedList.every((p) => p.orgId === null), `len=${unassignedList.length}`);
}

// ── 场景 2：认领 / 解除 / 物理删除级联 ─────────────────────────────────
async function scenarioClaims() {
  console.log('\n[2] 认领 / 解除 / 物理删除级联 / 跨文件顺序');
  const dir = makeDataDir();
  const repos = makeRepos(dir);
  repos.dir = dir;
  const svc = makePersonService(repos);

  const person = await svc.createPerson({ displayName: 'Chuanyu Chen' });
  const claim = await svc.createClaim({ personId: person.personId, source: 'github', accountKey: '22441124', displayName: 'Chuanyu Chen' });
  check('认领成功', claim.claimId.startsWith('clm_') && claim.personId === person.personId, claim.claimId);

  await expectCode('重复认领 → 40901', () => svc.createClaim({ personId: person.personId, source: 'github', accountKey: '22441124' }), 40901);
  await expectCode('认领不存在的人 → 40403', () => svc.createClaim({ personId: 'ghost', source: 'meeting', accountKey: 'x' }), 40403);

  const withCount = await svc.listPersons({});
  check('claimCount 派生', withCount.find((p) => p.personId === person.personId)?.claimCount === 1, 'count=1');

  // 物理删除：先删边、后删点（不可逆，仅限误建/重复提取）
  const removed = await svc.deletePerson(person.personId);
  check('物理删除级联解除 1 条边', removed.removedClaims === 1, JSON.stringify(removed));
  const claimsNow = JSON.parse(readFileSync(join(dir, 'identity-claims.json'), 'utf8'));
  check('认领边文件已清空', claimsNow.data.length === 0, `len=${claimsNow.data.length}`);
  const personsNow = JSON.parse(readFileSync(join(dir, 'persons.json'), 'utf8'));
  check('自然人已物理移除', !personsNow.data.some((p) => p.personId === person.personId), 'removed');

  await expectCode('删除不存在的人 → 40403', () => svc.deletePerson('ghost'), 40403);
  await expectCode('删除不存在的边 → 40404', () => svc.deleteClaim('clm_none'), 40404);

  const auditLines = readFileSync(join(dir, '.identity-audit.jsonl'), 'utf8').trim().split('\n');
  check('审计流水已追加', auditLines.length > 0 && JSON.parse(auditLines[0]).action === 'person.create', `lines=${auditLines.length}`);
}

// ── 场景 3：候选池派生与降级 ───────────────────────────────────────
async function scenarioCandidates() {
  console.log('\n[3] 候选池派生 / 去重 / 降级');
  const dir = makeDataDir();
  const repos = makeRepos(dir);
  repos.dir = dir;
  const personSvc = makePersonService(repos);
  const cand = new CandidateService(repos.contributors, repos.wiki, repos.meetings, repos.persons, repos.claims);

  const person = await personSvc.createPerson({ displayName: 'Chuanyu Chen' });
  await personSvc.createClaim({ personId: person.personId, source: 'github', accountKey: '22441124' });

  const data = await cand.getCandidates();
  check('github 候选 2 条', data.github.length === 2, `len=${data.github.length}`);
  check('meeting 去重后 2 条', data.meeting.length === 2, `len=${data.meeting.length}`);
  check('confluence 当前为空且有告警', data.confluence.length === 0 && data.warnings.some((w) => w.includes('confluence')), JSON.stringify(data.warnings));
  const claimed = data.github.find((c) => c.accountKey === '22441124');
  check('claimedBy 关联到自然人', claimed?.claimedBy?.[0]?.personId === person.personId, JSON.stringify(claimed?.claimedBy));
  const unclaimed = data.github.find((c) => c.accountKey === '9312901');
  check('未认领项 claimedBy 为空', Array.isArray(unclaimed?.claimedBy) && unclaimed.claimedBy.length === 0, 'empty');

  // 降级：来源文件缺失
  const degradedDir = makeDataDir(false);
  const degradedRepos = makeRepos(degradedDir);
  degradedRepos.dir = degradedDir;
  const degraded = new CandidateService(
    degradedRepos.contributors,
    degradedRepos.wiki,
    degradedRepos.meetings,
    degradedRepos.persons,
    degradedRepos.claims,
  );
  const degradedData = await degraded.getCandidates();
  check(
    '来源缺失降级为空且不抛错',
    degradedData.github.length === 0 && degradedData.meeting.length === 0 && degradedData.warnings.length >= 2,
    JSON.stringify(degradedData.warnings),
  );
}

// ── 场景 4：组织花名册派生 ─────────────────────────────────────────
async function scenarioRoster() {
  console.log('\n[4] 组织花名册派生 / 伪组织排除');
  const dir = makeDataDir();
  const repos = makeRepos(dir);
  repos.dir = dir;
  const svc = makePersonService(repos);
  const roster = new OrgRosterService(repos.persons, repos.organizations);

  const a = await svc.createPerson({ displayName: 'A User' });
  const b = await svc.createPerson({ displayName: 'B User' });
  const c = await svc.createPerson({ displayName: 'C User' });
  await svc.updatePerson(a.personId, { orgId: 'huawei' });
  await svc.updatePerson(b.personId, { orgId: 'huawei' });
  await svc.updatePerson(c.personId, { orgId: 'orange' });
  await svc.updatePerson(a.personId, { orgId: null });

  const data = await roster.getRoster();
  check('伪组织被排除', !data.organizations.some((e) => e.organization.orgId === 'unattributed'), `orgs=${data.organizations.length}`);
  const huawei = data.organizations.find((e) => e.organization.orgId === 'huawei');
  check('组织成员派生正确', huawei?.memberCount === 1 && huawei.members[0].personId === b.personId, JSON.stringify(huawei?.members));
  check(
    '未归属分组正确',
    data.unassigned.length === 1 && data.unassigned[0].personId === a.personId,
    JSON.stringify(data.unassigned),
  );
}

// ── 场景 5：令牌守卫 ───────────────────────────────────────────────
function scenarioGuard() {
  console.log('\n[5] AdminTokenGuard');
  const ctx = (headers) => ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) });

  const disabled = new AdminTokenGuard({ get: () => '' });
  check('未配置令牌 → 40301', codeOf(() => disabled.canActivate(ctx({ 'x-admin-token': 'x' }))) === 40301);

  const enabled = new AdminTokenGuard({ get: (key) => (key === 'adminToken' ? 'secret-token' : undefined) });
  check('缺少令牌 → 40101', codeOf(() => enabled.canActivate(ctx({}))) === 40101);
  check('令牌错误 → 40102', codeOf(() => enabled.canActivate(ctx({ 'x-admin-token': 'wrong' }))) === 40102);
  check('令牌正确 → 放行', enabled.canActivate(ctx({ 'x-admin-token': 'secret-token' })) === true);
}

function codeOf(fn) {
  try {
    fn();
    return 0;
  } catch (error) {
    return error?.code;
  }
}

// ── 主流程 ─────────────────────────────────────────────────────────
try {
  if (!existsSync(dist)) throw new Error('未找到 dist，请先执行 npm run build -w @openan/api');
  await scenarioPersons();
  await scenarioClaims();
  await scenarioCandidates();
  await scenarioRoster();
  scenarioGuard();
} catch (error) {
  failed += 1;
  console.error(`\n未捕获异常：${error?.stack ?? error}`);
} finally {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
}

console.log(`\n身份匹配校验结果：${passed}/${passed + failed} 通过`);
process.exit(failed === 0 ? 0 : 1);
