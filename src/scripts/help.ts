/**
 * Owns the `?` key for every view, so neither find.ts nor pager.ts has to. It
 * ignores `?` while a field has focus — typing a question mark into the filter
 * should filter, not open a dialog.
 */

let listeners: AbortController | null = null;

const isTyping = () => {
	const el = document.activeElement;
	return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
};

function init() {
	listeners?.abort();
	listeners = null;

	const help = document.querySelector<HTMLElement>('[data-help]');
	if (!help) return;

	listeners = new AbortController();
	const { signal } = listeners;

	const toggle = (open = help.hidden) => {
		help.hidden = !open;
	};

	help.addEventListener('click', () => toggle(false), { signal });

	document.addEventListener('keydown', (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;

		if (event.key === '?' && !isTyping()) {
			toggle();
			event.preventDefault();
			return;
		}

		if (event.key === 'Escape' && !help.hidden) {
			toggle(false);
			// Swallow it so the view's own Escape handler doesn't also fire.
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	}, { signal, capture: true });
}

document.addEventListener('astro:page-load', init);
