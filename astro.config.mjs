// @ts-check

import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';
import { readFileSync } from 'node:fs';

/** @typedef {{testedAt: string, resultUrl?: string | null, evidenceImage?: string}} SitemapTest */
/** @typedef {{slug: string, commercialReviewedAt: string, editorialUpdatedAt?: string, clientSupportVerifiedAt?: string, tests?: SitemapTest[]}} SitemapAirport */
/** @param {string} filename */
const readData = (filename) => JSON.parse(readFileSync(new URL(`./src/data/${filename}`, import.meta.url), 'utf8'));
const testedAirports = /** @type {SitemapAirport[]} */ (readData('airports.json'));
const profiles = /** @type {{slug: string, editorialUpdatedAt: string}[]} */ (readData('airport-profiles.json'));
/** @param {(string | undefined)[]} dates */
const latestDate = (dates) => dates.filter((date) => typeof date === 'string' && date).sort().at(-1) ?? '';
/** @param {SitemapAirport} airport */
const testDates = (airport) => (airport.tests ?? [])
	.filter((test) => test.resultUrl || test.evidenceImage).map((test) => test.testedAt);
const lastModifiedByPath = new Map(Object.entries(readData('page-updates.json')));
for (const airport of testedAirports) {
	lastModifiedByPath.set(`/airport/${airport.slug}/`, latestDate([
		airport.editorialUpdatedAt, airport.commercialReviewedAt, airport.clientSupportVerifiedAt, ...testDates(airport),
	]));
}
for (const profile of profiles) lastModifiedByPath.set(`/airport/${profile.slug}/`, profile.editorialUpdatedAt);
const latestRankingData = latestDate(testedAirports.flatMap((airport) => [airport.commercialReviewedAt, ...testDates(airport)]));
for (const pathname of ['/', '/airport/', '/rank/']) {
	lastModifiedByPath.set(pathname, latestDate([lastModifiedByPath.get(pathname), latestRankingData]));
}
for (const pathname of ['/test/', '/tutorial/']) {
	lastModifiedByPath.set(pathname, latestDate([lastModifiedByPath.get(pathname), ...testedAirports.flatMap(testDates)]));
}
lastModifiedByPath.set('/airport/', latestDate([lastModifiedByPath.get('/airport/'), ...profiles.map((profile) => profile.editorialUpdatedAt)]));

// https://astro.build/config
export default defineConfig({
	site: 'https://siilas.com',
	integrations: [sitemap({
		serialize(item) {
			const lastModified = lastModifiedByPath.get(new URL(item.url).pathname);
			if (lastModified) item.lastmod = lastModified;
			return item;
		},
	})],
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
