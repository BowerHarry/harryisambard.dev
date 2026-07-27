import { statSync } from 'node:fs';
import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * The only module that talks to `astro:content`. Everything else — routes, the
 * list, the pager — reads the shape below, so swapping the loader in
 * `content.config.ts` for a remote one is invisible past this file.
 */
export type Doc = {
	/** Route id, e.g. `yellow_sticker`. */
	id: string;
	/** What the list shows: the file as it exists on disk. */
	filename: string;
	/** The real title, from frontmatter. */
	title: string;
	/** Last modified. Frontmatter `updated` wins; otherwise the file's mtime. */
	updated: Date;
};

type DocEntry = CollectionEntry<'files'>;

function filenameOf(entry: DocEntry) {
	return entry.filePath?.split('/').pop() ?? `${entry.id}.md`;
}

function updatedAt(entry: DocEntry) {
	if (entry.data.updated) return entry.data.updated;

	// The Dropbox sync stamps each file's mtime with Dropbox's own timestamp,
	// so this stays meaningful for documents without an `updated` in frontmatter.
	try {
		if (entry.filePath) return statSync(entry.filePath).mtime;
	} catch {
		// Fall through to the epoch rather than failing the build over a date.
	}

	return new Date(0);
}

function toDoc(entry: DocEntry): Doc {
	return {
		id: entry.id,
		filename: filenameOf(entry),
		title: entry.data.title,
		updated: updatedAt(entry),
	};
}

/** Every document, newest first. */
export async function listDocs(): Promise<Doc[]> {
	const entries = await getCollection('files');
	return entries.map(toDoc).sort((a, b) => b.updated.getTime() - a.updated.getTime());
}

/** Entries paired with their `Doc`, for `getStaticPaths`. */
export async function listDocEntries() {
	const entries = await getCollection('files');
	return entries.map((entry) => ({ doc: toDoc(entry), entry }));
}
