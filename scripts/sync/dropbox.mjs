/** The API header must be plain ASCII, so accented filenames get escaped. */
export const asciiJson = (value) =>
	JSON.stringify(value).replace(
		/[\u007f-￿]/g,
		(char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`
	);

export async function accessToken({ key, secret, refresh }) {
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
export async function listFiles(token) {
	const entries = [];
	let page = await rpc(token, 'files/list_folder', { path: '', recursive: true });

	for (;;) {
		entries.push(...page.entries.filter((entry) => entry['.tag'] === 'file'));
		if (!page.has_more) return entries;
		page = await rpc(token, 'files/list_folder/continue', { cursor: page.cursor });
	}
}

export async function download(token, remotePath) {
	const response = await fetch('https://content.dropboxapi.com/2/files/download', {
		method: 'POST',
		headers: { authorization: `Bearer ${token}`, 'Dropbox-API-Arg': asciiJson({ path: remotePath }) },
	});

	if (!response.ok) {
		throw new Error(await failure(`Dropbox download of ${remotePath}`, response));
	}

	return Buffer.from(await response.arrayBuffer());
}
