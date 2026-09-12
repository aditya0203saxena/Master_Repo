"use client";

import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, OrbitControls } from "@react-three/drei";

function Orb() {
  return (
    <Float speed={1.2} rotationIntensity={0.35} floatIntensity={0.7}>
      <mesh scale={1.65}>
        <icosahedronGeometry args={[1, 5]} />
        <MeshDistortMaterial
          color="#7c3aed"
          roughness={0.2}
          metalness={0.35}
          distort={0.28}
          speed={1.8}
        />
      </mesh>
    </Float>
  );
}

export function AmbientScene() {
  return (
    <div className="h-full w-full" aria-hidden="true">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 5.2], fov: 42 }}>
        <ambientLight intensity={1.6} />
        <directionalLight position={[3, 4, 2]} intensity={3} />
        <pointLight position={[-3, -2, 2]} intensity={2} />
        <Orb />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}
