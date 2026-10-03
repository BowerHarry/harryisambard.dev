import { expect, test } from 'vitest';
import { fromDropbox, sameSignature } from '../../worker/signature.js';

// A published HMAC-SHA256 example, so the check is against something this
// code did not compute itself.
const SECRET = 'key';
const BODY = 'The quick brown fox jumps over the lazy dog';
const SIGNATURE = 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8';

test('sameSignature accepts equal strings', () => {
	expect(sameSignature('abc123', 'abc123')).toBe(true);
	expect(sameSignature('', '')).toBe(true);
});

test('sameSignature rejects a difference anywhere in the string', () => {
	expect(sameSignature('abc123', 'xbc123')).toBe(false);
	expect(sameSignature('abc123', 'abc12x')).toBe(false);
	expect(sameSignature('abc123', 'ABC123')).toBe(false);
});

test('sameSignature rejects different lengths and anything not a string', () => {
	expect(sameSignature('abc', 'abcd')).toBe(false);
	expect(sameSignature('abc', null)).toBe(false);
	expect(sameSignature(undefined, undefined)).toBe(false);
	expect(sameSignature(123, 123)).toBe(false);
});

test('fromDropbox accepts a body signed with the app secret', async () => {
	expect(await fromDropbox(BODY, SIGNATURE, SECRET)).toBe(true);
});

test('fromDropbox rejects a changed body, a wrong secret or a wrong signature', async () => {
	expect(await fromDropbox(`${BODY}!`, SIGNATURE, SECRET)).toBe(false);
	expect(await fromDropbox(BODY, SIGNATURE, 'another key')).toBe(false);
	expect(await fromDropbox(BODY, SIGNATURE.replace('f7', '00'), SECRET)).toBe(false);
	expect(await fromDropbox(BODY, SIGNATURE.toUpperCase(), SECRET)).toBe(false);
});

test('fromDropbox rejects a missing signature or secret', async () => {
	expect(await fromDropbox(BODY, null, SECRET)).toBe(false);
	expect(await fromDropbox(BODY, '', SECRET)).toBe(false);
	expect(await fromDropbox(BODY, SIGNATURE, undefined)).toBe(false);
});
