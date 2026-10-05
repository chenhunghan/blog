# c — chenhunghan's blog

Astro 7 + MDX + React 19, deployed as a GitHub Pages **project site** at
https://chenhunghan.github.io/blog/ (repo `chenhunghan/blog`). Pushing to `main` runs
`.github/workflows/deploy.yml`. The site root `chenhunghan.github.io/` is a different repo — never touch it.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.
The site lives under the `/blog` base path: open http://localhost:4321/blog/ (the bare `/` is a 404).

Known dev-server quirks:

- Edited component `<style>` sometimes keeps the old CSS after hot reload. Restart the server before
  concluding a style change "didn't work".
- After changing the content schema (`src/content.config.ts`), delete `.astro/data-store.json` and
  `node_modules/.astro/data-store.json`, then restart; otherwise new frontmatter fields read as `undefined`.

Before finishing, run `npm run build` and check pages in a real browser (light, dark and ~390px wide).

## Writing posts

Posts are `src/content/blog/<slug>.md` or `.mdx` (use `.mdx` only when embedding components). The file
name is the URL (`/blog/<slug>/`) and the RSS guid — **never rename a published post**, or feed readers
show it again as new.

```yaml
---
title: 'Short title'          # keep it to one line in the posts list
description: 'One sentence.'  # shown in "More posts", RSS and link previews
pubDate: '2026-01-31'
updatedDate: '2026-02-02'     # optional
tags: [ai, llm, agents]       # not displayed; posts sharing tags are suggested in "More posts"
heroImage: '../../assets/<slug>/cover.png'      # optional, shown at the top of the post
thumbnail: '../../assets/<slug>/thumbnail.png'  # optional, only for "More posts"
---
```

- **Link previews** are automatic: `src/pages/og/[slug].png.ts` renders a card per post (1200×630 layout, output at 2× = 2400×1260) at build
  time (title in Newsreader italic, date, and the hero/thumbnail image, else the pen illustration), and
  `BaseHead.astro` emits Open Graph/`article:*`/Twitter tags. Nothing to do per post; the front page uses
  `src/assets/og-default.png` (2400×1260; keep preview images under 5 MB for LinkedIn/X). Card rendering fetches Twemoji for emoji in titles (needs network at build).

- **Table of contents** is generated from the post's `#`/`##`/`###` headings (needs at least two).
  Don't write a manual one.
- **Images:** Markdown images with relative paths into `src/assets/` are optimised by Astro. Raw HTML
  (`<img width=…>`, `<video>`) is not processed: put those files in `public/` and use absolute paths that
  include the base, e.g. `/blog/images/<slug>/shot.png`.
- **Videos:** `<video src=… poster=… data-autoplay muted loop playsinline preload="metadata">`. The post
  layout plays `data-autoplay` videos, except for readers who prefer reduced motion (they get controls).
- **Code blocks:** always give a language (```` ```rust ````). Shiki highlights with GitHub light/dark.
  Tag MDX/JSX snippets as `jsx`; the `mdx` grammar barely highlights.
- **Internal links** inside `.astro` files go through `url()` from `src/consts.ts`, never a hardcoded `/…`.

## Translations (Traditional Chinese)

Any post can have a Traditional Chinese version; posts without one are unchanged. `src/i18n.ts` holds the languages,
UI strings and helpers.

- Write the translation at `src/content/blog/zh-tw/<same slug>.mdx` with `lang: 'zh-TW'` in its frontmatter (same
  `pubDate`, tags and images; relative paths gain one `../`). It is served at `/blog/zh-tw/<slug>/`.
- Both versions then get an "English · 繁體中文" switch under the date, `hreflang` alternates, `og:locale(:alternate)`
  and their own link-preview card (Chinese titles and dates use a Noto Serif TC subset fetched at build time).
- The English page sends readers to the Chinese version, before it paints, when they chose it on the switch earlier
  (localStorage `blog.lang`) or, if they never chose, when the first of their browser languages that we have is
  `zh-*` and they arrived from outside the blog (moving between the blog's own pages keeps the language being
  read). `?lang=en` keeps English. Crawlers don't run JavaScript, so English links always preview in English.
- The posts list, RSS and "More posts" list English posts only; English URLs never change.
- Components used by a translated post take `lang="zh-TW"` (see `src/components/trees/`); keep their strings in a
  per-language table in the component.

## Interactive components

Components are React (`.tsx`) in `src/components/`, imported in an `.mdx` post and placed with a client
directive. Without a directive they render to static HTML and ship no JavaScript.

```jsx
import MyChart from '../../components/MyChart.tsx';

<MyChart client:visible />
```

- Prefer `client:visible` so heavy code (three.js is ~1 MB) only loads when scrolled into view. Fall back to
  `client:only="react"` if a library touches `window` during server rendering.
- Reserve the component's space (fixed height or `aspect-ratio`) so hydration doesn't shift the page.
- Use the theme tokens instead of hard-coded colours: `--bg --fg --muted --border --accent --code-bg --mono`
  (CSS `var(--accent)`; for canvas read them with `getComputedStyle` and re-read on
  `prefers-color-scheme` changes).
- Respect `prefers-reduced-motion` and pause animation while off-screen (`IntersectionObserver`).

### Diagrams in the style of PlanetScale

PlanetScale's "The lifecycle of a sharded Postgres query" diagrams are hand-written React components:
no chart/3D/animation library. Isometric architecture views are drawn with the Canvas 2D API
(`getContext('2d')`, `requestAnimationFrame` for moving dots, `ResizeObserver` + `devicePixelRatio` for
crisp sizing); charts are plain HTML/SVG. Buttons (Replay, toggles, sliders) are ordinary React state.

This repo has a reusable kit in `src/components/diagrams/`: `iso.ts` (projection, camera fit, drawing,
paths) and `IsoDiagram.tsx` (sizing, theming, playback, captions, ‹ › Pause/Replay controls).
Describe a scene and pass it in:

```jsx
import IsoDiagram from '../../components/diagrams/IsoDiagram.tsx';

export const requestFlow = {
	groups: [
		{ label: 'edge', x: 0.5, y: 0.2, z: 5, w: 4.5, d: 2.2 },
		{ label: 'app', x: 0, y: 3.4, z: 2.5, w: 7.4, d: 2.8 },
		{ label: 'data', x: 0, y: 7.2, z: 0, w: 10.6, d: 2.8 },
	],
	nodes: [
		{ id: 'browser', label: 'browser', x: 1.2, y: 0.3, z: 7.5, w: 3, d: 1.1, h: 0.4 },
		{ id: 'cdn', label: 'cdn', x: 1.2, y: 0.8, z: 5, w: 3, d: 1.1 },
		{ id: 'api', label: 'api', x: 0.6, y: 3.9, z: 2.5, w: 2.8, d: 1.5, h: 0.6 },
		{ id: 'worker', label: 'worker', x: 4, y: 3.9, z: 2.5, w: 2.8, d: 1.5, h: 0.6, tone: 'muted' },
		{ id: 'primary', label: 'primary', x: 0.6, y: 7.7, w: 2.8, d: 1.5, h: 0.8 },
		{ id: 'replica1', label: 'replica', x: 4, y: 7.7, w: 2.8, d: 1.5, h: 0.8 },
		{ id: 'replica2', label: 'replica', x: 7.4, y: 7.7, w: 2.8, d: 1.5, h: 0.8 },
	],
	edges: [
		{ from: 'browser', to: 'cdn' },
		{ from: 'cdn', to: 'api' },
		{ from: 'api', to: 'primary' },
		{ from: 'worker', to: 'primary' },
		{ from: 'primary', to: 'replica1' },
		{ from: 'replica1', to: 'replica2' },
	],
	steps: [
		{ caption: 'The browser sends a request. The CDN has no cached copy.', path: ['browser', 'cdn'] },
		{ caption: 'The CDN forwards the request to the API.', path: ['cdn', 'api'] },
		{ caption: 'The API reads the data from the primary database.', path: ['api', 'primary'] },
		{ caption: 'The response travels back up to the browser.', path: ['primary', 'api', 'cdn', 'browser'], duration: 3400 },
		{ caption: 'Meanwhile, the primary streams the change to its replicas.', path: ['primary', 'replica1', 'replica2'] },
	],
};

<IsoDiagram client:visible scene={requestFlow} label="A request flowing from the browser to the database and back" />
```

- Axes: `x` runs down-right on screen, `y` down-left, `z` is up. Boxes are `w × d × h`. Stack layers by
  `z` (with small `y` offsets) for the floating-layers look.
- Groups are flat outlined platforms; edges route themselves (straight on one level, otherwise
  down/across/down); `tone: 'accent' | 'muted'` pins a box lit or faded.
- Each step moves a dot along `path` and lights nodes as it reaches them; `highlight` keeps nodes lit.
  Without `steps`, dots loop along every edge.
- Layout is trial and error: adjust coordinates and screenshot until compact. Tall scenes are capped at
  `min(75vh, 560px)` and scaled to fit.
- Extend `iso.ts` for new primitives (other shapes, labels, camera moves) rather than writing one-off
  canvas code per post.

### three.js and charts

- 3D: `three`, `@react-three/fiber` and `@react-three/drei` are installed. Reference:
  `src/components/TorusKnotScene.tsx` (a `<Canvas>` inside a fixed-height wrapper, `OrbitControls`,
  `useFrame` animation). Use 3D only when the content is really 3D; flat architecture belongs in the
  isometric kit above.
- Charts: `@observablehq/plot`. Reference: `src/components/GradientDescentChart.tsx` (renders
  `Plot.plot()` into a ref inside `useEffect`, a slider drives React state).
- Both reference components are not used by any post; copy them as starting points.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
