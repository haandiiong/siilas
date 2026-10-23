import { isCalendarDate } from './date-utils.mjs';

const DEFAULT_PAGE_SIZE = 10;

const positiveInteger = (value, fallback) => {
	const numeric = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
	return Number.isFinite(numeric) && numeric >= 1
		? Math.min(Number.MAX_SAFE_INTEGER, Math.floor(numeric)) : fallback;
};

/** Invalid or blank date inputs are ignored; valid bounds include their entire Beijing date. */
export const normalizeArchiveFilters = (input = {}) => {
	const filters = {};
	const source = input && typeof input === 'object' ? input : {};
	for (const key of ['airport', 'region', 'startDate', 'endDate']) {
		const value = typeof source[key] === 'string' ? source[key].trim() : '';
		if (value && (!['startDate', 'endDate'].includes(key) || isCalendarDate(value))) filters[key] = value;
	}
	return filters;
};

/** Keep source order and original record objects; never infer an exit from other fields. */
export const filterArchiveRecords = (records, input = {}) => {
	const { airport, region, startDate, endDate } = normalizeArchiveFilters(input);
	if (startDate && endDate && startDate > endDate) return [];
	return records.filter((record) => (!airport || record.airport === airport)
		&& (!region || record.region === region)
		&& (!(startDate || endDate) || isCalendarDate(record.date))
		&& (!startDate || record.date >= startDate)
		&& (!endDate || record.date <= endDate));
};

/** Page one always exists, including an archive or filtered result with no records. */
export const getArchivePageCount = (total, pageSize = DEFAULT_PAGE_SIZE) => {
	const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
	return Math.max(1, Math.ceil(count / positiveInteger(pageSize, DEFAULT_PAGE_SIZE)));
};

export const getArchivePageHref = (page = 1) => {
	const normalized = positiveInteger(page, 1);
	return normalized === 1 ? '/test/' : `/test/${normalized}/`;
};

/** startIndex is inclusive and endIndex is exclusive; requested pages clamp to existing bounds. */
export const paginateArchiveRecords = (records, requestedPage = 1, requestedPageSize = DEFAULT_PAGE_SIZE) => {
	const pageSize = positiveInteger(requestedPageSize, DEFAULT_PAGE_SIZE);
	const total = records.length;
	const pageCount = getArchivePageCount(total, pageSize);
	const page = Math.min(pageCount, positiveInteger(requestedPage, 1));
	const startIndex = (page - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, total);
	return { records: records.slice(startIndex, endIndex), page, pageSize, pageCount, total, startIndex, endIndex };
};

/** Whitelist compact fields so the browser index never includes full measurements or evidence. */
export const createArchiveIndex = (records, version, requestedPageSize = DEFAULT_PAGE_SIZE) => {
	const pageSize = positiveInteger(requestedPageSize, DEFAULT_PAGE_SIZE);
	return {
		version,
		pageSize,
		records: records.map(({ id, airport, region, date }, index) => ({
			id, airport, region, date, page: Math.floor(index / pageSize) + 1,
		})),
	};
};
