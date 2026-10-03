import { navigate } from 'astro:transitions/client';
import { overlayOpen } from './overlay';
import { createDocList, type DocList } from './doc-list';

/**
 * The left pane: type to filter, arrows or j/k to move the cursor, Enter to open
 * the document in the right pane. This file is the keyboard and the focus; the
 * rows themselves are in doc-list.ts.
 *
 * Both panes are on screen at once, so this and pager.ts are live together and
 * divide the keyboard by where the focus is: the filter box has the keys while
 * it is focused, the document has them otherwise.
 *
 * Everything is rewired on `astro:page-load` and torn down before the next page,
 * because the client router swaps documents under handlers that would otherwise
 * pile up on detached nodes.
 */

let listeners: AbortController | null = null;

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

const findInput = () => document.querySelector<HTMLInputElement>('[data-find]');

const query = (input: HTMLInputElement) => input.value.trim().toLowerCase();

/** Which pane holds the keyboard, for the hints in the status bar. */
const finding = (on: boolean) => document.documentElement.classList.toggle('is-finding', on);

/**
 * Focus the filter box. False when it isn't on screen: the narrow layout shows
 * one pane at a time, so the caller has to navigate to the list instead.
 */
export function focusFind() {
	const input = findInput();
	if (!input || input.offsetParent === null) return false;

	input.focus();
	input.select();
	finding(true);
	return true;
}

/** One key press that belongs to this pane. */
function onKey(event: KeyboardEvent, input: HTMLInputElement, docs: DocList) {
	const typing = event.target === input;

	switch (event.key) {
		case 'ArrowDown':
			docs.move(1);
			break;
		case 'ArrowUp':
			docs.move(-1);
			break;
		case 'Enter': {
			const href = docs.selectedHref();
			if (href) navigate(href);
			break;
		}
		case 'Escape':
			// Clear the filter first; a second Escape hands back the document.
			if (input.value) {
				input.value = '';
				docs.filter('');
			} else {
				input.blur();
				finding(false);
			}
			break;
		case '/':
			if (typing) return;
			focusFind();
			break;
		case 'j':
		case 'k':
			if (typing) return;
			docs.move(event.key === 'j' ? 1 : -1);
			break;
		default:
			// Any other printable key starts filtering. The keypress itself lands
			// in the box because this doesn't cancel it.
			if (!typing && event.key.length === 1 && event.key !== '?') {
				input.focus();
				finding(true);
			}
			return;
	}

	event.preventDefault();
}

function init() {
	listeners?.abort();
	listeners = null;

	const input = findInput();
	const list = document.querySelector<HTMLElement>('[data-doc-list]');
	const empty = document.querySelector<HTMLElement>('[data-docs-empty]');
	if (!input || !list) return;

	listeners = new AbortController();
	const { signal } = listeners;

	const docs = createDocList(list, empty);
	const page = document.querySelector<HTMLElement>('[data-doc-page]');

	input.addEventListener('input', () => docs.filter(query(input)), { signal });
	input.addEventListener('focus', () => finding(true), { signal });
	input.addEventListener('blur', () => finding(false), { signal });

	// Clicking a row is a plain link; hovering just moves the cursor to it.
	for (const row of docs.rows) {
		row.addEventListener('mouseenter', () => docs.moveTo(row), { signal });
	}

	document.addEventListener('keydown', (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		// The gallery and the help panel own the keyboard while they're up.
		if (overlayOpen()) return;
		// With a document open the pager has the keys, including the `/` and Esc
		// that hand them back here, until the box is focused.
		if (event.target !== input && page) return;

		onKey(event, input, docs);
	}, { signal });

	// The list survives navigation, so the cursor starts on the open document
	// rather than back at the top.
	const openRow = docs.markOpen(page?.dataset.docId);
	docs.filter(query(input));
	docs.moveTo(openRow);
	openRow?.scrollIntoView({ block: 'nearest' });

	// With a document open the keyboard belongs to it — `/` or Esc calls it back.
	// On a phone, focusing here would throw up the on-screen keyboard on arrival.
	if (page || isTouch()) {
		input.blur();
		finding(false);
	} else {
		input.focus({ preventScroll: true });
		finding(true);
	}
}

document.addEventListener('astro:page-load', init);
