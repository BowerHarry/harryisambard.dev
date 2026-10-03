import { beforeEach, describe, expect, test, vi } from 'vitest';
import { navigate } from 'astro:transitions/client';
import '../../src/scripts/pager';
import { cursor, input, isFinding, loadPage, pane, press } from './page';

const meta = () => document.querySelector('[data-term-meta]')!.textContent;

/** Move the pane as a real scroll would, and let the pager hear about it. */
function scrollPaneTo(top: number) {
	pane().scrollTop = top;
	pane().dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
	vi.mocked(navigate).mockClear();
	loadPage({ open: 'alpha', pane: { clientHeight: 500, scrollHeight: 2500, scrollTop: 0 } });
});

describe('scrolling', () => {
	test.each(['ArrowDown', 'j'])('%s scrolls down a line', (key) => {
		const event = press(key);

		expect(pane().scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 48, behavior: 'instant' });
		expect(event.defaultPrevented).toBe(true);
	});

	test.each(['ArrowUp', 'k'])('%s scrolls up a line', (key) => {
		press(key);

		expect(pane().scrollBy).toHaveBeenCalledExactlyOnceWith({ top: -48, behavior: 'instant' });
	});

	test.each([' ', 'd', 'PageDown'])('"%s" scrolls down nine tenths of the pane', (key) => {
		press(key);

		expect(pane().scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 450, behavior: 'instant' });
	});

	test.each(['u', 'PageUp'])('%s scrolls up nine tenths of the pane', (key) => {
		press(key);

		expect(pane().scrollBy).toHaveBeenCalledExactlyOnceWith({ top: -450, behavior: 'instant' });
	});

	test.each(['g', 'Home'])('%s jumps to the top', (key) => {
		press(key);

		expect(pane().scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: 'instant' });
	});

	test.each(['G', 'End'])('%s jumps to the bottom', (key) => {
		press(key);

		expect(pane().scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 2500, behavior: 'instant' });
	});

	test('other keys are left alone', () => {
		const event = press('x');

		expect(event.defaultPrevented).toBe(false);
		expect(pane().scrollBy).not.toHaveBeenCalled();
		expect(pane().scrollTo).not.toHaveBeenCalled();
	});

	test('the list cursor does not move while the document has the keys', () => {
		press('j');
		press('ArrowDown');

		expect(cursor()).toBe('alpha');
	});
});

describe('the scroll percentage', () => {
	test('starts at 0% and follows the pane', () => {
		expect(meta()).toBe('0%');

		scrollPaneTo(500);
		expect(meta()).toBe('25%');

		scrollPaneTo(2000);
		expect(meta()).toBe('100%');
	});

	test('is rounded to a whole number', () => {
		scrollPaneTo(667);

		expect(meta()).toBe('33%');
	});

	test('stays between 0% and 100% when the pane is pulled past either end', () => {
		scrollPaneTo(-120);
		expect(meta()).toBe('0%');

		scrollPaneTo(2150);
		expect(meta()).toBe('100%');
	});

	test('is blank for a document shorter than the pane', () => {
		loadPage({ open: 'alpha', pane: { clientHeight: 500, scrollHeight: 500, scrollTop: 0 } });

		expect(meta()).toBe('');
	});
});

describe('handing the keyboard to the finder', () => {
	test.each(['/', 'Escape', 'q', 'ArrowLeft'])('%s focuses the filter box', (key) => {
		const event = press(key);

		expect(document.activeElement).toBe(input());
		expect(isFinding()).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		expect(navigate).not.toHaveBeenCalled();
	});

	test('goes to the list page instead when the list is off screen', () => {
		document.querySelector<HTMLElement>('.pane-list')!.hidden = true;

		press('/');

		expect(navigate).toHaveBeenCalledExactlyOnceWith('/');
	});

	test('keys typed into the filter box do not scroll the document', () => {
		input().focus();

		for (const key of ['j', 'd', ' ', 'g', 'G', 'ArrowDown']) press(key, input());

		expect(pane().scrollBy).not.toHaveBeenCalled();
		expect(pane().scrollTo).not.toHaveBeenCalled();
	});

	test('ArrowDown in the filter box moves the list cursor instead', () => {
		input().focus();

		press('ArrowDown', input());

		expect(cursor()).toBe('beta');
	});

	test('the Escape that leaves the filter box is not also taken as a key for the document', () => {
		input().focus();

		press('Escape', input());

		expect(document.activeElement).not.toBe(input());
		expect(isFinding()).toBe(false);
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe('standing down', () => {
	test('shortcuts with a modifier are left to the browser', () => {
		for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
			const event = press('d', document.body, { [modifier]: true });
			expect(event.defaultPrevented).toBe(false);
		}

		expect(pane().scrollBy).not.toHaveBeenCalled();
	});

	test('nothing happens while the help panel is up', () => {
		document.querySelector<HTMLElement>('[data-help]')!.hidden = false;

		expect(press('j').defaultPrevented).toBe(false);
		expect(pane().scrollBy).not.toHaveBeenCalled();
	});

	test('nothing happens while the photo gallery is up', () => {
		document.body.insertAdjacentHTML('beforeend', '<div class="photo-gallery"></div>');

		press('Escape');

		expect(document.activeElement).not.toBe(input());
		expect(pane().scrollBy).not.toHaveBeenCalled();
	});

	test('with no document open, the pager has no keys and shows no percentage', () => {
		loadPage();
		input().blur();

		press('d');
		press(' ');
		press('G');

		expect(pane().scrollBy).not.toHaveBeenCalled();
		expect(pane().scrollTo).not.toHaveBeenCalled();
		expect(meta()).toBe('');
	});

	test('going back to the list unhooks the previous document\'s keys', () => {
		const old = pane();
		loadPage();
		input().blur();

		press('j');

		expect(old.scrollBy).not.toHaveBeenCalled();
		expect(cursor()).toBe('beta');
	});
});
