import * as Plot from '@observablehq/plot';
import { useEffect, useMemo, useRef, useState } from 'react';

type Step = { step: number; x: number; loss: number };

// Minimise f(x) = x² starting from x₀, with f'(x) = 2x.
function descend(learningRate: number, x0: number, steps: number): Step[] {
	const out: Step[] = [];
	let x = x0;
	for (let step = 0; step <= steps; step++) {
		out.push({ step, x, loss: x * x });
		x -= learningRate * 2 * x;
	}
	return out;
}

export default function GradientDescentChart({ x0 = 4, steps = 25 }: { x0?: number; steps?: number }) {
	const [learningRate, setLearningRate] = useState(0.1);
	const ref = useRef<HTMLDivElement>(null);
	const data = useMemo(() => descend(learningRate, x0, steps), [learningRate, x0, steps]);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const chart = Plot.plot({
			width: el.clientWidth,
			height: 280,
			y: { type: 'symlog', label: 'loss', grid: true },
			x: { label: 'step' },
			marks: [
				Plot.lineY(data, { x: 'step', y: 'loss', stroke: 'var(--accent-color, #2337ff)' }),
				Plot.dot(data, { x: 'step', y: 'loss', r: 2.5, fill: 'currentColor', tip: true }),
			],
		});
		el.replaceChildren(chart);
		return () => chart.remove();
	}, [data]);

	return (
		<figure style={{ margin: '2rem 0' }}>
			<label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontSize: '0.9em' }}>
				learning rate
				<input
					type="range"
					min={0.01}
					max={1.05}
					step={0.01}
					value={learningRate}
					onChange={(e) => setLearningRate(Number(e.target.value))}
					style={{ flex: 1 }}
				/>
				<code>{learningRate.toFixed(2)}</code>
			</label>
			<div ref={ref} style={{ minHeight: 280 }} />
			<figcaption style={{ fontSize: '0.85em', opacity: 0.7 }}>
				Gradient descent on f(x) = x² from x₀ = {x0}. Try a rate above 1.0.
			</figcaption>
		</figure>
	);
}
