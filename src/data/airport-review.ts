import type { Airport, AirportTest } from './airport-data';
import { compareTestsNewestFirst } from './date-utils.mjs';
import { getTestRegion as getRegion, TEST_REGIONS } from './test-regions.mjs';

export type ReviewStatusCount = { status: string; count: number };

export type ReviewDaily = {
	date: string;
	downloadMedian: number;
	uploadMedian: number;
	records: AirportTest[];
};

export type ReviewRegion = {
	region: string;
	recordCount: number;
	dateCount: number;
	latest: AirportTest | null;
	daily: ReviewDaily[];
	dailyMedianDownload: number | null;
	dailyDownloadMin: number | null;
	dailyDownloadMax: number | null;
	// Raw record counts describe observed statuses; they are not an experience score.
	chatgptCounts: ReviewStatusCount[];
	streamingCounts: ReviewStatusCount[];
};

export type ReviewObservation = {
	title: string;
	body: string;
	records: AirportTest[];
};

export type ReviewEvidence = {
	test: AirportTest;
	imagePath: string;
	note: string;
};

export type AirportReview = {
	verifiedCount: number;
	dateCount: number;
	startDate: string | null;
	endDate: string | null;
	regions: ReviewRegion[];
	observations: ReviewObservation[];
	evidence: ReviewEvidence[];
};

// Keep the review table in the same region order as the existing sample summaries.
const REGIONS = TEST_REGIONS;
const CHATGPT_STATUSES = ['流畅', '轻微延迟', '响应较慢', '响应严重延迟', '不可用'];
const STREAMING_STATUSES = ['流畅', '轻微缓冲', '缓冲明显', '缓冲严重', '不可用'];

const newestFirst = compareTestsNewestFirst;

const median = (values: number[]): number => {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const countStatuses = (records: AirportTest[], field: 'chatgpt' | 'streaming', order: string[]): ReviewStatusCount[] =>
	order.map((status) => ({ status, count: records.filter((test) => test[field] === status).length }))
		.filter(({ count }) => count > 0);

const getRegionReview = (region: string, verified: AirportTest[]): ReviewRegion => {
	const records = verified.filter((test) => getRegion(test) === region);
	const dates = [...new Set(records.map((test) => test.testedAt))].sort();
	const daily = dates.map((date): ReviewDaily => {
		const dailyRecords = records.filter((test) => test.testedAt === date);
		return {
			date,
			downloadMedian: median(dailyRecords.map((test) => test.downloadMbps)),
			uploadMedian: median(dailyRecords.map((test) => test.uploadMbps)),
			records: dailyRecords,
		};
	});
	const downloads = daily.map((day) => day.downloadMedian);
	return {
		region,
		recordCount: records.length,
		dateCount: dates.length,
		latest: records[0] ?? null,
		daily,
		// Each date contributes one median, regardless of how many tests that date has.
		dailyMedianDownload: downloads.length ? median(downloads) : null,
		dailyDownloadMin: downloads.length ? Math.min(...downloads) : null,
		dailyDownloadMax: downloads.length ? Math.max(...downloads) : null,
		chatgptCounts: countStatuses(records, 'chatgpt', CHATGPT_STATUSES),
		streamingCounts: countStatuses(records, 'streaming', STREAMING_STATUSES),
	};
};

const uniqueRecords = (records: Array<AirportTest | null | undefined>): AirportTest[] =>
	[...new Set(records.filter((test): test is AirportTest => Boolean(test)))].slice(0, 3);

const numberLabel = (value: number) => Number(value.toFixed(2)).toString();
const recordLabel = (test: AirportTest) => `${test.testedAt}${test.time ? ` ${test.time}` : ''} ${test.node}`;

const coverageObservation = (review: Omit<AirportReview, 'observations' | 'evidence'>, verified: AirportTest[]): ReviewObservation => {
	const covered = review.regions.filter((region) => region.recordCount > 0);
	const unknown = verified.filter((test) => getRegion(test) === null).length;
	const outside = verified.length - covered.reduce((sum, region) => sum + region.recordCount, 0) - unknown;
	const excludedSummary = [
		unknown ? `另有 ${unknown} 条节点出口地区未确认，未计入地区统计。` : '',
		outside ? `另有 ${outside} 条属于四个比较地区以外的出口，保留实际地区，未计入四地区统计。` : '',
	].join('');
	const windows = [...new Set(verified.map((test) => test.window.trim() || '未标注'))];
	const windowSummary = windows.map((window) => `${window} ${verified.filter((test) => (test.window.trim() || '未标注') === window).length} 条`).join('、');
	const latest = verified[0];
	const otherWindow = verified.find((test) => test.window !== latest?.window);
	const updates = covered.map((region) => region.latest!).toSorted(newestFirst);
	const updateDates = [...new Set(updates.map((test) => test.testedAt))].sort();
	const updateSummary = updateDates.length > 1
		? `有样本地区的最近实测日期不一致（${updateDates[0]} 至 ${updateDates.at(-1)}），需分别查看各地区的更新日期。`
		: updateDates.length === 1
			? `${covered.length === REGIONS.length ? '四地区' : '有样本地区'}最近实测日期一致，均为 ${updateDates[0]}。${covered.length < REGIONS.length ? `另有 ${REGIONS.length - covered.length} 个地区暂无可核验样本。` : ''}`
			: '尚无可明确归类的地区样本，暂不能比较更新日期。';
	return {
		title: '实测覆盖与记录时段',
		body: verified.length
			? `原始时段分布：${windowSummary}。${updateSummary}${excludedSummary}这些时段来自已保存的抽样记录，不代表连续监测。`
			: '暂无带测速结果链接或主截图的记录；测试日期、地区覆盖与时段暂不能汇总。',
		records: uniqueRecords([latest, updates.at(-1), otherWindow]),
	};
};

const speedObservation = (regions: ReviewRegion[]): ReviewObservation => {
	const measured = regions.filter((region) => region.dailyMedianDownload !== null)
		.toSorted((left, right) => right.dailyMedianDownload! - left.dailyMedianDownload! || REGIONS.indexOf(left.region as typeof REGIONS[number]) - REGIONS.indexOf(right.region as typeof REGIONS[number]));
	const highest = measured[0];
	const lowest = measured.at(-1);
	const representative = (region: ReviewRegion | undefined) => {
		if (!region) return undefined;
		const day = region.daily.toSorted((left, right) => Math.abs(left.downloadMedian - region.dailyMedianDownload!) - Math.abs(right.downloadMedian - region.dailyMedianDownload!) || right.date.localeCompare(left.date))[0];
		return day?.records.toSorted((left, right) => Math.abs(left.downloadMbps - day.downloadMedian) - Math.abs(right.downloadMbps - day.downloadMedian) || newestFirst(left, right))[0];
	};
	return {
		title: '地区下载样本差异',
		body: measured.length
			? `逐日下载代表值的历史中位数，${measured.length > 1 ? `最高为${highest.region}约 ${numberLabel(highest.dailyMedianDownload!)} Mbps（${highest.dateCount} 个日期），最低为${lowest!.region}约 ${numberLabel(lowest!.dailyMedianDownload!)} Mbps（${lowest!.dateCount} 个日期）。${highest.dailyMedianDownload === lowest!.dailyMedianDownload ? '两者数值相同。' : ''}` : `目前仅${highest.region}有样本：约 ${numberLabel(highest.dailyMedianDownload!)} Mbps（${highest.dateCount} 个日期）。`}各日期等权；样本的节点、时段与测速服务器可能不同，完整四区数值见下方。`
			: '四个地区均暂无可核验下载样本，不能比较地区速度。',
		records: uniqueRecords([representative(highest), representative(lowest)]),
	};
};

const serviceObservation = (verified: AirportTest[]): ReviewObservation => {
	const latest = verified[0];
	const stateKey = (test: AirportTest) => `${test.chatgpt}\u0000${test.streaming}`;
	const contrasting = verified.find((test) => stateKey(test) !== (latest ? stateKey(latest) : null));
	const records = uniqueRecords([latest, contrasting]);
	return {
		title: contrasting ? '具体服务状态出现差异' : '记录中的具体服务状态',
		body: latest
			? `测速记录所附的测试者体验报告：${records.map((test) => `${recordLabel(test)}，ChatGPT ${test.chatgpt}、流媒体${test.streaming}`).join('；')}。Speedtest 不验证这些体验，状态只对应当次测试。`
			: '暂无可核验测速记录所关联的 ChatGPT 或流媒体体验，暂不判断服务状态。',
		records,
	};
};

type EvidenceCandidate = { test: AirportTest; imagePath: string; imageLabel: string };

const getEvidence = (verified: AirportTest[]): ReviewEvidence[] => {
	// Image existence is checked by the existing data audit; never manufacture a path.
	const candidates = verified.flatMap((test): EvidenceCandidate[] => {
		// Supplemental images may show service status rather than a speed measurement.
		return test.evidenceImage ? [{ test, imagePath: test.evidenceImage, imageLabel: 'Speedtest 主截图' }] : [];
	});
	const selected: ReviewEvidence[] = [];
	const add = (candidate: EvidenceCandidate | undefined, reason: string) => {
		if (!candidate || selected.some((item) => item.test === candidate.test || item.imagePath === candidate.imagePath)) return;
		selected.push({ test: candidate.test, imagePath: candidate.imagePath, note: `${reason}；${candidate.imageLabel}。` });
	};
	const latest = candidates[0];
	const lowest = candidates.toSorted((left, right) => left.test.downloadMbps - right.test.downloadMbps || newestFirst(left.test, right.test))[0];
	add(latest, `按记录日期与明确时间排序，最近的带图实测${latest && latest === lowest ? '，也是带图实测中下载最低的样本' : ''}`);
	add(lowest, '带图实测中下载最低的样本，保留低速记录');
	const latestRegion = latest ? getRegion(latest.test) : null;
	const otherDate = candidates.find((candidate) => latestRegion && getRegion(candidate.test) === latestRegion && candidate.test.testedAt !== latest!.test.testedAt && !selected.some((item) => item.test === candidate.test || item.imagePath === candidate.imagePath));
	add(otherDate, '与最近带图实测同地区、不同日期的最近样本');
	for (const candidate of candidates) {
		if (selected.length >= 3) break;
		const region = getRegion(candidate.test);
		if (!region || selected.some((item) => getRegion(item.test) === region)) continue;
		add(candidate, '补充其他地区的最近带图实测');
	}
	for (const candidate of candidates) {
		if (selected.length >= 3) break;
		add(candidate, '按记录日期与明确时间排序，补充下一条带图实测');
	}
	return selected;
};

export const getAirportReview = (airport: Airport): AirportReview => {
	const verified = (airport.tests ?? [])
		.filter((test) => Boolean(test.resultUrl || test.evidenceImage))
		.toSorted(newestFirst);
	const dates = [...new Set(verified.map((test) => test.testedAt))].sort();
	const review = {
		verifiedCount: verified.length,
		dateCount: dates.length,
		startDate: dates[0] ?? null,
		endDate: dates.at(-1) ?? null,
		regions: REGIONS.map((region) => getRegionReview(region, verified)),
	};
	return {
		...review,
		observations: [coverageObservation(review, verified), speedObservation(review.regions), serviceObservation(verified)],
		evidence: getEvidence(verified),
	};
};
