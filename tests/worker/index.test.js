import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import worker from '../../worker/index.js';

const MINUTE = 60_000;
const URL = 'https://hook.test/';

// vitest.config.mjs sets DROPBOX_APP_SECRET to 'test-secret' and
// PAGES_DEPLOY_HOOK to https://pages.test/deploy-hook.

/** The one scheduler the Worker uses. */
const scheduler = () => env.BUILDS.get(env.BUILDS.idFromName('dropbox'));

const alarmTime = () => runInDurableObject(scheduler(), (_, state) => state.storage.getAlarm());
const lastBuild = () => runInDurableObject(scheduler(), (_, state) => state.storage.get('last'));
const setLastBuild = (time) => runInDurableObject(scheduler(), (_, state) => state.storage.put('last', time));

/** What Dropbox would put in X-Dropbox-Signature for this body. */
async function sign(body, secret = env.DROPBOX_APP_SECRET) {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
	return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function notify(body, signature) {
	const headers = signature === undefined ? {} : { 'x-dropbox-signature': signature };
	return worker.fetch(new Request(URL, { method: 'POST', body, headers }), env);
}

/** Makes the deploy hook answer with this status, and returns the mock. */
function deployHook(status) {
	return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status }));
}

/** `time` is within a second after `expected`: the test itself takes a moment. */
function expectAbout(time, expected) {
	expect(time).toBeGreaterThanOrEqual(expected);
	expect(time).toBeLessThan(expected + 1000);
}

// The scheduler's storage outlives a test, so each one starts it from nothing.
beforeEach(() =>
	runInDurableObject(scheduler(), async (_, state) => {
		await state.storage.deleteAlarm();
		await state.storage.deleteAll();
	})
);

afterEach(() => vi.restoreAllMocks());

// ── the endpoint ──────────────────────────────────────────────────────────

test('GET with a challenge echoes it, with the nosniff header Dropbox requires', async () => {
	const response = await worker.fetch(new Request(`${URL}?challenge=abc123`), env);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe('abc123');
	expect(response.headers.get('content-type')).toBe('text/plain');
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});

test('GET without a challenge just says what this is', async () => {
	const response = await worker.fetch(new Request(URL), env);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe('content hook\n');
});

test('other methods are refused', async () => {
	const response = await worker.fetch(new Request(URL, { method: 'PUT', body: '{}' }), env);

	expect(response.status).toBe(405);
});

test('a POST with a bad signature is refused and schedules nothing', async () => {
	const body = '{"list_folder":{"accounts":["a"]}}';

	for (const signature of [undefined, 'not-a-signature', await sign(body, 'wrong secret'), await sign('another body')]) {
		const response = await notify(body, signature);
		expect(response.status).toBe(403);
		expect(await response.text()).toBe('bad signature\n');
	}

	expect(await alarmTime()).toBeNull();
});

test('a POST signed by Dropbox schedules a build', async () => {
	const body = '{"list_folder":{"accounts":["a"]}}';
	const before = Date.now();

	const response = await notify(body, await sign(body));

	expect(response.status).toBe(200);
	expect(await response.text()).toBe('scheduled\n');
	expectAbout(await alarmTime(), before + 5 * MINUTE);
});

// ── the scheduler ─────────────────────────────────────────────────────────

test('schedule sets the build five quiet minutes out', async () => {
	const before = Date.now();

	await scheduler().schedule();

	expectAbout(await alarmTime(), before + 5 * MINUTE);
});

test('each new notification pushes the one pending build back', async () => {
	await scheduler().schedule();
	const first = await alarmTime();

	await new Promise((resolve) => setTimeout(resolve, 20));
	await scheduler().schedule();

	expect(await alarmTime()).toBeGreaterThan(first);
});

test('a build never follows the last one by less than five minutes', async () => {
	// Pretend the last build started two minutes in the future, so the minimum
	// gap ends later than the quiet window does.
	const last = Date.now() + 2 * MINUTE;
	await setLastBuild(last);

	await scheduler().schedule();

	expect(await alarmTime()).toBe(last + 5 * MINUTE);
});

test('a last build long ago does not hold the next one up', async () => {
	await setLastBuild(Date.now() - 60 * MINUTE);
	const before = Date.now();

	await scheduler().schedule();

	expectAbout(await alarmTime(), before + 5 * MINUTE);
});

test('the alarm calls the deploy hook and records when the build started', async () => {
	const hook = deployHook(200);
	await scheduler().schedule();
	const before = Date.now();

	expect(await runDurableObjectAlarm(scheduler())).toBe(true);

	expect(hook).toHaveBeenCalledExactlyOnceWith('https://pages.test/deploy-hook', { method: 'POST' });
	expectAbout(await lastBuild(), before);
	expect(await alarmTime()).toBeNull();
});

test('a failed deploy hook is retried in a minute and does not count as a build', async () => {
	deployHook(503);
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	await scheduler().schedule();
	const before = Date.now();

	await runDurableObjectAlarm(scheduler());

	expectAbout(await alarmTime(), before + MINUTE);
	expect(await lastBuild()).toBeUndefined();
	expect(error).toHaveBeenCalledWith('deploy hook failed (503), retrying');
});

test('the retry builds once the hook recovers', async () => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
	await scheduler().schedule();

	const hook = deployHook(503);
	await runDurableObjectAlarm(scheduler());
	expect(await lastBuild()).toBeUndefined();

	hook.mockImplementation(async () => new Response(''));
	expect(await runDurableObjectAlarm(scheduler())).toBe(true);

	expect(hook).toHaveBeenCalledTimes(2);
	expect(await lastBuild()).toBeTypeOf('number');
	expect(await alarmTime()).toBeNull();
});
