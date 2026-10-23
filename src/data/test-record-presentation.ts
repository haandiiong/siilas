import type { AirportTest } from './airport-data';
import { compareTestsNewestFirst } from './date-utils.mjs';
import { getTestRegion, TEST_REGIONS } from './test-regions.mjs';

export const getTestRecordAnchor = (airportSlug: string, recordId: string) =>
	`record-${airportSlug}-${encodeURIComponent(recordId)}`;

export const getTestRecordHref = (airportSlug: string, recordId: string) =>
	`/airport/${airportSlug}/#${encodeURIComponent(getTestRecordAnchor(airportSlug, recordId))}`;

export const sortTestsNewestFirst = <T extends Pick<AirportTest, 'testedAt' | 'time'>>(tests: readonly T[]): T[] =>
	[...tests].sort(compareTestsNewestFirst);

export const getTestSamplePeriod = (tests: AirportTest[]) => {
	const dates = tests.filter((test) => test.resultUrl || test.evidenceImage).map((test) => test.testedAt).sort();
	return dates.length ? dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} 至 ${dates.at(-1)}` : '待测试';
};

export const getTestEvidenceLinks = (test: AirportTest) => {
	const links = [
		...(test.evidenceImage ? [{ label: 'Speedtest 截图', path: test.evidenceImage }] : []),
		...(test.evidenceImages ?? []),
	];
	return links.filter((link, index) => links.findIndex((item) => item.path === link.path) === index);
};

export const getLatestRegionTests = (tests: AirportTest[]) => TEST_REGIONS.map((region) => ({
	region,
	test: tests
		.filter((test) => getTestRegion(test) === region && Boolean(test.resultUrl || test.evidenceImage))
		.toSorted(compareTestsNewestFirst)
		.at(0),
}));

export const getLatestExperienceSummary = (tests: AirportTest[], field: 'chatgpt' | 'streaming') => {
	const regions = getLatestRegionTests(tests).filter(({ test }) => test);
	return regions.length
		? regions.map(({ region, test }) => `${region} ${test!.testedAt}：${test![field]}`).join('；')
		: '待测试';
};

const recorded = (value: string | null | undefined) => value?.trim() || '未记录';
const measurement = (value: number | null | undefined, unit: string) => value == null ? '未记录' : `${value} ${unit}`;

export const getTestExperienceDetails = (test: AirportTest) => [
	...(test.streamingTest ? [
		{ label: '流媒体平台与画质', value: `${test.streamingTest.platform} ${test.streamingTest.quality}` },
		{ label: '三次拖动后的缓冲时间', value: test.streamingTest.seekBufferingSeconds
			? test.streamingTest.seekBufferingSeconds.map((seconds, index) => `第 ${index + 1} 次：${measurement(seconds, '秒')}`).join('；')
			: '未保存逐次秒数' },
		...(test.streamingTest.videoUrl ? [{ label: '测试视频', value: test.streamingTest.videoUrl }] : []),
	] : []),
	...(test.chatgptTest ? [
		{ label: 'ChatGPT 首次响应等待', value: measurement(test.chatgptTest.firstResponseSeconds, '秒') },
		{ label: 'ChatGPT 模型', value: recorded(test.chatgptTest.model) },
	] : []),
];

export const getTestRecordDetails = (test: AirportTest) => [
	{ label: '节点出口地区（按 IP）', value: getTestRegion(test) ?? '未确认' },
	{ label: '本地测试地区', value: recorded(test.sourceRegion) },
	{ label: '本地运营商', value: recorded(test.carrier) },
	{ label: '接入类型', value: recorded(test.accessType) },
	{ label: '连接方式', value: recorded(test.connectionType) },
	{ label: '基准下载带宽', value: measurement(test.baselineDownloadMbps, 'Mbps') },
	{ label: '设备', value: recorded(test.device) },
	{ label: '连接客户端', value: recorded(test.client) },
	{ label: '测速工具', value: recorded(test.measurementTool) },
	{ label: 'Speedtest 显示网络', value: recorded(test.isp) },
	{ label: '测速服务器', value: recorded(test.server) },
	{ label: 'Speedtest 空闲延迟', value: measurement(test.latencyMs, 'ms') },
	{ label: '下载负载延迟', value: measurement(test.downloadLatencyMs, 'ms') },
	{ label: '上传负载延迟', value: measurement(test.uploadLatencyMs, 'ms') },
	{ label: '抖动', value: measurement(test.jitterMs, 'ms') },
	{ label: '丢包率', value: measurement(test.packetLossPercent, '%') },
	{ label: '测试时段', value: recorded(test.window) },
	...getTestExperienceDetails(test),
	{ label: '证据备注', value: recorded(test.evidenceNote) },
];
