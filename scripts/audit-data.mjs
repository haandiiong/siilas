import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCalendarMonths, getDateValidationError, getPartialDateValidationError, getShanghaiDateKey, getTestWindow, isCalendarDate } from '../src/data/date-utils.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REGIONS = ['新加坡', '香港', '日本', '美国'];
const MIN_REGION_DAYS = 3;

const unique = (values) => [...new Set(values)];

export const auditData = async ({ airports, profiles = [], pageUpdates = {}, projectRoot, today = getShanghaiDateKey() }) => {
	if (!isCalendarDate(today)) throw new RangeError(`无效审计日期：${today}`);
	const errors = [];
	const warnings = [];
	const validateDate = (value, label) => {
		const message = getDateValidationError(value, today);
		if (message) errors.push(`${label}：${message}（${String(value)}）`);
		return !message;
	};
	for (const [pathname, updatedAt] of Object.entries(pageUpdates)) validateDate(updatedAt, `页面 ${pathname} 编辑日期`);
	const airportSlugs = airports.map((airport) => airport.slug);
	const duplicateSlugs = unique(airportSlugs.filter((slug, index) => airportSlugs.indexOf(slug) !== index));
	for (const slug of duplicateSlugs) errors.push(`机场 slug 重复：${slug}`);
	const profileSlugs = profiles.map((profile) => profile.slug);
	const allSlugs = [...airportSlugs, ...profileSlugs];
	for (const slug of unique(allSlugs.filter((value, index) => allSlugs.indexOf(value) !== index))) {
		if (!duplicateSlugs.includes(slug)) errors.push(`实测页与资料页 slug 冲突或资料页重复：${slug}`);
	}
	for (const profile of profiles) {
		const validSourceReviewedAt = validateDate(profile.sourceReviewedAt, `${profile.name} sourceReviewedAt`);
		const validSourceUpdatedAt = validateDate(profile.sourceUpdatedAt, `${profile.name} sourceUpdatedAt`);
		const validEditorialUpdatedAt = validateDate(profile.editorialUpdatedAt, `${profile.name} editorialUpdatedAt`);
		if (profile.publishedAt != null) {
			const validPublishedAt = validateDate(profile.publishedAt, `${profile.name} publishedAt`);
			if (validPublishedAt && validEditorialUpdatedAt && profile.publishedAt > profile.editorialUpdatedAt) {
				errors.push(`${profile.name}首次发布日期晚于页面编辑日期`);
			}
		}
		if (validSourceReviewedAt && validSourceUpdatedAt && profile.sourceReviewedAt > profile.sourceUpdatedAt) {
			errors.push(`${profile.name}来源核对日期晚于来源页编辑日期`);
		}
		if (profile.status !== 'stopped' && validSourceReviewedAt) {
			const nextReviewAt = addCalendarMonths(profile.sourceReviewedAt, 2);
			if (nextReviewAt <= today) warnings.push(`${profile.name}来源资料需要复核：${nextReviewAt}`);
		}
	}
	for (const airport of airports) {
		validateDate(airport.commercialReviewedAt, `${airport.name} commercialReviewedAt`);
		for (const field of ['editorialUpdatedAt', 'clientSupportVerifiedAt', 'serviceStatusUpdated', 'chatgptStatusUpdated', 'streamingStatusUpdated']) {
			if (airport[field] !== undefined) validateDate(airport[field], `${airport.name} ${field}`);
		}
		if (airport.foundedAt !== undefined) {
			const message = getPartialDateValidationError(airport.foundedAt, today);
			if (message) errors.push(`${airport.name} foundedAt：${message}（${String(airport.foundedAt)}）`);
		}
		for (const [index, snapshot] of (airport.nodeSnapshots ?? []).entries()) {
			validateDate(snapshot.capturedAt, `${airport.name} nodeSnapshots[${index}].capturedAt`);
		}
		for (const [index, incident] of (airport.serviceIncidents ?? []).entries()) {
			validateDate(incident.observedAt, `${airport.name} serviceIncidents[${index}].observedAt`);
		}
	}

	const allTests = airports.flatMap((airport) => (airport.tests ?? [])
		.map((test) => ({ airportSlug: airport.slug, test })));
	const ids = new Map();
	const resultUrls = new Map();
	for (const { airportSlug, test } of allTests) {
		validateDate(test.testedAt, `${airportSlug} 测试 ${test.id} testedAt`);
		const expectedWindow = getTestWindow(test.time);
		if (expectedWindow && test.window !== expectedWindow) {
			errors.push(`${airportSlug} 测试 ${test.id} 时段应为${expectedWindow}（北京时间 ${test.time}）`);
		}
		const idKey = `${airportSlug}:${test.id}`;
		if (ids.has(idKey)) errors.push(`测试 ID 重复：${idKey}`);
		ids.set(idKey, true);
		if (test.resultUrl) {
			if (resultUrls.has(test.resultUrl)) errors.push(`Speedtest 链接重复：${test.resultUrl}`);
			resultUrls.set(test.resultUrl, true);
		}
		const evidencePaths = test.evidenceImage ? [test.evidenceImage] : [];
		for (const evidence of test.evidenceImages ?? []) {
			if (!evidence || typeof evidence.label !== 'string' || !evidence.label.trim() || typeof evidence.path !== 'string') {
				errors.push(`${idKey} 附加证据必须包含 label 和 path`);
				continue;
			}
			evidencePaths.push(evidence.path);
		}
		for (const evidencePath of evidencePaths) {
			if (!evidencePath.startsWith('/') || evidencePath.startsWith('//') || evidencePath.split('/').includes('..')) {
				errors.push(`证据路径无效：${evidencePath}`);
				continue;
			}
			try {
				await access(join(projectRoot, 'public', evidencePath.replace(/^\//u, '')));
			} catch {
				errors.push(`证据文件不存在：${evidencePath}`);
			}
		}
	}

	const rows = airports.map((airport) => {
		const verifiedTests = allTests
			.filter((item) => item.airportSlug === airport.slug)
			.map((item) => item.test)
			.filter((test) => (test.resultUrl || test.evidenceImage) && !getDateValidationError(test.testedAt, today));
		const regionDays = Object.fromEntries(REGIONS.map((region) => [
			region,
			new Set(verifiedTests.filter((test) => test.node.includes(region)).map((test) => test.testedAt)).size,
		]));
		const nextReviewAt = getDateValidationError(airport.commercialReviewedAt, today)
			? '无效日期' : addCalendarMonths(airport.commercialReviewedAt, 2);
		const reviewState = nextReviewAt === '无效日期' ? '日期错误'
			: nextReviewAt < today ? '已到期' : nextReviewAt === today ? '今日到期' : '正常';
		if (reviewState !== '正常' && reviewState !== '日期错误') warnings.push(`${airport.name}商业资料${reviewState}：${nextReviewAt}`);
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

	return { today, airportCount: airports.length, profileCount: profiles.length, testCount: allTests.length, rows, errors, warnings };
};

const run = async () => {
	const airports = await readFile(join(PROJECT_ROOT, 'src/data/airports.json'), 'utf8').then(JSON.parse);
	const profiles = await readFile(join(PROJECT_ROOT, 'src/data/airport-profiles.json'), 'utf8').then(JSON.parse);
	const pageUpdates = await readFile(join(PROJECT_ROOT, 'src/data/page-updates.json'), 'utf8').then(JSON.parse);
	const today = getShanghaiDateKey();
	const report = await auditData({ airports, profiles, pageUpdates, projectRoot: PROJECT_ROOT, today });

	if (process.argv.includes('--json')) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		console.log(`数据审计日期：${report.today}｜实测机场 ${report.airportCount}｜资料页 ${report.profileCount}｜测速 ${report.testCount}`);
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
