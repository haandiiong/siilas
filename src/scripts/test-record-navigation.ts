import { initRecordLinks } from './test-record-links';

const recordIdFromHash = () => {
	try { return decodeURIComponent(window.location.hash.slice(1)); }
	catch { return ''; }
};

document.querySelectorAll<HTMLElement>('[data-record-pagination]').forEach((section) => {
	const rows = Array.from(section.querySelectorAll<HTMLTableRowElement>('[data-page-row]'));
	const controls = section.querySelector<HTMLElement>('[data-pagination-controls]');
	const pageNumbers = section.querySelector<HTMLElement>('[data-page-numbers]');
	const summary = section.querySelector<HTMLElement>('[data-page-summary]');
	const previous = section.querySelector<HTMLButtonElement>('[data-page-action="previous"]');
	const next = section.querySelector<HTMLButtonElement>('[data-page-action="next"]');
	const pageSize = Number(section.dataset.pageSize) || 10;
	const pageCount = Math.ceil(rows.length / pageSize);
	let currentPage = 1;

	if (!controls || !pageNumbers || !summary || !previous || !next || !rows.length) return;

	const pageButtons: HTMLButtonElement[] = [];
	if (pageCount > 1) {
		for (let page = 1; page <= pageCount; page += 1) {
			const button = document.createElement('button');
			button.type = 'button';
			button.textContent = String(page);
			button.dataset.page = String(page);
			button.setAttribute('aria-label', `第 ${page} 页`);
			pageNumbers.append(button);
			pageButtons.push(button);
		}
	}

	const render = () => {
		rows.forEach((row, index) => {
			row.hidden = index < (currentPage - 1) * pageSize || index >= currentPage * pageSize;
		});
		previous.disabled = currentPage === 1;
		next.disabled = currentPage === pageCount;
		summary.textContent = `第 ${currentPage} / ${pageCount} 页，共 ${rows.length} 条`;
		pageButtons.forEach((button) => {
			if (Number(button.dataset.page) === currentPage) button.setAttribute('aria-current', 'page');
			else button.removeAttribute('aria-current');
		});
	};

	const revealLinkedRecord = () => {
		const id = recordIdFromHash();
		const index = rows.findIndex((row) => row.id === id);
		rows.forEach((row) => row.removeAttribute('data-record-selected'));
		if (index < 0) {
			if (!id) { currentPage = 1; render(); }
			return;
		}
		currentPage = Math.floor(index / pageSize) + 1;
		render();
		const target = rows[index];
		target.setAttribute('data-record-selected', '');
		requestAnimationFrame(() => {
			if (recordIdFromHash() !== target.id || target.hidden) return;
			target.focus({ preventScroll: true });
			target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
		});
	};

	controls.hidden = pageCount <= 1;
	controls.addEventListener('click', (event) => {
		if (!(event.target instanceof Element)) return;
		const button = event.target.closest<HTMLButtonElement>('button');
		if (!button || button.disabled) return;
		if (button.dataset.pageAction === 'previous') currentPage -= 1;
		if (button.dataset.pageAction === 'next') currentPage += 1;
		if (button.dataset.page) currentPage = Number(button.dataset.page);
		currentPage = Math.max(1, Math.min(pageCount, currentPage));
		render();
		const selected = rows.find((row) => row.hasAttribute('data-record-selected'));
		if (selected?.hidden) {
			selected.removeAttribute('data-record-selected');
			const url = new URL(window.location.href);
			url.hash = '';
			window.history.replaceState(window.history.state, '', url);
		}
		if (button.disabled) pageButtons[currentPage - 1]?.focus();
	});

	initRecordLinks(section);

	render();
	revealLinkedRecord();
	window.addEventListener('hashchange', revealLinkedRecord);
});
