# harrybower.com

A single-page site. The left column lists files; clicking one fetches it and renders it on the right. There are no per-file routes.

## Commands

| Command           | Action                                      |
| :---------------- | :------------------------------------------ |
| `npm run dev`     | Start the dev server at `localhost:4321`    |
| `npm run build`   | Build the production site to `./dist/`      |
| `npm run preview` | Preview the build locally                   |

## Adding a file

Drop a markdown file into `src/content/files/`. The filename becomes its URL id, and `title` is required:

```markdown
---
title: Yellow Sticker
---

Yellow Sticker quietly watches official box offices…
```

`yellow-sticker.md` is served as `/files/yellow-sticker.json` and listed as "Yellow Sticker". Nothing else needs editing.

> Do not put a `README.md` or any other non-content markdown in `src/content/files/` — every `.md` in that directory is loaded as a file, and one without a `title` fails the build.

## Adding photos

Photos attach to **a phrase, not a file**. One file can have several photo sets, each independent.

Hovering a phrase shows a thumbnail popup; clicking it opens a full-screen gallery. On touch devices, tapping opens the gallery directly with no popup.

### 1. Put the images somewhere under `src/content/`

Not in `public/` — images must go through Astro's image pipeline to get resized. A shared folder alongside the markdown works:

```text
src/content/files/
  pier-rebuild.md
  photos/
    pier-01.jpg
```

### 2. Declare the sets in frontmatter

Each set has a name of your choosing (`scaffolding` below) and a list of photos. `alt` is required on every one:

```markdown
---
title: The Pier Rebuild
photos:
  scaffolding:
    - src: ./photos/pier-01.jpg
      alt: Scaffolding going up at low tide
    - src: ./photos/pier-02.jpg
      alt: New deck boards stacked on the shore
  finished:
    - src: ./photos/pier-09.jpg
      alt: The completed deck
---
```

`src` is relative to the markdown file.

### 3. Reference a set from the body

Use an ordinary markdown link with a `photos:` protocol, where the link text is the phrase you want to attach the photos to:

```markdown
The first weekend went entirely on [getting the frame up](photos:scaffolding).
By Sunday it was [more or less done](photos:finished).
```

That phrase renders bold and underlined. The file stays valid markdown, so it still reads sensibly in any other editor.

### Thumbnails

You do not make thumbnails. Astro generates a 160px and a 1600px `.webp` from each source image at build time.

### If you get it wrong

- **Referencing a key that isn't declared fails the build**, naming the file, the missing key, and the keys that do exist.
- **Declaring a key you never reference** logs a warning and builds fine.

## How it works

| File | Role |
| :--- | :--- |
| `src/content.config.ts` | Declares the `files` collection and its schema |
| `src/plugins/rehype-photo-links.mjs` | Rewrites `photos:` links into spans; validates the keys |
| `src/pages/files/[id].json.ts` | Emits one JSON file per markdown file at build, with resolved image URLs |
| `src/components/FileViewer.astro` | The file list; fetches a file on click |
| `src/components/PhotoLayer.tsx` | React island: hover popup and gallery |
| `src/styles/global.css` | Styles for injected content (scoped styles can't reach it) |

Content is fetched per click rather than inlined, so the page stays small as the number of files grows.
