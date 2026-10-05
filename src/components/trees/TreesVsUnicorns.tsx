import { useEffect, useMemo, useRef, useState } from 'react';
import data from './fabs.json';
import styles from './TreesVsUnicorns.module.css';

// Trees vs unicorns, counted: for a TSMC site, the canopy lost inside its outline (in trees, at 50 m² of crown each,
// as in the map) and one unicorn per US$1 bn of its estimated revenue, both run along the same years.
// Data: fabs.json, from tw-tree's site/stories/tsmc.json (build_stories.py, fab_revenue.py).

type Fab = (typeof data.fabs)[number];
const TREES_PER_GLYPH = 25;
const SHORT: Record<string, string> = {
	'tsmc-fab14': 'Fab 14 + 6',
	'tsmc-fab18': 'Fab 18',
	'tsmc-fab15': 'Fab 15',
	'tsmc-fab12': 'Fab 12',
	'tsmc-ap6': 'AP6',
	'tsmc-fab20': 'Fab 20',
	'tsmc-fab22': 'Fab 22',
	'tsmc-ap7': 'AP7',
};
const SHORT_ZH: Record<string, string> = { 'tsmc-ap6': '封測六廠', 'tsmc-ap7': '封測七廠' };
const PLACE_ZH: Record<string, string> = {
	'tsmc-fab14': '臺南',
	'tsmc-fab18': '臺南',
	'tsmc-fab15': '臺中',
	'tsmc-fab12': '新竹',
	'tsmc-ap6': '竹南',
	'tsmc-fab20': '寶山',
	'tsmc-fab22': '高雄',
	'tsmc-ap7': '嘉義',
};
const T = {
	en: {
		pause: 'Pause',
		replay: 'Replay ↻',
		play: 'Play',
		lost: 'trees’ canopy lost',
		revenue: 'US$ bn of estimated revenue',
		eachTree: (n: number) => `each 🌳 = ${n} trees`,
		eachUni: 'each 🦄 = US$1 bn',
		per: (n: string) => `≈ ${n} trees per 🦄`,
		noUni: 'no 🦄 yet',
		still: 'the site is still forest and farmland',
		table: 'Every TSMC site in the map: trees lost and unicorns',
		caption:
			'Canopy lost inside each site’s outline across its clearing years, at 50 m² of crown per tree; revenue is an estimate (TSMC reports only company-wide revenue), through August 2026. Click a site to play it.',
	},
	'zh-TW': {
		pause: '暫停',
		replay: '重播 ↻',
		play: '播放',
		lost: '棵樹的樹冠沒了',
		revenue: '估計營收（單位：10 億美元）',
		eachTree: (n: number) => `每個 🌳 = ${n} 棵樹`,
		eachUni: '每隻 🦄 = 10 億美元',
		per: (n: string) => `每隻 🦄 ≈ ${n} 棵樹`,
		noUni: '還沒飛出 🦄',
		still: '這裡還是樹林和農地',
		table: '地圖上每個台積電廠區：消失的樹與獨角獸',
		caption:
			'樹的數量是廠區範圍內、開發那幾年少掉的樹冠，以一棵樹約 50 平方公尺換算；營收是推估的（台積電只公布全公司營收），算到 2026 年 8 月。點一下各廠區就能播放。',
	},
};
const PLACE: Record<string, string> = {
	'tsmc-fab14': 'Tainan',
	'tsmc-fab18': 'Tainan',
	'tsmc-fab15': 'Taichung',
	'tsmc-fab12': 'Hsinchu',
	'tsmc-ap6': 'Zhunan',
	'tsmc-fab20': 'Baoshan',
	'tsmc-fab22': 'Kaohsiung',
	'tsmc-ap7': 'Chiayi',
};
const treesLost = (f: Fab) => Math.round((f.lost_ha * 10000) / data.tree_m2 / 100) * 100;
const revenueTotal = (f: Fab) => f.usd.reduce((a, b) => a + b, 0);
// revenue so far at a continuous year (each year's estimate accrues evenly while it is shown; 2026 is Jan–Aug)
const revenueAt = (f: Fab, yf: number) => {
	let sum = 0;
	f.years.forEach((y, i) => {
		const span = y === 2026 ? 8 / 12 : 1;
		sum += f.usd[i] * Math.max(0, Math.min(1, (yf - y) / span));
	});
	return sum;
};
// share of the canopy loss reached at a continuous year (the clearing years, as in the map)
const lostShare = (f: Fab, yf: number) => Math.max(0, Math.min(1, (yf - f.change[0]) / (f.change[1] - f.change[0] + 1)));
const END = 2026 + 8 / 12;

const fabs = [...data.fabs].sort((a, b) => revenueTotal(b) - revenueTotal(a));
const MAX_TREES = Math.max(...fabs.map((f) => treesLost(f) / TREES_PER_GLYPH));
const MAX_UNI = Math.max(...fabs.map((f) => Math.floor(revenueTotal(f))));

export default function TreesVsUnicorns({ initial = 'tsmc-fab14', lang = 'en' }: { initial?: string; lang?: 'en' | 'zh-TW' }) {
	const tr = T[lang];
	const zh = lang === 'zh-TW';
	const [id, setId] = useState(initial);
	const fab = fabs.find((f) => f.id === id) ?? fabs[0];
	const start = fab.change[0] - 2;
	const [yf, setYf] = useState(start);
	const [playing, setPlaying] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const seen = useRef(false);

	// autoplay once, the first time it is on screen; pause while off screen
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const io = new IntersectionObserver(([e]) => {
			if (e.isIntersecting && !seen.current) {
				seen.current = true;
				if (reduced) setYf(END);
				else setPlaying(true);
			}
			if (!e.isIntersecting) setPlaying(false);
		});
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (!playing) return;
		let raf = 0;
		let last = performance.now();
		const tick = (now: number) => {
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			setYf((y) => {
				const slow = y >= fab.change[0] - 0.5 && y <= fab.change[1] + 1;
				const next = y + dt * (slow ? 0.6 : 1.6);
				if (next >= END) {
					setPlaying(false);
					return END;
				}
				return next;
			});
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [playing, fab]);

	const select = (f: Fab) => {
		setId(f.id);
		setYf(f.change[0] - 2);
		setPlaying(true);
	};

	const trees = treesLost(fab);
	const glyphs = trees / TREES_PER_GLYPH;
	const goneGlyphs = Math.round(glyphs * lostShare(fab, yf));
	const cum = revenueAt(fab, yf);
	const unicorns = Math.floor(cum);
	const lostNow = Math.round((trees * lostShare(fab, yf)) / 100) * 100;
	const year = Math.min(2026, Math.floor(yf));
	const perUnicorn = unicorns ? lostNow / unicorns : null;

	const treeCells = useMemo(() => Array.from({ length: Math.ceil(MAX_TREES) }, (_, i) => i), []);
	const uniCells = useMemo(() => Array.from({ length: MAX_UNI }, (_, i) => i), []);

	return (
		<figure className={styles.figure} ref={ref}>
			<div className={styles.head}>
				<div className={styles.title}>
					<b>{zh ? fab.name_zh.replace('台積電', '').trim() : fab.name.replace('TSMC ', '')}</b>
					<span className={styles.year}>{year}</span>
				</div>
				<div className={styles.controls}>
					<button type="button" className={styles.button} onClick={() => (yf >= END ? select(fab) : setPlaying(!playing))}>
						{playing ? tr.pause : yf >= END ? tr.replay : tr.play}
					</button>
				</div>
			</div>
			<div className={styles.panels}>
				<div className={styles.panel}>
					<div className={styles.count}>
						<span className={styles.big}>🌳 {lostNow.toLocaleString()}</span>
						<span className={styles.label}>{tr.lost}</span>
					</div>
					<div className={`${styles.grid} ${styles.trees}`} aria-hidden="true">
						{treeCells.map((i) => (
							<i key={i} className={i >= glyphs ? styles.empty : i < goneGlyphs ? styles.gone : undefined}>
								🌳
							</i>
						))}
					</div>
					<div className={styles.unit}>{tr.eachTree(TREES_PER_GLYPH)}</div>
				</div>
				<div className={styles.panel}>
					<div className={styles.count}>
						<span className={styles.big}>🦄 {unicorns.toLocaleString()}</span>
						<span className={styles.label}>{tr.revenue}</span>
					</div>
					<div className={`${styles.grid} ${styles.unicorns}`} aria-hidden="true">
						{uniCells.map((i) => (
							<i key={i} className={i < unicorns ? styles.on : undefined}>
								🦄
							</i>
						))}
					</div>
					<div className={styles.unit}>{tr.eachUni}</div>
				</div>
			</div>
			<p className={styles.result} aria-live="polite">
				{perUnicorn
					? tr.per(perUnicorn >= 10 ? Math.round(perUnicorn).toLocaleString() : perUnicorn.toFixed(1))
					: lostNow
						? tr.noUni
						: tr.still}
			</p>
			<div className={styles.table} role="table" aria-label={tr.table}>
				{fabs.map((f) => {
					const t = treesLost(f);
					const u = Math.floor(revenueTotal(f));
					return (
						<button
							type="button"
							role="row"
							key={f.id}
							className={`${styles.row} ${f.id === id ? styles.current : ''}`}
							onClick={() => select(f)}
						>
							<span role="cell" className={styles.name}>
								{(zh && SHORT_ZH[f.id]) || SHORT[f.id]} <span className={styles.place}>{(zh ? PLACE_ZH : PLACE)[f.id]}</span>
							</span>
							<span role="cell">🌳 {t.toLocaleString()}</span>
							<span role="cell">🦄 {u.toLocaleString()}</span>
							<span role="cell" className={styles.ratio}>
								{u ? `${Math.round(t / u).toLocaleString()} 🌳 / 🦄` : '—'}
							</span>
						</button>
					);
				})}
			</div>
			<figcaption className={styles.caption}>
				{tr.caption}
			</figcaption>
		</figure>
	);
}
