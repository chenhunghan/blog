import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './IsoDiagram.module.css';
import {
	buildPath,
	type Camera,
	fitCamera,
	type Frame,
	type IsoScene,
	pointAt,
	readPalette,
	renderScene,
	sceneBounds,
	toScreen,
} from './iso';

export type { IsoScene } from './iso';

interface Props {
	scene: IsoScene;
	/** Accessible description of the diagram. */
	label: string;
	/** Start over after the last step instead of stopping. */
	loop?: boolean;
	/** 'tooltip': each step's caption is a bubble on the node it is about (step.anchor, else the end of its path),
	 * inside the diagram, so nothing below it changes height; 'below' (default): a caption line under the diagram. */
	captions?: 'below' | 'tooltip';
}

const STEP_MS = 2400;
const TRAVEL = 0.7; // share of a step spent moving the dot; the rest holds the result
const IDLE_MS = 2200; // one lap per edge when a scene has no steps

type Controls = Record<'play' | 'pause' | 'replay' | 'next' | 'prev', () => void>;

export default function IsoDiagram({ scene, label, loop = false, captions = 'below' }: Props) {
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const tipRef = useRef<HTMLDivElement>(null);
	const placeTip = useRef<() => void>(() => {});
	const controls = useRef<Controls | null>(null);
	const steps = scene.steps ?? [];
	const [step, setStep] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [finished, setFinished] = useState(false);

	// Aspect ratio comes from the scene itself, so the space is reserved before hydration.
	const { spanX, spanY } = sceneBounds(scene);

	useEffect(() => {
		const stage = stageRef.current;
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext('2d');
		if (!stage || !canvas || !ctx) return;

		const byId = new Map(scene.nodes.map((n) => [n.id, n]));
		const pathOf = (ids: string[]) => buildPath(ids.flatMap((id) => byId.get(id) ?? []));
		const stepPaths = steps.map((s) => (s.path && s.path.length > 1 ? pathOf(s.path) : null));
		const edgePaths = (scene.edges ?? []).map((e) => pathOf([e.from, e.to]));
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const duration = (i: number) => steps[i]?.duration ?? STEP_MS;

		const st = { step: 0, t: 0, playing: false, visible: false, started: false };
		let pal = readPalette(stage);
		let cam: Camera | null = null;
		let size = { w: 0, h: 0 };
		let raf = 0;
		let last = 0;

		const frame = (): Frame => {
			const glow = new Map<string, number>();
			const dots: Frame['dots'] = [];
			if (steps.length === 0) {
				if (!reduced) {
					edgePaths.forEach((p, i) => dots.push([pointAt(p, (st.t / IDLE_MS + i * 0.37) % 1), 1]));
				}
				return { glow, dots };
			}
			const s = steps[st.step];
			for (const id of s.highlight ?? []) glow.set(id, 1);
			const path = stepPaths[st.step];
			if (path) {
				const progress = Math.min(1, st.t / (duration(st.step) * TRAVEL));
				for (const [id, at] of path.arrivals) {
					if (progress >= at) glow.set(id, Math.max(glow.get(id) ?? 0, Math.min(1, 0.4 + (progress - at) * 6)));
				}
				if (progress < 1) {
					for (let i = 0; i < 4; i++) {
						const f = progress - i * 0.025;
						if (f >= 0) dots.push([pointAt(path, f), 1 - i * 0.25]);
					}
				}
			}
			return { glow, dots };
		};

		// Tooltip captions: beside the step's node, on whichever side (above, below, left, right) covers the least of
		// the other nodes, kept inside the stage; the arrow points at the node.
		const screenBox = (n: (typeof scene.nodes)[number]) => {
			const z0 = n.z ?? 0;
			const z1 = z0 + (n.h ?? 0.5);
			const pts: [number, number][] = [];
			for (const dx of [0, n.w]) for (const dy of [0, n.d]) for (const z of [z0, z1]) pts.push(toScreen(cam!, [n.x + dx, n.y + dy, z]));
			const xs = pts.map((q) => q[0]);
			const ys = pts.map((q) => q[1]);
			return { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
		};
		placeTip.current = () => {
			const tip = tipRef.current;
			const s = steps[st.step];
			if (!tip || !cam || !s) return;
			const n = byId.get(s.anchor ?? s.path?.at(-1) ?? s.highlight?.[0] ?? '');
			if (!n) {
				tip.style.visibility = 'hidden';
				return;
			}
			const a = screenBox(n);
			const others = scene.nodes.filter((o) => o !== n).map(screenBox);
			const w = tip.offsetWidth;
			const h = tip.offsetHeight;
			const gap = 12;
			const cx = (a.l + a.r) / 2;
			const cy = (a.t + a.b) / 2;
			const clampX = (x: number) => Math.max(4, Math.min(size.w - w - 4, x));
			const clampY = (y: number) => Math.max(4, Math.min(size.h - h - 4, y));
			const options = [
				{ side: 'above', x: clampX(cx - w / 2), y: a.t - gap - h },
				{ side: 'below', x: clampX(cx - w / 2), y: a.b + gap },
				{ side: 'right', x: a.r + gap, y: clampY(cy - h / 2) },
				{ side: 'left', x: a.l - gap - w, y: clampY(cy - h / 2) },
			];
			const cost = (o: (typeof options)[number]) => {
				const out = o.x < 0 || o.y < 0 || o.x + w > size.w || o.y + h > size.h;
				let covered = 0;
				for (const b of others) {
					const ox = Math.max(0, Math.min(o.x + w, b.r) - Math.max(o.x, b.l));
					const oy = Math.max(0, Math.min(o.y + h, b.b) - Math.max(o.y, b.t));
					covered += ox * oy;
				}
				return (out ? 1e9 : 0) + covered;
			};
			const best = options.reduce((p, o) => (cost(o) < cost(p) ? o : p));
			tip.style.left = `${best.x}px`;
			tip.style.top = `${best.y}px`;
			const vertical = best.side === 'above' || best.side === 'below';
			tip.style.setProperty('--arrow', vertical ? `${Math.max(12, Math.min(w - 12, cx - best.x))}px` : `${Math.max(12, Math.min(h - 12, cy - best.y))}px`);
			tip.dataset.side = best.side;
			tip.style.visibility = 'visible';
		};

		const draw = () => {
			if (!cam) return;
			ctx.clearRect(0, 0, size.w, size.h);
			renderScene(ctx, cam, scene, pal, frame());
		};

		const tick = (now: number) => {
			raf = 0;
			const dt = last ? Math.min(64, now - last) : 16;
			last = now;
			if (st.playing && st.visible) {
				st.t += dt;
				if (steps.length && st.t >= duration(st.step)) {
					if (st.step < steps.length - 1) {
						st.step += 1;
						st.t = 0;
						setStep(st.step);
					} else if (loop) {
						st.step = 0;
						st.t = 0;
						setStep(0);
					} else {
						st.t = duration(st.step);
						st.playing = false;
						setPlaying(false);
						setFinished(true);
					}
				}
			}
			draw();
			if (st.playing && st.visible) raf = requestAnimationFrame(tick);
			else last = 0;
		};
		const kick = () => {
			if (!raf) raf = requestAnimationFrame(tick);
		};

		const goTo = (i: number) => {
			st.step = Math.max(0, Math.min(steps.length - 1, i));
			setStep(st.step);
			setFinished(false);
			if (reduced) {
				// No motion: show each step's end state.
				st.t = duration(st.step);
				draw();
			} else {
				st.t = 0;
				st.playing = true;
				setPlaying(true);
				kick();
			}
		};
		controls.current = {
			play: () => {
				st.playing = true;
				setPlaying(true);
				kick();
			},
			pause: () => {
				st.playing = false;
				setPlaying(false);
			},
			replay: () => goTo(0),
			next: () => goTo(st.step + 1),
			prev: () => goTo(st.step - 1),
		};

		const resize = () => {
			const w = stage.clientWidth;
			const h = stage.clientHeight;
			if (!w || !h) return;
			const dpr = window.devicePixelRatio || 1;
			size = { w, h };
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			cam = fitCamera(scene, w, h);
			draw();
			placeTip.current();
		};
		const resizeObserver = new ResizeObserver(resize);
		resizeObserver.observe(stage);

		// Only animate while on screen; start from the beginning the first time it's seen.
		const visibility = new IntersectionObserver(([entry]) => {
			st.visible = entry.isIntersecting;
			if (st.visible && !st.started) {
				st.started = true;
				if (reduced) st.t = duration(0);
				else {
					st.playing = true;
					setPlaying(true);
				}
			}
			if (st.visible) kick();
		});
		visibility.observe(stage);

		const scheme = matchMedia('(prefers-color-scheme: dark)');
		const onScheme = () =>
			requestAnimationFrame(() => {
				pal = readPalette(stage);
				draw();
			});
		scheme.addEventListener('change', onScheme);

		return () => {
			cancelAnimationFrame(raf);
			resizeObserver.disconnect();
			visibility.disconnect();
			scheme.removeEventListener('change', onScheme);
		};
	}, [scene, loop]);

	const current = steps[step];
	// the caption's size changes with its text: place it after React has rendered it
	useLayoutEffect(() => placeTip.current(), [step]);
	const tooltip = captions === 'tooltip';
	return (
		<figure className={styles.figure}>
			<div ref={stageRef} className={styles.stage} style={{ aspectRatio: `${spanX} / ${spanY}` }}>
				<canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
				{current && tooltip && (
					<div ref={tipRef} className={styles.tip} aria-live="polite" style={{ visibility: 'hidden' }}>
						<span className={styles.count}>
							{step + 1}/{steps.length}
						</span>
						{current.caption}
					</div>
				)}
			</div>
			{current && (
				<figcaption className={`${styles.controls} ${tooltip ? styles.controlsOnly : ''}`}>
					{!tooltip && (
						<p className={styles.caption} aria-live="polite">
							<span className={styles.count}>
								{step + 1}/{steps.length}
							</span>
							{current.caption}
						</p>
					)}
					<div className={styles.buttons}>
						<button
							type="button"
							className={styles.button}
							onClick={() => controls.current?.prev()}
							disabled={step === 0}
							aria-label="Previous step"
						>
							‹
						</button>
						<button
							type="button"
							className={styles.button}
							onClick={() => controls.current?.next()}
							disabled={step === steps.length - 1}
							aria-label="Next step"
						>
							›
						</button>
						<button
							type="button"
							className={`${styles.button} ${styles.wide}`}
							onClick={() =>
								playing ? controls.current?.pause() : finished ? controls.current?.replay() : controls.current?.play()
							}
						>
							{playing ? 'Pause' : finished ? 'Replay ↻' : 'Play'}
						</button>
					</div>
				</figcaption>
			)}
		</figure>
	);
}
