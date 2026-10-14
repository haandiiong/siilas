import { z } from 'astro/zod';

const seconds = z.number().nonnegative().nullable();
const recordedText = z.string().trim().min(1);

export const CHATGPT_RESPONSE_TIERS = [
	{ maxSeconds: 5, label: '≤ 5 秒', status: '流畅', score: 100 },
	{ maxSeconds: 10, label: '> 5 秒且 ≤ 10 秒', status: '轻微延迟', score: 75 },
	{ maxSeconds: 20, label: '> 10 秒且 ≤ 20 秒', status: '响应较慢', score: 50 },
	{ maxSeconds: 30, label: '> 20 秒且 ≤ 30 秒', status: '响应严重延迟', score: 25 },
	{ maxSeconds: null, label: '超过 30 秒仍未开始回答，或页面无法打开', status: '不可用', score: 0 },
];

export const TEST_EXPERIENCE_METHODS = {
	confirmedAt: '2026-10-14',
	streaming: {
		platform: 'YouTube',
		quality: '4K',
		seekCount: 3,
		measurement: '拖动后至恢复播放前的缓冲等待',
	},
	chatgpt: {
		measurement: '发送消息至开始出现回答的等待',
		responseTiers: CHATGPT_RESPONSE_TIERS,
	},
};

/** @param {unknown} seconds */
export const getChatgptResponseTier = (seconds) => {
	if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
	return CHATGPT_RESPONSE_TIERS.find((tier) => tier.maxSeconds === null || seconds <= tier.maxSeconds) ?? null;
};

/** @param {{ chatgpt?: string, chatgptTest?: { firstResponseSeconds?: number | null } }} test */
export const getChatgptTimingMismatch = (test) => {
	const tier = getChatgptResponseTier(test.chatgptTest?.firstResponseSeconds);
	return tier && test.chatgpt && tier.status !== test.chatgpt
		? `首次响应秒数对应“${tier.status}”，与提交的“${test.chatgpt}”不一致，请核对原始记录`
		: null;
};

// Timing is optional; existing status-only records remain valid without invented seconds.
export const testExperienceSchema = z.object({
	streamingTest: z.object({
		platform: z.literal('YouTube'),
		quality: z.literal('4K'),
		seekBufferingSeconds: z.tuple([seconds, seconds, seconds]).optional(),
		videoUrl: z.url().refine((value) => URL.canParse(value) && ['https:', 'http:'].includes(new URL(value).protocol), '视频地址必须使用 http 或 https').optional(),
	}).strict().optional(),
	chatgptTest: z.object({
		firstResponseSeconds: seconds.optional(),
		model: recordedText.optional(),
	}).strict().refine((value) => Object.keys(value).length > 0, 'ChatGPT 测试详情至少记录一项实际条件').optional(),
});
