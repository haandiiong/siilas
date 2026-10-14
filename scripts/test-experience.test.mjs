import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getChatgptResponseTier, getChatgptTimingMismatch, testExperienceSchema } from '../src/data/test-experience-schema.mjs';
import { getTestExperienceDetails } from '../src/data/test-record-presentation.ts';
import { auditData } from './audit-data.mjs';

const streaming = (changes = {}) => ({ platform: 'YouTube', quality: '4K', ...changes });

test('已有135条记录无需补计时，解析不会给历史记录添加默认数据', () => {
	const airports = JSON.parse(readFileSync(new URL('../src/data/airports.json', import.meta.url), 'utf8'));
	const before = structuredClone(airports);
	const records = airports.flatMap((airport) => airport.tests ?? []);
	assert.equal(records.length, 135);
	for (const record of records) {
		assert.deepEqual(testExperienceSchema.parse(record), {});
		assert.deepEqual(getTestExperienceDetails(record), []);
	}
	assert.deepEqual(airports, before);
});

test('三次缓冲与首次响应保留实际零值、精度和未知项', () => {
	const details = {
		streamingTest: streaming({ seekBufferingSeconds: [0, null, 1.25], videoUrl: 'https://www.youtube.com/watch?v=example' }),
		chatgptTest: { firstResponseSeconds: 0, model: '已记录的模型' },
	};
	assert.deepEqual(testExperienceSchema.parse(details), details);
	const rows = Object.fromEntries(getTestExperienceDetails(details).map(({ label, value }) => [label, value]));
	assert.equal(rows['三次拖动后的缓冲时间'], '第 1 次：0 秒；第 2 次：未记录；第 3 次：1.25 秒');
	assert.equal(rows['ChatGPT 首次响应等待'], '0 秒');
	assert.equal(rows['ChatGPT 模型'], '已记录的模型');
	assert.equal(rows['测试视频'], details.streamingTest.videoUrl);
});

test('未计时保留未知，不把方法确认写成精确秒数', () => {
	const input = { streamingTest: streaming(), chatgptTest: { firstResponseSeconds: null } };
	assert.equal(testExperienceSchema.safeParse(input).success, true);
	const rows = getTestExperienceDetails(input);
	assert.ok(rows.some(({ value }) => value === '未保存逐次秒数'));
	assert.ok(rows.some(({ label, value }) => label === 'ChatGPT 首次响应等待' && value === '未记录'));
	assert.ok(!rows.some(({ value }) => value === '0 秒'));
});

test('计时拒绝负数、非有限数和字符串；三次缓冲不接受缺项或多项', () => {
	for (const value of [-1, Infinity, -Infinity, NaN, '1', false]) {
		assert.equal(testExperienceSchema.safeParse({ streamingTest: streaming({ seekBufferingSeconds: [1, value, 2] }) }).success, false);
		assert.equal(testExperienceSchema.safeParse({ chatgptTest: { firstResponseSeconds: value } }).success, false);
	}
	for (const values of [[], [1, 2], [1, 2, 3, 4]]) {
		assert.equal(testExperienceSchema.safeParse({ streamingTest: streaming({ seekBufferingSeconds: values }) }).success, false);
	}
});

test('测试条件与字段名称不能悄悄偏离已确认方法', () => {
	for (const streamingTest of [streaming({ platform: 'Netflix' }), streaming({ quality: '1080p' }), streaming({ bufferingSeconds: [1, 2, 3] })]) {
		assert.equal(testExperienceSchema.safeParse({ streamingTest }).success, false);
	}
	for (const chatgptTest of [{}, { model: '  ' }, { responseSeconds: 2 }, { firstResponseSeconds: 2, fullResponseSeconds: 10 }]) {
		assert.equal(testExperienceSchema.safeParse({ chatgptTest }).success, false);
	}
});

test('视频地址拒绝非网页协议和无效URL，不使审计抛出异常', () => {
	for (const videoUrl of ['not a url', '/video', 'javascript:alert(1)', 'file:///tmp/video', 'ftp://example.com/video']) {
		assert.equal(testExperienceSchema.safeParse({ streamingTest: streaming({ videoUrl }) }).success, false);
	}
});

test('数据审计对新增错误定位到机场、记录和具体计时字段', async () => {
	const report = await auditData({
		airports: [{ slug: 'fixture', name: '体验计时检查', commercialReviewedAt: '2026-10-14', tests: [{
			id: 'timing-record', testedAt: '2026-10-14', node: '香港节点',
			chatgptTest: { firstResponseSeconds: -2 },
		}] }],
		projectRoot: '.', today: '2026-10-14',
	});
	assert.ok(report.errors.some((error) => error.includes('fixture:timing-record') && error.includes('chatgptTest.firstResponseSeconds')));
});

test('首次响应五档按包含上限处理，30秒后按未响应档', () => {
	for (const [seconds, status] of [[0, '流畅'], [5, '流畅'], [5.01, '轻微延迟'], [10, '轻微延迟'], [10.01, '响应较慢'], [20, '响应较慢'], [20.01, '响应严重延迟'], [30, '响应严重延迟'], [30.01, '不可用'], [40, '不可用']]) {
		assert.equal(getChatgptResponseTier(seconds)?.status, status, String(seconds));
	}
	for (const seconds of [null, undefined, NaN, Infinity, -1, '5']) assert.equal(getChatgptResponseTier(seconds), null);
});

test('缺少精确时间不重判旧状态，有时间且冲突时提示核对', async () => {
	for (const chatgpt of ['流畅', '轻微延迟', '响应较慢', '响应严重延迟', '不可用']) {
		assert.equal(getChatgptTimingMismatch({ chatgpt }), null);
		assert.equal(getChatgptTimingMismatch({ chatgpt, chatgptTest: { firstResponseSeconds: null } }), null);
	}
	assert.equal(getChatgptTimingMismatch({ chatgpt: '轻微延迟', chatgptTest: { firstResponseSeconds: 10 } }), null);
	const record = { id: 'mismatch', testedAt: '2026-10-14', node: '香港节点', chatgpt: '流畅', chatgptTest: { firstResponseSeconds: 12 } };
	const before = structuredClone(record);
	const report = await auditData({ airports: [{ slug: 'fixture', name: '分档检查', commercialReviewedAt: '2026-10-14', tests: [record] }], projectRoot: '.', today: '2026-10-14' });
	assert.ok(report.errors.some((error) => error.includes('fixture:mismatch') && error.includes('响应较慢')));
	assert.deepEqual(record, before);
});
