import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTestsNewestFirst } from '../src/data/date-utils.mjs';
import { getTestRegion } from '../src/data/test-regions.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = process.argv[2] ? resolve(process.argv[2]) : join(projectRoot, 'dist');
const origin = 'https://siilas.com';
const pageHref = (page) => page === 1 ? '/test/' : `/test/${page}/`;
const decode = (value) => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/giu, (entity) => {
	const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
	return named[entity] ?? String.fromCodePoint(Number(entity.startsWith('&#x') ? `0x${entity.slice(3, -1)}` : entity.slice(2, -1)));
});
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)]
	.map(([, name, quoted, singleQuoted, bare]) => [name, decode(quoted ?? singleQuoted ?? bare ?? '')]));
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, 'giu'))].map((match) => attributes(match[1]));
const htmlCache = new Map();
const getHtml = async (filename) => {
	if (!htmlCache.has(filename)) htmlCache.set(filename, await readFile(filename, 'utf8'));
	return htmlCache.get(filename);
};
const localFile = (pathname) => {
	const filename = resolve(distRoot, `.${decodeURIComponent(pathname)}`, pathname.endsWith('/') ? 'index.html' : '');
	assert.ok(filename.startsWith(`${distRoot}${sep}`), `链接越出 dist：${pathname}`);
	return filename;
};
let checkedLinks = 0;
const checkLocalLink = async (href, pathname) => {
	const url = new URL(href, `${origin}${pathname}`);
	if (url.origin !== origin) return;
	const filename = localFile(url.pathname);
	assert.ok((await stat(filename)).isFile(), `${pathname} 链接未指向静态文件：${href}`);
	if (url.hash && url.hash !== '#') {
		const target = decodeURIComponent(url.hash.slice(1));
		const html = await getHtml(filename);
		assert.ok(tags(html, '[a-z][a-z0-9-]*').some((tag) => tag.id === target), `${pathname} 目标锚点不存在：${href}`);
	}
	checkedLinks += 1;
};

const indexText = await readFile(join(distRoot, 'test/record-index.json'), 'utf8');
const index = JSON.parse(indexText);
assert.deepEqual(Object.keys(index).sort(), ['pageSize', 'records', 'version'], '索引只保存版本、页大小和轻量记录');
assert.match(index.version, /^[a-f\d]{16}$/u, '索引版本应是内容指纹');
assert.equal(index.pageSize, 10, '归档每页最多 10 条');
assert.ok(Array.isArray(index.records), '索引 records 必须是数组');
const pageCount = Math.max(1, Math.ceil(index.records.length / index.pageSize));
const indexBytes = Buffer.byteLength(indexText);
assert.ok(indexBytes <= 512 + index.records.length * 384, `轻量索引过大：${indexBytes} 字节`);

const airports = JSON.parse(await readFile(join(projectRoot, 'src/data/airports.json'), 'utf8'));
const expectedRecords = airports.flatMap((airport) => (airport.tests ?? []).map((test) => ({ ...test, airportSlug: airport.slug })))
	.sort(compareTestsNewestFirst);
assert.equal(index.records.length, expectedRecords.length, '索引必须覆盖全部原始记录，不能只收录当前页或四区计分记录');
const indexedIds = new Set();
for (const [position, record] of index.records.entries()) {
	assert.deepEqual(Object.keys(record).sort(), ['airport', 'date', 'id', 'page', 'region'], '轻量索引不能包含速度、设备、证据或完整详情');
	assert.equal(indexedIds.has(record.id), false, `索引记录重复：${record.id}`);
	indexedIds.add(record.id);
	const expected = expectedRecords[position];
	assert.equal(record.id, `record-${expected.airportSlug}-${encodeURIComponent(expected.id)}`, '索引顺序及记录锚点应与稳定记录一致');
	assert.equal(record.airport, expected.airportSlug);
	assert.equal(record.date, expected.testedAt);
	assert.equal(record.region, getTestRegion(expected) ?? '');
	assert.equal(record.page, Math.floor(position / index.pageSize) + 1, `索引页码错误：${record.id}`);
}

const numericPages = (await readdir(join(distRoot, 'test'), { withFileTypes: true }))
	.filter((entry) => entry.isDirectory() && /^\d+$/u.test(entry.name)).map((entry) => Number(entry.name)).sort((a, b) => a - b);
assert.deepEqual(numericPages, Array.from({ length: pageCount - 1 }, (_, i) => i + 2), '数字分页应连续，从第 2 页开始');
const renderedIds = new Set();
const canonicalUrls = new Set();
const archivePages = [];
for (let page = 1; page <= pageCount; page += 1) {
	const pathname = pageHref(page);
	const html = await getHtml(localFile(pathname));
	const archive = tags(html, 'section').filter((tag) => Object.hasOwn(tag, 'data-test-archive'));
	assert.equal(archive.length, 1, `${pathname} 必须有一个归档区域`);
	assert.equal(Number(archive[0]['data-current-page']), page, `${pathname} 当前页码错误`);
	assert.equal(archive[0]['data-archive-version'], index.version, `${pathname} 索引版本与页面不一致`);
	assert.equal(new URL(archive[0]['data-index-url'], origin).pathname, '/test/record-index.json');
	assert.equal(new URL(archive[0]['data-index-url'], origin).searchParams.get('v'), index.version);
	assert.equal(/\bdata-record-pagination(?:[\s=>])/u.test(html), false, `${pathname} 不得再对全量行做隐藏式分页`);
	const canonicals = tags(html, 'link').filter((tag) => tag.rel === 'canonical');
	assert.equal(canonicals.length, 1, `${pathname} canonical 数量错误`);
	assert.equal(canonicals[0].href, `${origin}${pathname}`, `${pathname} 应保留独立 canonical`);
	assert.equal(canonicalUrls.has(canonicals[0].href), false, '分页 canonical 不得重复');
	canonicalUrls.add(canonicals[0].href);
	const bodies = [...html.matchAll(/<tbody\b([^>]*)>([\s\S]*?)<\/tbody>/giu)]
		.filter((match) => Object.hasOwn(attributes(match[1]), 'data-archive-rows'));
	assert.equal(bodies.length, 1, `${pathname} 应有一个原始记录表体`);
	const rows = [...bodies[0][2].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/giu)];
	const expectedRows = index.records.slice((page - 1) * index.pageSize, page * index.pageSize);
	assert.equal(rows.length, expectedRows.length, `${pathname} 当页记录条数不符`);
	assert.ok(rows.length <= 10, `${pathname} 包含超过 10 条记录`);
	assert.equal(tags(html, 'tr').filter((tag) => Object.hasOwn(tag, 'data-page-row')).length, rows.length, `${pathname} 不应另外内嵌隐藏记录`);
	for (const [position, row] of rows.entries()) {
		const rowAttributes = attributes(row[1]);
		const record = expectedRows[position];
		assert.ok(Object.hasOwn(rowAttributes, 'data-page-row'), `${pathname} 原始记录行标记缺失`);
		assert.equal(rowAttributes.id, record.id, `${pathname} 记录应与索引逐条对应`);
		assert.equal(Object.hasOwn(rowAttributes, 'hidden'), false, `${pathname} 当页记录不应隐藏`);
		assert.equal(/display\s*:\s*none/iu.test(rowAttributes.style ?? ''), false);
		assert.equal(renderedIds.has(record.id), false, `跨页记录重复：${record.id}`);
		renderedIds.add(record.id);
		const stableHref = `/airport/${record.airport}/#${encodeURIComponent(record.id)}`;
		assert.ok(tags(row[2], 'a').some((tag) => tag.href === stableHref), `${record.id} 缺少正确的稳定详情链接`);
	}
	const navigations = [...html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/giu)]
		.filter((match) => Object.hasOwn(attributes(match[1]), 'data-archive-pagination'));
	assert.equal(navigations.length, 1, `${pathname} 缺少普通分页导航`);
	const paginationLinks = tags(navigations[0][2], 'a');
	for (const link of paginationLinks) {
		const destination = Number(link['data-archive-page']);
		assert.ok(Number.isInteger(destination) && destination >= 1 && destination <= pageCount, `${pathname} 分页目标无效`);
		assert.equal(link.href, pageHref(destination), `${pathname} 分页地址无效`);
	}
	assert.ok(paginationLinks.some((link) => Number(link['data-archive-page']) === page && link['aria-current'] === 'page'), `${pathname} 当前分页未标注`);
	if (page > 1) assert.ok(paginationLinks.some((link) => link.rel === 'prev' && link.href === pageHref(page - 1)), `${pathname} 缺少上一页链接`);
	if (page < pageCount) assert.ok(paginationLinks.some((link) => link.rel === 'next' && link.href === pageHref(page + 1)), `${pathname} 缺少下一页链接`);
	for (const link of tags(html, 'a')) if (link.href) await checkLocalLink(link.href, pathname);
	archivePages.push({ pathname, html });
}
assert.deepEqual([...renderedIds].sort(), [...indexedIds].sort(), '静态页面与索引必须一一覆盖且不能漏记');

// Initial HTML and its script must not smuggle the full archive back into the first response.
const homeHtml = archivePages[0].html;
for (const record of index.records.slice(index.pageSize)) {
	assert.equal(homeHtml.includes(record.id), false, `首页内嵌了后续分页记录：${record.id}`);
}
for (const script of [...homeHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)]) {
	const attrs = attributes(script[1]);
	const contents = attrs.src && new URL(attrs.src, origin).origin === origin
		? await readFile(localFile(new URL(attrs.src, origin).pathname), 'utf8') : script[2];
	assert.equal(/\b(?:downloadMbps|uploadMbps|baselineDownloadMbps|evidenceNote)["']?\s*:/u.test(contents), false, '首页脚本不能内嵌全量测试详情');
}

const sitemapFiles = (await readdir(distRoot)).filter((filename) => /^sitemap.*\.xml$/u.test(filename));
assert.ok(sitemapFiles.length, '正式构建应生成 sitemap');
const sitemapEntries = new Map();
for (const filename of sitemapFiles) {
	const xml = await readFile(join(distRoot, filename), 'utf8');
	assert.equal(xml.includes('/test/record-index.json'), false, '轻量 JSON 索引不应进入 sitemap');
	for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/gu)) {
		const url = decode(match[1].match(/<loc>([^<]+)<\/loc>/u)?.[1] ?? '');
		assert.equal(sitemapEntries.has(url), false, `sitemap URL 重复：${url}`);
		sitemapEntries.set(url, match[1].match(/<lastmod>([^<]+)<\/lastmod>/u)?.[1]);
	}
}
const pageUpdates = JSON.parse(await readFile(join(projectRoot, 'src/data/page-updates.json'), 'utf8'));
const archiveModifiedAt = [pageUpdates['/test/'], ...expectedRecords.filter((record) => record.resultUrl || record.evidenceImage).map((record) => record.testedAt)]
	.filter(Boolean).sort().at(-1);
for (const { pathname } of archivePages) {
	assert.ok(sitemapEntries.has(`${origin}${pathname}`), `${pathname} 未进入 sitemap`);
	assert.equal(sitemapEntries.get(`${origin}${pathname}`)?.slice(0, 10), archiveModifiedAt, `${pathname} 应沿用 /test/ 真实修改日期`);
}
console.log(`测速归档构建检查通过：${pageCount} 个静态分页、${renderedIds.size} 条记录完整覆盖，轻量索引 ${indexBytes} 字节，${checkedLinks} 个站内链接及 sitemap 日期正确。`);
