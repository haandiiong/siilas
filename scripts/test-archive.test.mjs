import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
	createArchiveIndex, filterArchiveRecords, getArchivePageCount, getArchivePageHref,
	normalizeArchiveFilters, paginateArchiveRecords,
} from '../src/data/test-archive-query.mjs';
import { getTestRecordAnchor, sortTestsNewestFirst } from '../src/data/test-record-presentation.ts';
import { getTestRegion } from '../src/data/test-regions.mjs';

const sample = (id, overrides = {}) => ({ id, airport: 'alpha', region: '香港', date: '2026-10-01', ...overrides });

test('机场、出口地区和北京时间日期联合筛选，日期上下界均包含', () => {
	const records = [
		sample('after', { date: '2026-10-04' }),
		sample('last', { date: '2026-10-03' }),
		sample('other-airport', { airport: 'alpha-extra', date: '2026-10-02' }),
		sample('other-region', { region: '日本', date: '2026-10-02' }),
		sample('unknown-region', { region: '', date: '2026-10-02' }),
		sample('first', { date: '2026-10-01' }),
		sample('before', { date: '2026-09-30' }),
	];
	assert.deepEqual(filterArchiveRecords(records, {
		airport: 'alpha', region: '香港', startDate: '2026-10-01', endDate: '2026-10-03',
	}).map(({ id }) => id), ['last', 'first']);
	assert.deepEqual(filterArchiveRecords(records, { startDate: '2026-10-02', endDate: '2026-10-02' }).map(({ id }) => id), [
		'other-airport', 'other-region', 'unknown-region',
	]);
	assert.deepEqual(filterArchiveRecords(records, { airport: 'missing' }), []);
	assert.equal(filterArchiveRecords(records).length, records.length);
});

test('单侧日期边界、倒置区间和无效日历日期处理明确', () => {
	const records = [sample('late', { date: '2026-10-03' }), sample('early')];
	assert.deepEqual(filterArchiveRecords(records, { startDate: '2026-10-03' }).map(({ id }) => id), ['late']);
	assert.deepEqual(filterArchiveRecords(records, { endDate: '2026-10-01' }).map(({ id }) => id), ['early']);
	assert.deepEqual(filterArchiveRecords(records, { startDate: '2026-10-03', endDate: '2026-10-01' }), []);
	assert.deepEqual(filterArchiveRecords(records, { startDate: '2026-02-30', endDate: '2026-10-01' }).map(({ id }) => id), ['early']);
	assert.deepEqual(filterArchiveRecords(records, { startDate: 'invalid', endDate: '2026-13-01' }), records);
	assert.deepEqual(normalizeArchiveFilters({ airport: ' alpha ', region: ' 香港 ', startDate: ' 2024-02-29 ', endDate: '2026-02-29' }), {
		airport: 'alpha', region: '香港', startDate: '2024-02-29',
	});
	assert.deepEqual(normalizeArchiveFilters({ startDate: '1900-02-29', endDate: '2000-02-29' }), { endDate: '2000-02-29' });
	assert.deepEqual(normalizeArchiveFilters({ startDate: '2026-10-01T00:00:00Z', region: '   ' }), {});
});

test('筛选和分页不修改输入，匹配结果保留原记录引用及已有顺序', () => {
	const records = Object.freeze([Object.freeze(sample('b')), Object.freeze(sample('a', { region: '日本' })), Object.freeze(sample('c'))]);
	const filters = Object.freeze({ region: '香港', startDate: '2026-10-01' });
	const result = filterArchiveRecords(records, filters);
	assert.deepEqual(result.map(({ id }) => id), ['b', 'c']);
	assert.equal(result[0], records[0]);
	assert.equal(result[1], records[2]);
	const page = paginateArchiveRecords(result, 2, 1);
	assert.equal(page.records[0], records[2]);
	assert.deepEqual(records.map(({ id }) => id), ['b', 'a', 'c']);
});

test('空归档和一条记录始终存在第一页，不生成多余分页', () => {
	assert.deepEqual(paginateArchiveRecords([], 999), {
		records: [], page: 1, pageSize: 10, pageCount: 1, total: 0, startIndex: 0, endIndex: 0,
	});
	const record = sample('only');
	assert.deepEqual(paginateArchiveRecords([record], 999), {
		records: [record], page: 1, pageSize: 10, pageCount: 1, total: 1, startIndex: 0, endIndex: 1,
	});
	assert.equal(getArchivePageCount(0), 1);
	assert.equal(getArchivePageCount(1), 1);
	assert.equal(getArchivePageHref(1), '/test/');
});

test('翻页边界和归档增长不漏记录、不重复，索引页号对应实际静态页', () => {
	for (const size of [0, 1, 9, 10, 11, 19, 20, 21, 35, 36]) {
		const records = Array.from({ length: size }, (_, index) => sample(`record-${index}`));
		const index = createArchiveIndex(records, 'fixture-version');
		const pageCount = getArchivePageCount(size);
		const flattened = [];
		for (let page = 1; page <= pageCount; page += 1) {
			const actual = paginateArchiveRecords(index.records, page);
			assert.equal(actual.pageCount, pageCount);
			assert.ok(actual.records.length <= 10);
			assert.ok(actual.records.every((record) => record.page === page));
			assert.equal(actual.endIndex - actual.startIndex, actual.records.length);
			flattened.push(...actual.records.map(({ id }) => id));
			assert.equal(getArchivePageHref(page), page === 1 ? '/test/' : `/test/${page}/`);
		}
		assert.deepEqual(flattened, records.map(({ id }) => id));
		assert.equal(new Set(flattened).size, size);
	}
});

test('页码和页大小异常时使用有效边界，超过末页时返回末页', () => {
	const records = Array.from({ length: 25 }, (_, index) => sample(String(index)));
	for (const page of [0, -3, NaN, Infinity, 'bad', '']) assert.equal(paginateArchiveRecords(records, page).page, 1);
	assert.equal(paginateArchiveRecords(records, 99).page, 3);
	assert.equal(paginateArchiveRecords(records, '2').page, 2);
	assert.equal(paginateArchiveRecords(records, 2.9).page, 2);
	for (const pageSize of [0, -2, NaN, Infinity, 'invalid']) assert.equal(paginateArchiveRecords(records, 1, pageSize).pageSize, 10);
	assert.equal(paginateArchiveRecords(records, 2, 6).records.length, 6);
	assert.equal(paginateArchiveRecords(records, 2, 6).startIndex, 6);
	assert.equal(getArchivePageHref('invalid'), '/test/');
	assert.equal(getArchivePageCount(-1), 1);
	assert.equal(getArchivePageCount(NaN), 1);
});

test('筛选后重新分页，但索引保留原静态页号以便按需取记录', () => {
	const source = Array.from({ length: 24 }, (_, index) => sample(String(index), { airport: index % 2 ? 'beta' : 'alpha' }));
	const index = createArchiveIndex(source, 'filtered');
	const filtered = filterArchiveRecords(index.records, { airport: 'beta' });
	const first = paginateArchiveRecords(filtered);
	const second = paginateArchiveRecords(filtered, 2);
	assert.equal(first.total, 12);
	assert.equal(first.pageCount, 2);
	assert.deepEqual(second.records.map(({ id, page }) => [id, page]), [['21', 3], ['23', 3]]);
	assert.deepEqual([...first.records, ...second.records].map(({ id }) => id), source.filter(({ airport }) => airport === 'beta').map(({ id }) => id));
});

test('索引只包含轻量定位字段，不泄漏完整测速或证据详情', () => {
	const result = createArchiveIndex([sample('record-alpha-persistent-id', {
		downloadMbps: 100, evidenceNote: 'large detail', evidenceImage: '/evidence/example.png',
	})], 'content-version');
	assert.deepEqual(Object.keys(result), ['version', 'pageSize', 'records']);
	assert.deepEqual(result, {
		version: 'content-version', pageSize: 10,
		records: [{ id: 'record-alpha-persistent-id', airport: 'alpha', region: '香港', date: '2026-10-01', page: 1 }],
	});
});

test('生产记录的稳定锚点、出口地区与完整分页覆盖保持一致，不固定记录总数', () => {
	const airports = JSON.parse(readFileSync(new URL('../src/data/airports.json', import.meta.url), 'utf8'));
	const records = sortTestsNewestFirst(airports.flatMap((airport) => (airport.tests ?? []).map((record) => ({ airportSlug: airport.slug, ...record }))));
	const index = createArchiveIndex(records.map((record) => ({
		id: getTestRecordAnchor(record.airportSlug, record.id), airport: record.airportSlug,
		region: getTestRegion(record) ?? '', date: record.testedAt,
	})), 'production-fixture');
	assert.equal(index.records.length, records.length);
	assert.equal(new Set(index.records.map(({ id }) => id)).size, records.length);
	const paged = Array.from({ length: getArchivePageCount(records.length) }, (_, page) => paginateArchiveRecords(index.records, page + 1).records).flat();
	assert.deepEqual(paged, index.records);
	for (const [position, record] of records.entries()) {
		assert.equal(index.records[position].id, getTestRecordAnchor(record.airportSlug, record.id));
		assert.equal(index.records[position].region, getTestRegion(record) ?? '');
		assert.equal(index.records[position].page, Math.floor(position / 10) + 1);
	}
});
