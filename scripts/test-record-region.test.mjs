import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getAirportReview } from '../src/data/airport-review.ts';
import { getLatestRegionTests, sortTestsNewestFirst } from '../src/data/test-record-presentation.ts';
import { getCoreTestRegion, getTestRegion, getTestRegions, TEST_REGIONS } from '../src/data/test-regions.mjs';
import { auditData } from './audit-data.mjs';

const makeTest = (id, overrides = {}) => ({
	id,
	testedAt: '2026-10-01',
	time: '22:00',
	window: '晚高峰',
	node: '香港中转美国',
	exitRegion: '美国',
	baselineDownloadMbps: 1000,
	downloadMbps: 100,
	uploadMbps: 20,
	chatgpt: '流畅',
	streaming: '流畅',
	latencyMs: 10,
	resultUrl: `https://www.speedtest.net/result/${id}`,
	sourceRegion: '香港',
	isp: 'Singapore ISP',
	server: '测速服务器 · Tokyo',
	device: null,
	client: null,
	...overrides,
});

const auditTests = (tests) => auditData({
	airports: [{ slug: 'region-fixture', name: '出口地区测试', commercialReviewedAt: '2026-10-01', tests }],
	projectRoot: '.',
	today: '2026-10-04',
});

test('出口地区归一四区常用别名，原字段不被改写', () => {
	for (const [value, expected] of [
		['SG', '新加坡'], [' singapore ', '新加坡'],
		['HK', '香港'], ['Hong Kong', '香港'], ['中国香港', '香港'],
		['JP', '日本'], ['Japan', '日本'],
		['US', '美国'], ['USA', '美国'], ['United States', '美国'], ['United States of America', '美国'],
		...TEST_REGIONS.map((region) => [region, region]),
	]) {
		const record = Object.freeze(makeTest('alias', { exitRegion: value }));
		assert.equal(getTestRegion(record), expected, value);
		assert.equal(getCoreTestRegion(record), expected, value);
		assert.equal(record.exitRegion, value);
	}
});

test('香港中转美国只计美国，香港节点的日本出口只计日本', () => {
	const us = makeTest('us-exit');
	const jp = makeTest('jp-exit', { node: '香港节点', exitRegion: 'JP' });
	const records = [us, jp];
	const review = getAirportReview({ tests: records });
	const latest = getLatestRegionTests(records);
	assert.deepEqual(review.regions.map(({ recordCount }) => recordCount), [0, 0, 1, 1]);
	assert.deepEqual(latest.filter(({ test: record }) => record).map(({ region, test: record }) => [region, record.id]), [
		['日本', 'jp-exit'], ['美国', 'us-exit'],
	]);
	assert.equal(review.regions.find(({ region }) => region === '日本').latest, jp);
	assert.equal(review.regions.find(({ region }) => region === '美国').latest, us);
});

test('出口地区缺失、null或空白时不从节点、本地地区、ISP或服务器猜测', async () => {
	const records = [undefined, null, '  '].map((exitRegion, index) => makeTest(`unknown-${index}`, { exitRegion }));
	for (const record of records) {
		assert.equal(getTestRegion(record), null);
		assert.equal(getCoreTestRegion(record), null);
	}
	const review = getAirportReview({ tests: records });
	assert.equal(review.verifiedCount, records.length);
	assert.ok(review.regions.every(({ recordCount, latest }) => recordCount === 0 && latest === null));
	assert.ok(getLatestRegionTests(records).every(({ test: record }) => record === undefined));
	const report = await auditTests(records.filter(({ exitRegion }) => exitRegion !== '  '));
	assert.deepEqual(report.errors, []);
	assert.equal(report.rows[0].rankingGap, '新加坡缺3天、香港缺3天、日本缺3天、美国缺3天');
	const invalid = await auditTests([makeTest('invalid-region', { exitRegion: '  ' })]);
	assert.ok(invalid.errors.some((error) => error.includes('invalid-region') && error.includes('exitRegion')));
});

test('德国出口保留原地区，不强制归入四区或沿用节点名', async () => {
	const record = makeTest('germany', { node: '日本节点', exitRegion: '德国' });
	assert.equal(getTestRegion(record), '德国');
	assert.equal(getCoreTestRegion(record), null);
	assert.deepEqual(getTestRegions([record, makeTest('hk', { exitRegion: 'HK' }), record]), ['香港', '德国']);
	const review = getAirportReview({ tests: [record] });
	assert.equal(review.verifiedCount, 1);
	assert.ok(review.regions.every(({ recordCount }) => recordCount === 0));
	assert.match(review.observations[0].body, /四个比较地区以外的出口/u);
	assert.doesNotMatch(review.observations[0].body, /出口地区未确认/u);
	assert.ok(getLatestRegionTests([record]).every(({ test: current }) => current === undefined));
	const report = await auditTests([record]);
	assert.deepEqual(report.errors, []);
	assert.equal(report.rows[0].rankingGap, '新加坡缺3天、香港缺3天、日本缺3天、美国缺3天');
});

test('同日明确22点优于约23点，同刻按记录ID稳定排序且最新摘要与图表一致', () => {
	const records = [
		makeTest('approximate', { time: '约 23:00', window: '晚间' }),
		makeTest('b-exact'),
		makeTest('unknown-time', { time: null }),
		makeTest('a-exact'),
	];
	const before = structuredClone(records);
	const expected = ['a-exact', 'b-exact', 'approximate', 'unknown-time'];
	for (const input of [records, [...records].reverse()]) {
		assert.deepEqual(sortTestsNewestFirst(input).map(({ id }) => id), expected);
		assert.equal(getLatestRegionTests(input).find(({ region }) => region === '美国').test.id, 'a-exact');
		assert.equal(getAirportReview({ tests: input }).regions.find(({ region }) => region === '美国').latest.id, 'a-exact');
	}
	assert.deepEqual(records, before);
});

test('入库审计拒绝未换算的GMT时刻，允许北京时间、约时间和未知', async () => {
	for (const time of ['22:00', '约 23:00', null]) {
		const report = await auditTests([makeTest('beijing-time', { time })]);
		assert.deepEqual(report.errors, []);
	}
	const report = await auditTests([makeTest('raw-gmt', { time: '14:00 GMT' })]);
	assert.ok(report.errors.some((error) => error.includes('raw-gmt') && error.includes('time') && error.includes('北京时间')));
});

const threeDayCoverage = () => ['2026-10-01', '2026-10-02', '2026-10-03'].flatMap((testedAt, dayIndex) =>
	['SG', 'HK', 'JP', 'US'].map((exitRegion) => makeTest(`${exitRegion}-${dayIndex + 1}`, {
		testedAt,
		node: '香港中转美国',
		exitRegion,
	})),
);

test('混淆节点名的四区各三日样本在审计、图表和最新摘要中归档一致', async () => {
	const records = threeDayCoverage();
	const before = structuredClone(records);
	const report = await auditTests(records);
	assert.deepEqual(report.errors, []);
	assert.equal(report.rows[0].rankingGap, '已满足');
	const review = getAirportReview({ tests: records });
	const latest = getLatestRegionTests(records);
	for (const region of review.regions) {
		assert.equal(region.recordCount, 3, region.region);
		assert.equal(region.dateCount, 3, region.region);
		assert.deepEqual(region.daily.map(({ date }) => date), ['2026-10-01', '2026-10-02', '2026-10-03']);
		assert.equal(region.latest.testedAt, '2026-10-03');
		assert.equal(region.latest, latest.find((item) => item.region === region.region).test);
		assert.ok(region.daily.flatMap(({ records: samples }) => samples).every((record) => getTestRegion(record) === region.region));
	}
	assert.deepEqual(records, before);
});

test('同一日本出口日期重复测试不能补足缺少的第三日', async () => {
	const records = threeDayCoverage().filter(({ id }) => id !== 'JP-3');
	records.push(makeTest('JP-repeat', { exitRegion: '日本', testedAt: '2026-10-02' }));
	const report = await auditTests(records);
	assert.deepEqual(report.errors, []);
	assert.equal(report.rows[0].rankingGap, '日本缺1天');
	const region = getAirportReview({ tests: records }).regions.find(({ region }) => region === '日本');
	assert.equal(region.recordCount, 3);
	assert.equal(region.dateCount, 2);
});

test('生产记录按显式出口地区归档，数量与最新入口一致且不固定数据总量', () => {
	const airports = JSON.parse(readFileSync(new URL('../src/data/airports.json', import.meta.url), 'utf8'));
	assert.ok(airports.some((airport) => airport.tests?.length));
	for (const airport of airports) {
		const verified = (airport.tests ?? []).filter((record) => record.resultUrl || record.evidenceImage);
		const review = getAirportReview(airport);
		const latest = getLatestRegionTests(verified);
		assert.equal(review.verifiedCount, verified.length, airport.slug);
		for (const region of review.regions) {
			const expected = verified.filter((record) => getTestRegion(record) === region.region);
			assert.equal(region.recordCount, expected.length, `${airport.slug}/${region.region}`);
			assert.equal(region.dateCount, new Set(expected.map(({ testedAt }) => testedAt)).size);
			assert.equal(region.latest ?? undefined, latest.find((item) => item.region === region.region).test);
		}
		assert.equal(review.regions.reduce((sum, region) => sum + region.recordCount, 0), verified.filter((record) => getCoreTestRegion(record)).length);
	}
});
