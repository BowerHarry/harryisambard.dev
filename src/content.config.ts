import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * Documents come from local Markdown today. When the build starts fetching them
 * from elsewhere, only the `loader` below changes — a remote loader supplies the
 * same fields, and `src/lib/docs.ts` keeps the shape the rest of the site reads.
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
