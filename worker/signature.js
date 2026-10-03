/** Compare without leaking where two strings first differ. */
export function sameSignature(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;

	let difference = 0;
	for (let at = 0; at < a.length; at += 1) difference |= a.charCodeAt(at) ^ b.charCodeAt(at);
	return difference === 0;
}

/** Dropbox signs the raw body with the app secret: HMAC-SHA256, hex. */
export async function fromDropbox(body, signature, secret) {
	if (!signature || !secret) return false;

	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
	const hex = [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

	return sameSignature(hex, signature);
}
