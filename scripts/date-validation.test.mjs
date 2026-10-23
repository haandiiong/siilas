import assert from 'node:assert/strict';
import test from 'node:test';
import { auditData } from './audit-data.mjs';
import { addCalendarMonths, compareTestsNewestFirst, getDateValidationError, getPartialDateValidationError, getRecordedTimeMinutes, getRecordedTimeValidationError, getShanghaiDateKey, getTestWindow, isCalendarDate, toRecordedAtIso, toShanghaiRecordedTime } from '../src/data/date-utils.mjs';

const auditFixture = (airportChanges = {}, profiles = []) => auditData({
	airports: [{ slug: 'fixture', name: '日期边界验证', commercialReviewedAt: '2026-09-30', ...airportChanges }],
	profiles,
	projectRoot: '.',
	today: '2026-10-04',
});

test('日历日期拒绝无效日期，正确处理闰年', () => {
	for (const value of ['2026-02-29', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '2026-1-01', '0000-01-01']) {
		assert.equal(isCalendarDate(value), false, value);
	}
	assert.equal(isCalendarDate('2024-02-29'), true);
	assert.equal(isCalendarDate('1900-02-29'), false);
	assert.equal(isCalendarDate('2000-02-29'), true);
	assert.equal(getDateValidationError('2026-10-04', '2026-10-04'), null);
	assert.match(getDateValidationError('2026-10-05', '2026-10-04'), /不得晚于/u);
	assert.equal(getPartialDateValidationError('2025-10', '2026-10-04'), null);
	assert.match(getPartialDateValidationError('2026-13', '2026-10-04'), /有效/u);
	assert.match(getPartialDateValidationError('2027', '2026-10-04'), /不得晚于/u);
});

test('当前日期按中国标准时间跨日，与主机时区无关', () => {
	assert.equal(getShanghaiDateKey(new Date('2026-10-03T15:59:59Z')), '2026-10-03');
	assert.equal(getShanghaiDateKey(new Date('2026-10-03T16:00:00Z')), '2026-10-04');
});

test('每两个月复核按目标月末截断，不溢出到第三个月', () => {
	assert.equal(addCalendarMonths('2026-07-31', 2), '2026-09-30');
	assert.equal(addCalendarMonths('2026-12-31', 2), '2027-02-28');
	assert.equal(addCalendarMonths('2023-12-31', 2), '2024-02-29');
	assert.equal(addCalendarMonths('2026-09-30', 2), '2026-11-30');
	assert.equal(addCalendarMonths('2026-03-31', -1), '2026-02-28');
	assert.throws(() => addCalendarMonths('2026-02-30', 2), RangeError);
});

test('精确时间输出有效 ISO，约时间和未知时间保留日期精度', () => {
	assert.equal(toRecordedAtIso('2026-10-04', '10:40'), '2026-10-04T10:40:00+08:00');
	for (const time of ['约 10:40', null, undefined, '24:00', '09:60']) {
		assert.equal(toRecordedAtIso('2026-10-04', time), '2026-10-04');
	}
});

test('共享分钟解析只接受严格北京时间 HH:mm，约时间不伪装成精确时刻', () => {
	for (const [time, minutes] of [['00:00', 0], ['09:05', 545], ['20:00', 1200], ['23:59', 1439]]) {
		assert.equal(getRecordedTimeMinutes(time), minutes, time);
	}
	for (const time of ['约 23:59', '9:05', '09:05:00', '09:05 GMT', ' 09:05', '09:05 ', '24:00', '09:60', '', null, undefined, 905]) {
		assert.equal(getRecordedTimeMinutes(time), null, String(time));
		assert.equal(toRecordedAtIso('2026-10-04', time), '2026-10-04');
		assert.equal(getTestWindow(time), null, String(time));
	}
});

test('入库时间允许北京时间、明确约时间及未知值，原始时区必须先换算', () => {
	for (const time of [undefined, null, '00:00', '09:05', '23:59', '约 09:05', '约09:05', '约 23:59']) {
		assert.equal(getRecordedTimeValidationError(time), null, String(time));
	}
	for (const time of ['约 09:05', '约09:05']) {
		assert.equal(getRecordedTimeMinutes(time), null);
		assert.equal(getTestWindow(time), null);
		assert.equal(toRecordedAtIso('2026-10-04', time), '2026-10-04');
	}
	for (const time of ['24:00', '9:05', '09:60', '约 24:00', '约 9:05', '09:05 GMT', 'GMT 09:05', '09:05 UTC', '09:05 UTC+08:00', '09:05+08:00', '09:05-05:00', '09:05Z', '约 09:05 GMT', '09:05:00', ' 09:05', '09:05 ', '', '未知', 905, false, {}]) {
		const error = getRecordedTimeValidationError(time);
		assert.match(error, /先按原始时区换算北京时间/u, String(time));
		assert.match(error, /未知时间用 null/u, String(time));
		assert.equal(toRecordedAtIso('2026-10-04', time), '2026-10-04');
	}
});

test('最新记录统一按北京时间日期、精确分钟和稳定 ID 排序', () => {
	const records = [
		{ id: 'older', testedAt: '2026-10-03', time: '23:59' },
		{ id: 'approximate', testedAt: '2026-10-04', time: '约 23:59' },
		{ id: 'same-b', testedAt: '2026-10-04', time: '20:00' },
		{ id: 'midnight', testedAt: '2026-10-04', time: '00:00' },
		{ id: 'same-a', testedAt: '2026-10-04', time: '20:00' },
		{ id: 'unknown', testedAt: '2026-10-05', time: null },
		{ id: 'latest', testedAt: '2026-10-04', time: '20:01' },
	];
	const before = structuredClone(records);
	const expected = ['unknown', 'latest', 'same-a', 'same-b', 'midnight', 'approximate', 'older'];
	assert.deepEqual(records.toSorted(compareTestsNewestFirst).map(({ id }) => id), expected);
	assert.deepEqual(records.toReversed().toSorted(compareTestsNewestFirst).map(({ id }) => id), expected);
	assert.deepEqual(records, before);
	assert.equal(compareTestsNewestFirst({ testedAt: '2026-10-04' }, { testedAt: '2026-10-04', time: '未知' }), 0);
	assert.equal(compareTestsNewestFirst(records[0], records[0]), 0);
});

test('明确原始时区后才换算北京时间，跨日、跨年和闰日保留正确日期', () => {
	for (const zone of ['UTC', 'GMT', 'Z', '+00:00', 'UTC+00:00', 'GMT+00:00']) {
		assert.deepEqual(toShanghaiRecordedTime('2026-10-03', '16:00', zone), { testedAt: '2026-10-04', time: '00:00' }, zone);
	}
	assert.deepEqual(toShanghaiRecordedTime('2026-08-08', '09:44', 'GMT'), { testedAt: '2026-08-08', time: '17:44' });
	assert.deepEqual(toShanghaiRecordedTime('2026-12-31', '20:00', 'UTC'), { testedAt: '2027-01-01', time: '04:00' });
	assert.deepEqual(toShanghaiRecordedTime('2024-02-28', '23:59', 'GMT'), { testedAt: '2024-02-29', time: '07:59' });
	assert.deepEqual(toShanghaiRecordedTime('2026-01-01', '01:00', '+14:00'), { testedAt: '2025-12-31', time: '19:00' });
	assert.deepEqual(toShanghaiRecordedTime('2026-10-03', '23:45', '-03:30'), { testedAt: '2026-10-04', time: '11:15' });
	assert.deepEqual(toShanghaiRecordedTime('2026-10-04', '10:40', '+08:00'), { testedAt: '2026-10-04', time: '10:40' });
	assert.deepEqual(toShanghaiRecordedTime('0001-01-01', '00:00', 'UTC'), { testedAt: '0001-01-01', time: '08:00' });
	for (const zone of [undefined, null, '', 'local', 'Asia/Shanghai', '+8:00', '+08', '+14:01', '+24:00', '-15:00']) {
		assert.throws(() => toShanghaiRecordedTime('2026-10-04', '10:40', zone), RangeError, String(zone));
	}
	assert.throws(() => toShanghaiRecordedTime('2026-02-30', '10:40', 'UTC'), RangeError);
	assert.throws(() => toShanghaiRecordedTime('2026-10-04', '约 10:40', 'UTC'), RangeError);
	assert.throws(() => toShanghaiRecordedTime('9999-12-31', '23:59', 'UTC'), RangeError);
	assert.throws(() => toShanghaiRecordedTime('0001-01-01', '00:00', '+14:00'), RangeError);
});

test('测试时段按北京时间边界划分，约时间不能自动推断', () => {
	for (const [time, window] of [['00:00', '凌晨'], ['05:59', '凌晨'], ['06:00', '日间'], ['17:59', '日间'], ['18:00', '晚间'], ['19:59', '晚间'], ['20:00', '晚高峰'], ['22:59', '晚高峰'], ['23:00', '晚间'], ['23:59', '晚间']]) {
		assert.equal(getTestWindow(time), window, time);
	}
	for (const time of ['约 10:40', null, undefined, '24:00', '09:60']) assert.equal(getTestWindow(time), null);
});

test('审计拒绝确定时间的错误时段，检查附加证据文件和路径', async () => {
	const record = { id: 'evidence', testedAt: '2026-10-03', node: '香港', time: '19:00', window: '晚高峰', resultUrl: 'https://www.speedtest.net/result/fixture', evidenceImages: [{ label: 'ChatGPT 状态截图', path: '/evidence/not-present.png' }] };
	const report = await auditFixture({ tests: [record] });
	assert.ok(report.errors.some((error) => error.includes('时段应为晚间')));
	assert.ok(report.errors.some((error) => error.includes('证据文件不存在')));
	const unsafe = await auditFixture({ tests: [{ ...record, window: '晚间', evidenceImages: [{ label: '截图', path: '/../package.json' }] }] });
	assert.ok(unsafe.errors.some((error) => error.includes('证据路径无效')));
	const unknown = await auditFixture({ tests: [{ ...record, time: '约 19:00', evidenceImages: [] }] });
	assert.deepEqual(unknown.errors, []);
});

test('审计拒绝未来测速日期、异常日历日期，异常记录不计入参评覆盖', async () => {
	for (const testedAt of ['2099-01-01', '2026-02-30']) {
		const report = await auditFixture({ tests: [{ id: 'invalid', testedAt, node: '香港', resultUrl: 'https://www.speedtest.net/result/fixture' }] });
		assert.ok(report.errors.some((error) => error.includes('testedAt')), report.errors.join('\n'));
		assert.equal(report.rows[0].verifiedTests, 0);
		assert.equal(report.rows[0].latestTestAt, '无');
	}
});

test('审计覆盖商业、编辑、客户端、状态和观测日期', async () => {
	for (const field of ['commercialReviewedAt', 'editorialUpdatedAt', 'clientSupportVerifiedAt', 'serviceStatusUpdated', 'chatgptStatusUpdated', 'streamingStatusUpdated', 'foundedAt']) {
		const report = await auditFixture({ [field]: '2099-01-01' });
		assert.ok(report.errors.some((error) => error.includes(field)), field);
	}
	for (const [collection, field] of [['nodeSnapshots', 'capturedAt'], ['serviceIncidents', 'observedAt']]) {
		const report = await auditFixture({ [collection]: [{ [field]: '2026-02-30' }] });
		assert.ok(report.errors.some((error) => error.includes(`${collection}[0].${field}`)), collection);
	}
	const report = await auditFixture({ commercialReviewedAt: '2026-07-31' });
	assert.equal(report.rows[0].nextReviewAt, '2026-09-30');
	assert.equal(report.rows[0].reviewState, '已到期');
});

test('资料页来源、编辑和独立发布日期均被审计，未发布可为 null', async () => {
	const profile = { slug: 'reference', name: '资料日期验证', status: 'reference', sourceReviewedAt: '2026-09-20', sourceUpdatedAt: '2026-09-28', editorialUpdatedAt: '2026-10-03', publishedAt: null };
	assert.deepEqual((await auditFixture({}, [profile])).errors, []);
	for (const field of ['sourceReviewedAt', 'sourceUpdatedAt', 'editorialUpdatedAt', 'publishedAt']) {
		const report = await auditFixture({}, [{ ...profile, [field]: '2099-01-01' }]);
		assert.ok(report.errors.some((error) => error.includes(field)), field);
	}
	assert.ok((await auditFixture({}, [{ ...profile, sourceReviewedAt: '2026-09-30' }])).errors.some((error) => error.includes('核对日期晚于')));
	assert.ok((await auditFixture({}, [{ ...profile, publishedAt: '2026-10-04' }])).errors.some((error) => error.includes('首次发布日期晚于')));
});
