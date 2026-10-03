import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { contentHash } from '../../scripts/sync/hash.mjs';

const sha256 = (data) => createHash('sha256').update(data).digest();
const BLOCK = 4 * 1024 * 1024;

test('an empty file hashes to the SHA-256 of nothing', () => {
	expect(contentHash(Buffer.alloc(0))).toBe(
		'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
	);
});

test('a file under one block is the hash of its hash', () => {
	const file = Buffer.from('hello');
	expect(contentHash(file)).toBe(sha256(sha256(file)).toString('hex'));
});

test('a file of exactly one block is still a single block', () => {
	const file = Buffer.alloc(BLOCK, 'a');
	expect(contentHash(file)).toBe(sha256(sha256(file)).toString('hex'));
});

test('a larger file is hashed in 4 MiB blocks', () => {
	const file = Buffer.alloc(BLOCK * 2 + 10, 'a');
	file.write('tail', BLOCK * 2);

	const blocks = [
		file.subarray(0, BLOCK),
		file.subarray(BLOCK, BLOCK * 2),
		file.subarray(BLOCK * 2),
	];
	const expected = sha256(Buffer.concat(blocks.map(sha256))).toString('hex');

	expect(contentHash(file)).toBe(expected);
});
