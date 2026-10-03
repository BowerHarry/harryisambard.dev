import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { download } from './dropbox.mjs';
import { contentHash } from './hash.mjs';
import { log } from './log.mjs';

/** Which remote folder lands where, and what is allowed out of it. */
export const TARGETS = [
	{ remote: '/files', local: 'src/content/files', keep: /\.md$/i },
	{ remote: '/photos', local: 'src/content/photos', keep: /\.(png|jpe?g|webp|avif|gif|svg)$/i },
];

/** How many files to download at once. Dropbox is fine with this; be polite. */
const BATCH = 4;

const localName = (entry) => path.basename(entry.path_display);

/**
 * The entries a target mirrors. Only what sits directly in the folder: the
 * mirror is flat, so a file of the same name one level down would otherwise
 * quietly overwrite its sibling.
 */
export function wantedEntries(target, entries) {
	const prefix = `${target.remote.toLowerCase()}/`;

	return entries.filter(
		(entry) =>
			entry.path_lower.startsWith(prefix) &&
			!entry.path_lower.slice(prefix.length).includes('/') &&
			target.keep.test(entry.name)
	);
}

/** Whether the file on disk is already byte-identical to Dropbox's copy. */
async function upToDate(file, entry) {
	if (!existsSync(file)) return false;
	// A different size settles it without reading the file.
	if ((await stat(file)).size !== entry.size) return false;
	return contentHash(await readFile(file)) === entry.content_hash;
}

/** Makes one local folder under `root` match one remote folder. */
export async function syncTarget(token, target, entries, root) {
	const dir = path.join(root, target.local);
	await mkdir(dir, { recursive: true });

	const wanted = wantedEntries(target, entries);

	// Skip anything already up to date; a no-op sync should cost nothing.
	const changed = [];
	for (const entry of wanted) {
		if (!(await upToDate(path.join(dir, localName(entry)), entry))) changed.push(entry);
	}

	for (let at = 0; at < changed.length; at += BATCH) {
		await Promise.all(
			changed.slice(at, at + BATCH).map(async (entry) => {
				await writeFile(path.join(dir, localName(entry)), await download(token, entry.path_lower));
			})
		);
	}

	// docs.ts falls back to the mtime when frontmatter has no `updated`, so it
	// has to carry Dropbox's timestamp rather than the moment we downloaded.
	for (const entry of wanted) {
		const when = new Date(entry.server_modified);
		await utimes(path.join(dir, localName(entry)), when, when);
	}

	// Deletions have to propagate, or removed documents haunt the build.
	const keep = new Set(wanted.map(localName));
	const stale = (await readdir(dir)).filter((name) => !name.startsWith('.') && !keep.has(name));
	for (const name of stale) await rm(path.join(dir, name), { force: true });

	log(
		`${target.local}: ${wanted.length} file${wanted.length === 1 ? '' : 's'}` +
			` (${changed.length} downloaded, ${stale.length} removed)`
	);
}
