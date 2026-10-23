export interface ArchiveIndexRecord {
	id: string;
	airport: string;
	region: string;
	date: string;
	page: number;
}

export interface ArchiveIndex {
	version: string;
	pageSize: number;
	records: ArchiveIndexRecord[];
}

export interface ArchiveFilters {
	airport?: string;
	region?: string;
	startDate?: string;
	endDate?: string;
}

export interface ArchivePage<T> {
	records: T[];
	page: number;
	pageSize: number;
	pageCount: number;
	total: number;
	startIndex: number;
	endIndex: number;
}

export function normalizeArchiveFilters(input?: ArchiveFilters): ArchiveFilters;
export function filterArchiveRecords<T extends Pick<ArchiveIndexRecord, 'airport' | 'region' | 'date'>>(records: readonly T[], input?: ArchiveFilters): T[];
export function getArchivePageCount(total: number, pageSize?: number | string): number;
export function getArchivePageHref(page?: number | string): string;
export function paginateArchiveRecords<T>(records: readonly T[], requestedPage?: number | string, requestedPageSize?: number | string): ArchivePage<T>;
export function createArchiveIndex(records: readonly Omit<ArchiveIndexRecord, 'page'>[], version: string, requestedPageSize?: number | string): ArchiveIndex;
