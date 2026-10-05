/**
 * Isometric diagram primitives: projection, camera fitting and Canvas 2D drawing.
 *
 * World axes: x runs right-down on screen, y runs left-down, z is up. One world unit is
 * one "tile"; the camera scales the whole scene to fit the canvas.
 */

export type Vec3 = [number, number, number];
export type Tone = 'default' | 'accent' | 'muted';

export interface IsoNode {
	id: string;
	label?: string;
	x: number;
	y: number;
	z?: number;
	w: number;
	d: number;
	h?: number;
	tone?: Tone;
}

/** A flat outlined platform, e.g. a cluster or region that nodes sit on. */
export interface IsoGroup {
	label?: string;
	x: number;
	y: number;
	z?: number;
	w: number;
	d: number;
}

export interface IsoEdge {
	from: string;
	to: string;
}

export interface IsoStep {
	caption: string;
	/** Node ids a dot travels through during this step. */
	path?: string[];
	/** Node ids lit for the whole step (nodes on `path` light up as the dot reaches them). */
	highlight?: string[];
	/** Step length in ms. */
	duration?: number;
	/** Node the caption points at in tooltip mode (default: the last node on `path`, else the first highlighted). */
	anchor?: string;
}

export interface IsoScene {
	nodes: IsoNode[];
	groups?: IsoGroup[];
	edges?: IsoEdge[];
	steps?: IsoStep[];
}

export interface Camera {
	scale: number;
	ox: number;
	oy: number;
}

export interface Palette {
	fg: string;
	muted: string;
	accent: string;
	surface: string;
	font: string;
	dark: boolean;
}

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const DEFAULT_H = 0.5;

export function project([x, y, z]: Vec3): [number, number] {
	return [(x - y) * COS, (x + y) * SIN - z];
}

export function toScreen(cam: Camera, p: Vec3): [number, number] {
	const [px, py] = project(p);
	return [cam.ox + px * cam.scale, cam.oy + py * cam.scale];
}

/** Projected (camera-independent) bounding box of everything in the scene. */
export function sceneBounds(scene: IsoScene) {
	const pts: [number, number][] = [];
	for (const n of scene.nodes) {
		const z = n.z ?? 0;
		const h = n.h ?? DEFAULT_H;
		for (const dx of [0, n.w]) for (const dy of [0, n.d]) for (const dz of [0, h]) {
			pts.push(project([n.x + dx, n.y + dy, z + dz]));
		}
	}
	for (const g of scene.groups ?? []) {
		const z = g.z ?? 0;
		for (const dx of [0, g.w]) for (const dy of [0, g.d]) pts.push(project([g.x + dx, g.y + dy, z]));
	}
	const xs = pts.map((p) => p[0]);
	const ys = pts.map((p) => p[1]);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	return { minX, minY, spanX: Math.max(...xs) - minX, spanY: Math.max(...ys) - minY };
}

/** Scale and centre the scene inside a width × height box. */
export function fitCamera(scene: IsoScene, width: number, height: number, pad = 12): Camera {
	const b = sceneBounds(scene);
	const scale = Math.min((width - 2 * pad) / b.spanX, (height - 2 * pad) / b.spanY);
	return {
		scale,
		ox: (width - b.spanX * scale) / 2 - b.minX * scale,
		oy: (height - b.spanY * scale) / 2 - b.minY * scale,
	};
}

export function rgba(color: string, alpha: number): string {
	const m = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	if (!m) return color;
	const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
	const n = parseInt(hex, 16);
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Read the site's theme tokens so diagrams follow light/dark mode. */
export function readPalette(el: Element): Palette {
	const style = getComputedStyle(el);
	const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
	return {
		fg: v('--fg', '#1c1c1e'),
		muted: v('--muted', '#6e6e73'),
		accent: v('--accent', '#2754c5'),
		surface: v('--code-bg', '#f3f3f1'),
		font: v('--mono', 'ui-monospace, monospace'),
		dark: matchMedia('(prefers-color-scheme: dark)').matches,
	};
}

// ---------------------------------------------------------------------------
// Paths: polylines between nodes that dots travel along.

function anchor(n: IsoNode, level: 'top' | 'bottom' | 'middle'): Vec3 {
	const z = n.z ?? 0;
	const h = n.h ?? DEFAULT_H;
	return [n.x + n.w / 2, n.y + n.d / 2, level === 'top' ? z + h : level === 'bottom' ? z : z + h / 2];
}

/** Route between two nodes: straight on the same level, otherwise down/across/down like a circuit. */
export function segment(a: IsoNode, b: IsoNode): Vec3[] {
	const az = a.z ?? 0;
	const bz = b.z ?? 0;
	if (Math.abs(az - bz) < 1e-6) return [anchor(a, 'middle'), anchor(b, 'middle')];
	const [from, to] = az > bz ? [anchor(a, 'bottom'), anchor(b, 'top')] : [anchor(a, 'top'), anchor(b, 'bottom')];
	const mid = (from[2] + to[2]) / 2;
	return [from, [from[0], from[1], mid], [to[0], to[1], mid], to];
}

export interface IsoPath {
	pts: Vec3[];
	/** Cumulative projected length at each point, normalised to 0..1. */
	fracs: number[];
	/** When the dot reaches each node, as a fraction of the path. */
	arrivals: [string, number][];
}

export function buildPath(nodes: IsoNode[]): IsoPath {
	const pts: Vec3[] = [];
	const arrivalIndex: [string, number][] = [];
	nodes.forEach((n, i) => {
		if (i === 0) return;
		const seg = segment(nodes[i - 1], n);
		if (i === 1) arrivalIndex.push([nodes[0].id, 0]);
		pts.push(...seg);
		arrivalIndex.push([n.id, pts.length - 1]);
	});
	const lengths = [0];
	for (let i = 1; i < pts.length; i++) {
		const [ax, ay] = project(pts[i - 1]);
		const [bx, by] = project(pts[i]);
		lengths.push(lengths[i - 1] + Math.hypot(bx - ax, by - ay));
	}
	const total = lengths[lengths.length - 1] || 1;
	const fracs = lengths.map((l) => l / total);
	return { pts, fracs, arrivals: arrivalIndex.map(([id, idx]) => [id, fracs[idx]]) };
}

export function pointAt(path: IsoPath, f: number): Vec3 {
	const { pts, fracs } = path;
	if (pts.length === 0) return [0, 0, 0];
	const t = Math.min(1, Math.max(0, f));
	let i = 1;
	while (i < fracs.length - 1 && fracs[i] < t) i++;
	const span = fracs[i] - fracs[i - 1] || 1;
	const k = (t - fracs[i - 1]) / span;
	const [a, b] = [pts[i - 1], pts[i]];
	return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

// ---------------------------------------------------------------------------
// Drawing

function poly(ctx: CanvasRenderingContext2D, cam: Camera, pts: Vec3[]) {
	ctx.beginPath();
	pts.forEach((p, i) => {
		const [x, y] = toScreen(cam, p);
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	});
	ctx.closePath();
}

/** Text lying flat on a horizontal plane, reading along the x or y axis. */
function planeText(
	ctx: CanvasRenderingContext2D,
	cam: Camera,
	text: string,
	at: Vec3,
	along: 'x' | 'y',
	size: number,
	color: string,
	font: string,
	opts: { align?: CanvasTextAlign; maxLength?: number } = {},
) {
	const [sx, sy] = toScreen(cam, at);
	ctx.save();
	ctx.translate(sx, sy);
	if (along === 'x') ctx.transform(COS, SIN, -COS, SIN, 0, 0);
	else ctx.transform(COS, -SIN, COS, SIN, 0, 0);
	let px = size * cam.scale;
	ctx.font = `600 ${px}px ${font}`;
	if (opts.maxLength) {
		const width = ctx.measureText(text).width;
		const max = opts.maxLength * cam.scale;
		if (width > max) {
			px *= max / width;
			ctx.font = `600 ${px}px ${font}`;
		}
	}
	ctx.fillStyle = color;
	ctx.textAlign = opts.align ?? 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 0, 0);
	ctx.restore();
}

function drawGroup(ctx: CanvasRenderingContext2D, cam: Camera, g: IsoGroup, pal: Palette) {
	const z = g.z ?? 0;
	const { x, y, w, d } = g;
	poly(ctx, cam, [
		[x, y, z],
		[x + w, y, z],
		[x + w, y + d, z],
		[x, y + d, z],
	]);
	ctx.strokeStyle = rgba(pal.muted, 0.5);
	ctx.lineWidth = 1;
	ctx.stroke();
	if (g.label) {
		planeText(ctx, cam, g.label.toUpperCase(), [x + 0.35, y + d - 0.4, z], 'x', 0.26, pal.muted, pal.font, {
			align: 'left',
		});
	}
}

function drawNode(ctx: CanvasRenderingContext2D, cam: Camera, n: IsoNode, pal: Palette, glow: number) {
	const z0 = n.z ?? 0;
	const z1 = z0 + (n.h ?? DEFAULT_H);
	const { x, y, w, d } = n;
	const top: Vec3[] = [
		[x, y, z1],
		[x + w, y, z1],
		[x + w, y + d, z1],
		[x, y + d, z1],
	];
	const left: Vec3[] = [
		[x, y + d, z0],
		[x + w, y + d, z0],
		[x + w, y + d, z1],
		[x, y + d, z1],
	];
	const right: Vec3[] = [
		[x + w, y, z0],
		[x + w, y + d, z0],
		[x + w, y + d, z1],
		[x + w, y, z1],
	];
	const lit = n.tone === 'accent' ? 1 : glow;
	ctx.save();
	ctx.globalAlpha = n.tone === 'muted' ? 0.45 : 1;
	ctx.lineJoin = 'round';
	ctx.lineWidth = 1;
	const faces: [Vec3[], number, number][] = [
		[right, 0.14, 0.34],
		[left, 0.07, 0.26],
		[top, 0, 0.16],
	];
	for (const [face, shade, tint] of faces) {
		poly(ctx, cam, face);
		ctx.fillStyle = pal.surface;
		ctx.fill();
		if (shade) {
			ctx.fillStyle = `rgba(0, 0, 0, ${pal.dark ? shade * 2.2 : shade})`;
			ctx.fill();
		}
		if (lit > 0) {
			ctx.fillStyle = rgba(pal.accent, tint * lit);
			ctx.fill();
		}
		ctx.strokeStyle = rgba(pal.muted, 0.85);
		ctx.stroke();
		if (lit > 0) {
			ctx.strokeStyle = rgba(pal.accent, lit);
			ctx.stroke();
		}
	}
	if (n.label) {
		const alongX = w >= d;
		planeText(
			ctx,
			cam,
			n.label.toUpperCase(),
			[x + w / 2, y + d / 2, z1],
			alongX ? 'x' : 'y',
			Math.min(0.3, Math.min(w, d) * 0.4),
			lit > 0.5 ? pal.accent : pal.fg,
			pal.font,
			{ maxLength: (alongX ? w : d) * 0.85 },
		);
	}
	ctx.restore();
}

export interface Frame {
	glow: Map<string, number>;
	/** Dots to draw: world position and opacity. */
	dots: [Vec3, number][];
}

export function renderScene(
	ctx: CanvasRenderingContext2D,
	cam: Camera,
	scene: IsoScene,
	pal: Palette,
	frame: Frame,
) {
	const byId = new Map(scene.nodes.map((n) => [n.id, n]));

	// Connectors sit underneath everything.
	ctx.save();
	ctx.setLineDash([3, 4]);
	ctx.strokeStyle = rgba(pal.muted, 0.7);
	ctx.lineWidth = 1;
	for (const e of scene.edges ?? []) {
		const a = byId.get(e.from);
		const b = byId.get(e.to);
		if (!a || !b) continue;
		const pts = segment(a, b).map((p) => toScreen(cam, p));
		ctx.beginPath();
		pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
		ctx.stroke();
	}
	ctx.restore();

	// Dots travel along the connectors, so they sit at the connectors' level: boxes in front hide them.
	ctx.save();
	ctx.fillStyle = pal.accent;
	ctx.shadowColor = pal.accent;
	ctx.shadowBlur = 8;
	for (const [p, alpha] of frame.dots) {
		const [px, py] = toScreen(cam, p);
		ctx.globalAlpha = alpha;
		ctx.beginPath();
		ctx.arc(px, py, Math.max(2.5, cam.scale * 0.07), 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();

	// Painter's order: lower levels first, then back to front within a level.
	type Item = { z: number; depth: number; draw: () => void };
	const items: Item[] = [
		...(scene.groups ?? []).map((g) => ({
			z: g.z ?? 0,
			depth: -Infinity,
			draw: () => drawGroup(ctx, cam, g, pal),
		})),
		...scene.nodes.map((n) => ({
			z: n.z ?? 0,
			depth: n.x + n.w / 2 + n.y + n.d / 2,
			draw: () => drawNode(ctx, cam, n, pal, frame.glow.get(n.id) ?? 0),
		})),
	];
	items.sort((a, b) => a.z - b.z || a.depth - b.depth);
	for (const item of items) item.draw();

}
