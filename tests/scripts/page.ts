import { vi } from 'vitest';

/**
 * A stand-in for the page Terminal.astro and DocList.astro render: just the
 * elements and data attributes the scripts look for.
 */

export type TestDoc = { id: string; filename: string; title: string };

export const DOCS: TestDoc[] = [
	{ id: 'alpha', filename: 'alpha.md', title: 'First Notes' },
	{ id: 'beta', filename: 'Beta_Plan.md', title: 'Second Plan' },
	{ id: 'gamma', filename: 'gamma.md', title: 'Third Notes' },
];

type Size = { clientHeight: number; scrollHeight: number; scrollTop: number };

const rowHtml = (doc: TestDoc) => `
	<li class="doc" data-doc data-doc-id="${doc.id}"
		data-haystack="${`${doc.filename} ${doc.title}`.toLowerCase()}">
		<a class="doc-link" href="/${doc.id}">
			<span class="doc-name" data-text="${doc.filename}">${doc.filename}</span>
		</a>
	</li>`;

const docHtml = (id: string | undefined) =>
	id ? `<main data-doc-page data-doc-id="${id}"><h1>${id}</h1></main>` : '<p>no document open</p>';

/** What jsdom leaves out, having no layout: these are the parts the scripts use. */
function fakeLayout() {
	// On screen unless something above it is hidden.
	Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
		configurable: true,
		get() {
			return this.closest('[hidden]') ? null : document.body;
		},
	});
	Element.prototype.scrollIntoView = vi.fn();
	window.matchMedia = vi.fn().mockReturnValue({ matches: false });
}

/** The right pane's scroller, given a size and spies for its scroll methods. */
function sizePane({ clientHeight, scrollHeight, scrollTop }: Size) {
	const pane = document.querySelector<HTMLElement>('[data-term-body]')!;
	Object.defineProperty(pane, 'clientHeight', { configurable: true, value: clientHeight });
	Object.defineProperty(pane, 'scrollHeight', { configurable: true, value: scrollHeight });
	Object.defineProperty(pane, 'scrollTop', { configurable: true, writable: true, value: scrollTop });
	pane.scrollBy = vi.fn();
	pane.scrollTo = vi.fn();
}

const pageLoad = () => document.dispatchEvent(new Event('astro:page-load'));

/** Render a page and run the scripts against it, as a first visit would. */
export function loadPage({
	docs = DOCS,
	open,
	touch = false,
	pane = { clientHeight: 500, scrollHeight: 2500, scrollTop: 0 },
}: { docs?: TestDoc[]; open?: string; touch?: boolean; pane?: Size } = {}) {
	document.documentElement.className = '';
	document.body.innerHTML = `
		<section class="pane-list">
			<input data-find type="text" />
			<ul data-doc-list>${docs.map(rowHtml).join('')}</ul>
			<p hidden data-docs-empty>no matching documents</p>
		</section>
		<section class="pane-doc">
			<span data-term-meta></span>
			<div data-term-body tabindex="-1">${docHtml(open)}</div>
		</section>
		<div class="help" hidden data-help></div>`;

	fakeLayout();
	vi.mocked(window.matchMedia).mockReturnValue({ matches: touch } as MediaQueryList);
	sizePane(pane);
	pageLoad();
}

/**
 * Open another document the way the client router does: the right pane is
 * swapped, the persisted left pane is kept, and the scripts are wired again.
 */
export function openDoc(id: string | undefined) {
	document.querySelector('[data-term-body]')!.innerHTML = docHtml(id);
	pageLoad();
}

export const input = () => document.querySelector<HTMLInputElement>('[data-find]')!;
export const pane = () => document.querySelector<HTMLElement>('[data-term-body]')!;
export const rows = () => [...document.querySelectorAll<HTMLLIElement>('[data-doc]')];
export const row = (id: string) => document.querySelector<HTMLLIElement>(`[data-doc-id="${id}"]`)!;
export const isFinding = () => document.documentElement.classList.contains('is-finding');

/** The ids of the rows the filter is showing. */
export const shown = () => rows().filter((li) => !li.hidden).map((li) => li.dataset.docId);

/** The id of the row under the cursor. */
export const cursor = () => document.querySelector<HTMLLIElement>('.is-selected')?.dataset.docId;

/** Press a key with the focus on `target`. Returns the event, to see if it was cancelled. */
export function press(key: string, target: Element = document.body, modifiers: KeyboardEventInit = {}) {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });
	target.dispatchEvent(event);
	return event;
}

/** Type into the filter box. */
export function type(text: string) {
	input().value = text;
	input().dispatchEvent(new Event('input', { bubbles: true }));
}
