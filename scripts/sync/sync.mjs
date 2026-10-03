import { accessToken, listFiles } from './dropbox.mjs';
import { loadEnvFile } from './env.mjs';
import { log } from './log.mjs';
import { syncTarget, TARGETS } from './mirror.mjs';

/** One whole run. `root` is the repository: where .env is, and src/content/. */
export async function syncContent(root) {
	await loadEnvFile(root);

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

	for (const target of TARGETS) await syncTarget(token, target, entries, root);
}
