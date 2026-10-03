import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import rehypePhotoLinks from '../../src/plugins/rehype-photo-links.mjs';

const link = (href, text) => ({
	type: 'element',
	tagName: 'a',
	properties: { href },
	children: [{ type: 'text', value: text }],
});

/** A paragraph holding the given nodes, as the tree of a whole document. */
const tree = (...children) => ({
	type: 'root',
	children: [{ type: 'element', tagName: 'p', properties: {}, children }],
});

/** The vfile Astro hands a rehype plugin, declaring the given photo keys. */
const file = (...keys) => ({
	history: ['src/content/files/pier.md'],
	data: { astro: { frontmatter: { photos: Object.fromEntries(keys.map((key) => [key, []])) } } },
});

const run = (document, vfile) => rehypePhotoLinks()(document, vfile);

beforeEach(() => {
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

test('a photos: link becomes a focusable span carrying its key', () => {
	const document = tree(link('photos:scaffolding', 'getting the frame up'));

	run(document, file('scaffolding'));

	expect(document.children[0].children[0]).toEqual({
		type: 'element',
		tagName: 'span',
		properties: {
			className: ['photo-link'],
			'data-photo-key': 'scaffolding',
			tabIndex: 0,
			role: 'button',
		},
		children: [{ type: 'text', value: 'getting the frame up' }],
	});
	expect(console.warn).not.toHaveBeenCalled();
});

test('ordinary links and other elements are left alone', () => {
	const document = tree(
		link('https://example.com', 'elsewhere'),
		link('/photos:not-a-prefix', 'relative'),
		{ type: 'element', tagName: 'a', properties: {}, children: [] },
		{ type: 'element', tagName: 'em', properties: { href: 'photos:pier' }, children: [] }
	);
	const before = structuredClone(document);

	run(document, file());

	expect(document).toEqual(before);
});

test('the same key can be linked more than once', () => {
	const document = tree(link('photos:pier', 'once'), link('photos:pier', 'twice'));

	run(document, file('pier'));

	expect(document.children[0].children.map((node) => node.tagName)).toEqual(['span', 'span']);
});

test('a link nested inside other markup is found', () => {
	const inner = link('photos:pier', 'deep');
	const document = tree({ type: 'element', tagName: 'strong', properties: {}, children: [inner] });

	run(document, file('pier'));

	expect(inner.tagName).toBe('span');
});

test('an undeclared key fails the build, naming the file and the keys there are', () => {
	const document = tree(link('photos:peir', 'typo'));

	expect(() => run(document, file('pier', 'beach'))).toThrow(
		'rehype-photo-links: src/content/files/pier.md links to photo key "peir", which is not declared under "photos" in its frontmatter. Declared keys: pier, beach'
	);
});

test('a document with no photos at all says so in the error', () => {
	const document = tree(link('photos:pier', 'text'));
	const bare = { history: [], path: 'bare.md', data: {} };

	expect(() => run(document, bare)).toThrow(/bare\.md links to photo key "pier".*Declared keys: \(none\)/);
});

test('a declared key that is never linked warns, once per key', () => {
	const document = tree(link('photos:pier', 'text'));

	run(document, file('pier', 'beach', 'dunes'));

	expect(console.warn).toHaveBeenCalledTimes(2);
	expect(console.warn).toHaveBeenCalledWith(
		'rehype-photo-links: src/content/files/pier.md declares photo key "beach" in its frontmatter, but never references it in the body.'
	);
});
