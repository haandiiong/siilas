import { z } from 'astro/zod';
import rawAirports from './airports.json';

const testSchema = z.object({
	id: z.string().min(1),
	testedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	time: z.string().nullable(),
	window: z.string(),
	node: z.string().min(1),
	baselineDownloadMbps: z.number().positive(),
	downloadMbps: z.number().nonnegative(),
	uploadMbps: z.number().nonnegative(),
	chatgpt: z.string(),
	streaming: z.string(),
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
	chatgpt: z.string().optional(),
	streaming: z.string().optional(),
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
	officialWebsite: z.url().optional(),
	affiliate: z.boolean().optional(),
	foundedAt: z.string().optional(),
	couponCode: z.string().optional(),
	registrationOffer: z.string().optional(),
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
	lineTypes: z.array(z.string()).optional(),
	bandwidthPolicy: z.string().optional(),
	billingPolicy: z.string().optional(),
	paymentMethods: z.array(z.string()).optional(),
	refundPolicy: z.string().optional(),
	supportChannel: z.string().optional(),
	supportUrl: z.url().optional(),
	supportResponse: z.string().optional(),
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

const parsedAirports = z.array(airportSchema).length(10).parse(rawAirports);

const countMonitoringDays = (airport: z.infer<typeof airportSchema>) => new Set([
	...(airport.tests ?? []),
	...(airport.networkQualitySamples ?? []),
].map((sample) => sample.testedAt)).size;

export const airports = parsedAirports.map((airport) => {
	const dataDays = countMonitoringDays(airport);
	const status = airport.status === '持续监测中' || /^监测第\s*\d+\s*天$/u.test(airport.status)
		? dataDays === 0 ? '等待首次实测' : `监测第 ${dataDays} 天`
		: airport.status;

	return { ...airport, dataDays, status };
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
		...getNetworkQualitySamples(airport).map((sample) => sample.chatgpt).filter((value): value is string => Boolean(value)),
	])];
	if (!values.length) return '待测试';
	if (values.length > 1) return '结果不一';
	return values[0];
};

export const getStreamingSummary = (airport: Airport) => {
	if (typeof airport.streamingStatus === 'string') return airport.streamingStatus;
	const values = [...new Set([
		...getTests(airport).map((test) => test.streaming),
		...getNetworkQualitySamples(airport).map((sample) => sample.streaming).filter((value): value is string => Boolean(value)),
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
