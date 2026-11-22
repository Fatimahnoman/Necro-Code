"use client";

import { PointMaterial, Points, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { AURA_HEX, type AuraState } from "@/lib/aura";
import { installThreeConsoleGuard } from "@/lib/three-runtime";

installThreeConsoleGuard();

/**
 * Full-screen atmospheric WebGL layer:
 *   · 560 drifting spectral embers
 *   · a giant rotating wireframe relic (the "idle skull" silhouette)
 *   · additive fog sparkles
 *
 * It sits behind the glass dashboard and reacts to the SSE-driven aura.
 */

function SpectralEmbers({ aura }: { aura: AuraState }) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointer = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", handlePointer);
    return () => window.removeEventListener("pointermove", handlePointer);
  }, []);

  const positions = useMemo(() => {
    const count = 560;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const radius = 4 + Math.random() * 11;
      const angle = Math.random() * Math.PI * 2;
      data[i * 3] = Math.cos(angle) * radius;
      data[i * 3 + 1] = (Math.random() - 0.5) * 13;
      data[i * 3 + 2] = Math.sin(angle) * radius - 2;
    }
    return data;
  }, []);

  useFrame((_state, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.012;
    group.current.position.x = THREE.MathUtils.lerp(
      group.current.position.x,
      pointer.current.x * 0.45,
      0.025,
    );
    group.current.position.y = THREE.MathUtils.lerp(
      group.current.position.y,
      pointer.current.y * 0.3,
      0.025,
    );
  });

  return (
    <group ref={group}>
      <Points positions={positions} stride={3} frustumCulled={false}>
        <PointMaterial
          transparent
          color={AURA_HEX[aura]}
          size={0.045}
          sizeAttenuation
          depthWrite={false}
          opacity={0.55}
          blending={THREE.AdditiveBlending}
        />
      </Points>
    </group>
  );
}

function SpectralRelic({ aura }: { aura: AuraState }) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Group>(null);
  const wireMat = useRef<THREE.MeshBasicMaterial>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);

  const target = useMemo(() => new THREE.Color(AURA_HEX[aura]), [aura]);
  const current = useRef(new THREE.Color(AURA_HEX[aura]));

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    current.current.lerp(target, 0.045);

    if (group.current) {
      group.current.rotation.y += delta * 0.07;
      group.current.rotation.x = Math.sin(t * 0.17) * 0.12;
      const pulse = 1 + Math.sin(t * (aura === "crimson" ? 4.6 : 1.7)) * 0.035;
      group.current.scale.setScalar(pulse * 1.55);
    }
    if (core.current) core.current.rotation.y -= delta * 0.22;

    wireMat.current?.color.copy(current.current);
    ringMat.current?.color.copy(current.current);
    if (coreMat.current) {
      coreMat.current.color.copy(current.current);
      coreMat.current.emissive.copy(current.current);
      coreMat.current.emissiveIntensity =
        0.65 + Math.sin(t * (aura === "crimson" ? 5 : 2)) * 0.35;
    }
    if (light.current) {
      light.current.color.copy(current.current);
      light.current.intensity = aura === "crimson" ? 9 : 5.5;
    }
  });

  return (
    <group ref={group} position={[0, 0.1, -2.2]}>
      <mesh>
        <icosahedronGeometry args={[1.8, 1]} />
        <meshBasicMaterial
          ref={wireMat}
          color={AURA_HEX[aura]}
          wireframe
          transparent
          opacity={0.13}
          depthWrite={false}
        />
      </mesh>
      <group ref={core} scale={0.58}>
        <mesh>
          <icosahedronGeometry args={[1.8, 0]} />
          <meshStandardMaterial
            ref={coreMat}
            color={AURA_HEX[aura]}
            emissive={AURA_HEX[aura]}
            emissiveIntensity={0.9}
            metalness={0.72}
            roughness={0.26}
            transparent
            opacity={0.24}
            depthWrite={false}
          />
        </mesh>
      </group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.35, 0.008, 8, 120]} />
        <meshBasicMaterial
          ref={ringMat}
          color={AURA_HEX[aura]}
          transparent
          opacity={0.3}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.4, 0.4, 0]}>
        <torusGeometry args={[2.85, 0.004, 8, 120]} />
        <meshBasicMaterial
          color={AURA_HEX[aura]}
          transparent
          opacity={0.16}
          depthWrite={false}
        />
      </mesh>
      <pointLight ref={light} color={AURA_HEX[aura]} intensity={6} distance={14} />
    </group>
  );
}

function Atmosphere({ aura }: { aura: AuraState }) {
  return (
    <>
      <ambientLight intensity={0.28} />
      <SpectralEmbers aura={aura} />
      <SpectralRelic aura={aura} />
      <Sparkles
        count={80}
        scale={[22, 14, 12]}
        size={1.7}
        speed={0.28}
        opacity={0.22}
        color={AURA_HEX[aura]}
        noise={0.7}
      />
    </>
  );
}

export function HorrorBackdrop({ aura }: { aura: AuraState }) {
  return (
    <Canvas
      className="pointer-events-none"
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
      camera={{ position: [0, 0, 9.5], fov: 50 }}
      dpr={[1, 1.6]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => gl.setClearColor(0x040408, 0)}
    >
      <fog attach="fog" args={["#040408", 10, 32]} />
      <Atmosphere aura={aura} />
    </Canvas>
  );
}
