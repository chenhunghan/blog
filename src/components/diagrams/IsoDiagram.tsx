import { useEffect, useRef, useState } from 'react';
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
} from './iso';

export type { IsoScene } from './iso';

interface Props {
	scene: IsoScene;
	/** Accessible description of the diagram. */
	label: string;
	/** Start over after the last step instead of stopping. */
	loop?: boolean;
}

const STEP_MS = 2400;
const TRAVEL = 0.7; // share of a step spent moving the dot; the rest holds the result
const IDLE_MS = 2200; // one lap per edge when a scene has no steps

type Controls = Record<'play' | 'pause' | 'replay' | 'next' | 'prev', () => void>;

export default function IsoDiagram({ scene, label, loop = false }: Props) {
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
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
	return (
		<figure className={styles.figure}>
			<div ref={stageRef} className={styles.stage} style={{ aspectRatio: `${spanX} / ${spanY}` }}>
				<canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
			</div>
			{current && (
				<figcaption className={styles.controls}>
					<p className={styles.caption} aria-live="polite">
						<span className={styles.count}>
							{step + 1}/{steps.length}
						</span>
						{current.caption}
					</p>
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
