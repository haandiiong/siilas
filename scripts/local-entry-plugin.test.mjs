import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { persistSubmission, validateSubmissionPayload } from './local-entry-plugin.mjs';

const tinyPng = Buffer.concat([
	Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
	Buffer.alloc(64),
]);

const validPayload = () => ({
	airportSlug: 'xsus',
	testedAt: '2026-08-15',
	time: '09:30',
	window: '上午',
	nodeRegion: '日本',
	nodeLabel: '日本节点',
	baselineDownloadMbps: '1000',
	downloadMbps: '500.25',
	uploadMbps: '50.5',
	latencyMs: '88',
	downloadLatencyMs: '120',
	uploadLatencyMs: '130',
	chatgpt: '流畅',
	streaming: '轻微缓冲',
	resultUrl: 'https://www.speedtest.net/result/99999999999',
	sourceRegion: '河北石家庄',
	carrier: '中国联通',
	accessType: '家庭宽带',
	connectionType: '有线',
	isp: 'Example ISP',
	server: 'Example Server，Tokyo',
	device: 'MacBook',
	client: 'FlClash（macOS）',
	evidenceNote: '本地自动化测试记录',
	image: {
		name: 'speedtest.png',
		type: 'image/png',
		dataUrl: `data:image/png;base64,${tinyPng.toString('base64')}`,
	},
});

test('rejects a non-Speedtest result URL', () => {
	const payload = validPayload();
	payload.resultUrl = 'https://example.com/result/1';
	assert.throws(() => validateSubmissionPayload(payload, new Set(['xsus'])), /Speedtest/u);
});

test('persists one submission and rejects a duplicate URL', async () => {
	const root = await mkdtemp(join(tmpdir(), 'siilas-local-entry-'));
	try {
		await mkdir(join(root, 'src/data'), { recursive: true });
		await writeFile(join(root, 'src/data/airports.json'), '[{"slug":"xsus","name":"xsus","tests":[]}]\n');
		await writeFile(join(root, 'src/data/test-submissions.json'), '[]\n');

		const result = await persistSubmission(root, validPayload());
		assert.equal(result.airportSlug, 'xsus');
		assert.equal(result.id, '20260815-0930-jp');
		assert.equal(result.test.carrier, '中国联通');
		assert.equal(result.test.downloadLatencyMs, 120);

		const submissions = JSON.parse(await readFile(join(root, 'src/data/test-submissions.json'), 'utf8'));
		assert.equal(submissions.length, 1);
		assert.equal(submissions[0].test.resultUrl, 'https://www.speedtest.net/result/99999999999');
		assert.equal((await readFile(join(root, `public${result.evidenceImage}`))).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');

		await assert.rejects(() => persistSubmission(root, validPayload()), /已经录入/u);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
