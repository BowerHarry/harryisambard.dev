import { navigate } from 'astro:transitions/client';
import { overlayOpen } from './overlay';

/**
 * The left pane: type to filter, arrows or j/k to move the cursor, Enter to open
 * the document in the right pane.
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

function init() {
	listeners?.abort();
	listeners = null;

	const input = findInput();
	const list = document.querySelector<HTMLElement>('[data-doc-list]');
	const empty = document.querySelector<HTMLElement>('[data-docs-empty]');
	if (!input || !list) return;

	listeners = new AbortController();
	const { signal } = listeners;

	const rows = [...list.querySelectorAll<HTMLLIElement>('[data-doc]')];
	const page = document.querySelector<HTMLElement>('[data-doc-page]');
	const openRow = rows.find((row) => row.dataset.docId === page?.dataset.docId);

	let visible = rows;
	let index = 0;

	const query = () => input!.value.trim().toLowerCase();
	const matches = (row: HTMLLIElement, text: string) =>
		!text || (row.dataset.haystack ?? '').includes(text);

	function highlight(row: HTMLLIElement, text: string) {
		const name = row.querySelector<HTMLElement>('.doc-name');
		const full = name?.dataset.text;
		if (!name || full === undefined) return;

		const at = text ? full.toLowerCase().indexOf(text) : -1;
		if (at < 0) {
			name.textContent = full;
			return;
		}

		const mark = document.createElement('mark');
		mark.className = 'doc-match';
		mark.textContent = full.slice(at, at + text.length);
		name.replaceChildren(full.slice(0, at), mark, full.slice(at + text.length));
	}

	function render() {
		const text = query();
		visible = rows.filter((row) => matches(row, text));
		index = Math.min(Math.max(index, 0), Math.max(visible.length - 1, 0));

		const cursor = visible[index];

		for (const row of rows) {
			const shown = visible.includes(row);
			row.hidden = !shown;
			row.classList.toggle('is-selected', shown && row === cursor);
			row.classList.toggle('is-open', row === openRow);
			row
				.querySelector('.doc-link')
				?.setAttribute('aria-current', row === openRow ? 'page' : 'false');
			highlight(row, text);
		}

		if (empty) empty.hidden = visible.length > 0;
	}

	function move(delta: number) {
		if (!visible.length) return;
		index = (index + delta + visible.length) % visible.length;
		render();
		visible[index]?.scrollIntoView({ block: 'nearest' });
	}

	function open() {
		const href = visible[index]?.querySelector<HTMLAnchorElement>('.doc-link')?.href;
		if (href) navigate(href);
	}

	input.addEventListener('input', () => {
		index = 0;
		render();
	}, { signal });

	input.addEventListener('focus', () => finding(true), { signal });
	input.addEventListener('blur', () => finding(false), { signal });

	// Clicking a row is a plain link; hovering just moves the cursor to it.
	for (const row of rows) {
		row.addEventListener('mouseenter', () => {
			const at = visible.indexOf(row);
			if (at >= 0) {
				index = at;
				render();
			}
		}, { signal });
	}

	document.addEventListener('keydown', (event) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		// The gallery and the help panel own the keyboard while they're up.
		if (overlayOpen()) return;

		const typing = event.target === input;
		// With a document open the pager has the keys, including the `/` and Esc
		// that hand them back here, until the box is focused.
		if (!typing && page) return;

		switch (event.key) {
			case 'ArrowDown':
				move(1);
				break;
			case 'ArrowUp':
				move(-1);
				break;
			case 'Enter':
				open();
				break;
			case 'Escape':
				// Clear the filter first; a second Escape hands back the document.
				if (input!.value) {
					input!.value = '';
					index = 0;
					render();
				} else {
					input!.blur();
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
				move(event.key === 'j' ? 1 : -1);
				break;
			default:
				// Any other printable key starts filtering. The keypress itself lands
				// in the box because this doesn't cancel it.
				if (!typing && event.key.length === 1 && event.key !== '?') {
					input!.focus();
					finding(true);
				}
				return;
		}

		event.preventDefault();
	}, { signal });

	// The list survives navigation, so the cursor starts on the open document
	// rather than back at the top.
	index = Math.max(rows.filter((row) => matches(row, query())).indexOf(openRow!), 0);
	render();
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
