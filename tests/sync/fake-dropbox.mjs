import path from 'node:path';
import { vi } from 'vitest';
import { contentHash } from '../../scripts/sync/hash.mjs';

/** A file as `files/list_folder` describes it. */
export function fileEntry(remotePath, content, modified = '2026-01-02T03:04:05Z') {
	return {
		'.tag': 'file',
		name: path.basename(remotePath),
		path_lower: remotePath.toLowerCase(),
		path_display: remotePath,
		size: Buffer.byteLength(content),
		content_hash: contentHash(Buffer.from(content)),
		server_modified: modified,
		content,
	};
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

/**
 * Replaces `fetch` with a Dropbox that holds the given entries, listed
 * `pageSize` at a time. Returns the mock, so a test can see what was called.
 */
export function fakeDropbox(entries, { pageSize = entries.length || 1 } = {}) {
	const pages = [];
	for (let at = 0; at < entries.length; at += pageSize) pages.push(entries.slice(at, at + pageSize));
	if (!pages.length) pages.push([]);

	const page = (number) => json({ entries: pages[number], has_more: number < pages.length - 1, cursor: String(number + 1) });

	const fetch = vi.fn(async (url, options) => {
		if (url === 'https://api.dropbox.com/oauth2/token') return json({ access_token: 'token' });
		if (url === 'https://api.dropboxapi.com/2/files/list_folder') return page(0);
		if (url === 'https://api.dropboxapi.com/2/files/list_folder/continue') {
			return page(Number(JSON.parse(options.body).cursor));
		}
		if (url === 'https://content.dropboxapi.com/2/files/download') {
			const wanted = JSON.parse(options.headers['Dropbox-API-Arg']).path;
			const entry = entries.find((candidate) => candidate.path_lower === wanted);
			return entry ? new Response(entry.content) : json({ error: 'not_found' }, 409);
		}
		throw new Error(`unexpected request to ${url}`);
	});

	vi.stubGlobal('fetch', fetch);
	return fetch;
}

/** The remote paths the fake was asked to download, in order. */
export function downloads(fetch) {
	return fetch.mock.calls
		.filter(([url]) => url === 'https://content.dropboxapi.com/2/files/download')
		.map(([, options]) => JSON.parse(options.headers['Dropbox-API-Arg']).path);
}
