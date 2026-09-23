import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGIONS = ['新加坡', '香港', '日本', '美国'];
const MIN_REGION_DAYS = 3;

const addMonths = (dateKey, months) => {
	const date = new Date(`${dateKey}T00:00:00Z`);
	date.setUTCMonth(date.getUTCMonth() + months);
	return date.toISOString().slice(0, 10);
};

const unique = (values) => [...new Set(values)];

export const auditData = async ({ airports, projectRoot, today }) => {
	const errors = [];
	const warnings = [];
	const airportSlugs = airports.map((airport) => airport.slug);
	const duplicateSlugs = unique(airportSlugs.filter((slug, index) => airportSlugs.indexOf(slug) !== index));
	for (const slug of duplicateSlugs) errors.push(`机场 slug 重复：${slug}`);

	const allTests = airports.flatMap((airport) => (airport.tests ?? [])
		.map((test) => ({ airportSlug: airport.slug, test })));
	const ids = new Map();
	const resultUrls = new Map();
	for (const { airportSlug, test } of allTests) {
		const idKey = `${airportSlug}:${test.id}`;
		if (ids.has(idKey)) errors.push(`测试 ID 重复：${idKey}`);
		ids.set(idKey, true);
		if (test.resultUrl) {
			if (resultUrls.has(test.resultUrl)) errors.push(`Speedtest 链接重复：${test.resultUrl}`);
			resultUrls.set(test.resultUrl, true);
		}
		if (test.evidenceImage) {
			try {
				await access(join(projectRoot, 'public', test.evidenceImage.replace(/^\//u, '')));
			} catch {
				errors.push(`证据文件不存在：${test.evidenceImage}`);
			}
		}
	}

	const rows = airports.map((airport) => {
		const verifiedTests = allTests
			.filter((item) => item.airportSlug === airport.slug)
			.map((item) => item.test)
			.filter((test) => test.resultUrl || test.evidenceImage);
		const regionDays = Object.fromEntries(REGIONS.map((region) => [
			region,
			new Set(verifiedTests.filter((test) => test.node.includes(region)).map((test) => test.testedAt)).size,
		]));
		const nextReviewAt = addMonths(airport.commercialReviewedAt, 2);
		const reviewState = nextReviewAt < today ? '已到期' : nextReviewAt === today ? '今日到期' : '正常';
		if (reviewState !== '正常') warnings.push(`${airport.name}商业资料${reviewState}：${nextReviewAt}`);
		const gaps = REGIONS.filter((region) => regionDays[region] < MIN_REGION_DAYS)
			.map((region) => `${region}缺${MIN_REGION_DAYS - regionDays[region]}天`);

		return {
			name: airport.name,
			slug: airport.slug,
			commercialReviewedAt: airport.commercialReviewedAt,
			nextReviewAt,
			reviewState,
			latestTestAt: verifiedTests.map((test) => test.testedAt).sort().at(-1) ?? '无',
			verifiedTests: verifiedTests.length,
			rankingGap: gaps.length ? gaps.join('、') : '已满足',
		};
	});

	return { today, airportCount: airports.length, testCount: allTests.length, rows, errors, warnings };
};

const run = async () => {
	const airports = await readFile(join(PROJECT_ROOT, 'src/data/airports.json'), 'utf8').then(JSON.parse);
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
	}).format(new Date());
	const report = await auditData({ airports, projectRoot: PROJECT_ROOT, today });

	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log(`数据审计日期：${report.today}｜机场 ${report.airportCount}｜测速 ${report.testCount}`);
		console.table(report.rows.map((row) => ({
			机场: row.name,
			资料复核: row.commercialReviewedAt,
			下次复核: `${row.nextReviewAt}（${row.reviewState}）`,
			最新测速: row.latestTestAt,
			有效记录: row.verifiedTests,
			参评缺口: row.rankingGap,
		})));
		if (report.warnings.length) console.warn(`提醒：\n- ${report.warnings.join('\n- ')}`);
		if (report.errors.length) console.error(`错误：\n- ${report.errors.join('\n- ')}`);
		if (!report.warnings.length && !report.errors.length) console.log('未发现维护提醒或数据错误。');
	}

	if (report.errors.length) process.exitCode = 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
	await run();
}
