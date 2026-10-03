import { beforeEach, describe, expect, test, vi } from 'vitest';
import { navigate } from 'astro:transitions/client';
import { focusFind } from '../../src/scripts/find';
import { cursor, input, isFinding, loadPage, openDoc, press, row, rows, shown, type } from './page';

beforeEach(() => vi.mocked(navigate).mockClear());

describe('arriving', () => {
	test('on the list, the filter box has the keyboard and the cursor is on the first row', () => {
		loadPage();

		expect(document.activeElement).toBe(input());
		expect(isFinding()).toBe(true);
		expect(shown()).toEqual(['alpha', 'beta', 'gamma']);
		expect(cursor()).toBe('alpha');
		expect(document.querySelector('.is-open')).toBeNull();
	});

	test('on a touch screen the box is not focused, so no keyboard pops up', () => {
		loadPage({ touch: true });

		expect(document.activeElement).not.toBe(input());
		expect(isFinding()).toBe(false);
	});

	test('on a document, the keyboard is left to the document', () => {
		loadPage({ open: 'beta' });

		expect(document.activeElement).not.toBe(input());
		expect(isFinding()).toBe(false);
	});

	test('on a document, its row is marked open and the cursor starts there', () => {
		loadPage({ open: 'beta' });

		expect(cursor()).toBe('beta');
		expect(rows().map((li) => li.classList.contains('is-open'))).toEqual([false, true, false]);
		expect(rows().map((li) => li.querySelector('.doc-link')!.getAttribute('aria-current'))).toEqual([
			'false',
			'page',
			'false',
		]);
		expect(row('beta').scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
	});

	test('opening another document keeps the filter and moves the open mark', () => {
		loadPage({ open: 'alpha' });
		type('notes');

		openDoc('gamma');

		expect(input().value).toBe('notes');
		expect(shown()).toEqual(['alpha', 'gamma']);
		expect(cursor()).toBe('gamma');
		expect(row('alpha').classList.contains('is-open')).toBe(false);
		expect(row('gamma').classList.contains('is-open')).toBe(true);
	});

	test('when the filter hides the open document, the cursor falls back to the first match', () => {
		loadPage({ open: 'alpha' });
		type('plan');

		openDoc('gamma');

		expect(shown()).toEqual(['beta']);
		expect(cursor()).toBe('beta');
	});

	test('a page with no list does nothing', () => {
		loadPage();
		document.body.innerHTML = '';

		expect(() => document.dispatchEvent(new Event('astro:page-load'))).not.toThrow();
		expect(press('ArrowDown').defaultPrevented).toBe(false);
	});
});

describe('filtering', () => {
	beforeEach(() => loadPage());

	test('shows only the rows whose filename or title contains the text', () => {
		type('plan');
		expect(shown()).toEqual(['beta']);

		type('notes');
		expect(shown()).toEqual(['alpha', 'gamma']);
	});

	test('ignores case and surrounding spaces', () => {
		type('  BETA ');

		expect(shown()).toEqual(['beta']);
	});

	test('marks the matching part of the filename, in its original case', () => {
		type('beta');

		const name = row('beta').querySelector('.doc-name')!;
		expect(name.innerHTML).toBe('<mark class="doc-match">Beta</mark>_Plan.md');
		expect(name.textContent).toBe('Beta_Plan.md');
	});

	test('marks nothing when only the title matches', () => {
		type('second');

		expect(shown()).toEqual(['beta']);
		expect(row('beta').querySelector('mark')).toBeNull();
	});

	test('says so when nothing matches', () => {
		const empty = document.querySelector<HTMLElement>('[data-docs-empty]')!;

		type('zzz');
		expect(shown()).toEqual([]);
		expect(empty.hidden).toBe(false);
		expect(cursor()).toBeUndefined();

		type('');
		expect(empty.hidden).toBe(true);
	});

	test('clearing the text brings every row back, unmarked', () => {
		type('beta');
		type('');

		expect(shown()).toEqual(['alpha', 'beta', 'gamma']);
		expect(document.querySelector('mark')).toBeNull();
		expect(row('beta').querySelector('.doc-name')!.textContent).toBe('Beta_Plan.md');
	});

	test('puts the cursor back on the first match', () => {
		press('ArrowDown', input());
		press('ArrowDown', input());
		expect(cursor()).toBe('gamma');

		type('a');

		expect(cursor()).toBe('alpha');
	});
});

describe('moving the cursor', () => {
	beforeEach(() => loadPage());

	test('the arrows move it, and cancel the key', () => {
		const down = press('ArrowDown', input());
		expect(cursor()).toBe('beta');
		expect(down.defaultPrevented).toBe(true);

		press('ArrowUp', input());
		expect(cursor()).toBe('alpha');
	});

	test('there is only ever one cursor', () => {
		press('ArrowDown', input());
		press('ArrowDown', input());

		expect(document.querySelectorAll('.is-selected')).toHaveLength(1);
	});

	test('it wraps at both ends', () => {
		press('ArrowUp', input());
		expect(cursor()).toBe('gamma');

		press('ArrowDown', input());
		expect(cursor()).toBe('alpha');
	});

	test('it steps through the filtered rows only', () => {
		type('notes');

		press('ArrowDown', input());
		expect(cursor()).toBe('gamma');

		press('ArrowDown', input());
		expect(cursor()).toBe('alpha');
	});

	test('it scrolls the row it lands on into view', () => {
		press('ArrowDown', input());

		expect(row('beta').scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
	});

	test('it stays put when nothing matches', () => {
		type('zzz');

		expect(() => press('ArrowDown', input())).not.toThrow();
		expect(cursor()).toBeUndefined();
	});

	test('j and k move it when the box is not focused', () => {
		input().blur();

		expect(press('j').defaultPrevented).toBe(true);
		expect(cursor()).toBe('beta');

		press('k');
		expect(cursor()).toBe('alpha');
	});

	test('j and k typed into the box are just letters', () => {
		const event = press('j', input());

		expect(cursor()).toBe('alpha');
		expect(event.defaultPrevented).toBe(false);
	});

	test('hovering a row moves the cursor to it', () => {
		row('gamma').dispatchEvent(new MouseEvent('mouseenter'));

		expect(cursor()).toBe('gamma');
	});
});

describe('keys', () => {
	beforeEach(() => loadPage());

	test('Enter opens the document under the cursor', () => {
		press('ArrowDown', input());
		const enter = press('Enter', input());

		expect(navigate).toHaveBeenCalledExactlyOnceWith(row('beta').querySelector('a')!.href);
		expect(enter.defaultPrevented).toBe(true);
	});

	test('Enter does nothing when no row matches', () => {
		type('zzz');
		press('Enter', input());

		expect(navigate).not.toHaveBeenCalled();
	});

	test('Escape clears the filter first, then gives up the keyboard', () => {
		type('beta');

		press('Escape', input());
		expect(input().value).toBe('');
		expect(shown()).toEqual(['alpha', 'beta', 'gamma']);
		expect(document.activeElement).toBe(input());

		press('Escape', input());
		expect(document.activeElement).not.toBe(input());
		expect(isFinding()).toBe(false);
	});

	test('/ focuses the box and selects its text, without typing a slash', () => {
		type('beta');
		input().blur();
		expect(isFinding()).toBe(false);

		const slash = press('/');

		expect(document.activeElement).toBe(input());
		expect(isFinding()).toBe(true);
		expect(input().selectionStart).toBe(0);
		expect(input().selectionEnd).toBe(4);
		expect(slash.defaultPrevented).toBe(true);
	});

	test('/ typed into the box is just a slash', () => {
		expect(press('/', input()).defaultPrevented).toBe(false);
	});

	test('any other character focuses the box and is left to land in it', () => {
		input().blur();

		const event = press('b');

		expect(document.activeElement).toBe(input());
		expect(isFinding()).toBe(true);
		expect(event.defaultPrevented).toBe(false);
	});

	test('? and keys that are not characters do not start a filter', () => {
		input().blur();

		press('?');
		press('Shift');
		press('Tab');

		expect(document.activeElement).not.toBe(input());
	});

	test('shortcuts with a modifier are left to the browser', () => {
		for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
			const event = press('ArrowDown', input(), { [modifier]: true });
			expect(event.defaultPrevented).toBe(false);
		}

		expect(cursor()).toBe('alpha');
	});

	test('nothing happens while the help panel is up', () => {
		document.querySelector<HTMLElement>('[data-help]')!.hidden = false;

		expect(press('ArrowDown', input()).defaultPrevented).toBe(false);
		expect(cursor()).toBe('alpha');
	});

	test('nothing happens while the photo gallery is up', () => {
		document.body.insertAdjacentHTML('beforeend', '<div class="photo-gallery"></div>');

		press('ArrowDown', input());

		expect(cursor()).toBe('alpha');
	});

	test('loading a second page does not leave the first page\'s handlers behind', () => {
		openDoc(undefined);
		openDoc(undefined);

		press('ArrowDown', input());

		expect(cursor()).toBe('beta');
	});
});

describe('with a document open', () => {
	beforeEach(() => loadPage({ open: 'alpha' }));

	test('keys outside the box belong to the document', () => {
		for (const key of ['ArrowDown', 'j', 'Enter', 'x']) press(key);

		expect(cursor()).toBe('alpha');
		expect(navigate).not.toHaveBeenCalled();
		expect(document.activeElement).not.toBe(input());
	});

	test('keys inside the box still drive the list', () => {
		input().focus();

		press('ArrowDown', input());
		press('Enter', input());

		expect(cursor()).toBe('beta');
		expect(navigate).toHaveBeenCalledWith(row('beta').querySelector('a')!.href);
	});
});

describe('focusFind', () => {
	test('focuses the box and reports that it did', () => {
		loadPage({ open: 'alpha' });

		expect(focusFind()).toBe(true);
		expect(document.activeElement).toBe(input());
		expect(isFinding()).toBe(true);
	});

	test('reports false when the list is off screen, as in the narrow layout', () => {
		loadPage({ open: 'alpha' });
		document.querySelector<HTMLElement>('.pane-list')!.hidden = true;

		expect(focusFind()).toBe(false);
		expect(document.activeElement).not.toBe(input());
	});
});
