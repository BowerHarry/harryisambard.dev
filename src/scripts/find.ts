import { navigate } from 'astro:transitions/client';
import { overlayOpen } from './overlay';

/**
 * The left pane: type to filter, arrows or j/k to move the cursor, Enter to open
 * the document in the right pane.
 *
 * The pane is on screen on every route, so this script and pager.ts are live at
 * the same time. They divide the keyboard by focus: while the filter box has it,
 * everything here applies and the pager stands down; while it doesn't, the pager
 * scrolls the document and only `/` and Esc come back this way.
 *
 * Module scripts run once, but the client router swaps documents underneath us,
 * so everything is (re)wired on `astro:page-load` and torn down before the next
 * page arrives — otherwise handlers pile up and act on detached nodes.
 */

let listeners: AbortController | null = null;

const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

const findInput = () => document.querySelector<HTMLInputElement>('[data-find]');

/** The filter box is hidden, not just unfocused, when the panes are stacked. */
const onScreen = (input: HTMLInputElement) => input.offsetParent !== null;

/**
 * The status bar swaps its hints depending on which pane holds the keyboard.
 * Set alongside every focus move rather than from the focus event alone, which
 * a background window delivers late.
 */
const finding = (on: boolean) => document.documentElement.classList.toggle('is-finding', on);

/**
 * Claim a key. The pager listens on the same element and decides from where the
 * focus is, so a key that moves the focus — Escape, leaving the box — has to
 * stop here, or the pager reads the new state and undoes it.
 */
function take(event: KeyboardEvent) {
	event.preventDefault();
	event.stopImmediatePropagation();
}

/**
 * Put the keyboard in the filter box. Returns false when the box isn't on
 * screen — the narrow layout shows one pane at a time, and the caller has to
 * navigate to the list instead.
 */
export function focusFind() {
	const input = findInput();
	if (!input || !onScreen(input)) return false;

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
	let visible = rows;
	let index = 0;

	// The list is persisted across navigations, so the cursor has to be put back
	// on the open document rather than reset to the top of the list.
	const page = document.querySelector<HTMLElement>('[data-doc-page]');
	const openRow = rows.find((row) => row.dataset.docId === page?.dataset.docId);
	let cursorTo: HTMLLIElement | null = openRow ?? null;

	const href = (row: HTMLLIElement) => row.querySelector<HTMLAnchorElement>('.doc-link')?.href;

	function highlight(row: HTMLLIElement, query: string) {
		const name = row.querySelector<HTMLElement>('.doc-name');
		const text = name?.dataset.text;
		if (!name || text === undefined) return;

		const at = query ? text.toLowerCase().indexOf(query) : -1;
		if (at < 0) {
			name.textContent = text;
			return;
		}

		const mark = document.createElement('mark');
		mark.className = 'doc-match';
		mark.textContent = text.slice(at, at + query.length);
		name.replaceChildren(text.slice(0, at), mark, text.slice(at + query.length));
	}

	function render(query = input!.value.trim().toLowerCase()) {
		visible = rows.filter((row) => !query || (row.dataset.haystack ?? '').includes(query));

		// Only for the first paint after a navigation: park the cursor on the row
		// whose document is open, once we know which rows the filter left.
		if (cursorTo) {
			const at = visible.indexOf(cursorTo);
			if (at >= 0) index = at;
			cursorTo = null;
		}

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
			highlight(row, query);
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
		const target = visible[index] && href(visible[index]);
		if (target) navigate(target);
	}

	input.addEventListener('input', () => {
		index = 0;
		render();
	}, { signal });

	// Clicking into the box counts too, not just the keys that focus it.
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

		const typing = document.activeElement === input;
		// With a document open the pager has the keys, including the `/` and Esc
		// that hand them back here, until the box is focused.
		if (!typing && page) return;

		switch (event.key) {
			case 'ArrowDown':
				move(1);
				take(event);
				return;
			case 'ArrowUp':
				move(-1);
				take(event);
				return;
			case 'Enter':
				open();
				take(event);
				return;
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
				take(event);
				return;
			case '/':
				if (!typing) {
					focusFind();
					take(event);
				}
				return;
			case 'j':
			case 'k':
				if (!typing) {
					move(event.key === 'j' ? 1 : -1);
					take(event);
				}
				return;
		}

		// Any other printable key starts filtering; the keypress itself lands in
		// the input because we don't cancel it.
		if (!typing && event.key.length === 1 && event.key !== '?') {
			input!.focus();
			finding(true);
		}
	}, { signal });

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
