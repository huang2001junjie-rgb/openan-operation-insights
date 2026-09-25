/**
 * Confluence 只读探测脚本（第 1 步：摸清"能请求到什么数据"）。
 *
 * 只读（除第 15 节的 users-bulk 是 POST 查询外全部为 GET），
 * 不写任何数据文件、不做增量游标、不参与采集流水线。
 * 用法： node scripts/confluence-probe.mjs [spaceKey]
 * 凭证：读取 apps/api/.env 的 CONFLUENCE_BASE_URL / CONFLUENCE_TOKEN / CONFLUENCE_SPACES
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = readFileSync(resolve(here, '../.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env 缺失时退回进程环境变量 */
  }
  return env;
}

const env = loadEnv();
const base = (env.CONFLUENCE_BASE_URL ?? '').replace(/\/+$/, '');
const token = env.CONFLUENCE_TOKEN ?? '';
const space = process.argv[2] ?? (env.CONFLUENCE_SPACES ?? '').split(',')[0].trim();

if (!base || !token || !space) {
  console.error('缺少 CONFLUENCE_BASE_URL / CONFLUENCE_TOKEN / space key');
  process.exit(1);
}

const api = async (path) => {
  const res = await fetch(`${base}/wiki${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ← ${path}`);
  return res.json();
};

/** 分页拉取 CQL 结果（v1 search，_links.next 游标） */
async function searchAll(cql, expand, pageSize = 100) {
  const out = [];
  let path = `/rest/api/content/search?cql=${encodeURIComponent(cql)}&limit=${pageSize}&expand=${expand}`;
  let guard = 0;
  while (path && guard++ < 100) {
    const body = await api(path);
    out.push(...(body.results ?? []));
    const next = body._links?.next;
    path = next ? next.replace(/^\/wiki/, '') : null;
    process.stderr.write(`\r  已拉取 ${out.length} 条…`);
  }
  process.stderr.write('\r');
  return out;
}

const labelsOf = (page) => (page.metadata?.labels?.results ?? []).map((l) => l.name);

function tally(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    for (const key of [].concat(keyFn(item))) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

const fmt = (d) => (d ? String(d).slice(0, 10) : '-');

console.log(`\n=== 1. 空间 ===`);
const sp = await api(`/rest/api/space/${encodeURIComponent(space)}`);
console.log(`key=${sp.key}  name=${sp.name}  type=${sp.type}  status=${sp.status}`);

console.log(`\n=== 2. 全量页面（含标签 / 作者 / 祖先）===`);
const pages = await searchAll(
  `space="${space}" and type=page order by created asc`,
  'version,history,metadata.labels,ancestors',
);
console.log(`页面总数 = ${pages.length}`);
const dates = pages.map((p) => p.history?.createdDate).filter(Boolean).sort();
console.log(`创建时间范围：${fmt(dates[0])} → ${fmt(dates[dates.length - 1])}`);

console.log(`\n=== 3. 创建者分布（页面创建人）===`);
for (const [name, n] of tally(pages, (p) => p.history?.createdBy?.displayName ?? '(unknown)')) {
  console.log(`  ${String(n).padStart(4)}  ${name}`);
}

console.log(`\n=== 4. 最后修改者分布 ===`);
for (const [name, n] of tally(pages, (p) => p.version?.by?.displayName ?? '(unknown)')) {
  console.log(`  ${String(n).padStart(4)}  ${name}`);
}

console.log(`\n=== 5. 标签分布（label）===`);
const labelTally = tally(pages, (p) => labelsOf(p));
if (labelTally.length === 0) console.log('  （无任何标签）');
for (const [name, n] of labelTally) console.log(`  ${String(n).padStart(4)}  ${name}`);

console.log(`\n=== 6. 祖先层级（页面树深度 / 顶层节点）===`);
const topNodes = tally(pages, (p) => {
  const anc = p.ancestors ?? [];
  return anc.length === 0 ? '(无父页)' : anc[0].title;
});
for (const [name, n] of topNodes) console.log(`  ${String(n).padStart(4)}  ${name}`);

console.log(`\n=== 7. 创建者账户明细（尝试取 email；取不到说明权限不足）===`);
const creators = new Map();
for (const p of pages) {
  const c = p.history?.createdBy;
  if (c?.accountId) creators.set(c.accountId, c);
}
for (const [accountId, c] of creators) {
  let email = '(不可见)';
  let type = '?';
  try {
    const u = await api(`/rest/api/user?accountId=${encodeURIComponent(accountId)}`);
    email = u.email ?? email;
    type = u.accountType ?? type;
  } catch (e) {
    email = `(查询失败 ${String(e.message).split(' ')[0]})`;
  }
  console.log(`  ${c.displayName}  accountId=${accountId}  type=${type}  email=${email}`);
}

console.log(`\n=== 8. 标签全集（空间级，含未被页面使用的标签）===`);
try {
  const all = await api(`/rest/api/label?spaceKey=${encodeURIComponent(space)}&limit=200`);
  const names = (all.results ?? []).map((l) => l.name);
  console.log(names.length ? `  ${names.join(', ')}` : '  （空间无标签定义）');
} catch (e) {
  console.log(`  查询失败：${e.message}`);
}

console.log(`\n=== 9. 前 10 条页面样例（标题 | 创建者 | 创建日 | 标签）===`);
for (const p of pages.slice(0, 10)) {
  console.log(
    `  ${p.title} | ${p.history?.createdBy?.displayName ?? '-'} | ${fmt(p.history?.createdDate)} | [${labelsOf(p).join(',')}]`,
  );
}
console.log(`\n=== 10. 全量版本作者（= 编辑贡献，需逐页请求 version 接口）===`);
const editorTally = new Map();
let multiVersion = 0;
for (const p of pages) {
  let versions = [];
  try {
    const body = await api(`/rest/api/content/${p.id}/version?limit=200`);
    versions = body.results ?? [];
  } catch {
    continue;
  }
  if (versions.length > 1) multiVersion += 1;
  for (const v of versions) {
    const n = v.by?.displayName ?? '(unknown)';
    editorTally.set(n, (editorTally.get(n) ?? 0) + 1);
  }
  process.stderr.write(`\r  已扫描 ${pages.indexOf(p) + 1}/${pages.length} 页…`);
}
process.stderr.write('\r');
const sorted = [...editorTally.entries()].sort((a, b) => b[1] - a[1]);
console.log(`有编辑痕迹（版本数 > 1）的页面 = ${multiVersion} / ${pages.length}`);
for (const [name, n] of sorted) console.log(`  ${String(n).padStart(4)}  ${name}`);

console.log(`\n=== 11. 身份字段可得性（能否拿到 LFID / 邮箱 / username / accountId）===`);
const probe = async (label, path) => {
  try {
    const body = await api(path);
    const keys = body && typeof body === 'object' ? Object.keys(body).join(', ') : typeof body;
    console.log(`  [OK ] ${label}\n        keys: ${keys}\n        body: ${JSON.stringify(body).slice(0, 400)}`);
  } catch (e) {
    console.log(`  [FAIL] ${label} → ${e.message}`);
  }
};
await probe('v1 user/current（token 属主档案）', '/rest/api/user/current');
await probe('v2 /api/v2/users（用户列表）', '/api/v2/users?limit=5');
const sampleAccount = pages[0]?.history?.createdBy?.accountId ?? '';
await probe(
  `v1 user?accountId=${sampleAccount.slice(0, 12)}…`,
  `/rest/api/user?accountId=${encodeURIComponent(sampleAccount)}`,
);
await probe('v2 单用户', `/api/v2/users/${encodeURIComponent(sampleAccount)}`);

console.log(`\n=== 12. 页面正文里的身份线索（@提及 / 用户名 / LFID 字样）===`);
const clueRe = [
  /ri:username="([^"]+)"/g,
  /ri:account-id="([^"]+)"/g,
  /ri:userkey="([^"]+)"/g,
  /\b(lfid|LFID|LF ID|lfc-id)\b[^<\n]{0,50}/g,
];
const found = new Map();
for (const p of pages.slice(0, 12)) {
  let html = '';
  try {
    const body = await api(`/rest/api/content/${p.id}?expand=body.storage`);
    html = body.body?.storage?.value ?? '';
  } catch {
    continue;
  }
  for (const re of clueRe) {
    for (const m of html.matchAll(re)) {
      const key = m[0].slice(0, 60);
      found.set(key, (found.get(key) ?? 0) + 1);
    }
  }
}
if (found.size === 0) console.log('  （前 12 页正文未出现用户名 / account-id / LFID 字样）');
for (const [k, n] of [...found.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${String(n).padStart(3)}  ${k}`);
}

console.log(`\n=== 13. 页面协作者（history.contributors，可能含更多身份）===`);
try {
  const body = await api(
    `/rest/api/content/${pages[0].id}?expand=history.contributors,history`,
  );
  const users = body.history?.contributors?.users ?? [];
  console.log(`  返回 ${users.length} 个 contributor：`);
  for (const u of users.slice(0, 10)) console.log(`    ${JSON.stringify(u)}`);
} catch (e) {
  console.log(`  查询失败：${e.message}`);
}

console.log(`\n=== 14. 凭证是否真的在起作用（无头对照）===`);
const raw = async (label, path, headers) => {
  try {
    const res = await fetch(`${base}/wiki${path}`, { headers });
    console.log(`  ${String(res.status).padStart(3)}  ${label}`);
    return res;
  } catch (e) {
    console.log(`  ERR  ${label} → ${e.message}`);
    return null;
  }
};
await raw('无 Authorization → space', `/rest/api/space/${encodeURIComponent(space)}`, { Accept: 'application/json' });
await raw('无 Authorization → content', `/rest/api/content?spaceKey=${encodeURIComponent(space)}&limit=1`, { Accept: 'application/json' });
await raw('无 Authorization → user/current', '/rest/api/user/current', { Accept: 'application/json' });
await raw('带 Bearer → user/current', '/rest/api/user/current', { Authorization: `Bearer ${token}`, Accept: 'application/json' });
await probe('v2 users?accountIds', `/api/v2/users?accountIds=${encodeURIComponent(sampleAccount)}`);
await probe('user CQL 搜索', `/rest/api/search?cql=${encodeURIComponent('user.fullname~"Yijun"')}&limit=5`);

console.log(`\n=== 15. 批量查用户（POST /api/v2/users-bulk）能否拿到 email ===`);
let authorIds = [];
try {
  const withVer = await api(
    `/rest/api/content?spaceKey=${encodeURIComponent(space)}&limit=100&expand=version`,
  );
  authorIds = [
    ...new Set((withVer.results ?? []).map((p) => p.version?.by?.accountId).filter(Boolean)),
  ];
} catch (e) {
  console.log(`  取作者清单失败：${e.message}`);
}
console.log(`  用 ${authorIds.length} 个真实 accountId 试探`);

const tryBulk = async (label, headers) => {
  try {
    const res = await fetch(`${base}/wiki/api/v2/users-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify({ accountIds: authorIds }),
    });
    const text = await res.text();
    console.log(`  ${String(res.status).padStart(3)}  ${label}`);
    console.log(`       ${text.slice(0, 900)}`);
  } catch (e) {
    console.log(`  ERR  ${label} → ${e.message}`);
  }
};
await tryBulk('带 Bearer token', { Authorization: `Bearer ${token}` });
await tryBulk('无 Authorization（匿名）', {});

console.log('\n完成（只读，未写入任何文件）。');
