import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { getDateValidationError } from '../src/data/date-utils.mjs';
import {
  checkHandoff, loadLocalHandoff, loadSourceHandoff, manifestPath, projectDir, todayShanghai,
} from './lib/airport-source-handoff.mjs';

const args = process.argv.slice(2).filter((argument) => argument !== '--');
const valueAfter = (flag) => args[args.indexOf(flag) + 1];
if (!args.includes('--accept')) {
  const source = args.includes('--source');
  const count = await checkHandoff({ source });
  console.log(source
    ? `商业资料交接通过：${count} 家机场的商业来源指纹和全部已接收商业字段与确认清单一致；旧清单仍按完整来源版本检查。`
    : `商业资料交接通过：${count} 家机场的本地商业字段、套餐/客户端表和专属要点与已接收清单一致；未读取 yp7.net 当前来源。`);
} else {
  const slug = args.includes('--slug') ? valueAfter('--slug') : undefined;
  const note = args.includes('--note') ? valueAfter('--note') : undefined;
  if ((!slug && !args.includes('--all')) || (slug && args.includes('--all')) || !note?.trim() || note.startsWith('--')) {
    throw new Error('确认交接需指定 --slug <slug>（或 --all）和 --note <人工复核说明>。只确认已人工复核的商业字段，不会自动同步。');
  }
  const entries = await loadLocalHandoff();
  if (slug && !entries.has(slug)) throw new Error(`未知机场：${slug}`);
  const selected = slug ? [slug] : [...entries.keys()];
  const sources = await loadSourceHandoff(new Map(selected.map((selectedSlug) => [selectedSlug, entries.get(selectedSlug)])));
  for (const selectedSlug of selected) {
    const sourceDateError = getDateValidationError(sources.get(selectedSlug).sourceUpdatedAt);
    if (sourceDateError) throw new Error(`${entries.get(selectedSlug).name} 来源编辑日期${sourceDateError}；交接清单未写入。`);
  }
  // Do not accept tables that have not received the current source version.
  if (!slug || entries.get(slug).kind === 'reference') {
    execFileSync(process.execPath, [
      path.join(projectDir, 'scripts/sync-airport-profile-details.mjs'), '--check', '--tables-only',
      ...(slug ? ['--slug', slug] : []),
    ], { stdio: 'inherit' });
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    manifest = { version: 1, algorithm: 'sha256', airports: {} };
  }
  for (const selectedSlug of selected) {
    const entry = entries.get(selectedSlug);
    const source = sources.get(selectedSlug);
    manifest.airports[selectedSlug] = {
      name: entry.name, kind: entry.kind, sourcePage: entry.sourcePage,
      sourceFile: source.filename, sourceSha256: source.sourceSha256,
      sourceCommercialSha256: source.sourceCommercialSha256, sourceUpdatedAt: source.sourceUpdatedAt,
      acceptedAt: todayShanghai(), acceptanceNote: note.trim(), received: entry.received,
    };
  }
  if (args.includes('--all')) {
    for (const staleSlug of Object.keys(manifest.airports)) if (!entries.has(staleSlug)) delete manifest.airports[staleSlug];
  }
  manifest.airports = Object.fromEntries(Object.entries(manifest.airports).sort(([left], [right]) => left.localeCompare(right, 'en')));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`已记录 ${selected.length} 家机场的商业来源指纹、完整来源审计版本和人工接收字段；测速记录未写入交接清单。`);
}
