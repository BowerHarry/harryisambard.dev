import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * Documents are Markdown files on disk, mirrored from Dropbox before the build
 * by `scripts/sync-content.mjs`. `src/lib/docs.ts` is what the rest of the site
 * reads.
 */
const files = defineCollection({
	loader: glob({ pattern: '*.md', base: './src/content/files' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			// Optional; `listDocs()` falls back to the file's mtime.
			updated: z.coerce.date().optional(),
			photos: z
				.record(
					z.string(),
					z.array(
						z.object({
							src: image(),
							alt: z.string(),
						})
					)
				)
				.optional(),
		}),
});

export const collections = { files };
