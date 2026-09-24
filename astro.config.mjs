// @ts-check

import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	// Served from the `chenhunghan/blog` repo as a GitHub Pages project site.
	site: 'https://chenhunghan.github.io',
	base: '/blog',
	integrations: [mdx(), sitemap(), react()],
	// Self-hosted fonts for the posts list (styled after earendil.com/posts).
	fonts: [
		{
			// Pixel monospace for dates. OFL, from github.com/rektdeckard/departure-mono.
			provider: fontProviders.local(),
			name: 'Departure Mono',
			cssVariable: '--font-departure',
			fallbacks: ['ui-monospace', 'monospace'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/departure-mono/DepartureMono-Regular.woff2'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
		{
			// Italic serif for titles; a free stand-in for earendil's Plantin italic.
			provider: fontProviders.fontsource(),
			name: 'Newsreader',
			cssVariable: '--font-newsreader',
			weights: [400],
			styles: ['italic'],
			subsets: ['latin'],
			fallbacks: ['Georgia', 'serif'],
		},
	],
	markdown: {
		// Code blocks are highlighted by Shiki; colours follow the reader's light/dark preference.
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
		},
	},
});
