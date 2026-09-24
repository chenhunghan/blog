import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import type { Mesh } from 'three';

function Knot() {
	const mesh = useRef<Mesh>(null);
	const [hovered, setHovered] = useState(false);
	const [clicked, setClicked] = useState(false);

	useFrame((_, delta) => {
		if (mesh.current) mesh.current.rotation.y += delta * 0.4;
	});

	return (
		<mesh
			ref={mesh}
			scale={clicked ? 1.25 : 1}
			onClick={() => setClicked((c) => !c)}
			onPointerOver={() => setHovered(true)}
			onPointerOut={() => setHovered(false)}
		>
			<torusKnotGeometry args={[1, 0.32, 200, 32]} />
			<meshStandardMaterial color={hovered ? '#ff7a59' : '#2337ff'} roughness={0.3} metalness={0.4} />
		</mesh>
	);
}

export default function TorusKnotScene({ height = 360 }: { height?: number }) {
	return (
		<div style={{ height, margin: '2rem 0', borderRadius: 12, overflow: 'hidden', background: '#0f1219' }}>
			<Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
				<ambientLight intensity={0.4} />
				<directionalLight position={[3, 5, 2]} intensity={2} />
				<Knot />
				<OrbitControls enableZoom={false} />
			</Canvas>
		</div>
	);
}
