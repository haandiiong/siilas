import { filterArchiveRecords, getArchivePageHref, normalizeArchiveFilters, paginateArchiveRecords } from '../data/test-archive-query.mjs';
import { initRecordLinks } from './test-record-links';
import { SITE_TITLE } from '../consts';

interface IndexRecord { id: string; airport: string; region: string; date: string; page: number; }
interface ArchiveIndex { version: string; pageSize: number; records: IndexRecord[]; }
interface Filters { airport?: string; region?: string; startDate?: string; endDate?: string; }

const archive = document.querySelector<HTMLElement>('[data-test-archive]');
if (archive) initArchive(archive);

function initArchive(section: HTMLElement) {
	const form = section.querySelector<HTMLFormElement>('[data-archive-filters]');
	const tbody = section.querySelector<HTMLTableSectionElement>('[data-archive-rows]');
	const table = section.querySelector<HTMLElement>('[data-archive-table]');
	const pagination = section.querySelector<HTMLElement>('[data-archive-pagination]');
	const status = section.querySelector<HTMLElement>('[data-archive-status]');
	const empty = section.querySelector<HTMLElement>('[data-archive-empty]');
	const error = section.querySelector<HTMLElement>('[data-archive-error]');
	if (!form || !tbody || !table || !pagination || !status || !empty || !error) return;
	const airport = form.elements.namedItem('airport') as HTMLSelectElement;
	const region = form.elements.namedItem('region') as HTMLSelectElement;
	const from = form.elements.namedItem('from') as HTMLInputElement;
	const to = form.elements.namedItem('to') as HTMLInputElement;
	const version = section.dataset.archiveVersion;
	const pageCache = new Map<number, Promise<Map<string, HTMLTableRowElement>>>();
	const initialRows = new Map(Array.from(tbody.querySelectorAll<HTMLTableRowElement>('[data-page-row]'), (row) => [row.id, row.cloneNode(true) as HTMLTableRowElement]));
	pageCache.set(Number(section.dataset.currentPage) || 1, Promise.resolve(initialRows));
	let indexPromise: Promise<ArchiveIndex> | undefined;
	let activeFilters: Filters = {};
	let generation = 0;
	let loading = false;

	async function fetchArchive(url: string) {
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 20000);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) throw new Error('Archive unavailable');
			return await response.text();
		} finally { window.clearTimeout(timeout); }
	}

	function getIndex() {
		if (!indexPromise) {
			indexPromise = fetchArchive(section.dataset.indexUrl!).then((text) => {
				const index = JSON.parse(text) as ArchiveIndex;
				if (index.version !== version || !Array.isArray(index.records) || index.pageSize !== 10) throw new Error('Archive changed');
				return index;
			}).catch((reason) => { indexPromise = undefined; throw reason; });
		}
		return indexPromise;
	}

	function loadPage(page: number) {
		if (!pageCache.has(page)) {
			const url = new URL(getArchivePageHref(page), window.location.origin);
			url.searchParams.set('v', version!);
			pageCache.set(page, fetchArchive(url.href).then((html) => {
				const doc = new DOMParser().parseFromString(html, 'text/html');
				if (doc.querySelector<HTMLElement>('[data-test-archive]')?.dataset.archiveVersion !== version) throw new Error('Archive changed');
				return new Map(Array.from(doc.querySelectorAll<HTMLTableRowElement>('[data-archive-rows] > tr[data-page-row]'), (row) => [row.id, row]));
			}).catch((reason) => { pageCache.delete(page); throw reason; }));
		}
		return pageCache.get(page)!;
	}

	const hasFilters = (filters: Filters) => Object.values(filters).some(Boolean);
	function readFilters(url: URL): Filters {
		airport.value = url.searchParams.get('airport') || '';
		region.value = url.searchParams.get('region') || '';
		from.value = url.searchParams.get('from') || '';
		to.value = url.searchParams.get('to') || '';
		return normalizeArchiveFilters({ airport: airport.value, region: region.value, startDate: from.value, endDate: to.value });
	}
	function resultUrl(filters: Filters, page: number) {
		const url = new URL(hasFilters(filters) ? '/test/' : getArchivePageHref(page), window.location.origin);
		if (filters.airport) url.searchParams.set('airport', filters.airport);
		if (filters.region) url.searchParams.set('region', filters.region);
		if (filters.startDate) url.searchParams.set('from', filters.startDate);
		if (filters.endDate) url.searchParams.set('to', filters.endDate);
		if (hasFilters(filters) && page > 1) url.searchParams.set('page', String(page));
		return url;
	}
	function requestedPage(url: URL, filters: Filters) {
		return Number(hasFilters(filters) ? url.searchParams.get('page') || 1 : url.pathname.match(/^\/test\/(\d+)\/$/)?.[1] || 1);
	}

	function renderPagination(page: number, pageCount: number, total: number) {
		const fragment = document.createDocumentFragment();
		const addLink = (text: string, target: number, disabled = false, current = false) => {
			const item = document.createElement(disabled ? 'span' : 'a');
			item.textContent = text;
			if (item instanceof HTMLAnchorElement) {
				item.href = resultUrl(activeFilters, target).href;
				item.dataset.archivePage = String(target);
				item.setAttribute('aria-label', /^\d+$/.test(text) ? `第 ${target} 页` : text);
			} else item.setAttribute('aria-disabled', 'true');
			if (current) item.setAttribute('aria-current', 'page');
			fragment.append(item);
		};
		addLink('上一页', page - 1, page === 1);
		const numbers = Array.from(new Set([1, pageCount, ...Array.from({ length: 5 }, (_, i) => page + i - 2)]))
			.filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
		numbers.forEach((n, index) => {
			if (index && n - numbers[index - 1] > 1) {
				const gap = document.createElement('span');
				gap.textContent = '…';
				gap.setAttribute('aria-hidden', 'true');
				fragment.append(gap);
			}
			addLink(String(n), n, false, n === page);
		});
		addLink('下一页', page + 1, page === pageCount);
		const summary = document.createElement('span');
		summary.className = 'page-summary';
		summary.dataset.archiveSummary = '';
		summary.textContent = `第 ${page} / ${pageCount} 页，共 ${total} 条`;
		fragment.append(summary);
		pagination!.replaceChildren(fragment);
		pagination!.hidden = total === 0;
	}

	function showError(url: URL) {
		error!.hidden = false;
		const retry = error!.querySelector<HTMLAnchorElement>('a');
		if (retry) retry.href = url.href;
		status!.textContent = '记录加载失败，请重新筛选或重新加载此页。';
		table!.hidden = true;
		pagination!.hidden = true;
		empty!.hidden = true;
	}

	async function applyState(url: URL, historyMode: 'push' | 'replace' | 'none', focusResult = false) {
		const request = ++generation;
		const filters = readFilters(url);
		loading = true;
		section.setAttribute('aria-busy', 'true');
		status!.textContent = '正在加载记录…';
		error!.hidden = true;
		empty!.hidden = true;
		table!.hidden = true;
		pagination!.hidden = true;
		try {
			const index = await getIndex();
			if (request !== generation) return;
			const matches = filterArchiveRecords(index.records, filters);
			const result = paginateArchiveRecords(matches, requestedPage(url, filters), index.pageSize);
			const pages = new Set(result.records.map((record) => record.page));
			const loaded = new Map(await Promise.all(Array.from(pages, async (page) => [page, await loadPage(page)] as const)));
			if (request !== generation) return;
			const fragment = document.createDocumentFragment();
			result.records.forEach((record) => {
				const row = loaded.get(record.page)?.get(record.id);
				if (!row) throw new Error('Record unavailable');
				fragment.append(document.importNode(row, true));
			});
			tbody!.replaceChildren(fragment);
			initRecordLinks(tbody!);
			activeFilters = filters;
			section.dataset.currentPage = String(result.page);
			table!.hidden = result.total === 0;
			empty!.hidden = result.total !== 0;
			status!.textContent = result.total
				? `${hasFilters(filters) ? '筛选结果' : '全部记录'}：共 ${result.total} 条，当前显示第 ${result.startIndex + 1}–${result.endIndex} 条。`
				: '没有符合筛选条件的记录，请调整机场、出口地区或日期范围。';
			renderPagination(result.page, result.pageCount, result.total);
			const target = resultUrl(filters, result.page);
			target.hash = url.hash;
			if (historyMode === 'push') window.history.pushState(null, '', target);
			if (historyMode === 'replace') window.history.replaceState(null, '', target);
			const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
			if (canonical) canonical.href = new URL(target.pathname, canonical.href).href;
			document.title = `机场测速记录｜${hasFilters(filters) ? `筛选结果（第 ${result.page} 页）` : result.page === 1 ? '四地区节点与使用体验' : `第 ${result.page} 页`}｜${SITE_TITLE}`;
			if (focusResult) {
				status!.tabIndex = -1;
				status!.focus({ preventScroll: true });
				status!.scrollIntoView({ block: 'nearest' });
			}
		} catch {
			if (request === generation) showError(url);
		} finally {
			if (request === generation) {
				loading = false;
				section.removeAttribute('aria-busy');
				if (window.location.hash && error!.hidden) void revealRecord();
			}
		}
	}

	async function revealRecord() {
		if (loading) return;
		let id: string;
		try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
		tbody!.querySelectorAll('[data-record-selected]').forEach((row) => row.removeAttribute('data-record-selected'));
		if (!id) return;
		const row = Array.from(tbody!.rows).find((row) => row.id === id);
		if (row) {
			row.setAttribute('data-record-selected', '');
			requestAnimationFrame(() => {
				row.focus({ preventScroll: true });
				row.scrollIntoView({ block: 'center', inline: 'nearest' });
			});
			return;
		}
		const hash = window.location.hash;
		try {
			const index = await getIndex();
			if (loading || window.location.hash !== hash) return;
			const record = index.records.find((record) => record.id === id);
			if (!record) return;
			const target = new URL(getArchivePageHref(record.page), window.location.origin);
			target.hash = hash;
			if (target.href !== window.location.href) window.location.replace(target);
		} catch { showError(new URL(window.location.href)); }
	}

	form.querySelectorAll<HTMLFieldSetElement>('fieldset').forEach((fieldset) => { fieldset.disabled = false; });
	initRecordLinks(tbody);
	const validateDates = () => to.setCustomValidity(from.value && to.value && from.value > to.value ? '结束日期不能早于开始日期。' : '');
	from.addEventListener('input', validateDates);
	to.addEventListener('input', validateDates);
	form.addEventListener('submit', (event) => {
		event.preventDefault();
		validateDates();
		if (!form.reportValidity()) return;
		void applyState(resultUrl(normalizeArchiveFilters({ airport: airport.value, region: region.value, startDate: from.value, endDate: to.value }), 1), 'push');
	});
	form.addEventListener('reset', () => {
		to.setCustomValidity('');
		void applyState(new URL('/test/', window.location.origin), 'push');
	});
	pagination.addEventListener('click', (event) => {
		if (!(event instanceof MouseEvent) || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
		const link = event.target.closest<HTMLAnchorElement>('a[data-archive-page]');
		if (!link || !hasFilters(activeFilters)) return;
		event.preventDefault();
		void applyState(new URL(link.href), 'push', true);
	});
	window.addEventListener('popstate', () => { to.setCustomValidity(''); void applyState(new URL(window.location.href), 'none'); });
	window.addEventListener('hashchange', () => { void revealRecord(); });
	const initialUrl = new URL(window.location.href);
	if (['airport', 'region', 'from', 'to', 'page'].some((key) => initialUrl.searchParams.has(key))) void applyState(initialUrl, 'replace');
	else void revealRecord();
}
