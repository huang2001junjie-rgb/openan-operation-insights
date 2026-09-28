/**
 * 接口冒烟脚本：逐个请求核心端点并校验响应信封。
 * 用法：先启动服务（npm run dev:api），再执行 npm run smoke -w @openan/api
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3000/api';

const cases = [
  { name: '首页汇总', path: '/home/summary', expect: (d) => d.partnerCount && 'nextSummit' in d },
  { name: '贡献组织卡片', path: '/organizations?scope=contributing', expect: (d) => Array.isArray(d) },
  { name: '贡献明细', path: '/contributions?sortBy=pullRequests&order=desc&limit=5', expect: (d) => Array.isArray(d) },
  { name: '个人贡献明细', path: '/contributor-contributions?sortBy=commits&order=desc&limit=5', expect: (d) => Array.isArray(d) },
  { name: '个人贡献组织筛选', path: '/contributor-contributions?orgIds=huawei&sortBy=commits&order=desc', expect: (d) => Array.isArray(d) },
  { name: '汇总指标', path: '/contributions/summary', expect: (d) => typeof d.totals?.pullRequests === 'number' },
  { name: 'wiki 成果明细', path: '/wiki?sortBy=requirements&order=desc&limit=5', expect: (d) => Array.isArray(d) },
  { name: '账号级 Confluence 明细', path: '/confluence-accounts?sortBy=requirements&order=desc&limit=5', expect: (d) => Array.isArray(d) },
  { name: '账号级 Confluence 组织筛选', path: '/confluence-accounts?orgIds=unattributed&sortBy=requirements', expect: (d) => Array.isArray(d) },
  { name: '峰会列表', path: '/summits?includeDetail=false&page=1&pageSize=10', expect: (d) => Array.isArray(d.items) },
  { name: '峰会详情', path: '/summits/one-summit-2026', expect: (d) => d.id === 'one-summit-2026' },
  { name: '峰会不存在→40402', path: '/summits/not-exist', expectError: 40402 },
  { name: '例会参会矩阵', path: '/meetings', expect: (d) => Array.isArray(d.columns) && Array.isArray(d.rows) },
  { name: '非法排序字段→40001', path: '/contributions?sortBy=oops', expectError: 40001 },
  { name: '账号级非法排序字段→40001', path: '/confluence-accounts?sortBy=oops', expectError: 40001 },
  { name: '非法年份→40003', path: '/summits?year=1999', expectError: 40003 },
  // 注：ListPersonsQueryDto（04 §5.3.10）仅支持 keyword / orgId，不含 status；原用例的 `?status=all` 会被 40001 拒绝
  { name: '自然人列表', path: '/identity/persons', expect: (d) => Array.isArray(d) },
  { name: '认领边列表', path: '/identity/claims', expect: (d) => Array.isArray(d) },
  {
    name: '候选池',
    path: '/identity/candidates',
    expect: (d) => Array.isArray(d.github) && Array.isArray(d.meeting) && Array.isArray(d.warnings),
  },
  {
    name: '组织花名册',
    path: '/identity/org-roster',
    expect: (d) => Array.isArray(d.organizations) && Array.isArray(d.unassigned),
  },
  // 写接口未带令牌：已配置 → 40101；未配置 → 40301（两者均可接受）
  { name: '写接口缺令牌', path: '/identity/persons', method: 'POST', body: { displayName: 'smoke' }, expectErrorIn: [40101, 40301] },
];

let failed = 0;

for (const testCase of cases) {
  const url = `${BASE}${testCase.path}`;
  try {
    const init = { method: testCase.method ?? 'GET' };
    if (testCase.body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(testCase.body);
    }
    const response = await fetch(url, init);
    const body = await response.json();

    const expectedCodes = testCase.expectErrorIn ?? (testCase.expectError !== undefined ? [testCase.expectError] : null);
    if (expectedCodes) {
      const ok = expectedCodes.includes(body.code);
      ok ? pass(testCase.name, `code=${body.code}`) : fail(testCase.name, `期望 code∈${expectedCodes}，实际 ${JSON.stringify(body)}`);
      continue;
    }

    const ok = body.code === 0 && testCase.expect(body.data);
    ok ? pass(testCase.name, `HTTP ${response.status}`) : fail(testCase.name, JSON.stringify(body).slice(0, 240));
  } catch (error) {
    fail(testCase.name, error.message);
  }
}

console.log(`\n冒烟结果：${cases.length - failed}/${cases.length} 通过`);
// 用 exitCode 而非 process.exit()：后者在 Windows + Node 20 下会在异步句柄关闭时
// 触发 libuv 断言崩溃（退出码 0xC0000409），使「全通过」被误报为失败。
process.exitCode = failed === 0 ? 0 : 1;

function pass(name, detail) {
  console.log(`  PASS  ${name}  (${detail})`);
}

function fail(name, detail) {
  failed += 1;
  console.error(`  FAIL  ${name}  → ${detail}`);
}
