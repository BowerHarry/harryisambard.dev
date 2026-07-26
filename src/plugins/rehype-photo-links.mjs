import { visit } from 'unist-util-visit';

const PREFIX = 'photos:';

/**
 * Rewrites `[text](photos:key)` links into `<span class="photo-link" data-photo-key="key">`,
 * and validates every key against the `photos` map in the file's frontmatter.
 */
export default function rehypePhotoLinks() {
	return (tree, file) => {
		const path = file.history[0] ?? file.path ?? 'unknown file';
		const declared = Object.keys(file.data.astro?.frontmatter?.photos ?? {});
		const referenced = new Set();

		visit(tree, 'element', (node) => {
			if (node.tagName !== 'a') return;

			const href = node.properties?.href;
			if (typeof href !== 'string' || !href.startsWith(PREFIX)) return;

			const key = href.slice(PREFIX.length);
			if (!declared.includes(key)) {
				throw new Error(
					`rehype-photo-links: ${path} links to photo key "${key}", which is not declared under "photos" in its frontmatter. Declared keys: ${declared.length ? declared.join(', ') : '(none)'}`
				);
			}

			referenced.add(key);
			node.tagName = 'span';
			node.properties = {
				className: ['photo-link'],
				'data-photo-key': key,
				tabIndex: 0,
				role: 'button',
			};
		});

		for (const key of declared) {
			if (!referenced.has(key)) {
				console.warn(
					`rehype-photo-links: ${path} declares photo key "${key}" in its frontmatter, but never references it in the body.`
				);
			}
		}
	};
}
