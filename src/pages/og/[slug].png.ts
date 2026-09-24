/**
 * Link-preview cards generated for every post at build time, laid out at 1200×630 and rendered at 2×
 * (2400×1260) so they stay sharp on retina screens:
 * the post title, date and image in the site's style. Rendered with Satori, rasterised with sharp.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { APIRoute, GetStaticPaths } from 'astro';
import { type CollectionEntry, getCollection } from 'astro:content';
import satori from 'satori';
import sharp from 'sharp';
import { SITE_TITLE } from '../../consts';

const WIDTH = 1200;
const HEIGHT = 630;
const PAD = 72;
const ART = 460; // square image on the right
const BG = '#fcfcfb';

export const getStaticPaths = (async () => {
	const posts = await getCollection('blog');
	return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

// Satori needs ttf/otf/woff (not woff2), read from disk relative to the project root.
const fontFile = (path: string) => readFile(resolve(path));
const fonts = Promise.all([
	fontFile('node_modules/@fontsource/inter/files/inter-latin-700-normal.woff'),
	fontFile('node_modules/@fontsource/newsreader/files/newsreader-latin-400-italic.woff'),
	fontFile('src/assets/fonts/departure-mono/DepartureMono-Regular.woff'),
]).then(([inter, newsreader, departure]) => [
	{ name: 'Inter', data: inter, weight: 700 as const, style: 'normal' as const },
	{ name: 'Newsreader', data: newsreader, weight: 400 as const, style: 'italic' as const },
	{ name: 'Departure Mono', data: departure, weight: 400 as const, style: 'normal' as const },
]);

const dataUri = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

/** The post's own image (hero or thumbnail), cropped square, or null. */
async function postArt(post: CollectionEntry<'blog'>): Promise<string | null> {
	const image = post.data.heroImage ?? post.data.thumbnail;
	const fsPath = (image as { fsPath?: string } | undefined)?.fsPath;
	if (!fsPath) return null;
	const png = await sharp(fsPath).resize(ART * 2, ART * 2, { fit: 'cover' }).png().toBuffer();
	return dataUri(png);
}

/** Emoji in titles are drawn with Twemoji; if that fails they are simply left out. */
async function loadEmoji(segment: string): Promise<string> {
	const codepoints = [...segment].map((c) => c.codePointAt(0)!.toString(16));
	const code = (segment.includes('‍') ? codepoints : codepoints.filter((c) => c !== 'fe0f')).join('-');
	try {
		const res = await fetch(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/${code}.svg`);
		if (!res.ok) return '';
		return `data:image/svg+xml;base64,${Buffer.from(await res.text()).toString('base64')}`;
	} catch {
		return '';
	}
}

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown, extra = {}): Node => ({
	type,
	props: { style, children, ...extra },
});

export const GET: APIRoute = async ({ props }) => {
	const post = (props as { post: CollectionEntry<'blog'> }).post;
	const art = await postArt(post);
	const date = post.data.pubDate.toLocaleDateString('en-us', { year: 'numeric', month: 'short', day: 'numeric' });
	const title = post.data.title;
	const titleSize = title.length > 48 ? 54 : title.length > 28 ? 62 : 72;

	const right = art
		? el('img', { width: ART, height: ART, borderRadius: 16, objectFit: 'cover' }, undefined, {
				src: art,
				width: ART,
				height: ART,
			})
		: // No image: the pen illustration as a full-height strip, faded top and bottom like the front page.
			el('div', { display: 'flex', position: 'relative', width: 277, height: HEIGHT, marginTop: -PAD, marginRight: 40 }, [
				el('img', { width: 277, height: HEIGHT, opacity: 0.85 }, undefined, {
					src: dataUri(await readFile(resolve('src/assets/illustrations/pen-1.jpg')).then((b) => sharp(b).png().toBuffer())),
					width: 277,
					height: HEIGHT,
				}),
				el('div', {
					position: 'absolute',
					top: 0,
					left: 0,
					width: 277,
					height: 63,
					backgroundImage: `linear-gradient(to bottom, ${BG}, rgba(252,252,251,0))`,
				}),
				el('div', {
					position: 'absolute',
					bottom: 0,
					left: 0,
					width: 277,
					height: 63,
					backgroundImage: `linear-gradient(to top, ${BG}, rgba(252,252,251,0))`,
				}),
			]);

	const card = el(
		'div',
		{
			display: 'flex',
			width: WIDTH,
			height: HEIGHT,
			padding: PAD,
			gap: 56,
			background: BG,
			alignItems: art ? 'center' : 'stretch',
		},
		[
			el('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, height: HEIGHT - 2 * PAD }, [
				el('div', { fontFamily: 'Inter', fontWeight: 700, fontSize: 56, letterSpacing: -1.5, color: '#1c1c1e', lineHeight: 1 }, SITE_TITLE),
				el('div', { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: titleSize, lineHeight: 1.15, color: '#1c1c1e' }, title),
				el('div', { fontFamily: 'Departure Mono', fontSize: 22, color: '#6e6e73' }, date),
			]),
			right,
		],
	);

	const svg = await satori(card as never, {
		width: WIDTH,
		height: HEIGHT,
		fonts: await fonts,
		loadAdditionalAsset: async (code, segment) => (code === 'emoji' ? loadEmoji(segment) : ''),
	});
	// Satori's SVG is vector: rasterise at 2× (density 144 = 2 × 72 dpi).
	const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
	return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
