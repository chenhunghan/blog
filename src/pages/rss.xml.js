import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE, url } from '../consts';
import { isDefault } from '../i18n';

export async function GET(context) {
	// English posts only: translations are other versions of the same post, not new items
	const posts = (await getCollection('blog', isDefault)).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		// Channel link is the blog's home, not the site root.
		site: new URL(url(), context.site).href,
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
		customData: [
			'<language>en</language>',
			`<atom:link href="${new URL(url('rss.xml'), context.site).href}" rel="self" type="application/rss+xml"/>`,
		].join(''),
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.pubDate,
			categories: post.data.tags,
			link: url(`${post.id}/`),
		})),
	});
}
