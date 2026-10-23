// Server/build data only. Browser code must use the compact JSON index and test-archive-query.mjs.
import { createHash } from 'node:crypto';
import { airports, getTests } from './airport-data';
import { createArchiveIndex, getArchivePageCount } from './test-archive-query.mjs';
import { getTestRecordAnchor, sortTestsNewestFirst } from './test-record-presentation';
import { getTestRegion } from './test-regions.mjs';

export const archivePageSize = 10;
export const archiveRecords = sortTestsNewestFirst(airports.flatMap((airport) =>
	getTests(airport).map((record) => ({ airport: airport.name, airportSlug: airport.slug, ...record })),
));
export type ArchiveRecord = (typeof archiveRecords)[number];
export const archivePageCount = getArchivePageCount(archiveRecords.length, archivePageSize);
export const archiveVersion = createHash('sha256').update(JSON.stringify(archiveRecords)).digest('hex').slice(0, 16);
export const archiveIndex = createArchiveIndex(archiveRecords.map((record) => ({
	id: getTestRecordAnchor(record.airportSlug, record.id),
	airport: record.airportSlug,
	region: getTestRegion(record) ?? '',
	date: record.testedAt,
})), archiveVersion, archivePageSize);

export { getArchivePageHref } from './test-archive-query.mjs';
