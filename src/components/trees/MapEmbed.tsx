import { useEffect, useRef, useState } from 'react';
import styles from './MapEmbed.module.css';

// One view of the tw-tree 3D map (https://chenhunghan.github.io/tw-tree/) in a post.
//  - Until the reader clicks, it is only a poster image: no iframe, no WebGL, no data.
//  - The iframe loads under the poster and fades in when the map reports its first frame with trees ('ready').
//  - Off screen, the map pauses (keeps its state); back on screen it resumes at once.
//  - At most MAX_LIVE maps exist (1 on phones). Starting another removes the least recently seen one, which is off
//    screen; before it goes it sends a snapshot of its last frame, which replaces the poster, and its current view,
//    so "Resume" reopens it there.
//  - Full screen: the map asks (postMessage 'expand'); the figure goes full screen, or covers the window where
//    the Fullscreen API isn't available (iPhone).
// Message protocol: see "Embedding" in tw-tree's AGENTS.md.

const BASE = import.meta.env.PUBLIC_TWTREE_BASE ?? 'https://chenhunghan.github.io/tw-tree/';
const READY_TIMEOUT = 20000;
const T = {
	en: { loading: 'Loading the map…', explore: 'Explore in 3D', resume: 'Resume', exploreAria: 'Explore in 3D', resumeAria: 'Resume the 3D map' },
	'zh-TW': { loading: '地圖載入中…', explore: '以 3D 探索', resume: '繼續', exploreAria: '以 3D 探索', resumeAria: '繼續 3D 地圖' },
};

interface Live {
	id: string;
	seen: number;
	visible: boolean;
	evict: () => Promise<void>;
}
const live: Live[] = [];
const maxLive = () => (matchMedia('(pointer: coarse)').matches || innerWidth < 700 ? 1 : 2);

interface Props {
	/** Query string for the map, without `embed`/`lang` (e.g. "at=24.76,121.59&d=3200&az=160&el=15"). */
	view: string;
	poster: string;
	alt: string;
	/** Plain-text caption; or pass the caption as children (rich text, links). */
	caption?: string;
	children?: React.ReactNode;
	/** Width / height on wide screens; phones use 4 / 5. */
	aspect?: number;
	/** Start by itself when it comes near the screen (instead of on a click). */
	autostart?: boolean;
	/** Wider than the text column on large screens. */
	wide?: boolean;
	/** Page language: the buttons, and the map's own UI. */
	lang?: 'en' | 'zh-TW';
}

type State = 'poster' | 'loading' | 'live';

export default function MapEmbed({ view, poster, alt, caption, children, aspect = 3 / 2, autostart = false, wide = false, lang = 'en' }: Props) {
	const tr = T[lang];
	const figRef = useRef<HTMLDivElement>(null);
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [state, setState] = useState<State>('poster');
	const [src, setSrc] = useState<string | null>(null);
	const [image, setImage] = useState(poster);
	const [resumable, setResumable] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const me = useRef<Live | null>(null);
	const lastUrl = useRef<string>(`${BASE}?${view}&embed=1&lang=${lang === 'zh-TW' ? 'zh' : 'en'}`);
	const snapWait = useRef<((data: string | null) => void) | null>(null);
	const started = useRef(false);
	const startRef = useRef<() => void>(() => {});

	const post = (msg: object) => frameRef.current?.contentWindow?.postMessage({ tw: 'host', ...msg }, '*');

	// messages from this map
	useEffect(() => {
		const onMsg = (e: MessageEvent) => {
			if (!frameRef.current || e.source !== frameRef.current.contentWindow || e.data?.tw !== 'tree') return;
			const m = e.data;
			if (m.type === 'ready') setState('live');
			else if (m.type === 'view' && typeof m.url === 'string') lastUrl.current = m.url;
			else if (m.type === 'snapshot') snapWait.current?.(m.data);
			else if (m.type === 'expand') setFull(!!m.on);
		};
		addEventListener('message', onMsg);
		return () => removeEventListener('message', onMsg);
	}, []);

	// pause off screen, remember when last seen
	useEffect(() => {
		const el = figRef.current;
		if (!el) return;
		const io = new IntersectionObserver(([e]) => {
			if (autostart && e.isIntersecting && !me.current && !started.current) {
				started.current = true;
				startRef.current();
			}
			if (!me.current) return;
			me.current.visible = e.isIntersecting;
			if (e.isIntersecting) me.current.seen = performance.now();
			post({ type: e.isIntersecting ? 'resume' : 'pause' });
		});
		io.observe(el);
		return () => io.disconnect();
	}, []);

	// reveal anyway if the map never says it's ready
	useEffect(() => {
		if (state !== 'loading') return;
		const t = setTimeout(() => setState('live'), READY_TIMEOUT);
		return () => clearTimeout(t);
	}, [state, src]);

	// full screen: the browser's where available, else cover the window
	const setFull = (on: boolean) => {
		const el = figRef.current;
		if (!el) return;
		if (on && document.fullscreenEnabled && el.requestFullscreen) el.requestFullscreen().catch(() => cover(true));
		else if (!on && document.fullscreenElement) document.exitFullscreen();
		else cover(on);
	};
	const cover = (on: boolean) => {
		setExpanded(on);
		document.documentElement.style.overflow = on ? 'hidden' : '';
		post({ type: 'expanded', on });
	};
	useEffect(() => {
		const onFs = () => {
			const on = document.fullscreenElement === figRef.current;
			setExpanded(on);
			post({ type: 'expanded', on });
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && expanded && !document.fullscreenElement) cover(false);
		};
		document.addEventListener('fullscreenchange', onFs);
		addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			removeEventListener('keydown', onKey);
		};
	}, [expanded]);

	const evict = async () => {
		const data = await new Promise<string | null>((resolve) => {
			snapWait.current = resolve;
			post({ type: 'snapshot' });
			setTimeout(() => resolve(null), 800);
		});
		snapWait.current = null;
		if (data) setImage(data);
		setResumable(true);
		setState('poster');
		setSrc(null);
		const i = live.indexOf(me.current!);
		if (i >= 0) live.splice(i, 1);
		me.current = null;
	};

	const start = async () => {
		if (state !== 'poster') return;
		// make room: the least recently seen maps, off screen ones first
		const others = live.filter((l) => l !== me.current);
		others.sort((a, b) => Number(b.visible) - Number(a.visible) || b.seen - a.seen);
		while (others.length >= maxLive()) await others.pop()!.evict();
		me.current = { id: view, seen: performance.now(), visible: true, evict };
		live.push(me.current);
		setState('loading');
		setSrc(lastUrl.current);
	};
	startRef.current = start;

	return (
		<figure className={`${styles.figure} ${wide ? styles.wide : ''}`}>
			<div
				ref={figRef}
				className={`${styles.stage} ${expanded ? styles.expanded : ''}`}
				style={{ '--aspect': String(aspect) } as React.CSSProperties}
			>
				{src && (
					<iframe
						ref={frameRef}
						className={styles.frame}
						src={src}
						title={alt}
						allow="fullscreen"
						allowFullScreen
					/>
				)}
				<button
					type="button"
					className={`${styles.poster} ${state === 'live' ? styles.hidden : ''}`}
					onClick={start}
					aria-label={`${resumable ? tr.resumeAria : tr.exploreAria}: ${alt}`}
					tabIndex={state === 'live' ? -1 : 0}
				>
					<img src={image} alt={alt} loading="lazy" decoding="async" />
					<span className={styles.play}>
						{state === 'loading' ? (
							<>
								<span className={styles.spinner} aria-hidden="true" />
								{tr.loading}
							</>
						) : (
							<>
								<svg viewBox="0 0 24 24" aria-hidden="true">
									<path d="M8 5v14l11-7z" />
								</svg>
								{resumable ? tr.resume : tr.explore}
							</>
						)}
					</span>
				</button>
			</div>
			{(caption || children) && <figcaption className={styles.caption}>{children ?? caption}</figcaption>}
		</figure>
	);
}
