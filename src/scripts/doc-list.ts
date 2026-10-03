/**
 * The rows of the left pane: which of them the filter shows, where the cursor
 * is, and which one is the open document. find.ts owns the keyboard and calls
 * into this; nothing here listens for anything.
 */
export type DocList = ReturnType<typeof createDocList>;

type Row = HTMLLIElement;

const matches = (row: Row, text: string) => !text || (row.dataset.haystack ?? '').includes(text);

/** Marks where `text` falls in the row's filename, or restores the plain name. */
function highlight(row: Row, text: string) {
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

export function createDocList(list: HTMLElement, empty: HTMLElement | null) {
	const rows = [...list.querySelectorAll<Row>('[data-doc]')];

	let visible: Row[] = rows;
	let index = 0;

	function showCursor() {
		for (const row of list.querySelectorAll('.is-selected')) row.classList.remove('is-selected');
		visible[index]?.classList.add('is-selected');
	}

	/** Show only the rows matching `text`, with the cursor back on the first. */
	function filter(text: string) {
		visible = [];
		index = 0;

		for (const row of rows) {
			const shown = matches(row, text);
			row.hidden = !shown;
			highlight(row, text);
			if (shown) visible.push(row);
		}

		if (empty) empty.hidden = visible.length > 0;
		showCursor();
	}

	/** Step the cursor through the visible rows, wrapping at either end. */
	function move(delta: number) {
		if (!visible.length) return;
		index = (index + delta + visible.length) % visible.length;
		showCursor();
		visible[index].scrollIntoView({ block: 'nearest' });
	}

	/** Put the cursor on a row, if the filter is showing it. */
	function moveTo(row: Row | undefined) {
		const at = row ? visible.indexOf(row) : -1;
		if (at < 0) return;
		index = at;
		showCursor();
	}

	/** Where Enter goes: the link of the row under the cursor. */
	function selectedHref() {
		return visible[index]?.querySelector<HTMLAnchorElement>('.doc-link')?.href;
	}

	/** Mark the row for the document in the right pane, and return it. */
	function markOpen(id: string | undefined) {
		const openRow = rows.find((row) => row.dataset.docId === id);

		for (const row of rows) {
			row.classList.toggle('is-open', row === openRow);
			row
				.querySelector('.doc-link')
				?.setAttribute('aria-current', row === openRow ? 'page' : 'false');
		}

		return openRow;
	}

	return { rows, filter, move, moveTo, selectedHref, markOpen };
}
