import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { syncTarget, TARGETS, wantedEntries } from '../../scripts/sync/mirror.mjs';
import { downloads, fakeDropbox, fileEntry } from './fake-dropbox.mjs';

const [FILES, PHOTOS] = TARGETS;

let root;
let dir;

beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), 'sync-test-'));
	dir = path.join(root, FILES.local);
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	await rm(root, { recursive: true, force: true });
});

const names = (entries) => entries.map((entry) => entry.path_display);

/** Puts a file in the local folder, as an earlier sync or a stray would have. */
async function onDisk(name, content) {
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), content);
}

// ── which entries a target takes ──────────────────────────────────────────

test('a target takes only the files directly inside its own folder', () => {
	const entries = [
		fileEntry('/files/a.md', ''),
		fileEntry('/files/drafts/a.md', ''),
		fileEntry('/photos/a.md', ''),
		fileEntry('/a.md', ''),
		fileEntry('/files-old/a.md', ''),
	];

	expect(names(wantedEntries(FILES, entries))).toEqual(['/files/a.md']);
});

test('a target takes only the file types it keeps', () => {
	const entries = [
		fileEntry('/files/a.md', ''),
		fileEntry('/files/B.MD', ''),
		fileEntry('/files/notes.txt', ''),
		fileEntry('/files/a.md.bak', ''),
		fileEntry('/photos/pier.jpg', ''),
		fileEntry('/photos/pier.JPEG', ''),
		fileEntry('/photos/logo.svg', ''),
		fileEntry('/photos/raw.heic', ''),
	];

	expect(names(wantedEntries(FILES, entries))).toEqual(['/files/a.md', '/files/B.MD']);
	expect(names(wantedEntries(PHOTOS, entries))).toEqual([
		'/photos/pier.jpg',
		'/photos/pier.JPEG',
		'/photos/logo.svg',
	]);
});

test('the remote folder matches whatever its capitalisation in Dropbox', () => {
	const entries = [fileEntry('/Files/Yellow Sticker.md', '')];

	expect(names(wantedEntries(FILES, entries))).toEqual(['/Files/Yellow Sticker.md']);
});

// ── mirroring ─────────────────────────────────────────────────────────────

test('downloads what is missing, under the name Dropbox displays', async () => {
	const entries = [fileEntry('/files/Yellow Sticker.md', '# yellow'), fileEntry('/files/b.md', '# b')];
	const fetch = fakeDropbox(entries);

	await syncTarget('token', FILES, entries, root);

	expect((await readdir(dir)).sort()).toEqual(['Yellow Sticker.md', 'b.md']);
	expect(await readFile(path.join(dir, 'Yellow Sticker.md'), 'utf8')).toBe('# yellow');
	expect(downloads(fetch)).toEqual(['/files/yellow sticker.md', '/files/b.md']);
});

test('downloads more files than fit in one batch', async () => {
	const entries = Array.from({ length: 9 }, (_, n) => fileEntry(`/files/${n}.md`, `doc ${n}`));
	const fetch = fakeDropbox(entries);

	await syncTarget('token', FILES, entries, root);

	expect(await readdir(dir)).toHaveLength(9);
	expect(downloads(fetch)).toHaveLength(9);
});

test('skips a file that is already identical', async () => {
	const entries = [fileEntry('/files/a.md', 'same')];
	const fetch = fakeDropbox(entries);
	await onDisk('a.md', 'same');

	await syncTarget('token', FILES, entries, root);

	expect(downloads(fetch)).toEqual([]);
	expect(console.log).toHaveBeenCalledWith('[content] src/content/files: 1 file (0 downloaded, 0 removed)');
});

test('replaces a file whose contents differ, even at the same size', async () => {
	const entries = [fileEntry('/files/a.md', 'new!'), fileEntry('/files/b.md', 'longer than before')];
	const fetch = fakeDropbox(entries);
	await onDisk('a.md', 'old!');
	await onDisk('b.md', 'short');

	await syncTarget('token', FILES, entries, root);

	expect(await readFile(path.join(dir, 'a.md'), 'utf8')).toBe('new!');
	expect(await readFile(path.join(dir, 'b.md'), 'utf8')).toBe('longer than before');
	expect(downloads(fetch)).toEqual(['/files/a.md', '/files/b.md']);
});

test("stamps every file with Dropbox's timestamp, downloaded or not", async () => {
	const entries = [
		fileEntry('/files/new.md', 'new', '2025-03-04T05:06:07Z'),
		fileEntry('/files/kept.md', 'kept', '2024-01-01T00:00:00Z'),
	];
	fakeDropbox(entries);
	await onDisk('kept.md', 'kept');

	await syncTarget('token', FILES, entries, root);

	expect((await stat(path.join(dir, 'new.md'))).mtime).toEqual(new Date('2025-03-04T05:06:07Z'));
	expect((await stat(path.join(dir, 'kept.md'))).mtime).toEqual(new Date('2024-01-01T00:00:00Z'));
});

test('removes local files that are gone from Dropbox', async () => {
	const entries = [fileEntry('/files/a.md', 'a')];
	fakeDropbox(entries);
	await onDisk('deleted.md', 'x');
	await onDisk('stray.txt', 'x');

	await syncTarget('token', FILES, entries, root);

	expect(await readdir(dir)).toEqual(['a.md']);
	expect(console.log).toHaveBeenCalledWith('[content] src/content/files: 1 file (1 downloaded, 2 removed)');
});

test('leaves dotfiles alone', async () => {
	fakeDropbox([]);
	await onDisk('.gitkeep', '');
	await onDisk('deleted.md', 'x');

	await syncTarget('token', FILES, [], root);

	expect(await readdir(dir)).toEqual(['.gitkeep']);
});

test('an empty Dropbox folder empties the local one', async () => {
	fakeDropbox([]);
	await onDisk('a.md', 'a');

	await syncTarget('token', FILES, [], root);

	expect(await readdir(dir)).toEqual([]);
	expect(console.log).toHaveBeenCalledWith('[content] src/content/files: 0 files (0 downloaded, 1 removed)');
});

test('a failed download fails the sync', async () => {
	const entries = [fileEntry('/files/a.md', 'a')];
	fakeDropbox([]);

	await expect(syncTarget('token', FILES, entries, root)).rejects.toThrow('Dropbox download of /files/a.md failed');
});
