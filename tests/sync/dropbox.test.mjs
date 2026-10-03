import { afterEach, expect, test, vi } from 'vitest';
import { accessToken, asciiJson, download, listFiles } from '../../scripts/sync/dropbox.mjs';
import { fakeDropbox, fileEntry } from './fake-dropbox.mjs';

afterEach(() => vi.unstubAllGlobals());

test('asciiJson leaves plain ASCII as ordinary JSON', () => {
	expect(asciiJson({ path: '/files/notes.md' })).toBe('{"path":"/files/notes.md"}');
});

test('asciiJson escapes anything outside ASCII, and still parses back', () => {
	const value = { path: '/files/café – naïve 日本.md' };
	const escaped = asciiJson(value);

	expect(escaped).toMatch(/^[\x00-\x7e]*$/);
	expect(escaped).toContain('caf\\u00e9');
	expect(JSON.parse(escaped)).toEqual(value);
});

test('asciiJson escapes emoji as a surrogate pair', () => {
	expect(asciiJson('😀')).toBe('"\\ud83d\\ude00"');
});

test('asciiJson escapes DEL, which is ASCII but not allowed in a header', () => {
	expect(asciiJson('a\u007fb')).toBe('"a\\u007fb"');
});

test('accessToken trades the refresh token for an access token', async () => {
	const fetch = fakeDropbox([]);

	const token = await accessToken({ key: 'key', secret: 'secret', refresh: 'refresh' });

	expect(token).toBe('token');
	const [url, options] = fetch.mock.calls[0];
	expect(url).toBe('https://api.dropbox.com/oauth2/token');
	expect(options.headers.authorization).toBe(`Basic ${Buffer.from('key:secret').toString('base64')}`);
	expect(options.body.get('grant_type')).toBe('refresh_token');
	expect(options.body.get('refresh_token')).toBe('refresh');
});

test('accessToken says so when Dropbox refuses the refresh token', async () => {
	vi.stubGlobal('fetch', async () => new Response('invalid_grant', { status: 400 }));

	await expect(accessToken({ key: 'k', secret: 's', refresh: 'r' })).rejects.toThrow(
		'Dropbox refused the refresh token (400): invalid_grant'
	);
});

test('listFiles follows the cursor to the last page', async () => {
	const entries = ['/files/a.md', '/files/b.md', '/files/c.md'].map((name) => fileEntry(name, name));
	const fetch = fakeDropbox(entries, { pageSize: 1 });

	const listed = await listFiles('token');

	expect(listed.map((entry) => entry.path_display)).toEqual(['/files/a.md', '/files/b.md', '/files/c.md']);
	expect(fetch).toHaveBeenCalledTimes(3);
	expect(fetch.mock.calls[0][1].headers.authorization).toBe('Bearer token');
});

test('listFiles leaves out folders and deleted entries', async () => {
	fakeDropbox([
		{ '.tag': 'folder', name: 'files', path_lower: '/files', path_display: '/files' },
		fileEntry('/files/a.md', 'a'),
		{ '.tag': 'deleted', name: 'old.md', path_lower: '/files/old.md', path_display: '/files/old.md' },
	]);

	const listed = await listFiles('token');

	expect(listed.map((entry) => entry.name)).toEqual(['a.md']);
});

test('download returns the bytes, asking by an ASCII-only header', async () => {
	const fetch = fakeDropbox([fileEntry('/files/Café.md', 'bonjour')]);

	const bytes = await download('token', '/files/café.md');

	expect(bytes.toString()).toBe('bonjour');
	expect(fetch.mock.calls[0][1].headers['Dropbox-API-Arg']).toBe('{"path":"/files/caf\\u00e9.md"}');
});

test('a failed call reports the status and the body', async () => {
	fakeDropbox([]);

	await expect(download('token', '/files/missing.md')).rejects.toThrow(
		'Dropbox download of /files/missing.md failed (409): {"error":"not_found"}'
	);
});

test('a missing scope is explained rather than just reported', async () => {
	const body = '{"error": {".tag": "missing_scope", "required_scope": "files.metadata.read"}}';
	vi.stubGlobal('fetch', async () => new Response(body, { status: 401 }));

	await expect(listFiles('token')).rejects.toThrow(
		/files\/list_folder failed: the token is missing the "files.metadata.read" scope.\n.*\n.*issue a new refresh token/
	);
});
