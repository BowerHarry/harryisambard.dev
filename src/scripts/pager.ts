import { navigate } from 'astro:transitions/client';
import { overlayOpen } from './overlay';
import { focusFind } from './find';

/**
 * The right pane: less-style scrolling keys, a live scroll percentage in the
 * header, and `/` or Esc to hand the keyboard back to the finder on the left.
 * Wired on `astro:page-load` and torn down before the next navigation, for the
 * same reason as find.ts.
 */

let listeners: AbortController | null = null;

const LINE = 48;

function init() {
	listeners?.abort();
	listeners = null;

	const pane = document.querySelector<HTMLElement>('[data-term-body]');
	const meta = document.querySelector<HTMLElement>('[data-term-meta]');
	if (!pane || !document.querySelector('[data-doc-page]')) return; // not a document

	listeners = new AbortController();
	const { signal } = listeners;

	function percent() {
		if (!meta) return;
		const scrollable = pane!.scrollHeight - pane!.clientHeight;
		// A document shorter than the pane has no position to report, so it says
		// nothing rather than something that reads as a measurement.
		meta.textContent = scrollable > 0 ? `${Math.round((pane!.scrollTop / scrollable) * 100)}%` : '';
	}

	function by(amount: number) {
		pane!.scrollBy({ top: amount, behavior: 'instant' });
	}

	pane.addEventListener('scroll', percent, { signal, passive: true });

	document.addEventListener('keydown', (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		// The gallery and the help panel own the keyboard while they're up.
		if (overlayOpen()) return;
		// So does the filter box, whenever it has focus.
		if (document.activeElement instanceof HTMLInputElement) return;

		const page = pane!.clientHeight * 0.9;

		switch (event.key) {
			case 'ArrowDown':
			case 'j':
				by(LINE);
				break;
			case 'ArrowUp':
			case 'k':
				by(-LINE);
				break;
			case ' ':
			case 'd':
			case 'PageDown':
				by(page);
				break;
			case 'u':
			case 'PageUp':
				by(-page);
				break;
			case 'g':
			case 'Home':
				pane!.scrollTo({ top: 0, behavior: 'instant' });
				break;
			case 'G':
			case 'End':
				pane!.scrollTo({ top: pane!.scrollHeight, behavior: 'instant' });
				break;
			case 'Escape':
			case 'q':
			case 'ArrowLeft':
			case '/':
				// Both panes are on screen, so this is a move of the keyboard, not a
				// navigation — except when they're stacked and the list is off screen.
				// preventDefault below keeps the slash itself out of the box.
				if (!focusFind()) navigate('/');
				break;
			default:
				return;
		}

		event.preventDefault();
	}, { signal });

	percent();
}

document.addEventListener('astro:page-load', init);
