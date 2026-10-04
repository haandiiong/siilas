import { z } from 'astro/zod';
import rawProfiles from './airport-profiles.json';
import rawDetails from './airport-profile-details.json';
import rawHighlights from './airport-profile-highlights.json';
import { historicalDateSchema as dateSchema } from './date-schema';
import { addCalendarMonths } from './date-utils.mjs';


const profileSchema = z.object({
	slug: z.string().regex(/^[a-z0-9-]+$/),
	name: z.string().min(1),
	status: z.enum(['reference', 'stopped']),
	sourcePage: z.url(),
	sourceReviewedAt: dateSchema,
	sourceUpdatedAt: dateSchema,
	editorialUpdatedAt: dateSchema,
	publishedAt: dateSchema.nullable().optional(),
	sourceReviewNote: z.string().min(1),
	priceSummary: z.string().min(1).optional(),
	trial: z.string().min(1).optional(),
	client: z.string().min(1).optional(),
	universalSubscription: z.string().min(1).optional(),
	noExpiry: z.string().min(1).optional(),
	audience: z.string().min(1).optional(),
	cautions: z.string().min(1),
	officialUrl: z.url().optional(),
	officialLinkNote: z.string().min(1).optional(),
}).superRefine((profile, context) => {
	if (profile.status === 'reference') {
		for (const field of ['priceSummary', 'trial', 'client', 'universalSubscription', 'noExpiry', 'audience'] as const) {
			if (!profile[field]) context.addIssue({ code: 'custom', path: [field], message: `资料页缺少 ${field}` });
		}
	}
	if (profile.sourceReviewedAt > profile.sourceUpdatedAt) {
		context.addIssue({ code: 'custom', path: ['sourceReviewedAt'], message: '来源核对日期晚于来源页编辑日期' });
	}
	if (profile.publishedAt && profile.publishedAt > profile.editorialUpdatedAt) {
		context.addIssue({ code: 'custom', path: ['publishedAt'], message: '首次发布日期晚于页面编辑日期' });
	}
});

const parsedProfiles = z.array(profileSchema).min(1).superRefine((profiles, context) => {
	const slugs = new Set<string>();
	profiles.forEach((profile, index) => {
		if (slugs.has(profile.slug)) {
			context.addIssue({ code: 'custom', path: [index, 'slug'], message: `资料页 slug 重复：${profile.slug}` });
		}
		slugs.add(profile.slug);
	});
}).parse(rawProfiles);

const tableSchema = z.object({
	title: z.string().min(1),
	columns: z.array(z.string().min(1)).min(2),
	rows: z.array(z.array(z.string())).min(1),
	truncated: z.boolean().optional(),
	sourceRowCount: z.number().int().positive().optional(),
	sourceColumnCount: z.number().int().positive().optional(),
}).superRefine((table, context) => {
	table.rows.forEach((row, index) => {
		if (row.length !== table.columns.length) {
			context.addIssue({ code: 'custom', path: ['rows', index], message: `表格列数不一致：${table.title}` });
		}
	});
});
const detailsSchema = z.record(z.string(), z.object({
	planTables: z.array(tableSchema),
	clientTables: z.array(tableSchema),
}));
const highlightsSchema = z.record(z.string(), z.array(z.string().min(1)).min(2).max(4));
const parsedDetails = detailsSchema.parse(rawDetails);
const parsedHighlights = highlightsSchema.parse(rawHighlights);
const activeSlugs = new Set(parsedProfiles.filter((profile) => profile.status === 'reference').map((profile) => profile.slug));
for (const slug of activeSlugs) {
	if (!parsedDetails[slug]?.planTables.length) throw new Error(`资料页缺少逐档套餐表：${slug}`);
	if (!parsedHighlights[slug]) throw new Error(`资料页缺少独立要点：${slug}`);
}
for (const slug of [...Object.keys(parsedDetails), ...Object.keys(parsedHighlights)]) {
	if (!activeSlugs.has(slug)) throw new Error(`资料页补充数据含未知或停用 slug：${slug}`);
}

export const airportProfiles = parsedProfiles.map((profile) => {
	return {
		...profile,
		planTables: parsedDetails[profile.slug]?.planTables ?? [],
		clientTables: parsedDetails[profile.slug]?.clientTables ?? [],
		highlights: parsedHighlights[profile.slug] ?? [],
		nextSourceReviewAt: addCalendarMonths(profile.sourceReviewedAt, 2),
	};
});

export type AirportProfile = (typeof airportProfiles)[number];
