import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * A local .env, so the same command works here and in CI without a flag.
 * Variables that are already set win over the file.
 */
export async function loadEnvFile(root) {
	const file = path.join(root, '.env');
	if (!existsSync(file)) return;

	for (const line of (await readFile(file, 'utf8')).split('\n')) {
		const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
		if (!match || match[1] in process.env) continue;
		process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
	}
}
