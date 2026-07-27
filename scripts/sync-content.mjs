#!/usr/bin/env node
/**
 * Mirrors the Dropbox app folder into src/content/ before Astro runs.
 *
 *   Dropbox/Apps/<app>/files/*.md   →  src/content/files/
 *   Dropbox/Apps/<app>/photos/*     →  src/content/photos/
 *
 * Deliberately a mirror rather than a content-layer loader: once the files are
 * on disk, the glob loader, the `image()` schema helper and `buildPhotos()` all
 * work exactly as they do for local content, so nothing downstream knows the
 * documents came off the network. Each file's mtime is set to Dropbox's
 * `server_modified`, which is what `docs.ts` falls back to for ordering.
 *
 * Without credentials it leaves whatever is already on disk alone and exits 0,
 * so a local build works offline and a fork builds without secrets.
 *
 * Env: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Which remote folder lands where, and what is allowed out of it. */
const TARGETS = [
	{ remote: '/files', local: 'src/content/files', keep: /\.md$/i },
	{ remote: '/photos', local: 'src/content/photos', keep: /\.(png|jpe?g|webp|avif|gif|svg)$/i },
];

/** How many downloads to have in flight. Dropbox is fine with this; be polite. */
const CONCURRENCY = 4;

const log = (message) => console.log(`[content] ${message}`);

/** A local .env, so the same command works here and in CI without a flag. */
async function loadEnvFile() {
	const file = path.join(ROOT, '.env');
	if (!existsSync(file)) return;

	for (const line of (await readFile(file, 'utf8')).split('\n')) {
		const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
		if (!match || match[1] in process.env) continue;
		process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
	}
}

/**
 * Dropbox's own hash: SHA-256 of the concatenated SHA-256 of each 4 MiB block.
 * Comparing it against the local file is what makes a re-run cheap.
 */
function contentHash(buffer) {
	const BLOCK = 4 * 1024 * 1024;
	const digests = [];

	for (let at = 0; at < buffer.length; at += BLOCK) {
		digests.push(createHash('sha256').update(buffer.subarray(at, at + BLOCK)).digest());
	}

	return createHash('sha256').update(Buffer.concat(digests)).digest('hex');
}

/** The API header must be plain ASCII, so accented filenames get escaped. */
const asciiJson = (value) =>
	JSON.stringify(value).replace(
		/[\u007f-\uffff]/g,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
	);

async function accessToken({ key, secret, refresh }) {
	const response = await fetch('https://api.dropbox.com/oauth2/token', {
		method: 'POST',
		headers: {
			authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
	});

	if (!response.ok) {
		throw new Error(`Dropbox refused the refresh token (${response.status}): ${await response.text()}`);
	}

	return (await response.json()).access_token;
}

async function rpc(token, endpoint, body) {
	const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

	if (!response.ok) throw new Error(await failure(`Dropbox ${endpoint}`, response));
	return response.json();
}

/**
 * The message for a failed call. A token carries the scopes it was minted with,
 * so ticking them in the app console afterwards changes nothing until the token
 * is reissued — worth saying outright, because the API only names the scope.
 */
async function failure(what, response) {
	const body = await response.text();
	const scope = /"required_scope":\s*"([^"]+)"/.exec(body);

	if (!scope) return `${what} failed (${response.status}): ${body}`;

	return (
		`${what} failed: the token is missing the "${scope[1]}" scope.\n` +
		'Enable it under Permissions in the Dropbox app console, press Submit, then\n' +
		'issue a new refresh token — the existing one keeps the scopes it was made with.'
	);
}

/** Every file in the app folder, following the cursor to the end. */
async function listFiles(token) {
	const entries = [];
	let page = await rpc(token, 'files/list_folder', { path: '', recursive: true });

	for (;;) {
		entries.push(...page.entries.filter((entry) => entry['.tag'] === 'file'));
		if (!page.has_more) return entries;
		page = await rpc(token, 'files/list_folder/continue', { cursor: page.cursor });
	}
}

async function download(token, remotePath) {
	const response = await fetch('https://content.dropboxapi.com/2/files/download', {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiJson({ path: remotePath }) },
	});

	if (!response.ok) {
		throw new Error(await failure(`Dropbox download of ${remotePath}`, response));
	}

	return Buffer.from(await response.arrayBuffer());
}

/** Run `work` over `items`, a few at a time. */
async function pool(items, work) {
	const queue = [...items];
	const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
		for (let item = queue.shift(); item; item = queue.shift()) await work(item);
	});

	await Promise.all(runners);
}

async function syncTarget(token, target, entries) {
	const dir = path.join(ROOT, target.local);
	await mkdir(dir, { recursive: true });

	// Only what sits directly in the folder: the mirror is flat, so a file of the
	// same name one level down would otherwise quietly overwrite its sibling.
	const prefix = `${target.remote.toLowerCase()}/`;
	const wanted = entries.filter(
		(entry) =>
			entry.path_lower.startsWith(prefix) &&
			!entry.path_lower.slice(prefix.length).includes('/') &&
			target.keep.test(entry.name)
	);

	let written = 0;
	await pool(wanted, async (entry) => {
		const file = path.join(dir, path.basename(entry.path_display));

		// Skip anything already byte-identical; a no-op sync should cost nothing.
		if (existsSync(file) && contentHash(await readFile(file)) === entry.content_hash) return;

		await writeFile(file, await download(token, entry.path_lower));
		written += 1;
	});

	// `updated` in frontmatter wins, but docs.ts falls back to the mtime, so it
	// has to carry Dropbox's timestamp rather than the moment we downloaded.
	for (const entry of wanted) {
		const when = new Date(entry.server_modified);
		await utimes(path.join(dir, path.basename(entry.path_display)), when, when);
	}

	// Deletions have to propagate, or removed documents haunt the build.
	const keep = new Set(wanted.map((entry) => path.basename(entry.path_display)));
	const stale = (await readdir(dir)).filter((name) => !name.startsWith('.') && !keep.has(name));
	for (const name of stale) await rm(path.join(dir, name), { force: true });

	log(
		`${target.local}: ${wanted.length} file${wanted.length === 1 ? '' : 's'}` +
			` (${written} downloaded, ${stale.length} removed)`
	);
}

async function main() {
	await loadEnvFile();

	const credentials = {
		key: process.env.DROPBOX_APP_KEY,
		secret: process.env.DROPBOX_APP_SECRET,
		refresh: process.env.DROPBOX_REFRESH_TOKEN,
	};

	if (!credentials.key || !credentials.secret || !credentials.refresh) {
		// Locally this is normal: build against whatever is already checked out.
		// On Pages it is not — the content is never in the repository, so carrying
		// on would replace a working site with an empty one.
		if (process.env.CF_PAGES) {
			throw new Error(
				'No Dropbox credentials in the build environment.\n' +
					'Set DROPBOX_APP_KEY, DROPBOX_APP_SECRET and DROPBOX_REFRESH_TOKEN under\n' +
					'Pages → Settings → Environment variables, for Production and Preview both.'
			);
		}

		log('no Dropbox credentials, keeping the content already on disk');
		return;
	}

	const token = await accessToken(credentials);
	const entries = await listFiles(token);

	for (const target of TARGETS) await syncTarget(token, target, entries);
}

await main();
