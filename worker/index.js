import { DurableObject } from 'cloudflare:workers';

/**
 * Turns Dropbox edits into Pages builds.
 *
 * Dropbox calls this Worker whenever the app folder changes. Building on every
 * call would be wasteful and, on the free plan's 500 builds a month, eventually
 * self-defeating: saving a document eight times while writing it is eight
 * notifications. So a notification only ever schedules an alarm, and each new
 * one pushes that alarm further out — the build happens once the writing stops.
 *
 * Secrets: DROPBOX_APP_SECRET (to verify callers), PAGES_DEPLOY_HOOK (to build).
 */

/** How long the folder has to be quiet before the build goes ahead. */
const QUIET_MS = 5 * 60_000;

/** And never more than one build inside this window, whatever arrives. */
const MIN_GAP_MS = 5 * 60_000;

/** A failed deploy hook is worth retrying; Pages is occasionally busy. */
const RETRY_MS = 60_000;

/** Compare without leaking where two strings first differ. */
function sameSignature(a, b) {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;

	let difference = 0;
	for (let at = 0; at < a.length; at += 1) difference |= a.charCodeAt(at) ^ b.charCodeAt(at);
	return difference === 0;
}

/** Dropbox signs the raw body with the app secret: HMAC-SHA256, hex. */
async function fromDropbox(body, signature, secret) {
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

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// Dropbox verifies the endpoint once, by asking it to echo a challenge.
		// The nosniff header is required: it refuses the endpoint without it.
		if (request.method === 'GET') {
			const challenge = url.searchParams.get('challenge');
			if (!challenge) return new Response('content hook\n');

			return new Response(challenge, {
				headers: { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff' },
			});
		}

		if (request.method !== 'POST') return new Response('method not allowed\n', { status: 405 });

		const body = await request.text();
		if (!(await fromDropbox(body, request.headers.get('x-dropbox-signature'), env.DROPBOX_APP_SECRET))) {
			return new Response('bad signature\n', { status: 403 });
		}

		// Dropbox wants its 200 back promptly, and scheduling is all we do anyway:
		// which files changed doesn't matter, since the build re-syncs everything.
		await env.BUILDS.get(env.BUILDS.idFromName('dropbox')).schedule();
		return new Response('scheduled\n');
	},
};

export class BuildScheduler extends DurableObject {
	/** Push the pending build out; there is one alarm, so the last call wins. */
	async schedule() {
		const last = (await this.ctx.storage.get('last')) ?? 0;
		await this.ctx.storage.setAlarm(Math.max(Date.now() + QUIET_MS, last + MIN_GAP_MS));
	}

	async alarm() {
		const response = await fetch(this.env.PAGES_DEPLOY_HOOK, { method: 'POST' });

		if (!response.ok) {
			console.error(`deploy hook failed (${response.status}), retrying`);
			await this.ctx.storage.setAlarm(Date.now() + RETRY_MS);
			return;
		}

		// Only a build that actually started opens the next quiet window.
		await this.ctx.storage.put('last', Date.now());
	}
}
