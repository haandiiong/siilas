import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkHandoff } from './lib/airport-source-handoff.mjs';

// The source articles live in the sibling yp7.net project. Set YP7_REVIEW_DIR
// when regenerating from another checkout layout.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const sourceDir = process.env.YP7_REVIEW_DIR
  ? path.resolve(process.env.YP7_REVIEW_DIR)
  : path.resolve(projectDir, '../yp7.net/docs/机场评测');
const profilePath = path.join(projectDir, 'src/data/airport-profiles.json');
const outputPath = path.join(projectDir, 'src/data/airport-profile-details.json');
const MAX_ROWS = 14;
const MAX_COLUMNS = 10;

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const slug = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : undefined;
if (args.includes('--slug') && (!slug || slug.startsWith('--'))) throw new Error('--slug 需要提供资料机场 slug');
if (slug && !args.includes('--check')) throw new Error('--slug 仅可用于 --check，避免将其他机场的表格从生成结果移除');
const allProfiles = JSON.parse(await readFile(profilePath, 'utf8'))
  .filter((profile) => profile.status === 'reference');
const profiles = slug ? allProfiles.filter((profile) => profile.slug === slug) : allProfiles;
if (slug && profiles.length !== 1) throw new Error(`找不到在用资料机场：${slug}`);
const sourcePathFor = (url) => new URL(url).pathname.replace(/\/+$/u, '') + '/';
const byPermalink = new Map();

for (const profile of profiles) {
  const permalink = sourcePathFor(profile.sourcePage);
  if (byPermalink.has(permalink)) throw new Error(`重复来源路径：${permalink}`);
  byPermalink.set(permalink, profile);
}

const stripMarkdown = (value) => {
  let text = value.trim();
  text = text.replace(/<br\s*\/?\s*>/giu, '；');
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1');
  text = text.replace(/<[^>]+>/gu, '');
  text = text.replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
  text = text.replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
  text = text.replace(/&(?:nbsp|amp|lt|gt|quot);/gu, (entity) => ({
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  })[entity]);
  text = text.replace(/(?:\*\*|__|~~|`)/gu, '');
  text = text.replace(/\\([\\|*_`])/gu, '$1');
  return text.replace(/\s+/gu, ' ').trim();
};

const splitRow = (line) => {
  const cells = [];
  let cell = '';
  const trimmed = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed[index] === '\\' && trimmed[index + 1] === '|') {
      cell += '\\|';
      index += 1;
    } else if (trimmed[index] === '|') {
      cells.push(stripMarkdown(cell));
      cell = '';
    } else {
      cell += trimmed[index];
    }
  }
  cells.push(stripMarkdown(cell));
  return cells;
};

const isDivider = (line) => {
  if (!/^\s*\|/u.test(line)) return false;
  return splitRow(line).every((cell) => /^:?-{3,}:?$/u.test(cell));
};

const isClientVersionTable = (headings, columns) => {
  const section = headings.filter(Boolean).join(' > ');
  return /客户端下载|自有客户端/u.test(section)
    && /^(?:系统|平台)$/u.test(columns[0] ?? '')
    && columns.includes('页面版本')
    && columns.includes('页面标注更新日期');
};

const classify = (headings, columns) => {
  const section = headings.filter(Boolean).join(' > ');
  const firstColumn = columns[0] ?? '';
  const columnText = columns.join(' ');

  // These recurring tables summarize an article, offer buying advice, or
  // reproduce historical tests; none is a source plan/client inventory.
  if (/资料(?:汇总|与历史记录)|历史记录|FAQ|常见问题|差异化观察|怎么测|测速|资料来源/u.test(section)) return null;
  if (/^(项目|问题|需求|使用需求|阶段|类型|指标)$/u.test(firstColumn)) return null;

  const planSection = /套餐|价格|流量包|付款|不限时|按量包|模式区别|重置多少钱/u.test(section);
  const planColumns = /价格|付款|金额|月付|季付|半年付|年付|总价|月价|流量|额度|重置包价格/u.test(columnText);
  if (planSection && planColumns && /套餐|方案|商品|价格|付款|金额|月付|季付|半年付|年付|流量|额度|档位/u.test(columnText)) return 'planTables';

  const clientFirstColumn = /^(?:设备|设备分类|使用设备|设备或使用方式|系统|系统或方式|平台|后台菜单中的客户端|客户端)$/u.test(firstColumn);
  const clientColumns = /客户端|教程|入口|导入|使用方式|连接方式|官网|资料|文档|操作/u.test(columnText);
  if (clientFirstColumn && clientColumns && (/客户端|订阅|下载|导入|使用流程/u.test(section) || /系统|平台|客户端/u.test(firstColumn))) return 'clientTables';
  if (isClientVersionTable(headings, columns)) return 'clientTables';

  return null;
};

const tableTitle = (lines, index, headings) => {
  const preceding = lines.slice(Math.max(0, index - 4), index).reverse().find((line) => line.trim());
  if (preceding && !/^#/u.test(preceding) && /[：:]\s*$/u.test(preceding)) {
    const label = stripMarkdown(preceding).replace(/[：:]\s*$/u, '');
    if (label.length > 0 && label.length <= 36) return label;
  }
  return headings.filter(Boolean).at(-1) ?? '资料表';
};

const extractTables = (markdown, filename) => {
  const lines = markdown.split(/\r?\n/u);
  const headings = [];
  const result = { planTables: [], clientTables: [] };
  const skipped = [];
  const capped = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const heading = lines[index].match(/^(#{2,6})\s+(.+?)\s*#*\s*$/u);
    if (heading) {
      const level = heading[1].length;
      headings[level] = stripMarkdown(heading[2]);
      headings.length = level + 1;
      continue;
    }
    if (!/^\s*\|/u.test(lines[index]) || !isDivider(lines[index + 1])) continue;

    const columns = splitRow(lines[index]);
    const rows = [];
    let end = index + 2;
    while (end < lines.length && /^\s*\|/u.test(lines[end])) {
      const row = splitRow(lines[end]);
      if (row.length !== columns.length) throw new Error(`${filename}:${end + 1} 表格列数不一致`);
      rows.push(row);
      end += 1;
    }
    const kind = classify(headings, columns);
    let title = isClientVersionTable(headings, columns)
      ? '客户端下载版本信息'
      : tableTitle(lines, index, headings);
    if (!kind) {
      skipped.push(`${title} (${rows.length} 行)`);
    } else if (rows.length > 0) {
      if (result[kind].some((table) => table.title === title)) title = `${title}：${columns[0]}`;
      const truncated = columns.length > MAX_COLUMNS || rows.length > MAX_ROWS;
      if (truncated) {
        capped.push(`${title}: ${rows.length} 行 × ${columns.length} 列`);
        title = `${title}（节选）`;
      }
      result[kind].push({
        title,
        columns: columns.slice(0, MAX_COLUMNS),
        rows: rows.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS)),
        ...(truncated ? { truncated: true, sourceRowCount: rows.length, sourceColumnCount: columns.length } : {}),
      });
    }
    index = end - 1;
  }

  return { ...result, skipped, capped };
};

const sourceFiles = (await readdir(sourceDir)).filter((file) => file.endsWith('.md')).sort();
const sourceByPermalink = new Map();
for (const filename of sourceFiles) {
  const markdown = await readFile(path.join(sourceDir, filename), 'utf8');
  const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/u)?.[1];
  const permalink = frontmatter?.match(/^permalink:\s*["']?([^\s"']+)/mu)?.[1];
  if (!permalink) continue;
  const normalized = permalink.replace(/\/+$/u, '') + '/';
  if (!byPermalink.has(normalized)) continue;
  if (sourceByPermalink.has(normalized)) throw new Error(`多个来源文件使用 ${normalized}`);
  sourceByPermalink.set(normalized, { filename, markdown });
}

const output = {};
const report = [];
for (const profile of profiles) {
  const source = sourceByPermalink.get(sourcePathFor(profile.sourcePage));
  if (!source) throw new Error(`找不到 ${profile.slug} 的来源 Markdown：${profile.sourcePage}`);
  const { planTables, clientTables, skipped, capped } = extractTables(source.markdown, source.filename);
  output[profile.slug] = { planTables, clientTables };
  report.push({ slug: profile.slug, plans: planTables.length, clients: clientTables.length, skipped, capped });
}

const serialized = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8');
  const matches = slug
    ? JSON.stringify(JSON.parse(current)[slug]) === JSON.stringify(output[slug])
    : current === serialized;
  if (!matches) throw new Error(`airport-profile-details.json${slug ? ` 中 ${slug}` : ''} 与来源 Markdown 不一致；请重新运行生成脚本`);
  if (!process.argv.includes('--tables-only')) {
    await checkHandoff({ source: true, slug });
    console.log('商业来源指纹（旧清单检查完整版本）与已接收商业字段一致；--check 同时检查交接清单，不再仅检查表格。');
  } else {
    console.log('仅检查套餐与客户端表；其余商业字段和来源版本需另行复核确认。');
  }
} else {
  await writeFile(outputPath, serialized);
  console.log('本次仅同步套餐与客户端表；请人工复核官网、摘要、试用、来源日期和专属要点，再确认商业资料交接。');
}

const planCoverage = report.filter((item) => item.plans > 0).length;
const clientCoverage = report.filter((item) => item.clients > 0).length;
console.log(`已匹配 ${report.length} 篇来源：套餐表 ${planCoverage}/${report.length}，客户端表 ${clientCoverage}/${report.length}。`);
console.log(`无套餐表：${report.filter((item) => item.plans === 0).map((item) => item.slug).join('、') || '无'}`);
console.log(`无客户端表：${report.filter((item) => item.clients === 0).map((item) => item.slug).join('、') || '无'}`);
for (const item of report.filter((entry) => entry.capped.length)) console.log(`已截取 ${item.slug}：${item.capped.join('；')}`);
