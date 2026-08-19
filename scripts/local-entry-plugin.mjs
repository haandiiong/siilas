import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ENTRY_ROUTE = '/local-entry/';
const API_ROUTE = '/__siilas/local-entry';
const MAX_BODY_BYTES = 14 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const CHATGPT_STATUSES = ['流畅', '轻微延迟', '响应较慢', '响应严重延迟', '不可用'];
const STREAMING_STATUSES = ['流畅', '轻微缓冲', '缓冲明显', '缓冲严重', '不可用'];
const WINDOWS = ['上午', '日间', '晚间', '晚高峰'];
const NODE_REGIONS = {
	香港: 'hk',
	日本: 'jp',
	新加坡: 'sg',
	美国: 'us',
};
const CARRIERS = ['中国联通', '中国电信', '中国移动', '其他'];
const ACCESS_TYPES = ['家庭宽带', '移动网络', '企业宽带', '其他'];
const CONNECTION_TYPES = ['有线', 'Wi-Fi', '移动数据', '其他'];

const cleanText = (value, maxLength = 200) => typeof value === 'string'
	? value.replaceAll('\0', '').trim().slice(0, maxLength)
	: '';

const requiredText = (value, label, maxLength = 200) => {
	const cleaned = cleanText(value, maxLength);
	if (!cleaned) throw new Error(`请填写${label}`);
	return cleaned;
};

const enumValue = (value, allowed, label) => {
	const cleaned = cleanText(value);
	if (!allowed.includes(cleaned)) throw new Error(`${label}不在允许范围内`);
	return cleaned;
};

const numberValue = (value, label, { min = 0, max = Number.POSITIVE_INFINITY, nullable = false } = {}) => {
	if ((value === '' || value === null || value === undefined) && nullable) return null;
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
		throw new Error(`${label}必须是 ${min}–${Number.isFinite(max) ? max : '∞'} 之间的数字`);
	}
	return parsed;
};

const localDateKey = () => {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Shanghai',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
	return `${parts.year}-${parts.month}-${parts.day}`;
};

const validateDate = (value) => {
	const date = requiredText(value, '测试日期', 10);
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00+08:00`))) {
		throw new Error('测试日期格式不正确');
	}
	if (date > localDateKey()) throw new Error('测试日期不能晚于北京时间今天');
	return date;
};

const validateTime = (value) => {
	const time = requiredText(value, '北京时间', 5);
	if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time)) throw new Error('北京时间必须使用 HH:MM 格式');
	return time;
};

const validateResultUrl = (value) => {
	const rawUrl = requiredText(value, 'Speedtest链接', 500);
	let url;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error('Speedtest链接格式不正确');
	}
	const isSpeedtestHost = url.hostname === 'speedtest.net' || url.hostname.endsWith('.speedtest.net');
	if (url.protocol !== 'https:' || !isSpeedtestHost || !/\/result(?:\/d)?\/\d+\/?$/u.test(url.pathname)) {
		throw new Error('请填写有效的Speedtest结果链接');
	}
	url.hash = '';
	return url.href;
};

const speedtestResultId = (value) => {
	if (typeof value !== 'string') return null;
	try {
		return /\/result(?:\/d)?\/(\d+)\/?$/u.exec(new URL(value).pathname)?.[1] ?? null;
	} catch {
		return null;
	}
};

const decodeImage = (image) => {
	if (!image || typeof image !== 'object') throw new Error('请上传Speedtest截图');
	const dataUrl = requiredText(image.dataUrl, 'Speedtest截图', MAX_BODY_BYTES);
	const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/u.exec(dataUrl);
	if (!match) throw new Error('截图只支持 PNG、JPG 或 WebP');
	const buffer = Buffer.from(match[2].replaceAll(/\s/gu, ''), 'base64');
	if (buffer.length < 100 || buffer.length > MAX_IMAGE_BYTES) throw new Error('截图大小必须在 100B–10MB 之间');

	let extension;
	if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) extension = '.png';
	if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) extension = '.jpg';
	if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') extension = '.webp';
	if (!extension) throw new Error('截图文件内容与图片格式不匹配');

	return { buffer, extension };
};

const isLoopback = (address = '') => address === '127.0.0.1'
	|| address === '::1'
	|| address === '::ffff:127.0.0.1';

const readJson = async (path, fallback) => {
	try {
		return JSON.parse(await readFile(path, 'utf8'));
	} catch (error) {
		if (error?.code === 'ENOENT') return fallback;
		throw error;
	}
};

const nextAvailablePath = async (basePath) => {
	const extension = extname(basePath);
	const stem = basePath.slice(0, -extension.length);
	for (let index = 1; index < 1000; index += 1) {
		const candidate = index === 1 ? basePath : `${stem}-${index}${extension}`;
		try {
			await readFile(candidate);
		} catch (error) {
			if (error?.code === 'ENOENT') return candidate;
			throw error;
		}
	}
	throw new Error('无法生成唯一的截图文件名');
};

const nextRecordId = (baseId, ids) => {
	let candidate = baseId;
	let suffix = 2;
	while (ids.has(candidate)) {
		candidate = `${baseId}-${suffix}`;
		suffix += 1;
	}
	return candidate;
};

export const validateSubmissionPayload = (payload, airportSlugs) => {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('提交内容格式不正确');
	const airportSlug = requiredText(payload.airportSlug, '机场', 80);
	if (!airportSlugs.has(airportSlug)) throw new Error('所选机场不存在');

	const testedAt = validateDate(payload.testedAt);
	const time = validateTime(payload.time);
	const nodeRegion = enumValue(payload.nodeRegion, Object.keys(NODE_REGIONS), '节点地区');
	const nodeLabel = cleanText(payload.nodeLabel, 120) || `${nodeRegion}节点`;
	if (!nodeLabel.includes(nodeRegion)) throw new Error(`节点名称需要包含“${nodeRegion}”，以便正确参与地区评分`);

	return {
		airportSlug,
		testedAt,
		time,
		window: enumValue(payload.window, WINDOWS, '测试时段'),
		nodeRegion,
		node: nodeLabel,
		baselineDownloadMbps: numberValue(payload.baselineDownloadMbps, '本地宽带', { min: 1, max: 100000 }),
		downloadMbps: numberValue(payload.downloadMbps, '下载速度', { max: 100000 }),
		uploadMbps: numberValue(payload.uploadMbps, '上传速度', { max: 100000 }),
		latencyMs: numberValue(payload.latencyMs, '空闲延迟', { max: 100000, nullable: true }),
		downloadLatencyMs: numberValue(payload.downloadLatencyMs, '下载负载延迟', { max: 100000, nullable: true }),
		uploadLatencyMs: numberValue(payload.uploadLatencyMs, '上传负载延迟', { max: 100000, nullable: true }),
		chatgpt: enumValue(payload.chatgpt, CHATGPT_STATUSES, 'ChatGPT状态'),
		streaming: enumValue(payload.streaming, STREAMING_STATUSES, '流媒体状态'),
		resultUrl: validateResultUrl(payload.resultUrl),
		sourceRegion: requiredText(payload.sourceRegion, '测试省市', 120),
		carrier: enumValue(payload.carrier, CARRIERS, '本地运营商'),
		accessType: enumValue(payload.accessType, ACCESS_TYPES, '网络类型'),
		connectionType: enumValue(payload.connectionType, CONNECTION_TYPES, '连接方式'),
		isp: cleanText(payload.isp, 160) || null,
		server: cleanText(payload.server, 200) || null,
		device: requiredText(payload.device, '测试设备', 160),
		client: requiredText(payload.client, '客户端', 200),
		evidenceNote: cleanText(payload.evidenceNote, 500) || undefined,
		image: decodeImage(payload.image),
	};
};

const loadProjectData = async (projectRoot) => {
	const airportsPath = join(projectRoot, 'src/data/airports.json');
	const submissionsPath = join(projectRoot, 'src/data/test-submissions.json');
	const airports = await readJson(airportsPath, []);
	const submissions = await readJson(submissionsPath, []);
	if (!Array.isArray(airports) || !Array.isArray(submissions)) throw new Error('项目数据文件格式不正确');
	return { airportsPath, submissionsPath, airports, submissions };
};

export const persistSubmission = async (projectRoot, payload) => {
	const projectData = await loadProjectData(projectRoot);
	const airportSlugs = new Set(projectData.airports.map((airport) => airport.slug));
	const input = validateSubmissionPayload(payload, airportSlugs);
	const existingTests = projectData.airports.flatMap((airport) => airport.tests ?? []);
	const submittedTests = projectData.submissions.map((submission) => submission.test);
	const allTests = [...existingTests, ...submittedTests];
	const airportTests = [
		...(projectData.airports.find((airport) => airport.slug === input.airportSlug)?.tests ?? []),
		...projectData.submissions
			.filter((submission) => submission.airportSlug === input.airportSlug)
			.map((submission) => submission.test),
	];

	const incomingResultId = speedtestResultId(input.resultUrl);
	if (allTests.some((test) => speedtestResultId(test?.resultUrl) === incomingResultId)) {
		throw Object.assign(new Error('这个Speedtest链接已经录入，请勿重复提交'), { statusCode: 409 });
	}
	if (airportTests.some((test) => test
		&& test.testedAt === input.testedAt
		&& test.time === input.time
		&& test.node === input.node)) {
		throw Object.assign(new Error('相同机场、时间和节点的记录已经存在'), { statusCode: 409 });
	}

	const regionCode = NODE_REGIONS[input.nodeRegion];
	const idBase = `${input.testedAt.replaceAll('-', '')}-${input.time.replace(':', '')}-${regionCode}`;
	const id = nextRecordId(idBase, new Set(airportTests.map((test) => test?.id).filter(Boolean)));
	const evidenceDirectory = join(projectRoot, 'public/evidence', input.airportSlug);
	await mkdir(evidenceDirectory, { recursive: true });
	const imageBasePath = join(evidenceDirectory, `${input.testedAt}-${input.time.replace(':', '')}-${regionCode}-speedtest${input.image.extension}`);
	const imagePath = await nextAvailablePath(imageBasePath);
	const evidenceImage = `/evidence/${input.airportSlug}/${imagePath.slice(evidenceDirectory.length + 1)}`;
	const test = {
		id,
		testedAt: input.testedAt,
		time: input.time,
		window: input.window,
		node: input.node,
		baselineDownloadMbps: input.baselineDownloadMbps,
		downloadMbps: input.downloadMbps,
		uploadMbps: input.uploadMbps,
		chatgpt: input.chatgpt,
		streaming: input.streaming,
		latencyMs: input.latencyMs,
		downloadLatencyMs: input.downloadLatencyMs,
		uploadLatencyMs: input.uploadLatencyMs,
		resultUrl: input.resultUrl,
		evidenceImage,
		...(input.evidenceNote ? { evidenceNote: input.evidenceNote } : {}),
		sourceRegion: input.sourceRegion,
		carrier: input.carrier,
		accessType: input.accessType,
		connectionType: input.connectionType,
		isp: input.isp,
		server: input.server,
		device: input.device,
		client: input.client,
	};
	const submission = {
		airportSlug: input.airportSlug,
		submittedAt: new Date().toISOString(),
		test,
	};
	const nextSubmissions = [...projectData.submissions, submission];
	const transactionId = randomUUID();
	const tempImagePath = `${imagePath}.${transactionId}.tmp`;
	const tempJsonPath = `${projectData.submissionsPath}.${transactionId}.tmp`;
	const backupDirectory = join(projectRoot, '.astro/local-entry-backups');

	await mkdir(dirname(projectData.submissionsPath), { recursive: true });
	await mkdir(backupDirectory, { recursive: true });
	await writeFile(tempImagePath, input.image.buffer, { flag: 'wx' });
	await writeFile(tempJsonPath, `${JSON.stringify(nextSubmissions, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });

	try {
		try {
			await copyFile(projectData.submissionsPath, join(backupDirectory, `test-submissions-${Date.now()}.json`));
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error;
		}
		await rename(tempImagePath, imagePath);
		await rename(tempJsonPath, projectData.submissionsPath);
	} catch (error) {
		await Promise.allSettled([unlink(tempImagePath), unlink(tempJsonPath), unlink(imagePath)]);
		throw error;
	}

	return {
		airportSlug: input.airportSlug,
		id,
		evidenceImage,
		recordCount: nextSubmissions.length,
		test,
	};
};

const readBody = async (request) => new Promise((resolve, reject) => {
	let size = 0;
	const chunks = [];
	request.on('data', (chunk) => {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) {
			reject(Object.assign(new Error('提交内容超过14MB，请压缩截图后重试'), { statusCode: 413 }));
			request.destroy();
			return;
		}
		chunks.push(chunk);
	});
	request.on('end', () => {
		try {
			resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
		} catch {
			reject(new Error('提交内容不是有效JSON'));
		}
	});
	request.on('error', reject);
});

const sendJson = (response, statusCode, body) => {
	response.statusCode = statusCode;
	response.setHeader('Content-Type', 'application/json; charset=utf-8');
	response.setHeader('Cache-Control', 'no-store');
	response.end(JSON.stringify(body));
};

export function siilasLocalEntry() {
	return {
		name: 'siilas-local-entry',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(async (request, response, next) => {
				const requestUrl = new URL(request.url ?? '/', 'http://localhost');
				if (requestUrl.pathname !== ENTRY_ROUTE && requestUrl.pathname !== API_ROUTE) return next();

				if (!isLoopback(request.socket.remoteAddress)) {
					return sendJson(response, 403, { ok: false, message: '本地录入功能只允许从当前电脑访问' });
				}

				try {
					if (request.method === 'GET' && requestUrl.pathname === ENTRY_ROUTE) {
						const html = await readFile(join(PROJECT_ROOT, 'src/dev/data-entry.html'), 'utf8');
						response.statusCode = 200;
						response.setHeader('Content-Type', 'text/html; charset=utf-8');
						response.setHeader('Cache-Control', 'no-store');
						response.setHeader('X-Robots-Tag', 'noindex, nofollow');
						return response.end(html);
					}

					if (request.method === 'GET' && requestUrl.pathname === API_ROUTE) {
						const { airports, submissions } = await loadProjectData(PROJECT_ROOT);
						return sendJson(response, 200, {
							ok: true,
							airports: airports.map(({ slug, name, testClient }) => ({ slug, name, testClient: testClient ?? '' })),
							recent: submissions.slice(-8).reverse().map(({ airportSlug, submittedAt, test }) => ({
								airportSlug,
								submittedAt,
								id: test.id,
								testedAt: test.testedAt,
								time: test.time,
								node: test.node,
								downloadMbps: test.downloadMbps,
							})),
						});
					}

					if (request.method === 'POST' && requestUrl.pathname === API_ROUTE) {
						const origin = cleanText(request.headers.origin, 300);
						if (origin && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin)) {
							return sendJson(response, 403, { ok: false, message: '请求来源不是本地开发页面' });
						}
						const result = await persistSubmission(PROJECT_ROOT, await readBody(request));
						return sendJson(response, 201, { ok: true, message: '数据和截图已写入项目', ...result });
					}

					return sendJson(response, 405, { ok: false, message: '不支持这个请求方法' });
				} catch (error) {
					const statusCode = error?.statusCode ?? 400;
					if (statusCode >= 500) server.config.logger.error(`[local-entry] ${error?.stack ?? error}`);
					return sendJson(response, statusCode, {
						ok: false,
						message: error instanceof Error ? error.message : '数据写入失败',
					});
				}
			});
		},
	};
}

export const localEntryPaths = { ENTRY_ROUTE, API_ROUTE, PROJECT_ROOT, tempRoot: tmpdir() };
