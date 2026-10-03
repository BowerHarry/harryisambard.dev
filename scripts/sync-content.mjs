#!/usr/bin/env node
/**
 * Mirrors the Dropbox app folder into src/content/ before Astro runs.
 *
 *   Dropbox/Apps/<app>/files/*.md   →  src/content/files/
 *   Dropbox/Apps/<app>/photos/*     →  src/content/photos/
 *
 * Deliberately a mirror rather than a content-layer loader: once the files are
 * on disk, the glob loader, the `image()` schema helper and `buildPhotos()` all
 * work exactly as they do for local content, so nothing downstream knows the
 * documents came off the network. Each file's mtime is set to Dropbox's
 * `server_modified`, which is what `docs.ts` falls back to for ordering.
 *
 * Without credentials it leaves whatever is already on disk alone and exits 0,
 * so a local build works offline and a fork builds without secrets.
 *
 * Env: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN.
 *
 * This file only starts the run. The work is in scripts/sync/:
 *   sync.mjs     the run itself: credentials, then each target in turn
 *   env.mjs      reads a local .env
 *   dropbox.mjs  the three Dropbox API calls
 *   hash.mjs     Dropbox's content hash
 *   mirror.mjs   makes one local folder match one remote folder
 */

import path from 'node:path';
import { syncContent } from './sync/sync.mjs';

await syncContent(path.resolve(import.meta.dirname, '..'));
