import type { AirportTest } from './airport-data';

const TEST_REGIONS = [
	{ name: '新加坡', pattern: /新加坡/u },
	{ name: '香港', pattern: /香港/u },
	{ name: '日本', pattern: /日本/u },
	{ name: '美国', pattern: /美国/u },
] as const;

const timeMinutes = (time: string | null) => {
	const match = time?.match(/(\d{1,2}):(\d{2})/u);
	return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};

export const sortTestsNewestFirst = <T extends Pick<AirportTest, 'testedAt' | 'time'>>(tests: readonly T[]): T[] =>
	[...tests].sort((left, right) => right.testedAt.localeCompare(left.testedAt)
		|| timeMinutes(right.time) - timeMinutes(left.time));

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

export const getLatestRegionTests = (tests: AirportTest[]) => TEST_REGIONS.map(({ name, pattern }) => ({
	region: name,
	test: tests
		.filter((test) => pattern.test(test.node) && Boolean(test.resultUrl || test.evidenceImage))
		.toSorted((left, right) => right.testedAt.localeCompare(left.testedAt)
			|| timeMinutes(right.time) - timeMinutes(left.time))
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

export const getTestRecordDetails = (test: AirportTest) => [
	{ label: '测试地区', value: recorded(test.sourceRegion) },
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
	{ label: '证据备注', value: recorded(test.evidenceNote) },
];
