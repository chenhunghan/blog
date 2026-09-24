# blog

Source for https://chenhunghan.github.io/blog/ — built with [Astro](https://astro.build), MDX and React.

## Writing

Add a `.md` or `.mdx` file to `src/content/blog/`:

```mdx
---
title: 'My post'
description: 'One-line summary'
pubDate: '2026-09-24'
---

import MyChart from '../../components/MyChart.tsx';

Some **markdown**.

<MyChart client:visible />
```

Interactive components live in `src/components/` as React (`.tsx`) files and need a
`client:*` directive (`client:visible`, `client:load`, …) to run in the browser.
See `AGENTS.md` for how to build charts, three.js scenes and animated isometric
diagrams (`src/components/diagrams/`).

## Commands

| Command           | Action                                          |
| :---------------- | :---------------------------------------------- |
| `npm install`     | Install dependencies                            |
| `npm run dev`     | Dev server at `localhost:4321/blog/`            |
| `npm run build`   | Build to `./dist/`                              |
| `npm run preview` | Preview the production build locally            |

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site and
publishes it to GitHub Pages (repo **Settings → Pages → Source: GitHub Actions**).

The site is served under the `/blog` base path, so link to internal pages with the
`url()` helper from `src/consts.ts` rather than hardcoding `/...`.
