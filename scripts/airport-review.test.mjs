import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { getAirportReview } from '../src/data/airport-review.ts';

const makeTest = (id, overrides = {}) => ({
	id,
	testedAt: '2026-10-01',
	time: '20:00',
	window: '晚高峰',
	node: '香港节点',
	baselineDownloadMbps: 1000,
	downloadMbps: 100,
	uploadMbps: 20,
	chatgpt: '流畅',
	streaming: '流畅',
	latencyMs: 10,
	resultUrl: `https://www.speedtest.net/result/${id}`,
	sourceRegion: null,
	isp: null,
	device: null,
	client: null,
	...overrides,
});
const reviewTests = (tests) => getAirportReview({ tests });
const hongKong = (review) => review.regions.find(({ region }) => region === '香港');

test('无样本返回四个固定地区、null 测量和三条无证据观察', () => {
	const review = getAirportReview({});
	assert.deepEqual(review.regions.map(({ region }) => region), ['新加坡', '香港', '日本', '美国']);
	assert.equal(review.verifiedCount, 0);
	assert.equal(review.dateCount, 0);
	assert.equal(review.startDate, null);
	assert.equal(review.endDate, null);
	for (const region of review.regions) {
		assert.equal(region.latest, null);
		assert.equal(region.dailyMedianDownload, null);
		assert.equal(region.dailyDownloadMin, null);
		assert.equal(region.dailyDownloadMax, null);
		assert.deepEqual(region.daily, []);
		assert.deepEqual(region.chatgptCounts, []);
		assert.deepEqual(region.streamingCounts, []);
	}
	assert.equal(review.observations.length, 3);
	assert.ok(review.observations.every(({ records }) => records.length === 0));
	assert.deepEqual(review.evidence, []);
});

test('只有结果链接或测速主截图可计入核验，附加体验截图本身不够', () => {
	const verifiedByResult = makeTest('result');
	const verifiedByImage = makeTest('image', { resultUrl: null, evidenceImage: '/evidence/image.png', testedAt: '2026-10-02' });
	const supplementalOnly = makeTest('extra-only', { resultUrl: null, evidenceImages: [{ label: 'ChatGPT', path: '/evidence/chatgpt.png' }], testedAt: '2026-10-03' });
	const noEvidence = makeTest('none', { resultUrl: null, testedAt: '2026-10-04', downloadMbps: 999 });
	const review = reviewTests([verifiedByResult, verifiedByImage, supplementalOnly, noEvidence]);
	assert.equal(review.verifiedCount, 2);
	assert.equal(review.dateCount, 2);
	assert.equal(review.startDate, '2026-10-01');
	assert.equal(review.endDate, '2026-10-02');
	assert.equal(hongKong(review).latest, verifiedByImage);
	assert.equal(hongKong(review).recordCount, 2);
	assert.deepEqual(review.evidence.map(({ test }) => test.id), ['image']);
	assert.ok(review.observations.every(({ records }) => records.every((record) => record === verifiedByResult || record === verifiedByImage)));
});

test('日内下载与上传分别取中位数，跨日不因同一天重复测速而加权', () => {
	const records = [
		makeTest('many-a', { downloadMbps: 80, uploadMbps: 10 }),
		makeTest('many-b', { downloadMbps: 100, uploadMbps: 20 }),
		makeTest('many-c', { downloadMbps: 120, uploadMbps: 30 }),
		makeTest('zero-day', { testedAt: '2026-10-02', downloadMbps: 0, uploadMbps: 0 }),
	];
	const region = hongKong(reviewTests(records));
	assert.equal(region.recordCount, 4);
	assert.equal(region.dateCount, 2);
	assert.deepEqual(region.daily.map(({ date, downloadMedian, uploadMedian }) => ({ date, downloadMedian, uploadMedian })), [
		{ date: '2026-10-01', downloadMedian: 100, uploadMedian: 20 },
		{ date: '2026-10-02', downloadMedian: 0, uploadMedian: 0 },
	]);
	// The pooled median would be 90; equal weighting of two dates must yield 50.
	assert.equal(region.dailyMedianDownload, 50);
	assert.equal(region.dailyDownloadMin, 0);
	assert.equal(region.dailyDownloadMax, 100);
	assert.equal(region.daily[1].records[0].id, 'zero-day');
});

test('偶数日内中位数与真实零值不会被当成缺失数据', () => {
	const region = hongKong(reviewTests([
		makeTest('zero', { downloadMbps: 0, uploadMbps: 0 }),
		makeTest('positive', { downloadMbps: 20, uploadMbps: 10 }),
	]));
	assert.equal(region.daily[0].downloadMedian, 10);
	assert.equal(region.daily[0].uploadMedian, 5);
	const allZero = hongKong(reviewTests([makeTest('all-zero', { downloadMbps: 0, uploadMbps: 0 })]));
	assert.equal(allZero.dailyMedianDownload, 0);
	assert.equal(allZero.dailyDownloadMin, 0);
	assert.equal(allZero.dailyDownloadMax, 0);
});

test('来源地区不是节点地区，未知或同时命名两个地区的节点不分配', () => {
	const review = reviewTests([
		makeTest('unknown', { node: '未标注节点', sourceRegion: '香港', testedAt: '2026-10-03' }),
		makeTest('ambiguous', { node: '香港中转美国', downloadMbps: 999 }),
		makeTest('english-only', { node: 'US 01', downloadMbps: 888 }),
		makeTest('singapore', { node: '新加坡 01', downloadMbps: 50 }),
	]);
	assert.equal(review.verifiedCount, 4);
	assert.equal(review.endDate, '2026-10-03');
	assert.deepEqual(review.regions.map(({ recordCount }) => recordCount), [1, 0, 0, 0]);
	assert.equal(review.regions[0].dailyMedianDownload, 50);
	assert.match(review.observations[0].body, /3 条节点地区无法明确归类/u);
});

test('最新样本保留每个地区实际日期，并按明确时间排序，近似时间不推断分钟', () => {
	const late = makeTest('latest-hk', { testedAt: '2026-10-03', time: '22:00' });
	const review = reviewTests([
		makeTest('older-hk', { testedAt: '2026-10-02', time: '23:00' }),
		makeTest('earlier-hk', { testedAt: '2026-10-03', time: '21:00' }),
		makeTest('approximate-hk', { testedAt: '2026-10-03', time: '约 23:00' }),
		makeTest('unknown-time-hk', { testedAt: '2026-10-03', time: null }),
		late,
		makeTest('older-jp', { node: '日本节点', testedAt: '2026-10-01' }),
	]);
	assert.equal(hongKong(review).latest, late);
	assert.equal(review.regions[2].latest.testedAt, '2026-10-01');
	assert.equal(review.regions[0].latest, null);
});

test('状态数量保留原始分类，服务观察引用最新核验记录与真实状态差异，排除未核验记录', () => {
	const records = [
		makeTest('smooth-a'),
		makeTest('smooth-b'),
		makeTest('slow', { testedAt: '2026-10-02', chatgpt: '响应较慢', streaming: '缓冲明显' }),
		makeTest('unavailable', { testedAt: '2026-10-03', chatgpt: '不可用' }),
		makeTest('latest', { testedAt: '2026-10-04' }),
		makeTest('excluded', { testedAt: '2026-10-05', resultUrl: null, chatgpt: '不可用', streaming: '不可用' }),
	];
	const review = reviewTests(records);
	assert.deepEqual(hongKong(review).chatgptCounts, [{ status: '流畅', count: 3 }, { status: '响应较慢', count: 1 }, { status: '不可用', count: 1 }]);
	assert.deepEqual(hongKong(review).streamingCounts, [{ status: '流畅', count: 4 }, { status: '缓冲明显', count: 1 }]);
	assert.equal(review.observations.length, 3);
	assert.ok(review.observations.every(({ records }) => records.length <= 3));
	const service = review.observations[2];
	assert.ok(service.records.length > 0 && service.records.length <= 2);
	assert.equal(service.records[0], records.find(({ id }) => id === 'latest'));
	assert.ok(service.records.some((record) => record.chatgpt !== service.records[0].chatgpt || record.streaming !== service.records[0].streaming));
	for (const record of service.records) {
		assert.ok(records.includes(record));
		assert.ok(record.resultUrl || record.evidenceImage);
		assert.ok(service.body.includes(record.testedAt));
		assert.ok(service.body.includes(record.chatgpt));
		assert.ok(service.body.includes(record.streaming));
	}
});

test('截图优先最近、最低下载与同地区不同日期，不只展示高值', () => {
	const screenshot = (id, changes) => makeTest(id, { evidenceImage: `/evidence/${id}.png`, ...changes });
	const review = reviewTests([
		screenshot('latest', { testedAt: '2026-10-04', downloadMbps: 900 }),
		screenshot('lower-old', { testedAt: '2026-10-01', node: '美国节点', downloadMbps: 0 }),
		screenshot('same-region-old', { testedAt: '2026-10-03', downloadMbps: 400 }),
		screenshot('high-jp', { testedAt: '2026-10-03', node: '日本节点', downloadMbps: 999 }),
	]);
	assert.deepEqual(review.evidence.map(({ test }) => test.id), ['latest', 'lower-old', 'same-region-old']);
	assert.match(review.evidence[0].note, /最近的带图实测/u);
	assert.match(review.evidence[1].note, /下载最低/u);
	assert.match(review.evidence[2].note, /同地区、不同日期/u);
	assert.equal(review.evidence[1].test.downloadMbps, 0);
});

test('截图只返回主测速截图路径，去重且最多三条', () => {
	const review = reviewTests([
		makeTest('result-only', { testedAt: '2026-10-05' }),
		makeTest('extra', { testedAt: '2026-10-04', evidenceImages: [{ label: 'ChatGPT 状态截图', path: '/evidence/shared.png' }] }),
		makeTest('duplicate', { testedAt: '2026-10-03', evidenceImage: '/evidence/shared.png' }),
		makeTest('same-image', { testedAt: '2026-10-02', evidenceImage: '/evidence/shared.png' }),
		makeTest('second', { node: '日本节点', testedAt: '2026-10-02', evidenceImage: '/evidence/second.png' }),
		makeTest('third', { node: '美国节点', testedAt: '2026-10-01', evidenceImage: '/evidence/third.png' }),
		makeTest('fourth', { evidenceImage: '/evidence/fourth.png' }),
	]);
	assert.equal(review.evidence.length, 3);
	assert.equal(new Set(review.evidence.map(({ imagePath }) => imagePath)).size, 3);
	assert.equal(new Set(review.evidence.map(({ test }) => test.id)).size, 3);
	assert.equal(review.evidence[0].test.id, 'duplicate');
	assert.ok(review.evidence.every(({ test, imagePath }) => imagePath === test.evidenceImage));
	assert.deepEqual(reviewTests([makeTest('only-url')]).evidence, []);
});

test('有结果链接但仅附加 ChatGPT 状态图的记录可计入汇总，不能误入测速画廊', () => {
	const record = makeTest('chatgpt-extra', { evidenceImages: [{ label: 'ChatGPT 状态截图', path: '/evidence/chatgpt.png' }] });
	const review = reviewTests([record]);
	assert.equal(review.verifiedCount, 1);
	assert.equal(hongKong(review).recordCount, 1);
	assert.equal(hongKong(review).dailyMedianDownload, 100);
	assert.deepEqual(review.evidence, []);
	assert.deepEqual(record.evidenceImages, [{ label: 'ChatGPT 状态截图', path: '/evidence/chatgpt.png' }]);
});

test('地区未知的主截图可以保留，但选择依据不能称它为另一个已知地区', () => {
	const review = reviewTests([
		makeTest('latest', { testedAt: '2026-10-04', downloadMbps: 500, evidenceImage: '/evidence/latest.png' }),
		makeTest('unknown', { testedAt: '2026-10-03', node: '未标注节点', downloadMbps: 200, evidenceImage: '/evidence/unknown.png' }),
		makeTest('lowest', { testedAt: '2026-10-01', node: '日本节点', downloadMbps: 0, evidenceImage: '/evidence/lowest.png' }),
	]);
	assert.equal(review.evidence[2].test.id, 'unknown');
	assert.doesNotMatch(review.evidence[2].note, /其他地区/u);
	assert.match(review.evidence[2].note, /下一条带图实测/u);
});

test('派生统计不修改输入，排序在输入顺序变化时仍可复查', () => {
	const tests = [makeTest('b', { evidenceImage: '/evidence/b.png' }), makeTest('a', { evidenceImage: '/evidence/a.png' })];
	const before = JSON.stringify(tests);
	Object.freeze(tests);
	tests.forEach(Object.freeze);
	const input = Object.freeze({ tests });
	const first = getAirportReview(input);
	assert.equal(JSON.stringify(tests), before);
	assert.deepEqual(first, reviewTests([...tests].reverse()));
});

test('现有机场的核验数量、日期权重、零值和实际图片路径保持一致', () => {
	const airports = JSON.parse(readFileSync(new URL('../src/data/airports.json', import.meta.url), 'utf8'));
	for (const airport of airports) {
		const review = getAirportReview(airport);
		const verified = (airport.tests ?? []).filter((record) => record.resultUrl || record.evidenceImage);
		assert.equal(review.verifiedCount, verified.length, airport.slug);
		assert.equal(review.dateCount, new Set(verified.map(({ testedAt }) => testedAt)).size, airport.slug);
		assert.equal(review.observations.length, 3, airport.slug);
		assert.ok(review.observations.every(({ records }) => records.length <= 3 && records.every((record) => verified.includes(record))), airport.slug);
		for (const region of review.regions) {
			assert.equal(region.dateCount, region.daily.length, `${airport.slug}/${region.region}`);
			assert.equal(region.recordCount, region.daily.reduce((sum, day) => sum + day.records.length, 0));
			if (region.daily.length) {
				const downloads = region.daily.map(({ downloadMedian }) => downloadMedian).sort((a, b) => a - b);
				const midpoint = Math.floor(downloads.length / 2);
				const expected = downloads.length % 2 ? downloads[midpoint] : (downloads[midpoint - 1] + downloads[midpoint]) / 2;
				assert.equal(region.dailyMedianDownload, expected, `${airport.slug}/${region.region}`);
			}
		}
		assert.ok(review.evidence.length <= 3, airport.slug);
		for (const { test: record, imagePath } of review.evidence) {
			assert.ok(verified.includes(record), airport.slug);
			assert.ok(existsSync(new URL(`../public${imagePath}`, import.meta.url)), `${airport.slug}: ${imagePath}`);
		}
	}
});
