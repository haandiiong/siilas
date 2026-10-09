import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDateValidationError, getShanghaiDateKey } from '../../src/data/date-utils.mjs';

export const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const manifestPath = path.join(projectDir, 'src/data/airport-source-handoff.json');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right, 'en')))
  : item);
export const todayShanghai = getShanghaiDateKey;
const readJson = async (filename) => JSON.parse(await readFile(path.join(projectDir, filename), 'utf8'));
const editorialFields = new Set(['editorialUpdatedAt', 'publishedAt']);
const firstPartyFields = new Set([
  'tests', 'nodeSnapshots', 'serviceIncidents', 'chatgptStatus', 'chatgptStatusUpdated',
  'streamingStatus', 'streamingStatusUpdated', 'status', 'serviceStatus', 'serviceStatusUpdated',
]);
const permalinkOf = (url) => new URL(url).pathname.replace(/\/+$/u, '') + '/';

export function commercialSourceSha256(markdown, filename = '来源文章') {
  const startMarker = '<!-- siilas-testing:start -->';
  const endMarker = '<!-- siilas-testing:end -->';
  const startCount = markdown.split(startMarker).length - 1;
  const endCount = markdown.split(endMarker).length - 1;
  if (startCount === 0 && endCount === 0) return hash(markdown);

  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker);
  const markerIsLine = (marker, index) => {
    const lineStart = markdown.lastIndexOf('\n', index - 1) + 1;
    const lineEnd = markdown.indexOf('\n', index + marker.length);
    return markdown.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim() === marker;
  };
  const frontmatter = markdown.match(/^---\s*\r?\n[\s\S]*?\r?\n---/u)?.[0];
  if (startCount !== 1 || endCount !== 1 || start >= end
    || !markerIsLine(startMarker, start) || !markerIsLine(endMarker, end)
    || (frontmatter && start < frontmatter.length)) {
    throw new Error(`${filename} 的 Siilas 自动测速块标记无效：必须为正文中唯一、完整且顺序正确的一对独立行标记`);
  }
  let commercial = markdown.slice(0, start) + markdown.slice(end + endMarker.length);
  if (frontmatter) {
    const dates = frontmatter.match(/^dateModified:[^\r\n]*(?:\r?\n|$)/gmu) ?? [];
    if (dates.length > 1) throw new Error(`${filename} 的来源编辑日期字段重复，不能排除自动编辑日期`);
    commercial = commercial.replace(frontmatter, frontmatter.replace(/^dateModified:[^\r\n]*(?:\r?\n|$)/gmu, ''));
  }
  return hash(commercial);
}

export async function loadLocalHandoff() {
  const [tested, profiles, details, highlights] = await Promise.all([
    readJson('src/data/airports.json'), readJson('src/data/airport-profiles.json'),
    readJson('src/data/airport-profile-details.json'), readJson('src/data/airport-profile-highlights.json'),
  ]);
  const entries = new Map();
  for (const [kind, airports] of [['tested', tested], ['profile', profiles]]) {
    for (const airport of airports) {
      if (entries.has(airport.slug)) throw new Error(`机场 slug 重复：${airport.slug}`);
      if (!airport.sourcePage) throw new Error(`${airport.name} 缺少商业资料来源页，不能完成资料交接`);
      const fieldHashes = Object.fromEntries(Object.entries(airport)
        .filter(([field]) => !editorialFields.has(field) && !(kind === 'tested' && firstPartyFields.has(field)))
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([field, value]) => [field, hash(canonical(value))]));
      entries.set(airport.slug, {
        name: airport.name, kind: kind === 'tested' ? 'tested' : airport.status,
        sourcePage: airport.sourcePage,
        received: {
          fieldHashes,
          detailsSha256: hash(canonical(details[airport.slug] ?? null)),
          highlightsSha256: hash(canonical(highlights[airport.slug] ?? null)),
        },
      });
    }
  }
  return entries;
}

export async function loadSourceHandoff(entries) {
  const sourceDir = process.env.YP7_REVIEW_DIR
    ? path.resolve(process.env.YP7_REVIEW_DIR)
    : path.resolve(projectDir, '../yp7.net/docs/机场评测');
  let filenames;
  try {
    filenames = (await readdir(sourceDir)).filter((filename) => filename.endsWith('.md')).sort();
  } catch (error) {
    throw new Error(`无法读取 yp7.net 来源目录 ${sourceDir}；交接复核需要来源文件，可设置 YP7_REVIEW_DIR。正式构建只检查已接收清单，不需要此目录。`, { cause: error });
  }
  const wanted = new Set([...entries.values()].map((entry) => permalinkOf(entry.sourcePage)));
  const articles = new Map();
  for (const filename of filenames) {
    const markdown = await readFile(path.join(sourceDir, filename), 'utf8');
    const frontmatter = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/u)?.[1];
    const permalink = frontmatter?.match(/^permalink:\s*["']?([^\s"']+)/mu)?.[1];
    if (!permalink) continue;
    const normalized = permalink.replace(/\/+$/u, '') + '/';
    if (!wanted.has(normalized)) continue;
    if (articles.has(normalized)) throw new Error(`多个来源文件使用 ${normalized}`);
    const updated = (frontmatter.match(/^(?:dateModified|updated):\s*["']?([^\s"']+)/mu)?.[1] ?? null)?.replaceAll('/', '-') ?? null;
    articles.set(normalized, {
      filename, sourceSha256: hash(markdown),
      sourceCommercialSha256: commercialSourceSha256(markdown, filename),
      sourceUpdatedAt: updated,
    });
  }
  return new Map([...entries].map(([slug, entry]) => {
    const source = articles.get(permalinkOf(entry.sourcePage));
    if (!source) throw new Error(`找不到 ${entry.name} 的来源 Markdown：${entry.sourcePage}`);
    return [slug, source];
  }));
}

export async function loadManifest() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || manifest.algorithm !== 'sha256' || !manifest.airports || Array.isArray(manifest.airports)) {
    throw new Error('商业资料交接清单格式无效');
  }
  return manifest;
}

export function handoffErrors(entries, manifest, sources) {
  const errors = [];
  const validHash = (value) => typeof value === 'string' && /^[a-f\d]{64}$/u.test(value);
  for (const slug of Object.keys(manifest.airports)) {
    if (!entries.has(slug)) errors.push(`交接清单残留机场 ${slug}，删除或迁移机场时同步清理清单`);
  }
  for (const [slug, current] of entries) {
    const accepted = manifest.airports[slug];
    if (!accepted) {
      errors.push(`${current.name} (${slug}) 尚无已接收的商业资料清单`);
      continue;
    }
    if (!validHash(accepted.sourceSha256) || typeof accepted.sourceFile !== 'string' || !accepted.sourceFile) {
      errors.push(`${current.name} 来源版本缺失或格式无效`);
    }
    const hasCommercialHash = Object.hasOwn(accepted, 'sourceCommercialSha256');
    if (hasCommercialHash && !validHash(accepted.sourceCommercialSha256)) {
      errors.push(`${current.name} 商业来源指纹格式无效`);
    }
    if (getDateValidationError(accepted.acceptedAt) || getDateValidationError(accepted.sourceUpdatedAt)
      || typeof accepted.acceptanceNote !== 'string' || !accepted.acceptanceNote.trim()) {
      errors.push(`${current.name} 交接确认日期或说明无效`);
    }
    if (accepted.kind !== current.kind || accepted.sourcePage !== current.sourcePage || accepted.name !== current.name) {
      errors.push(`${current.name} 来源页或资料类型发生变化，需重新复核交接`);
    }
    const previousFields = accepted.received?.fieldHashes ?? {};
    const currentFields = current.received.fieldHashes;
    const changedFields = [...new Set([...Object.keys(previousFields), ...Object.keys(currentFields)])]
      .filter((field) => !validHash(previousFields[field]) || previousFields[field] !== currentFields[field]);
    if (changedFields.length) errors.push(`${current.name} 已接收商业字段变动：${changedFields.join('、')}`);
    for (const [field, label] of [['detailsSha256', '套餐/客户端表'], ['highlightsSha256', '专属资料要点']]) {
      if (!validHash(accepted.received?.[field]) || accepted.received[field] !== current.received[field]) {
        errors.push(`${current.name} 已接收${label}变动`);
      }
    }
    if (sources) {
      const source = sources.get(slug);
      // Old receipts keep full-article checks until a human accepts the new
      // commercial fingerprint. Full hashes and edit dates remain audit data.
      const versionChanged = hasCommercialHash
        ? !validHash(source.sourceCommercialSha256) || accepted.sourceCommercialSha256 !== source.sourceCommercialSha256
        : accepted.sourceSha256 !== source.sourceSha256 || accepted.sourceUpdatedAt !== source.sourceUpdatedAt;
      if (versionChanged || accepted.sourceFile !== source.filename) {
        errors.push(`${current.name} yp7.net ${hasCommercialHash ? '商业来源' : '完整来源文章'}已变化：${source.filename}；请复核官网、摘要、套餐、试用、客户端、来源日期和专属要点后重新确认交接`);
      }
    }
  }
  return errors;
}

export async function checkHandoff({ source = false, slug } = {}) {
  const allEntries = await loadLocalHandoff();
  if (slug && !allEntries.has(slug)) throw new Error(`未知机场：${slug}`);
  const entries = slug ? new Map([[slug, allEntries.get(slug)]]) : allEntries;
  const fullManifest = await loadManifest();
  const manifest = slug ? { ...fullManifest, airports: { [slug]: fullManifest.airports[slug] } } : fullManifest;
  const sources = source ? await loadSourceHandoff(entries) : undefined;
  const errors = handoffErrors(entries, manifest, sources);
  if (errors.length) throw new Error(`商业资料交接需要更新：\n- ${errors.join('\n- ')}\n人工复核后，使用 pnpm data:handoff:accept -- --slug <slug> --note <复核说明> 确认；该操作只记录版本，不会同步或猜测商业字段。`);
  return entries.size;
}
