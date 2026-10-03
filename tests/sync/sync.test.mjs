import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { loadEnvFile } from '../../scripts/sync/env.mjs';
import { syncContent } from '../../scripts/sync/sync.mjs';
import { fakeDropbox, fileEntry } from './fake-dropbox.mjs';

const CREDENTIALS = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'];

let root;

beforeEach(async () => {
	// A scratch repository root, so no test ever reads the real .env or writes
	// to the real src/content/.
	root = await mkdtemp(path.join(os.tmpdir(), 'sync-test-'));
	for (const name of [...CREDENTIALS, 'CF_PAGES', 'SYNC_TEST_VALUE']) vi.stubEnv(name, undefined);
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	await rm(root, { recursive: true, force: true });
});

function setCredentials() {
	for (const name of CREDENTIALS) vi.stubEnv(name, 'x');
}

// ── .env ──────────────────────────────────────────────────────────────────

test('loadEnvFile reads KEY=value lines, with or without quotes', async () => {
	await writeFile(
		path.join(root, '.env'),
		['# a comment', 'DROPBOX_APP_KEY=plain', 'DROPBOX_APP_SECRET="double"', "  DROPBOX_REFRESH_TOKEN = 'single'", ''].join('\n')
	);

	await loadEnvFile(root);

	expect(process.env.DROPBOX_APP_KEY).toBe('plain');
	expect(process.env.DROPBOX_APP_SECRET).toBe('double');
	expect(process.env.DROPBOX_REFRESH_TOKEN).toBe('single');
});

test('loadEnvFile does not override a variable that is already set', async () => {
	vi.stubEnv('SYNC_TEST_VALUE', 'from the shell');
	await writeFile(path.join(root, '.env'), 'SYNC_TEST_VALUE=from the file\n');

	await loadEnvFile(root);

	expect(process.env.SYNC_TEST_VALUE).toBe('from the shell');
});

test('loadEnvFile does nothing when there is no .env', async () => {
	await expect(loadEnvFile(root)).resolves.toBeUndefined();
});

// ── the run ───────────────────────────────────────────────────────────────

test('without credentials it keeps what is on disk and touches nothing', async () => {
	const fetch = fakeDropbox([]);

	await syncContent(root);

	expect(fetch).not.toHaveBeenCalled();
	expect(await readdir(root)).toEqual([]);
	expect(console.log).toHaveBeenCalledWith('[content] no Dropbox credentials, keeping the content already on disk');
});

test('one missing credential counts as none', async () => {
	const fetch = fakeDropbox([]);
	setCredentials();
	vi.stubEnv('DROPBOX_REFRESH_TOKEN', '');

	await syncContent(root);

	expect(fetch).not.toHaveBeenCalled();
});

test('on Cloudflare Pages, missing credentials fail the build', async () => {
	const fetch = fakeDropbox([]);
	vi.stubEnv('CF_PAGES', '1');

	await expect(syncContent(root)).rejects.toThrow('No Dropbox credentials in the build environment.');
	expect(fetch).not.toHaveBeenCalled();
});

test('on Cloudflare Pages with credentials it syncs as usual', async () => {
	fakeDropbox([fileEntry('/files/a.md', '# a')]);
	setCredentials();
	vi.stubEnv('CF_PAGES', '1');

	await syncContent(root);

	expect(await readdir(path.join(root, 'src/content/files'))).toEqual(['a.md']);
});

test('with credentials it mirrors both folders', async () => {
	fakeDropbox(
		[
			fileEntry('/files/a.md', '# a'),
			fileEntry('/photos/pier.jpg', 'jpeg bytes'),
			fileEntry('/elsewhere/ignored.md', 'x'),
		],
		{ pageSize: 2 }
	);
	setCredentials();

	await syncContent(root);

	expect(await readdir(path.join(root, 'src/content/files'))).toEqual(['a.md']);
	expect(await readdir(path.join(root, 'src/content/photos'))).toEqual(['pier.jpg']);
	expect(await readFile(path.join(root, 'src/content/photos/pier.jpg'), 'utf8')).toBe('jpeg bytes');
});

test('credentials can come from the .env in the root', async () => {
	fakeDropbox([fileEntry('/files/a.md', '# a')]);
	await writeFile(path.join(root, '.env'), CREDENTIALS.map((name) => `${name}=x`).join('\n'));

	await syncContent(root);

	expect(await readdir(path.join(root, 'src/content/files'))).toEqual(['a.md']);
});
