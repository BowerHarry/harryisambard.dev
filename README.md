# harryisambard.dev

A terminal-inspired personal site — a loose portfolio, somewhere to write about
projects in detail, plan future work, and keep anything else that interests me.

**[www.harryisambard.dev](https://www.harryisambard.dev)**

The list of documents sits in the left third, the document you are reading fills
the rest, and the whole thing is driven from the keyboard: `/` to search, `j/k`
to move, `enter` to open, `space` to page. It reads like `less` inside a file
manager.

The point is that writing has to be frictionless. I pick up a laptop or an iPad,
write markdown in whatever editor is nearest, save, and the site republishes
itself. Nothing to commit, nothing to log into.

## How it works

The content is not in this repository. Documents and photos live in a Dropbox
folder, and the site is rebuilt from them whenever they change.

```
  iA Writer, any device
          │ save
          ▼
  Dropbox app folder ──── webhook ────▶ Cloudflare Worker
          │                                    │ waits for five quiet minutes
          │                                    ▼
          │                             Pages deploy hook
          │                                    │
          │      build: mirror, then Astro     ▼
          └──────────────────────────▶ Cloudflare Pages ──▶ static site
```

Three pieces make that work:

**The sync.** `scripts/sync-content.mjs` runs before every build and mirrors the
Dropbox folder into `src/content/`. Mirroring onto disk, rather than fetching
documents through a content loader, means Astro's image pipeline and content
collections behave exactly as they would for files committed to the repository —
the network is invisible past that one script. It skips files whose contents
already match, propagates deletions, and stamps each file's mtime with Dropbox's
timestamp so the list can sort by it.

**The trigger.** `worker/index.js` is a small Cloudflare Worker that receives
Dropbox's webhook, checks its signature, and schedules a build on a Durable
Object alarm five minutes out. Each new notification pushes that alarm back, so
a document saved eight times while being written causes one build, not eight.

**The build.** Cloudflare Pages runs `npm run build`, which is the sync followed
by `astro build`, and deploys the static output. Any deploy — a code push or a
Dropbox edit — publishes whatever is in Dropbox at that moment.

## Built with

| | |
| :--- | :--- |
| [Astro](https://astro.build) | Static output; every page is prerendered |
| React | One island, for the photo popup and gallery |
| Cloudflare Pages | Hosting and builds |
| Cloudflare Workers | The Dropbox webhook and build debounce |
| Dropbox API | Where the documents actually live |

No CSS framework and no client-side router beyond Astro's view transitions. The
styling is a handful of hand-written stylesheets.

## Structure

| Path | Role |
| :--- | :--- |
| `src/layouts/Terminal.astro` | The two-pane shell: list, document, status bar |
| `src/pages/index.astro` | The list with no document open |
| `src/pages/[id].astro` | One route per document |
| `src/components/DocList.astro` | The searchable file list |
| `src/components/PhotoLayer.tsx` | React island: the state behind `PhotoPopup.tsx` and `PhotoGallery.tsx` |
| `src/scripts/find.ts` | The keyboard and focus of the left pane |
| `src/scripts/doc-list.ts` | Filtering and cursor movement in the list |
| `src/scripts/pager.ts` | `less`-style scrolling in the right pane |
| `src/lib/docs.ts` | The only module that talks to `astro:content` |
| `src/plugins/rehype-photo-links.mjs` | Turns `photos:` links into gallery triggers |
| `src/styles/` | `theme.css` holds the tokens; one stylesheet each for the shell, the list, the help panel, documents and photos |
| `scripts/sync-content.mjs` | Dropbox → `src/content/`; the steps are in `scripts/sync/` |
| `worker/index.js` | Dropbox webhook → debounced Pages build |
| `worker/signature.js` | Checks a notification really is Dropbox's |
| `tests/` | The tests, laid out like the code they cover |

## Writing a document

A markdown file in the Dropbox `files/` folder. The filename becomes the URL,
and `title` is the only required frontmatter:

```markdown
---
title: Yellow Sticker
updated: 2026-07-26
---

Yellow Sticker watches official box offices and pings you the second
same-day standing tickets appear for the shows you care about.
```

`updated` is optional — without it the list sorts on the file's Dropbox
timestamp.

### Photos

Photos attach to **a phrase, not a document**, so a single file can have several
independent sets. Drop the images in the Dropbox `photos/` folder, declare a set
in frontmatter, and reference it from the body with a `photos:` link:

```markdown
---
title: The Pier Rebuild
photos:
  scaffolding:
    - src: ../photos/pier-01.jpg
      alt: Scaffolding going up at low tide
---

The first weekend went entirely on [getting the frame up](photos:scaffolding).
```

That phrase shows a thumbnail on hover and opens a full-screen gallery on click.
Thumbnails are generated at build time. Referencing a set that isn't declared
fails the build and names the mistake; declaring one you never use warns.

## Keyboard

| | |
| :--- | :--- |
| `/` | Focus the search box |
| `↑` `↓` `j` `k` | Move the cursor, or scroll the document |
| `enter` | Open the selected document |
| `space` `d` `u` | Page through the document |
| `g` `G` | Top / bottom |
| `esc` | Clear the search, then return to the document |
| `?` | Show the shortcuts |

Below 56rem the panes stack and show one at a time.

## Running it locally

```sh
npm install
npm run dev
```

Without Dropbox credentials the sync leaves whatever is in `src/content/` alone,
so this works offline. To pull the real content, copy `.env.example` to `.env`
and fill in a Dropbox app key, secret and refresh token.

| Command | Action |
| :--- | :--- |
| `npm run dev` | Sync, then serve on `localhost:4321` |
| `npm run sync` | Mirror the content down from Dropbox |
| `npm run build` | Sync, then build to `./dist/` |
| `npm test` | Run the tests once |
| `npm run test:watch` | Rerun the tests as files change |
| `npm run deploy:hook` | Deploy the webhook Worker |

Both `dev` and `build` sync first, so local work starts from the same documents
the live site has. The dev server does not watch Dropbox while it runs — rerun
`npm run sync` to pick up an edit made elsewhere mid-session.

## Tests

```sh
npm test
```

[Vitest](https://vitest.dev) runs everything, in three groups set up in
`vitest.config.mjs`. None of them touch the network, the real `.env` or
`src/content/`.

| Tests | Cover | Run in |
| :--- | :--- | :--- |
| `tests/sync/` | The Dropbox hash, the API calls, which files are downloaded, restamped or removed, and what happens without credentials | Node, against a fake Dropbox and a scratch folder |
| `tests/plugins/` | The `photos:` link rewrite, its build error and its warning | Node |
| `tests/scripts/` | Filtering, the cursor, and which pane a key goes to | jsdom, on a cut-down copy of the page |
| `tests/worker/` | The signature check, the challenge echo, and the build scheduler's quiet window, minimum gap and retry | The Workers runtime, via `@cloudflare/vitest-pool-workers` |

To run one group or one file:

```sh
npx vitest run --project worker
npx vitest run tests/scripts/find.test.ts
```

The React photo popup and gallery, the Astro templates and the stylesheets have
no tests; `npx astro build` is the check that they still compile.

## Deployment

Cloudflare Pages builds from `main` with `npm run build` and publishes `dist`.
The three Dropbox variables are set in the Pages environment; the build fails
loudly if they are missing there, rather than quietly publishing an empty site.

The Worker is deployed separately and holds two secrets of its own — the Dropbox
app secret, to verify notifications, and the Pages deploy hook URL:

```sh
npx wrangler secret put DROPBOX_APP_SECRET -c worker/wrangler.jsonc
npx wrangler secret put PAGES_DEPLOY_HOOK -c worker/wrangler.jsonc
npm run deploy:hook
```

Its URL then goes in the Webhooks section of the Dropbox app console.
