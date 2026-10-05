/**
 * Post translations. A post is written in English at `src/content/blog/<slug>.md(x)`; a translation lives at
 * `src/content/blog/<lang dir>/<slug>.md(x)` with `lang` in its frontmatter (e.g. `zh-TW` in `zh-tw/`) and is served
 * at `/blog/<lang dir>/<slug>/`. English stays the default everywhere: the posts list, RSS and "More posts" show
 * English posts only, and their URLs never change. A post with translations gets a language switch, and its
 * English page moves readers whose browser prefers a translated language (or who picked it before) to that version.
 */
import type { CollectionEntry } from 'astro:content';

export const LANGS = {
	en: { name: 'English', dir: '', htmlLang: 'en', ogLocale: 'en_US', dateLocale: 'en-US' },
	'zh-TW': { name: '繁體中文', dir: 'zh-tw', htmlLang: 'zh-Hant-TW', ogLocale: 'zh_TW', dateLocale: 'zh-TW' },
} as const;
export type Lang = keyof typeof LANGS;
export const DEFAULT_LANG: Lang = 'en';
/** localStorage key for the reader's choice (set by the language switch). */
export const LANG_KEY = 'blog.lang';

type Post = CollectionEntry<'blog'>;

export const langOf = (post: Post): Lang => (post.data.lang ?? DEFAULT_LANG) as Lang;

/** The slug shared by a post and its translations (the id without the language directory). */
export function baseSlug(post: Post): string {
	const dir = LANGS[langOf(post)].dir;
	return dir && post.id.startsWith(`${dir}/`) ? post.id.slice(dir.length + 1) : post.id;
}

/** Every language version of a post (itself included), in LANGS order. */
export function versions(post: Post, all: Post[]): Post[] {
	const slug = baseSlug(post);
	return all
		.filter((p) => baseSlug(p) === slug)
		.sort((a, b) => Object.keys(LANGS).indexOf(langOf(a)) - Object.keys(LANGS).indexOf(langOf(b)));
}

export const isDefault = (post: Post) => langOf(post) === DEFAULT_LANG;

/** UI strings of the post layout. */
const UI = {
	en: { updated: 'updated', morePosts: 'More posts', contents: 'Contents', readIn: 'Read in' },
	'zh-TW': { updated: '更新於', morePosts: '更多文章', contents: '目錄', readIn: '語言' },
} satisfies Record<Lang, Record<string, string>>;
export const ui = (lang: Lang) => UI[lang];

export function formatDate(date: Date, lang: Lang = DEFAULT_LANG): string {
	return date.toLocaleDateString(LANGS[lang].dateLocale, { year: 'numeric', month: 'short', day: 'numeric' });
}
