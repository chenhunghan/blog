import { createContext, type ReactElement, useContext, useEffect, useRef, useState } from 'react';
import px from './pixel.json';
import totals from './island-totals.json';
import styles from './PixelJourney.module.css';

// One real pixel, from the raw Landsat scene to the number in the published tiles, then every year, then every pixel.
// Data: pixel.json from tw-tree's pipeline/analysis/pixel_story.py (raw values read from the USGS file on Microsoft
// Planetary Computer, the model re-run locally: it gives the stored value exactly); island-totals.json (index.json).

const IMG = '/blog/images/trees-vs-unicorns/pixel/';
const d = px.detail;
type Lang = 'en' | 'zh-TW';
const LangCtx = createContext<Lang>('en');
const BANDS = { en: ['blue', 'green', 'red', 'near-IR', 'SWIR 1', 'SWIR 2'], 'zh-TW': ['藍', '綠', '紅', '近紅外', '短波紅外 1', '短波紅外 2'] };
const BAND_COLORS = ['#3b6fd4', '#3f9a54', '#c8463c', '#8a5bb8', '#b07a36', '#7a6248'];
const STEP_MS = 5200;
const dateOf = (lang: Lang) =>
	new Date(d.date + 'T00:00:00Z').toLocaleDateString(lang === 'zh-TW' ? 'zh-TW' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtDate = dateOf('en');
const [path, row] = [d.scene.slice(10, 13), d.scene.slice(13, 16)];
const sensorName = { LT04: 'Landsat 4', LT05: 'Landsat 5', LE07: 'Landsat 7', LC08: 'Landsat 8', LC09: 'Landsat 9' }[d.sensor] ?? d.sensor;
const after = px.series.find((s) => s.year === 1998)?.f;

function Scene() {
	const zh = useContext(LangCtx) === 'zh-TW';
	const [fx, fy] = [d.pixel_in_scene[0] / d.scene_px[0], d.pixel_in_scene[1] / d.scene_px[1]];
	return (
		<div className={styles.pic}>
			<img src={IMG + 'scene.jpg'} alt={zh ? `${dateOf('zh-TW')}整幅 Landsat 影像：臺灣西南海岸，局部有雲` : `The whole Landsat scene of ${fmtDate}: the coast of south-western Taiwan, partly cloudy`} />
			<span className={styles.mark} style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }} />
		</div>
	);
}

function Crop() {
	const zh = useContext(LangCtx) === 'zh-TW';
	// the pixel is the centre one of the crop (crop_px / 2)
	const n = d.crop_px;
	const c = (n / 2 / n) * 100;
	return (
		<div className={`${styles.pic} ${styles.square}`}>
			<img className={styles.pixelated} src={IMG + 'crop.jpg'} alt={zh ? '同一幅影像裁切 1.9 公里見方，原始 30 公尺像元：農田、一條路與樹叢' : 'A 1.9 km true-colour crop of the same scene at native 30 m pixels: fields, a road and tree groves'} />
			<span className={styles.grid} style={{ backgroundSize: `${100 / n}% ${100 / n}%` }} />
			<span className={styles.pixel} style={{ left: `${c}%`, top: `${c}%`, width: `${100 / n}%`, height: `${100 / n}%` }} />
		</div>
	);
}

function Bars({ values, max, fmt }: { values: number[]; max: number; fmt: (v: number) => string }) {
	const bands = BANDS[useContext(LangCtx)];
	return (
		<div className={styles.bars}>
			{values.map((v, i) => (
				<div key={bands[i]} className={styles.bar}>
					<span className={styles.value}>{fmt(v)}</span>
					<span className={styles.fill} style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: BAND_COLORS[i] }} />
					<span className={styles.band}>{bands[i]}</span>
				</div>
			))}
		</div>
	);
}

function Votes() {
	const zh = useContext(LangCtx) === 'zh-TW';
	const v = d.votes;
	const mean = (v.reduce((a, b) => a + b, 0) / v.length) * 100;
	return (
		<svg className={styles.votes} viewBox="0 0 300 150" role="img" aria-label={zh ? `隨機森林的 60 棵決策樹各自預測 ${Math.round(Math.min(...v) * 100)}% 到 ${Math.round(Math.max(...v) * 100)}%，平均 ${d.f_local}%` : `The 60 trees of the random forest each predict between ${Math.round(Math.min(...v) * 100)}% and ${Math.round(Math.max(...v) * 100)}%; their average is ${d.f_local}%`}>
			<line x1="10" x2="290" y1="120" y2="120" className={styles.axis} />
			{[0, 25, 50, 75, 100].map((p) => (
				<text key={p} x={10 + p * 2.8} y="138" className={styles.tick}>
					{p}%
				</text>
			))}
			{[...v]
				.sort((a, b) => a - b)
				.map((t, i) => (
					<line key={i} x1={10 + t * 280} x2={10 + t * 280} y1={112 - (i % 6) * 14} y2={100 - (i % 6) * 14} className={styles.vote} style={{ animationDelay: `${i * 25}ms` }} />
				))}
			<line x1={10 + mean * 2.8} x2={10 + mean * 2.8} y1="12" y2="120" className={styles.mean} />
			<text x={10 + mean * 2.8 + 5} y="22" className={styles.meanLabel}>
				{d.f_local}%
			</text>
		</svg>
	);
}

function Row() {
	const cells: [string, string][] = [
		['x_utm', px.x_utm.toString()],
		['y_utm', px.y_utm.toString()],
		[`f${d.year}`, d.f_stored.toString()],
		[`s${d.year}`, `→ ${d.scene}`],
	];
	return (
		<div className={styles.rowWrap}>
			<div className={styles.file}>
				tile {px.tile}.frac / .prov <span>(Apache Arrow)</span>
			</div>
			<table className={styles.row}>
				<tbody>
					{cells.map(([k, v]) => (
						<tr key={k}>
							<th>{k}</th>
							<td>{v}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function Series() {
	const zh = useContext(LangCtx) === 'zh-TW';
	const W = 300;
	const H = 110;
	const xs = (y: number) => 14 + ((y - 1984) / (2026 - 1984)) * (W - 24);
	const ys = (f: number) => H - 14 - (f / 100) * (H - 26);
	const pts = px.series.filter((s) => s.f !== null) as { year: number; f: number }[];
	return (
		<div className={styles.seriesWrap}>
			<svg className={styles.series} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={zh ? '這個像元 1984–2026 年每年的樹冠比例：1998 年前在 13% 到 93% 之間，之後約 5%' : "This pixel's tree cover every year, 1984 to 2026: between 13% and 93% before 1998, about 5% after"}>
				<rect x={xs(1997.5)} width={xs(1998.5) - xs(1997.5)} y="4" height={H - 18} className={styles.clearing} />
				<polyline points={pts.map((s) => `${xs(s.year)},${ys(s.f)}`).join(' ')} className={styles.line} />
				{pts.map((s) => (
					<circle key={s.year} cx={xs(s.year)} cy={ys(s.f)} r={s.year === d.year ? 3.4 : 1.8} className={s.year === d.year ? styles.dotOn : styles.dot} />
				))}
				{[1984, 1998, 2026].map((y) => (
					<text key={y} x={xs(y)} y={H - 2} className={styles.tick} textAnchor="middle">
						{y}
					</text>
				))}
			</svg>
			<div className={styles.thumbs}>
				{px.thumbs.map((t) => (
					<figure key={t.year}>
						<img className={styles.pixelated} src={IMG + t.img} alt={zh ? `${t.year} 年：樹冠 ${t.f}%` : `${t.year}: ${t.f}% tree cover`} />
						<figcaption>
							{t.year}
							<b>{t.f}%</b>
						</figcaption>
					</figure>
				))}
			</div>
		</div>
	);
}

function Island() {
	const zh = useContext(LangCtx) === 'zh-TW';
	const rows = totals.rows;
	const W = 300;
	const H = 120;
	const xs = (y: number) => 14 + ((y - 1984) / (2026 - 1984)) * (W - 24);
	const ys = (f: number) => H - 16 - ((f - 55) / 25) * (H - 28);
	return (
		<svg className={styles.series} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={zh ? '臺灣陸地 1984–2026 年每年的樹冠比例：在 66% 到 70% 之間' : "Tree cover of Taiwan's land every year, 1984 to 2026: between 66% and 70%"}>
			{[60, 70, 80].map((g) => (
				<g key={g}>
					<line x1="14" x2={W - 10} y1={ys(g)} y2={ys(g)} className={styles.gridline} />
					<text x="12" y={ys(g) + 3} className={styles.tick} textAnchor="end">
						{g}
					</text>
				</g>
			))}
			<polyline points={rows.map((r) => `${xs(r.year)},${ys(r.raw)}`).join(' ')} className={styles.raw} />
			<polyline points={rows.map((r) => `${xs(r.year)},${ys(r.tree)}`).join(' ')} className={styles.line} />
			{[1984, 2000, 2026].map((y) => (
				<text key={y} x={xs(y)} y={H - 2} className={styles.tick} textAnchor="middle">
					{y}
				</text>
			))}
		</svg>
	);
}

type Step = { title: string; body: string; view: () => ReactElement };
const STEPS_EN: Step[] = [
	{
		title: 'One real scene',
		body: `${sensorName} photographed this 185 km strip of south-western Taiwan on ${fmtDate} (path ${path}, row ${row}). The orange square is where TSMC Fab 14 stands today.`,
		view: Scene,
	},
	{
		title: 'One 30 m pixel',
		body: `Zoom in to 1.9 km. Each square is one pixel, 30 × 30 m on the ground. We follow the outlined one, at x ${px.x_utm.toLocaleString()}, y ${px.y_utm.toLocaleString()} on the native grid.`,
		view: Crop,
	},
	{
		title: 'Six raw numbers',
		body: 'The pixel is six numbers straight from the USGS file: how much light came back in each band. Leaves reflect near-infrared strongly, so that bar stands out.',
		view: () => <Bars values={d.dn} max={22000} fmt={(v) => v.toLocaleString()} />,
	},
	{
		title: 'Light, corrected',
		body: `Scaled to reflectance, ${sensorName} matched to Landsat 8, and this year’s haze and season evened out on forest and open land that never changed. NDVI ${d.features.ndvi.toFixed(2)}.`,
		view: () => <Bars values={d.sr_normalised} max={0.36} fmt={(v) => v.toFixed(3)} />,
	},
	{
		title: '60 trees vote',
		body: `A random forest trained on ESA WorldCover 2021: each of its ${px.n_trees} decision trees makes a guess. Their average is ${d.f_local}% tree cover, exactly the stored value.`,
		view: Votes,
	},
	{
		title: 'One row in a tile',
		body: 'Saved with the pixel’s exact position and the ID of the scene it came from, so anyone can trace the number back to the raw file.',
		view: Row,
	},
	{
		title: 'Every year',
		body: `Each year gets its own scene. Before 1998 the value swings with crops and seasons; in 1998 the Science Park arrives and it drops to ${after}%, and stays there.`,
		view: Series,
	},
	{
		title: 'Every pixel',
		body: `Repeated for 39.6 million pixels and 42 years: Taiwan’s land stays between 66% and 70% tree cover. Grey: before the yearly correction, when haze still read as trees.`,
		view: Island,
	},
];

const STEPS_ZH: Step[] = [
	{
		title: '一張真實的衛星影像',
		body: `${dateOf('zh-TW')}，${sensorName} 拍下了臺灣西南部這片 185 公里寬的影像（path ${path}、row ${row}）。橘色小框，就是今天台積電 Fab 14 所在的位置。`,
		view: Scene,
	},
	{
		title: '一個 30 公尺的像元',
		body: `放大到 1.9 公里見方。每個小方格就是一個像元，對應地面上 30 × 30 公尺。接下來我們只看框起來的這一格，它在原始格網上的位置是 x ${px.x_utm.toLocaleString()}、y ${px.y_utm.toLocaleString()}。`,
		view: Crop,
	},
	{
		title: '六個原始數字',
		body: '這一格，在 USGS 的原始檔案裡就只是六個數字：每個波段反射回來多少光。樹葉特別會反射近紅外光，所以那一根特別高。',
		view: () => <Bars values={d.dn} max={22000} fmt={(v) => v.toLocaleString()} />,
	},
	{
		title: '校正後的光',
		body: `先換算成反射率，把 ${sensorName} 的數值校正到和 Landsat 8 一致，再拿幾十年來都沒變過的森林和空地當基準，把這一年的霧霾和季節差異抹平。NDVI 是 ${d.features.ndvi.toFixed(2)}。`,
		view: () => <Bars values={d.sr_normalised} max={0.36} fmt={(v) => v.toFixed(3)} />,
	},
	{
		title: '60 棵樹投票',
		body: `這是用 ESA WorldCover 2021 訓練出來的隨機森林，裡面的 ${px.n_trees} 棵決策樹各猜一個數字，平均起來是 ${d.f_local}% 的樹冠，跟資料裡存的數值一模一樣。`,
		view: Votes,
	},
	{
		title: '存成圖塊裡的一列',
		body: '這個數字會連同像元的精確位置、來源影像的編號一起存下來，任何人都能一路追回原始檔案。',
		view: Row,
	},
	{
		title: '每一年',
		body: `每一年都各有一張影像。1998 年以前，數值跟著作物和季節上上下下；1998 年科學園區一來，就掉到 ${after}%，從此再也沒回來。`,
		view: Series,
	},
	{
		title: '全臺每一格',
		body: '同樣的步驟，重複在 3,960 萬個像元、42 個年份上：臺灣陸地的樹冠覆蓋一直落在 66% 到 70% 之間。灰色虛線是還沒做逐年校正、霧霾還被當成樹的版本。',
		view: Island,
	},
];

const UI = {
	en: { pause: 'Pause', replay: 'Replay ↻', play: 'Play', prev: 'Previous step', next: 'Next step', step: 'Step' },
	'zh-TW': { pause: '暫停', replay: '重播 ↻', play: '播放', prev: '上一步', next: '下一步', step: '步驟' },
};

export default function PixelJourney({ lang = 'en' }: { lang?: Lang }) {
	const STEPS = lang === 'zh-TW' ? STEPS_ZH : STEPS_EN;
	const ui = UI[lang];
	const [step, setStep] = useState(0);
	const [playing, setPlaying] = useState(false);
	const ref = useRef<HTMLElement>(null);
	const seen = useRef(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const io = new IntersectionObserver(
			([e]) => {
				if (e.isIntersecting && !seen.current) {
					seen.current = true;
					if (!reduced) setPlaying(true);
				}
				if (!e.isIntersecting) setPlaying(false);
			},
			{ threshold: 0.5 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	useEffect(() => {
		if (!playing) return;
		const t = setTimeout(() => {
			if (step < STEPS.length - 1) setStep(step + 1);
			else setPlaying(false);
		}, STEP_MS);
		return () => clearTimeout(t);
	}, [playing, step]);

	const go = (i: number) => {
		setStep(Math.max(0, Math.min(STEPS.length - 1, i)));
		setPlaying(false);
	};
	const s = STEPS[step];
	const View = s.view;
	const finished = step === STEPS.length - 1 && !playing;

	return (
		<LangCtx.Provider value={lang}>
		<figure className={styles.figure} ref={ref}>
			<div className={styles.stage}>
				<div className={styles.visual} key={step}>
					<View />
				</div>
				<div className={styles.text} aria-live="polite">
					<div className={styles.count}>
						{step + 1}/{STEPS.length}
					</div>
					<h4 className={styles.h}>{s.title}</h4>
					<p>{s.body}</p>
				</div>
			</div>
			<div className={styles.controls}>
				<div className={styles.dots}>
					{STEPS.map((x, i) => (
						<button key={x.title} type="button" className={`${styles.dotBtn} ${i === step ? styles.dotCur : ''}`} onClick={() => go(i)} aria-label={`${ui.step} ${i + 1}: ${x.title}`} />
					))}
				</div>
				<div className={styles.buttons}>
					<button type="button" className={styles.button} onClick={() => go(step - 1)} disabled={step === 0} aria-label={ui.prev}>
						‹
					</button>
					<button type="button" className={styles.button} onClick={() => go(step + 1)} disabled={step === STEPS.length - 1} aria-label={ui.next}>
						›
					</button>
					<button
						type="button"
						className={`${styles.button} ${styles.wide}`}
						onClick={() => {
							if (finished) {
								setStep(0);
								setPlaying(true);
							} else setPlaying(!playing);
						}}
					>
						{playing ? ui.pause : finished ? ui.replay : ui.play}
					</button>
				</div>
			</div>
		</figure>
		</LangCtx.Provider>
	);
}
