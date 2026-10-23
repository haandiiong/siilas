const initialized = new WeakSet<HTMLButtonElement>();

/** Shared by airport records and lazily loaded archive rows. */
export const initRecordLinks = (root: ParentNode) => {
	root.querySelectorAll<HTMLButtonElement>('[data-copy-record-link]').forEach((button) => {
		if (initialized.has(button)) return;
		initialized.add(button);
		button.hidden = false;
		button.addEventListener('click', async () => {
			const tools = button.closest<HTMLElement>('.record-link-tools');
			const status = tools?.querySelector<HTMLElement>('[data-record-link-status]');
			const fallback = tools?.querySelector<HTMLInputElement>('[data-record-link-fallback]');
			if (!status || !fallback || !button.dataset.recordUrl) return;
			const url = new URL(button.dataset.recordUrl, window.location.origin).href;
			button.disabled = true;
			fallback.hidden = true;
			try {
				if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
				await navigator.clipboard.writeText(url);
				status.textContent = '链接已复制';
			} catch {
				fallback.value = url;
				fallback.hidden = false;
				fallback.focus();
				fallback.select();
				status.textContent = '自动复制未成功，可选中下方链接复制';
			} finally {
				button.disabled = false;
			}
		});
	});
};
