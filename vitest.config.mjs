import { fileURLToPath } from 'node:url';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Three kinds of code, so three places to run it: the build scripts in Node,
// the pane scripts against a DOM, and the Worker inside the Workers runtime.
export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'node',
					include: ['tests/sync/**/*.test.mjs', 'tests/plugins/**/*.test.mjs'],
				},
			},
			{
				resolve: {
					// `astro:transitions/client` only exists inside an Astro build.
					alias: {
						'astro:transitions/client': fileURLToPath(
							new URL('./tests/stubs/astro-transitions-client.ts', import.meta.url)
						),
					},
				},
				test: {
					name: 'dom',
					environment: 'jsdom',
					include: ['tests/scripts/**/*.test.ts'],
				},
			},
			{
				plugins: [
					cloudflareTest({
						wrangler: { configPath: './worker/wrangler.jsonc' },
						// Stand-ins for the two secrets, which are never in the config file.
						miniflare: {
							bindings: {
								DROPBOX_APP_SECRET: 'test-secret',
								PAGES_DEPLOY_HOOK: 'https://pages.test/deploy-hook',
							},
						},
					}),
				],
				test: {
					name: 'worker',
					include: ['tests/worker/**/*.test.js'],
				},
			},
		],
	},
});
