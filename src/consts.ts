// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'c';
export const SITE_DESCRIPTION = 'Notes, experiments and interactive posts by chenhunghan.';
export const GITHUB_URL = 'https://github.com/chenhunghan';

/** Prefix a site-relative path with the configured `base` (e.g. `/blog`). */
export function url(path = ''): string {
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	return `${base}/${path.replace(/^\//, '')}`;
}
