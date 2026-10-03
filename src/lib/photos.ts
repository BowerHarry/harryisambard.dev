import { getImage } from 'astro:assets';

type PhotoItem = { src: ImageMetadata; alt: string };
type PhotoSets = Record<string, PhotoItem[]> | undefined;

/** One photo at a given width, as the plain `{ src, width, height }` the island reads. */
async function resized(src: ImageMetadata, width: number) {
	const image = await getImage({ src, width, format: 'webp' });
	return { src: image.src, width: image.attributes.width, height: image.attributes.height };
}

async function buildPhoto(item: PhotoItem) {
	const [thumb, full] = await Promise.all([resized(item.src, 160), resized(item.src, 1600)]);
	return { alt: item.alt, thumb, full };
}

/**
 * Turns the `photos` frontmatter into the plain shape `PhotoLayer` expects.
 * Optimisation happens here, at build time, so the island only ever receives URLs.
 */
export async function buildPhotos(sets: PhotoSets) {
	const built = await Promise.all(
		Object.entries(sets ?? {}).map(async ([key, items]) => [key, await Promise.all(items.map(buildPhoto))])
	);

	return Object.fromEntries(built);
}
