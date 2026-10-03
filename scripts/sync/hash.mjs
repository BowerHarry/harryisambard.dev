import { createHash } from 'node:crypto';

const BLOCK = 4 * 1024 * 1024;

/**
 * Dropbox's own hash: SHA-256 of the concatenated SHA-256 of each 4 MiB block.
 * Comparing it against the local file is what makes a re-run cheap.
 */
export function contentHash(buffer) {
	const digests = [];

	for (let at = 0; at < buffer.length; at += BLOCK) {
		digests.push(createHash('sha256').update(buffer.subarray(at, at + BLOCK)).digest());
	}

	return createHash('sha256').update(Buffer.concat(digests)).digest('hex');
}
