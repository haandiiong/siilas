import { z } from 'astro/zod';
import rawAirports from './airports.json';

const chatgptStatusSchema = z.enum([
	'流畅',
	'轻微延迟',
	'响应较慢',
	'响应严重延迟',
	'不可用',
], {
	error: 'ChatGPT 状态不在评分规则中，请先确认或新增对应的计分档位',
});

const streamingStatusSchema = z.enum([
	'流畅',
	'轻微缓冲',
	'缓冲明显',
	'缓冲严重',
	'不可用',
], {
	error: '流媒体状态不在评分规则中，请先确认或新增对应的计分档位',
});

const testSchema = z.object({
	id: z.string().min(1),
	testedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	time: z.string().nullable(),
	window: z.string(),
	node: z.string().min(1),
	baselineDownloadMbps: z.number().positive(),
	downloadMbps: z.number().nonnegative(),
	uploadMbps: z.number().nonnegative(),
	chatgpt: chatgptStatusSchema,
	streaming: streamingStatusSchema,
	latencyMs: z.number().nonnegative().nullable(),
	jitterMs: z.number().nonnegative().nullable().optional(),
	packetLossPercent: z.number().min(0).max(100).nullable().optional(),
	resultUrl: z.url().nullable(),
	evidenceImage: z.string().startsWith('/').optional(),
	evidenceNote: z.string().min(1).optional(),
	sourceRegion: z.string().nullable(),
	isp: z.string().nullable(),
	device: z.string().nullable(),
	client: z.string().nullable(),
});

const networkQualitySampleSchema = z.object({
	id: z.string().min(1),
	testedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	time: z.string().nullable(),
	node: z.string().min(1),
	downloadMbps: z.number().nonnegative(),
	uploadMbps: z.number().nonnegative(),
	latencyMs: z.number().nonnegative(),
	jitterMs: z.number().nonnegative().nullable().optional(),
	packetLossPercent: z.number().min(0).max(100).nullable().optional(),
	chatgpt: chatgptStatusSchema.optional(),
	streaming: streamingStatusSchema.optional(),
	server: z.string().min(1),
	evidence: z.string().min(1),
	evidenceImage: z.string().startsWith('/').optional(),
});

const nodeSnapshotSchema = z.object({
	capturedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	time: z.string().min(1),
	total: z.number().int().positive(),
	reachable: z.number().int().nonnegative(),
	timeout: z.number().int().nonnegative(),
	highLatency: z.number().int().nonnegative(),
	latencyRange: z.string().min(1),
	selectedNode: z.string().min(1),
	timeoutNodes: z.array(z.string()),
	highLatencyNodes: z.array(z.string()),
	evidenceImages: z.array(z.string().startsWith('/')).min(1),
});

const serviceIncidentSchema = z.object({
	observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	time: z.string().min(1),
	status: z.string().min(1),
	speedtest: z.string().min(1),
	chatgpt: z.string().min(1),
	streaming: z.string().min(1),
	note: z.string().min(1),
});

const airportSchema = z.object({
	slug: z.string().regex(/^[a-z0-9-]+$/),
	name: z.string().min(1),
	website: z.url().optional(),
	affiliate: z.boolean().optional(),
	foundedAt: z.string().optional(),
	couponCode: z.string().optional(),
	registrationOffer: z.string().optional(),
	offerEvidenceImages: z.array(z.string().startsWith('/')).optional(),
	score: z.number().min(0).max(10).nullable(),
	stability: z.number().min(0).max(100).nullable(),
	speed: z.union([z.number(), z.literal('待实测'), z.null()]).transform((value) =>
		typeof value === 'number' ? value : null,
	),
	latency: z.number().nonnegative().nullable(),
	chatgpt: z.boolean().nullable(),
	chatgptStatus: z.string().optional(),
	chatgptStatusUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	streaming: z.number().min(0).max(5).nullable(),
	streamingStatus: z.string().optional(),
	dataDays: z.number().int().nonnegative().optional(),
	rankingEligible: z.boolean(),
	price: z.number().nonnegative(),
	traffic: z.string(),
	lowestPlan: z.object({
		price: z.string().min(1),
		traffic: z.string().min(1),
	}).optional(),
	protocol: z.string(),
	status: z.string(),
	serviceStatus: z.string().optional(),
	serviceStatusUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	summary: z.string(),
	platforms: z.array(z.string()).optional(),
	testClient: z.string().optional(),
	universalSubscription: z.string().optional(),
	deviceLimit: z.string().optional(),
	nodeCount: z.number().int().nonnegative().optional(),
	onlineSnapshot: z.string().optional(),
	regions: z.array(z.string()).optional(),
	regionsNote: z.string().optional(),
	nodeEvidenceImages: z.array(z.string().startsWith('/')).optional(),
	lineTypes: z.array(z.string()).optional(),
	bandwidthPolicy: z.string().optional(),
	billingPolicy: z.string().optional(),
	paymentMethods: z.array(z.string()).optional(),
	refundPolicy: z.string().optional(),
	trial: z.string().optional(),
	noExpiry: z.string().optional(),
	plans: z.array(z.object({
		name: z.string(),
		price: z.string(),
		traffic: z.string(),
		details: z.array(z.string()).optional(),
	})).optional(),
	planEvidenceImages: z.array(z.string().startsWith('/')).optional(),
	noExpiryPlans: z.array(z.object({
		name: z.string(),
		price: z.string(),
		traffic: z.string(),
		details: z.array(z.string()).optional(),
	})).optional(),
	dailyPlans: z.array(z.object({ name: z.string(), price: z.string(), duration: z.string(), traffic: z.string() })).optional(),
	addOns: z.array(z.object({ name: z.string(), price: z.string(), traffic: z.string(), condition: z.string() })).optional(),
	tests: z.array(testSchema).optional(),
	networkQualitySamples: z.array(networkQualitySampleSchema).optional(),
	nodeSnapshots: z.array(nodeSnapshotSchema).optional(),
	serviceIncidents: z.array(serviceIncidentSchema).optional(),
});

const parsedAirports = z.array(airportSchema).length(9).parse(rawAirports);

type ScoringSample = {
	testedAt: string;
	node: string;
	downloadMbps: number;
	uploadMbps: number;
	baselineDownloadMbps?: number;
	chatgpt?: string;
	streaming?: string;
};

type DailyRegionSample = {
	testedAt: string;
	region: string;
	downloadMbps: number;
	uploadMbps: number;
	baselineDownloadMbps: number;
	chatgpt: number | null;
	streaming: number | null;
};

const MIN_SCORING_DAYS = 7;
const MIN_SCORING_SAMPLES = 28;
const MIN_REGION_SCORING_DAYS = 3;
const MIN_REGION_SCORING_SAMPLES = 5;
const REQUIRED_NODE_REGIONS = [
	{ name: '新加坡', pattern: /新加坡/u },
	{ name: '香港', pattern: /香港/u },
	{ name: '日本', pattern: /日本/u },
	{ name: '美国', pattern: /美国/u },
] as const;

const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const average = (values: number[]) => values.length
	? values.reduce((sum, value) => sum + value, 0) / values.length
	: 0;
const median = (values: number[]) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
};
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const isPresent = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;
const consistencyScore = (values: number[]) => {
	if (!values.length) return 0;
	const mean = average(values);
	if (mean === 0) return 0;
	const variance = average(values.map((value) => (value - mean) ** 2));
	const coefficientOfVariation = Math.sqrt(variance) / mean;
	return clampPercent(100 - coefficientOfVariation * 100);
};

const chatgptScore = (status?: string) => {
	if (!status) return null;
	if (status === '流畅') return 100;
	if (status === '轻微延迟') return 75;
	if (status === '响应较慢') return 50;
	if (status === '响应严重延迟') return 25;
	if (status === '不可用') return 0;
	return null;
};

const streamingScore = (status?: string) => {
	if (!status) return null;
	if (status === '流畅') return 100;
	if (status === '轻微缓冲') return 75;
	if (status === '缓冲明显') return 50;
	if (status === '缓冲严重') return 25;
	if (status === '不可用') return 0;
	return null;
};

const trafficInGb = (traffic: string) => {
	const amount = Number.parseFloat(traffic.match(/\d+(?:\.\d+)?/u)?.[0] ?? '0');
	return /TB|T\b/iu.test(traffic) ? amount * 1024 : amount;
};

const getRegionName = (node: string) =>
	REQUIRED_NODE_REGIONS.find(({ pattern }) => pattern.test(node))?.name ?? null;

const aggregateSamplesByRegionDay = (samples: ScoringSample[]) => {
	const groups = new Map<string, ScoringSample[]>();

	for (const sample of samples) {
		const region = getRegionName(sample.node);
		if (!region) continue;
		const key = `${region}:${sample.testedAt}`;
		groups.set(key, [...(groups.get(key) ?? []), sample]);
	}

	return [...groups.entries()].map(([key, dailySamples]): DailyRegionSample => {
		const [region, testedAt] = key.split(':');
		const chatgptValues = dailySamples.map((sample) => chatgptScore(sample.chatgpt)).filter(isPresent);
		const streamingValues = dailySamples.map((sample) => streamingScore(sample.streaming)).filter(isPresent);
		return {
			region,
			testedAt,
			downloadMbps: median(dailySamples.map((sample) => sample.downloadMbps)),
			uploadMbps: median(dailySamples.map((sample) => sample.uploadMbps)),
			baselineDownloadMbps: median(dailySamples.map((sample) => sample.baselineDownloadMbps ?? 1000)),
			chatgpt: chatgptValues.length ? average(chatgptValues) : null,
			streaming: streamingValues.length ? average(streamingValues) : null,
		};
	});
};

const equalWeightRegions = (samples: DailyRegionSample[], key: 'chatgpt' | 'streaming') => {
	const regionalScores = REQUIRED_NODE_REGIONS
		.map(({ name }) => samples.filter((sample) => sample.region === name).map((sample) => sample[key]).filter(isPresent))
		.filter((values) => values.length)
		.map((values) => average(values));
	return regionalScores.length ? round(clampPercent(average(regionalScores))) : null;
};

const calculateExperienceScores = (samples: ScoringSample[]) => {
	const dailySamples = aggregateSamplesByRegionDay(samples);

	return {
		chatgpt: equalWeightRegions(dailySamples, 'chatgpt'),
		streaming: equalWeightRegions(dailySamples, 'streaming'),
	};
};

const calculateScore = (airport: z.infer<typeof airportSchema>, samples: ScoringSample[]) => {
	const dailySamples = aggregateSamplesByRegionDay(samples);
	const regionalConsistency = REQUIRED_NODE_REGIONS.map(({ name }) => {
		const regionalSamples = dailySamples.filter((sample) => sample.region === name);
		const downloadConsistency = consistencyScore(regionalSamples.map((sample) => sample.downloadMbps));
		const uploadConsistency = consistencyScore(regionalSamples.map((sample) => sample.uploadMbps));
		return downloadConsistency * 0.8 + uploadConsistency * 0.2;
	});
	const stability = clampPercent(average(regionalConsistency));
	const regionalSpeeds = REQUIRED_NODE_REGIONS.map(({ name }) => median(
		dailySamples
			.filter((sample) => sample.region === name)
			.map((sample) => (sample.downloadMbps / sample.baselineDownloadMbps) * 100),
	));
	const speed = clampPercent(average(regionalSpeeds));
	const experienceScores = calculateExperienceScores(samples);
	const chatgpt = experienceScores.chatgpt ?? 0;
	const streaming = experienceScores.streaming ?? 0;
	const value = clampPercent((trafficInGb(airport.traffic) / Math.max(airport.price, 0.01)) * 10);
	const total = (stability * 0.4 + speed * 0.25 + chatgpt * 0.15 + streaming * 0.1 + value * 0.1) / 10;

	return {
		score: round(total),
		stability: round(stability),
		breakdown: {
			stability: round(stability),
			speed: round(speed),
			chatgpt: round(chatgpt),
			streaming: round(streaming),
			value: round(value),
		},
	};
};

const countMonitoringDays = (airport: z.infer<typeof airportSchema>) => new Set([
	...(airport.tests ?? []),
	...(airport.networkQualitySamples ?? []),
].map((sample) => sample.testedAt)).size;

export const airports = parsedAirports.map((airport) => {
	const dataDays = countMonitoringDays(airport);
	const verifiedSamples: ScoringSample[] = [
		...(airport.tests ?? []),
		...(airport.networkQualitySamples ?? []),
	];
	const hasRequiredNodeCoverage = REQUIRED_NODE_REGIONS.every(({ pattern }) => {
		const regionalSamples = verifiedSamples.filter((sample) => pattern.test(sample.node));
		const regionalDays = new Set(regionalSamples.map((sample) => sample.testedAt)).size;
		return regionalSamples.length >= MIN_REGION_SCORING_SAMPLES
			&& regionalDays >= MIN_REGION_SCORING_DAYS;
	});
	const rankingEligible = dataDays >= MIN_SCORING_DAYS
		&& verifiedSamples.length >= MIN_SCORING_SAMPLES
		&& hasRequiredNodeCoverage;
	const calculated = rankingEligible ? calculateScore(airport, verifiedSamples) : null;
	const experienceScores = calculateExperienceScores(verifiedSamples);
	const status = airport.status === '持续监测中' || /^监测第\s*\d+\s*天$/u.test(airport.status)
		? dataDays === 0 ? '等待首次实测' : `已有样本 ${dataDays} 天`
		: airport.status;
	const monthlyPlans = (airport.plans ?? [])
		.filter((plan) => /\/月/u.test(plan.price))
		.map((plan) => ({
			price: Number.parseFloat(plan.price.match(/\d+(?:\.\d+)?/u)?.[0] ?? '0'),
			priceLabel: plan.price,
			traffic: plan.traffic,
		}))
		.filter((plan) => plan.price > 0)
		.sort((left, right) => left.price - right.price);
	const entryPlan = airport.lowestPlan ?? (monthlyPlans[0]
		? { price: monthlyPlans[0].priceLabel, traffic: monthlyPlans[0].traffic }
		: { price: `¥${airport.price}/月`, traffic: airport.traffic });

	return {
		...airport,
		dataDays,
		status,
		rankingEligible,
		score: calculated?.score ?? null,
		stability: calculated?.stability ?? null,
		scoreBreakdown: calculated?.breakdown ?? null,
		experienceScores,
		entryPlan,
	};
});
export type Airport = (typeof airports)[number];
export type AirportTest = NonNullable<Airport['tests']>[number];

export const getTests = (airport: Airport) => airport.tests ?? [];
export const getNetworkQualitySamples = (airport: Airport) => airport.networkQualitySamples ?? [];

export const getMaxDownload = (airport: Airport) => {
	const downloads = [
		...getTests(airport).map((test) => test.downloadMbps),
		...getNetworkQualitySamples(airport).map((sample) => sample.downloadMbps),
	];
	return downloads.length ? Math.max(...downloads) : airport.speed;
};

export const getChatGPTSummary = (airport: Airport) => {
	if (airport.chatgptStatus) return airport.chatgptStatus;
	const values = [...new Set([
		...getTests(airport).map((test) => test.chatgpt),
		...getNetworkQualitySamples(airport).map((sample) => sample.chatgpt).filter(isPresent),
	])];
	if (!values.length) return '待测试';
	if (values.length > 1) return '结果不一';
	return values[0];
};

export const getStreamingSummary = (airport: Airport) => {
	if (typeof airport.streamingStatus === 'string') return airport.streamingStatus;
	const values = [...new Set([
		...getTests(airport).map((test) => test.streaming),
		...getNetworkQualitySamples(airport).map((sample) => sample.streaming).filter(isPresent),
	])];
	if (!values.length) return '待测试';
	return values.length === 1 ? values[0] : '结果不一';
};

export const formatLocalDateKey = (date: Date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
};
