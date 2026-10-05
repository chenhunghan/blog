import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			// Card image for "More posts" and link previews when there is no hero image.
			thumbnail: z.optional(image()),
			tags: z.array(z.string()).default([]),
			// Language of the post (default English). A translation lives in a language directory, e.g. zh-tw/<slug>.mdx; see src/i18n.ts.
			lang: z.enum(['en', 'zh-TW']).default('en'),
		}),
});

export const collections = { blog };
