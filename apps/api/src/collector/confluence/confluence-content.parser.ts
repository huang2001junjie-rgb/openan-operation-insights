/**
 * Confluence 正文口径解析器（storage 格式 XHTML）。
 *
 * 纯函数、无 I/O：两个维度的"读懂正文"逻辑集中在此，便于用固定样例离线回归
 * （见 scripts/confluence-check.mjs），口径变更也只改这一处。
 *
 * 已确认的真实口径（2026-09-28 对真实空间只读实测）：
 *
 * 1. **需求**：`Releases > Release Planning > <release> > Requirement Proposal` 页面里唯一的
 *    表格，**每个 `Contacts` 列的 @ 提及各算 1 条**（一行可有多位联系人，各自计数）。
 *    表格**外**另有约 33 处 @（Status 等列），故必须**只取 Contacts 单元格**。
 *
 * 2. **议题分享**：会议纪要页的 `Agenda` 段**整段**取 @（段落里的与表格行里的都算）——
 *    实测该段只有一张布局表格、分享人写在「议题标题 + @分享人」的**段落**里，限定表格行会恒 0。
 *    同页 `Attendees & Representation` 段的 @ 是**出席签到**（占全页 @ 的 80%），必须排除，
 *    否则统计到的是"出席次数"而非"议题分享次数"。
 *
 * 另外提供展示名解析：`extractRenderedUserNames()` 从 `body.view` 渲染视图里取
 * `accountId → 展示名`（只影响可读性，不影响计数与归属）。
 */

/** 一条 mention：accountId 是归属唯一真相，username 仅作展示名兜底 */
export interface Mention {
  accountId: string;
  username: string | null;
}

/** 标题切段结果 */
export interface ContentSection {
  /** 标题文本（已解实体、压缩空白） */
  heading: string;
  /** 该标题到下一个同级标题之间的正文（不含标题自身） */
  html: string;
}

// ── 低层：HTML / 实体 ─────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** 去掉全部标签、解实体、压缩空白（用于比对标题 / 表头等"文本语义"） */
export function toPlainText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * 抽取片段中的全部 mention（按出现顺序，保留重复）。
 * 兼容 `<ri:user ... />` 与 `<ri:user ...></ri:user>`；缺 account-id 的直接跳过（无法归属）。
 */
export function extractMentions(fragment: string): Mention[] {
  const mentions: Mention[] = [];
  for (const match of fragment.matchAll(/<ri:user\b[^>]*>/gi)) {
    const tag = match[0];
    const accountId = /\bri:account-id="([^"]*)"/i.exec(tag)?.[1]?.trim();
    if (!accountId) continue;
    mentions.push({
      accountId,
      username: /\bri:username="([^"]*)"/i.exec(tag)?.[1]?.trim() ?? null,
    });
  }
  return mentions;
}

// ── 展示名：从**渲染视图**（body.view）里捞 accountId → 展示名 ──────

/**
 * 从渲染视图 HTML 里抽出 `accountId → 展示名`。
 *
 * 为什么需要：storage 正文里的提及**只有** `ri:account-id`（实测 `ri:username` 永不出现），
 * 名字是 Confluence 渲染时才用查看者凭据去用户目录换出来的。而 `/rest/api/user?accountId=`
 * 对采集令牌返回 403（`User not permitted to view user profiles`，实测 2026-09-28）——
 * 但 `?expand=body.storage,body.view` 返回的渲染 HTML 里**服务端已经换好了名字**：
 *
 * ```html
 * <a class="confluence-userlink user-mention" data-account-id="5da82cb1…"
 *    href="…/wiki/people/5da82cb1…?ref=confluence">FeiGuo</a>
 * ```
 *
 * 于是展示名不必再额外申请"读用户资料"权限，也不再需要逐账号 N+1 查询。
 * 展示名**只影响可读性**（状态文件待办清单、日志），不参与任何计数与归属。
 *
 * 已注销/无权限的账号渲染成 `Unknown user` 之类的占位文本，一律跳过（留给后续兜底）。
 */
export function extractRenderedUserNames(viewHtml: string): Map<string, string> {
  const names = new Map<string, string>();
  const anchorRe = /<a\b[^>]*\bdata-account-id="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of viewHtml.matchAll(anchorRe)) {
    const accountId = match[1].trim();
    const name = toPlainText(match[2]);
    if (!accountId || !name) continue;
    if (/^(unknown|deleted)\s*user$/i.test(name)) continue;
    if (!names.has(accountId)) names.set(accountId, name);
  }

  return names;
}

/** 按指定层级标题切段（默认 h2；不按更低层级切，避免把段内小标题误当边界） */
export function splitSections(storage: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 2): ContentSection[] {
  const tag = `h${level}`;
  const headingRe = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');

  const anchors: Array<{ start: number; end: number; heading: string }> = [];
  for (const match of storage.matchAll(headingRe)) {
    const start = match.index ?? 0;
    anchors.push({ start, end: start + match[0].length, heading: toPlainText(match[1]) });
  }

  return anchors.map((anchor, index) => ({
    heading: anchor.heading,
    html: storage.slice(anchor.end, anchors[index + 1]?.start ?? storage.length),
  }));
}

/** 取出片段内的全部表格 */
function extractTables(fragment: string): string[] {
  return [...fragment.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((match) => match[0]);
}

/** 取出表格内的全部行 */
function extractRows(table: string): string[] {
  return [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((match) => match[0]);
}

/** 取出行内的全部单元格（td / th） */
function extractCells(row: string): string[] {
  return [...row.matchAll(/<t[hd]\b[\s\S]*?<\/t[hd]>/gi)].map((match) => match[0]);
}

/**
 * 片段（表格单元格 / 正文段落）里"像 @某人、但不是真正的提及"的纯文本 handle。
 *
 * 真实数据里出现过：需求页 Contacts 列写着纯文本 `@syedbilalafzal`、会议纪要 Agenda 段
 * 写着 `@Shaowei Zhang` —— 这种**无法解析出 accountId**，只能作为待办暴露给运营去改成
 * 真正的提及（不猜、不猜错）。
 *
 * 只取 `@` 后的**第一段词**（`@Shaowei Zhang` → `Shaowei`），够运营在正文里检索定位；
 * 前缀守卫排除邮箱（`a@b.com` 的 `@` 前面是词字符，不视为 handle）。
 */
function extractPlainTextHandles(fragment: string): string[] {
  const withoutMentions = fragment
    .replace(/<ac:link\b[\s\S]*?<\/ac:link>/gi, ' ')
    .replace(/<ri:user\b[^>]*>/gi, ' ');
  const text = toPlainText(withoutMentions);
  const handles = [...text.matchAll(/(?<![\w./@])@([A-Za-z0-9._-]+)/g)].map((match) => match[1]);
  return [...new Set(handles)];
}

// ── 口径 1：需求（Requirement Proposal 表格的 Contacts 列）──────

export interface RequirementContactRow {
  /** 数据行序号（1 起，不含表头） */
  rowIndex: number;
  /** 该行的需求标题（列名匹配不到时为空串，仅供快照/日志定位） */
  title: string;
  /** Contacts 单元格解析出的账号（同行内按账号去重，避免重复提及被计两次） */
  accountIds: string[];
  /** 单元格里像 @人但没解析成 mention 的纯文本，供运营修正 */
  plainTextHandles: string[];
}

export interface RequirementParseResult {
  /** 表头含联系人列（false 说明页面结构变了，口径要重新核对） */
  found: boolean;
  rows: RequirementContactRow[];
  /** 逐联系人展开的账号序列（每个 contact 各算 1 条，故长度即需求条数） */
  contactAccountIds: string[];
  /** accountId → 正文里能直接读到的展示名（ri:username），仅作兜底 */
  displayHints: Map<string, string>;
}

const EMPTY_REQUIREMENT_RESULT: RequirementParseResult = {
  found: false,
  rows: [],
  contactAccountIds: [],
  displayHints: new Map(),
};

/**
 * 解析需求表格：命中**第一张**表头含 `contactsColumn` 的表格（真实页面只有一张），
 * 之后逐行取该列的 mention。
 *
 * 计数语义（已定稿）：**每个联系人各算 1 条** —— 一行两位联系人则两位各得 1 条，
 * 因此"需求条数"可能大于表格行数，这是"共同承接"的有意表达。
 */
export function parseRequirementContacts(
  storage: string,
  options: { contactsColumn: string; titleColumn?: string },
): RequirementParseResult {
  const wantedContacts = options.contactsColumn.trim().toLowerCase();
  const wantedTitle = options.titleColumn?.trim().toLowerCase();

  for (const table of extractTables(storage)) {
    const rawRows = extractRows(table);
    if (rawRows.length === 0) continue;

    const headerCells = extractCells(rawRows[0]).map((cell) => toPlainText(cell).toLowerCase());
    const contactsIndex = headerCells.indexOf(wantedContacts);
    if (contactsIndex < 0) continue;

    const titleIndex = wantedTitle ? headerCells.indexOf(wantedTitle) : -1;
    const rows: RequirementContactRow[] = [];
    const contactAccountIds: string[] = [];
    const displayHints = new Map<string, string>();

    for (const [index, rawRow] of rawRows.slice(1).entries()) {
      const cells = extractCells(rawRow);
      const contactCell = cells[contactsIndex] ?? '';
      const mentions = extractMentions(contactCell);
      // 同行同账号只算一次：重复提及属于数据笔误，不应放大计数
      const accountIds = [...new Set(mentions.map((mention) => mention.accountId))];
      const title = titleIndex >= 0 ? toPlainText(cells[titleIndex] ?? '') : '';

      // 整行皆空（表格尾部空行）不计入，避免污染行数
      const rowIsEmpty = cells.every((cell) => toPlainText(cell).length === 0);
      if (rowIsEmpty) continue;

      for (const mention of mentions) {
        if (mention.username) displayHints.set(mention.accountId, mention.username);
      }

      rows.push({
        rowIndex: index + 1,
        title,
        accountIds,
        plainTextHandles: extractPlainTextHandles(contactCell),
      });
      contactAccountIds.push(...accountIds);
    }

    return { found: true, rows, contactAccountIds, displayHints };
  }

  return EMPTY_REQUIREMENT_RESULT;
}

// ── 口径 2：议题分享（会议纪要 Agenda 段内的 @）─────────────────

export interface AgendaShareParseResult {
  /** 找到 Agenda 标题段（false 说明标题名或层级不符，口径要重新核对） */
  found: boolean;
  /** 该段内 @ 到的账号，**按期去重**（同一期同一账号只算 1 次），保持首次出现顺序 */
  accountIds: string[];
  /** 该段内 @ 的总处数（未去重；与 accountIds 的差值即同期重复提及数，观测用） */
  mentionCount: number;
  /** 段内"像 @人但没解析成提及"的纯文本 handle，供运营修正正文 */
  plainTextHandles: string[];
  /** accountId → 正文里能直接读到的展示名（ri:username），仅作兜底 */
  displayHints: Map<string, string>;
}

/**
 * 解析一期会议纪要的议题分享人：取 `heading`（默认 Agenda）段内**全部** @。
 *
 * 真实正文里该段只有一张布局表格（分类标签 + 议题标题 + 分享人都在段落里，行内没有 @），
 * 故**不限定表格行**；段外的出席签到段、Action Items 段一律不计（靠段边界隔离）。
 * 段内还可能出现"写成纯文本的 @人"，解析不出账号，单列到 `plainTextHandles`。
 *
 * 计数语义（已定稿）：**按期去重** —— 同一期会议同一账号被 @ 多次只算 1 次
 * （即"参加了几期会议的议题分享"）。
 */
export function parseAgendaShares(
  storage: string,
  options: { heading: string },
): AgendaShareParseResult {
  const wanted = options.heading.trim().toLowerCase();
  const section = splitSections(storage, 2).find(
    (candidate) => candidate.heading.toLowerCase() === wanted,
  );
  if (!section) {
    return {
      found: false,
      accountIds: [],
      mentionCount: 0,
      plainTextHandles: [],
      displayHints: new Map(),
    };
  }

  const accountIds: string[] = [];
  const seen = new Set<string>();
  const displayHints = new Map<string, string>();
  const mentions = extractMentions(section.html);

  for (const mention of mentions) {
    if (mention.username) displayHints.set(mention.accountId, mention.username);
    // 按期去重：同一期同一账号只计一次
    if (seen.has(mention.accountId)) continue;
    seen.add(mention.accountId);
    accountIds.push(mention.accountId);
  }

  return {
    found: true,
    accountIds,
    mentionCount: mentions.length,
    plainTextHandles: extractPlainTextHandles(section.html),
    displayHints,
  };
}
