import { getImage } from 'astro:assets';

type PhotoSets = Record<string, { src: ImageMetadata; alt: string }[]> | undefined;

/**
 * Turns the `photos` frontmatter into the plain shape `PhotoLayer` expects.
 * Optimisation happens here, at build time, so the island only ever receives URLs.
 */
export async function buildPhotos(sets: PhotoSets) {
	const photos: Record<string, unknown[]> = {};

	for (const [key, items] of Object.entries(sets ?? {})) {
		photos[key] = await Promise.all(
			items.map(async (item) => {
				const thumb = await getImage({ src: item.src, width: 160, format: 'webp' });
				const full = await getImage({ src: item.src, width: 1600, format: 'webp' });
				return {
					alt: item.alt,
					thumb: {
						src: thumb.src,
						width: thumb.attributes.width,
						height: thumb.attributes.height,
					},
					full: { src: full.src, width: full.attributes.width, height: full.attributes.height },
				};
			})
		);
	}

	return photos;
}
