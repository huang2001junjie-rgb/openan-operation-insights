/**
 * 例会台账（Excel）→ `data/meetings.json` 转换脚本（ADR-0005，见 05 文档 §10）。
 *
 * 用法：
 *   npm run collect:meetings -w @openan/api
 *   npm run collect:meetings -w @openan/api -- --source=data/source/meetings.xlsx --dry-run
 *
 * 输入：`<dataDir>/source/meetings.xlsx`；缺失时取该目录下唯一的 `.xlsx`
 *       （可用 `MEETINGS_SOURCE_PATH` 或 `--source=` 覆盖）。
 * 输出：`<dataDir>/meetings.json`（信封 `schemaVersion=1` + `data: MeetingAttendanceMatrix`）。
 *
 * 照搬原则（ADR-0005）：列头为**人名原文**、行头为**日期原序**；不排序、不聚合、
 * 不补人、不改写列名。空白格 = 缺席（计入出席率分母，属明知并接受的负债）。
 * 例外（ADR-0022）：表头中字面量「出勤人数」的一列**不是成员列**，逐行解析为
 * 该场全场的实到人数（`participantCount`，可空），不参与出席判定。
 */
import { existsSync, readdirSync } from 'node:fs';
import { rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Workbook } from 'exceljs';
import type { MeetingAttendanceMatrix, MeetingAttendanceRow } from '../src/contract/entities';
import { isMeetingAttendanceMatrix } from '../src/repositories/validators';

const scriptDir = __dirname;
const repoRoot = resolve(scriptDir, '../../..');

/**
 * 出席记号白名单（宽容匹配，见 05 文档 §10.4）。
 * 空白一律视为缺席；未命中的非空记号会计入告警，便于拿到真实台账后校准。
 */
const PRESENT_TOKENS = new Set([
  '√',
  '✓',
  '✔',
  'v',
  'y',
  'yes',
  '1',
  'true',
  't',
  '是',
  'x',
  'o',
  '●',
  '出席',
  '与会',
  'present',
]);

/**
 * 显式缺席记号：与空白同义（不计入未识别告警），便于台账里用 `0` / `×` 明确标缺。
 * 其余未命中的非空记号会告警，提示校准 PRESENT_TOKENS。
 */
const ABSENT_TOKENS = new Set(['0', 'false', 'f', 'n', 'no', '否', '缺席', '请假', '×', '-', '—', '–', '/', 'none']);

/**
 * 出席人数列的表头字面量（ADR-0022）：与成员列区分，整列不参与出席判定。
 * 该列记录的是全场实到人数（含非成员列席者），与成员出席格计数口径不同。
 */
const PARTICIPANT_COUNT_HEADER = '出勤人数';

/** 日期列识别阈值：至少 80% 的数据行可解析为日期 */
const DATE_COLUMN_RATIO = 0.8;

const DATE_PATTERN = /^(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})日?$/;
const ISO_DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T/;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

interface CliArgs {
  source?: string;
  out?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const readFlag = (flag: string): string | undefined =>
    argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);

  return { source: readFlag('--source'), out: readFlag('--out'), dryRun: argv.includes('--dry-run') };
}

function resolveFromRoot(value: string): string {
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}

function resolveDataDir(): string {
  const fromEnv = process.env.DATA_DIR?.trim();
  if (fromEnv) return resolveFromRoot(fromEnv);

  const candidates = [join(repoRoot, 'data'), resolve(process.cwd(), '../../data')];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0];
}

/** 台账源文件：--source > MEETINGS_SOURCE_PATH > 默认名 > 目录内唯一 .xlsx */
function resolveSourcePath(dataDir: string, override?: string): string {
  if (override) return resolveFromRoot(override);

  const fromEnv = process.env.MEETINGS_SOURCE_PATH?.trim();
  if (fromEnv) return resolveFromRoot(fromEnv);

  const sourceDir = join(dataDir, 'source');
  const preferred = join(sourceDir, 'meetings.xlsx');
  if (existsSync(preferred)) return preferred;
  if (!existsSync(sourceDir)) {
    throw new Error(`未找到台账目录：${sourceDir}`);
  }

  const excelFiles = readdirSync(sourceDir).filter((name) => name.toLowerCase().endsWith('.xlsx'));
  if (excelFiles.length === 0) throw new Error(`台账目录内没有 .xlsx 文件：${sourceDir}`);
  if (excelFiles.length > 1) {
    throw new Error(`台账目录存在多个 .xlsx，请用 --source 指定：${excelFiles.join('、')}`);
  }
  return join(sourceDir, excelFiles[0]);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 归一化任意 Excel 单元格取值为字符串（兼容富文本 / 超链接 / 公式 / 日期） */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return formatUtcDate(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (typeof value === 'object') {
    const candidate = value as {
      richText?: { text?: string }[];
      text?: unknown;
      result?: unknown;
    };
    if (Array.isArray(candidate.richText)) {
      return candidate.richText.map((part) => part.text ?? '').join('');
    }
    if (typeof candidate.text === 'string') return candidate.text;
    if (candidate.result !== undefined) return cellText(candidate.result);
  }

  return '';
}

/** 解析为 `YYYY-MM-DD`；无法识别返回 null（兼容 `2026.06.09` / ISO / Excel 序列号） */
function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0) return null;

  const matched = DATE_PATTERN.exec(text);
  if (matched) {
    return `${matched[1]}-${pad(Number(matched[2]))}-${pad(Number(matched[3]))}`;
  }

  const iso = ISO_DATE_PREFIX_PATTERN.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial > 0 && serial < 100000) {
      return formatUtcDate(new Date(EXCEL_EPOCH_UTC + Math.round(serial) * 86_400_000));
    }
  }

  return null;
}

function isPresentMark(raw: string): boolean {
  return PRESENT_TOKENS.has(raw.trim().toLowerCase());
}

function detectDateColumn(raw: string[][]): number {
  const header = raw[0];
  const body = raw.slice(1);
  if (body.length === 0) return -1;

  const threshold = Math.max(1, Math.ceil(body.length * DATE_COLUMN_RATIO));
  return header.findIndex(
    (_, index) => body.filter((row) => parseDate(row[index]) !== null).length >= threshold,
  );
}

async function buildMatrix(
  sourcePath: string,
  unknownMarks: Set<string>,
  invalidCounts: Set<string>,
): Promise<MeetingAttendanceMatrix> {
  const workbook = new Workbook();
  await workbook.xlsx.readFile(sourcePath);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('台账中没有工作表');

  const rowCount = sheet.rowCount;
  const columnCount = sheet.columnCount;
  if (rowCount < 2 || columnCount < 2) {
    throw new Error(`台账行列不足（${rowCount} × ${columnCount}），至少需要 1 行表头 + 1 行数据`);
  }

  const raw: string[][] = [];
  for (let row = 1; row <= rowCount; row += 1) {
    const cells: string[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      cells.push(cellText(sheet.getCell(row, column).value));
    }
    raw.push(cells);
  }

  const dateColumn = detectDateColumn(raw);
  if (dateColumn < 0) {
    throw new Error('未能识别日期列：请确认第 1 行为表头，且其后每行一场例会（日期列可解析）');
  }

  const nameColumns = raw[0]
    .map((header, index) => ({ name: header.trim(), index }))
    .filter(
      (column) => column.index !== dateColumn && column.name.length > 0 && column.name !== PARTICIPANT_COUNT_HEADER,
    );
  if (nameColumns.length === 0) {
    throw new Error('未能识别出席人列：第 1 行需为人名表头');
  }

  /** 「出勤人数」列（ADR-0022）：可选；缺失时全部行为 null */
  const participantCountColumn = raw[0].findIndex(
    (header, index) => index !== dateColumn && header.trim() === PARTICIPANT_COUNT_HEADER,
  );

  /** 解析出席人数：空白 → null；非负整数 → number；其余 → null 并告警（按缺席语义的「未知」处理，不中止导入） */
  const parseParticipantCount = (rawValue: string): number | null => {
    const text = rawValue.trim();
    if (text.length === 0) return null;
    const value = Number(text);
    if (Number.isInteger(value) && value >= 0) return value;
    invalidCounts.add(text);
    return null;
  };

  const rows: MeetingAttendanceRow[] = [];
  const seenDates = new Set<string>();
  for (let index = 1; index < raw.length; index += 1) {
    const date = parseDate(raw[index][dateColumn]);
    if (date === null) continue; // 跳过空行 / 小计行

    if (seenDates.has(date)) throw new Error(`台账存在重复日期：${date}`);
    seenDates.add(date);

    const attendance = nameColumns.map((column) => {
      const mark = raw[index][column.index].trim();
      const normalized = mark.toLowerCase();
      if (mark.length > 0 && !isPresentMark(mark) && !ABSENT_TOKENS.has(normalized)) {
        unknownMarks.add(mark);
      }
      return isPresentMark(mark);
    });

    const participantCount =
      participantCountColumn >= 0 ? parseParticipantCount(raw[index][participantCountColumn]) : null;

    rows.push({ date, attendance, participantCount });
  }

  if (rows.length === 0) throw new Error('台账中没有可解析的例会行');

  const matrix: MeetingAttendanceMatrix = {
    columns: nameColumns.map((column) => column.name),
    rows,
    updatedAt: new Date().toISOString(),
  };

  if (!isMeetingAttendanceMatrix(matrix)) {
    throw new Error('生成的矩阵不符合契约（见 04 文档 §3.8），已中止写入');
  }

  return matrix;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = resolveDataDir();
  const sourcePath = resolveSourcePath(dataDir, args.source);

  if (!existsSync(sourcePath)) {
    throw new Error(`台账文件不存在：${sourcePath}`);
  }

  const unknownMarks = new Set<string>();
  const invalidCounts = new Set<string>();
  const matrix = await buildMatrix(sourcePath, unknownMarks, invalidCounts);

  const presentCount = matrix.rows.reduce(
    (total, row) => total + row.attendance.filter(Boolean).length,
    0,
  );
  const totalCells = matrix.rows.length * matrix.columns.length;

  const counts = matrix.rows.flatMap((row) => (row.participantCount == null ? [] : [row.participantCount]));
  const countAvg = counts.length > 0 ? counts.reduce((total, value) => total + value, 0) / counts.length : null;
  const countMax = counts.length > 0 ? Math.max(...counts) : null;

  console.log('── 例会台账导入 ─────────────────────────────');
  console.log(`源文件   : ${sourcePath}`);
  console.log(`成员列   : ${matrix.columns.length} 人（保留原序）`);
  console.log(`例会行   : ${matrix.rows.length} 场（保留原序）`);
  console.log(`日期区间 : ${matrix.rows[0].date} → ${matrix.rows[matrix.rows.length - 1].date}`);
  console.log(`出席格   : ${presentCount}/${totalCells}`);
  console.log(
    `出勤人数 : ${counts.length}/${matrix.rows.length} 场已填` +
      (countAvg !== null ? `；平均 ${countAvg.toFixed(1)}，最大 ${countMax}` : ''),
  );
  if (unknownMarks.size > 0) {
    console.warn(`未识别记号: ${[...unknownMarks].join('、')}（按缺席处理，请校准 PRESENT_TOKENS）`);
  }
  if (invalidCounts.size > 0) {
    console.warn(`出勤人数列存在非整数: ${[...invalidCounts].join('、')}（按未填处理）`);
  }

  if (args.dryRun) {
    console.log('dry-run  : 未写入任何文件');
    console.log('─────────────────────────────────────────────');
    return;
  }

  const outPath = args.out ? resolveFromRoot(args.out) : join(dataDir, 'meetings.json');
  const envelope = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    data: matrix,
  };

  const tmpPath = `${outPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tmpPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    await rename(tmpPath, outPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => undefined);
    throw error;
  }

  console.log(`写入文件 : ${outPath}`);
  console.log('─────────────────────────────────────────────');
}

main().catch((error: unknown) => {
  console.error(`导入失败，既有数据保持不变：${(error as Error).message}`);
  process.exit(1);
});
