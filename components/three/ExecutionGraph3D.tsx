"use client";

import { Line, OrbitControls, PointMaterial, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { AURA_HEX, type AuraState } from "@/lib/aura";
import { installThreeConsoleGuard } from "@/lib/three-runtime";
import type { NodeStatus, StageDef, StageId } from "@/lib/types";
import { WORKFLOW_STAGES } from "@/lib/types";

installThreeConsoleGuard();

type NodeStatusMap = Record<StageId, NodeStatus>;
type NodeRefMap = Record<StageId, MutableRefObject<THREE.Group | null>>;
type LabelRefMap = Partial<Record<StageId, HTMLDivElement | null>>;

const LABEL_OFFSET = new THREE.Vector3(0, -1.12, 0);
const BADGE_OFFSET = new THREE.Vector3(0.52, 0.5, 0);

/** Seal orbit: half-width / half-height of the ritual square (local units). */
const ORBIT_X = 2.75;
const ORBIT_Y = 1.58;

const POSITIONS: Record<StageId, [number, number, number]> = {
  input_code: [-ORBIT_X, ORBIT_Y, 0],
  glitch_scanner: [ORBIT_X, ORBIT_Y, 0],
  exorcism_reasoning: [ORBIT_X, -ORBIT_Y, 0],
  clean_code_output: [-ORBIT_X, -ORBIT_Y, 0],
};

const CAMERA_Z = 6.0;
const CAMERA_FOV = 45;
const MAX_GRAPH_SCALE = 1.15;
const MIN_GRAPH_SCALE = 0.4;
/** Stained-glass disc radius (0.86) × hover scale (1.16) + float amplitude. */
const SEAL_REACH = 1.07;

/** Stained-glass rose disc behind each seal. */
const GLASS_PANES = 12;
const GLASS_INNER = 0.56;
const GLASS_OUTER = 0.86;
/** Half the height of a projected stage label (up to two 12px lines), in px. */
const LABEL_HALF_HEIGHT_PX = 20;
/** Gap kept between labels and the canvas edge, in px. */
const EDGE_GAP_PX = 8;

export function labelMaxPx(width: number): number {
  return Math.min(176, Math.max(112, width * 0.3));
}

/**
 * Largest graph scale (capped at `MAX_GRAPH_SCALE`) that keeps the seals,
 * their HTML labels, and the reserved HUD strips inside the canvas, plus the
 * vertical offset that centres the graph between those strips.
 */
export function fitGraph(
  width: number,
  height: number,
  reserveTopPx: number,
  reserveBottomPx: number,
): { scale: number; offsetY: number } {
  const h = Math.max(height, 1);
  const halfH = CAMERA_Z * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
  const halfW = halfH * (Math.max(width, 1) / h);
  const unitsPerPx = (2 * halfH) / h;

  const top = halfH - reserveTopPx * unitsPerPx;
  const bottom = -halfH + (reserveBottomPx + LABEL_HALF_HEIGHT_PX) * unitsPerPx;
  const localTop = ORBIT_Y + SEAL_REACH;
  const localBottom = ORBIT_Y - LABEL_OFFSET.y;
  const byHeight = (top - bottom) / (localTop + localBottom);

  // Labels are clamped inside the canvas by LabelProjector, so only the
  // seals bound the width.
  const edge = EDGE_GAP_PX * unitsPerPx;
  const byWidth = (halfW - edge) / (ORBIT_X + SEAL_REACH);

  const scale = Math.min(
    MAX_GRAPH_SCALE,
    Math.max(MIN_GRAPH_SCALE, Math.min(byHeight, byWidth)),
  );
  const offsetY = (top + bottom) / 2 - (scale * (localTop - localBottom)) / 2;
  return { scale, offsetY };
}

const EDGES: Array<[StageId, StageId]> = [
  ["input_code", "glitch_scanner"],
  ["glitch_scanner", "exorcism_reasoning"],
  ["exorcism_reasoning", "clean_code_output"],
  ["clean_code_output", "input_code"],
];

const STATUS_HEX: Record<NodeStatus, string> = {
  pending: "#6B5E45",
  active: "#9D4EDD",
  done: "#00FF66",
  error: "#FF003C",
};

function StageLabel({
  stage,
  status,
  selected,
}: {
  stage: StageDef;
  status: NodeStatus;
  selected: boolean;
}) {
  const color = STATUS_HEX[status];

  return (
    <div
      className="flex w-max max-w-[var(--label-max,176px)] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-[#0a0b14]/90 px-2 py-1 text-center font-display text-[12px] font-bold uppercase leading-tight tracking-[0.08em] text-bone backdrop-blur-md"
      style={{
        borderColor: `${color}66`,
        color: status === "pending" ? "#E2D9C8" : color,
        boxShadow:
          status === "pending"
            ? "none"
            : selected
              ? `0 0 24px ${color}55, inset 0 0 18px ${color}18`
              : `0 0 18px ${color}33, inset 0 0 18px ${color}14`,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span>{stage.label}</span>
    </div>
  );
}

function StageNode3D({
  position,
  status,
  selected,
  onSelect,
  nodeRef,
}: {
  position: [number, number, number];
  status: NodeStatus;
  selected: boolean;
  onSelect: () => void;
  nodeRef: MutableRefObject<THREE.Group | null>;
}) {
  const spinGroup = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const haloA = useRef<THREE.Mesh>(null);
  const glass = useRef<THREE.Group>(null);
  const deepColor = useMemo(
    () => `#${new THREE.Color(STATUS_HEX[status]).multiplyScalar(0.45).getHexString()}`,
    [status],
  );
  const leading = useMemo(() => {
    // Gold "lead came" between panes: 12 radial bars + inner/outer rims.
    const positions: number[] = [];
    for (let i = 0; i < GLASS_PANES; i++) {
      const angle = (i / GLASS_PANES) * Math.PI * 2;
      positions.push(
        Math.cos(angle) * GLASS_INNER, Math.sin(angle) * GLASS_INNER, 0,
        Math.cos(angle) * GLASS_OUTER, Math.sin(angle) * GLASS_OUTER, 0,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);
  useEffect(() => () => leading.dispose(), [leading]);
  const [hovered, setHovered] = useState(false);
  const targetScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const color = STATUS_HEX[status];
  const pending = status === "pending";
  const lit = status === "active" || status === "error";

  // Faceted crystal edges, shared by the outline of this seal.
  const crystalEdges = useMemo(() => {
    const source = new THREE.OctahedronGeometry(0.5, 0);
    const edges = new THREE.EdgesGeometry(source);
    source.dispose();
    return edges;
  }, []);
  useEffect(() => () => crystalEdges.dispose(), [crystalEdges]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (nodeRef.current) {
      const group = nodeRef.current;
      group.position.y = position[1] + Math.sin(t * 1.45 + position[0]) * 0.065;
      const desired = hovered || selected ? 1.16 : 1;
      targetScale.setScalar(desired);
      group.scale.lerp(targetScale, 0.12);
    }
    if (spinGroup.current) {
      spinGroup.current.rotation.y += delta * (lit ? 0.85 : 0.22);
    }
    if (core.current) {
      const beat = lit ? 1 + Math.sin(t * (status === "error" ? 9 : 5)) * 0.22 : 1;
      core.current.scale.setScalar(beat);
    }
    if (haloA.current) {
      haloA.current.rotation.x += delta * (lit ? 1.1 : 0.35);
      haloA.current.rotation.y += delta * 0.4;
    }
    if (glass.current) {
      const pulse = pending ? 0.14 : 0.42 + Math.sin(t * (lit ? 4.2 : 1.6)) * 0.16;
      glass.current.children.forEach((child) => {
        const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
        if (material && material.userData.pane) material.opacity = pulse;
      });
    }
  });

  return (
    <group ref={nodeRef} position={position}>
      <group ref={spinGroup}>
        {/* Faceted obsidian crystal (the click target). */}
        <mesh
          scale={[1, 1.25, 1]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          onPointerOver={(event) => {
            event.stopPropagation();
            setHovered(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHovered(false);
            document.body.style.cursor = "auto";
          }}
        >
          <octahedronGeometry args={[0.5, 0]} />
          <meshStandardMaterial
            color="#0b0a10"
            emissive={color}
            emissiveIntensity={pending ? 0.05 : 0.32}
            metalness={0.92}
            roughness={0.16}
            flatShading
            transparent
            opacity={0.9}
          />
        </mesh>
        <lineSegments geometry={crystalEdges} scale={[1.005, 1.256, 1.005]}>
          <lineBasicMaterial
            color={color}
            transparent
            opacity={pending ? 0.35 : 0.95}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
        {/* Glowing core shard. */}
        <mesh ref={core}>
          <icosahedronGeometry args={[0.19, 0]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={pending ? 0.3 : 1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <pointLight
          color={color}
          intensity={lit ? 4.2 : pending ? 0.6 : 1.6}
          distance={3.6}
        />
      </group>

      {/* Rotating energy halos. */}
      <mesh ref={haloA}>
        <torusGeometry args={[0.7, 0.008, 6, 72]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={pending ? 0.14 : selected ? 1 : 0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Stained-glass rose disc behind the crystal (faces the camera). */}
      <group ref={glass} position={[0, 0, -0.16]}>
        {Array.from({ length: GLASS_PANES }, (_, index) => (
          <mesh key={index}>
            <ringGeometry
              args={[
                GLASS_INNER,
                GLASS_OUTER,
                4,
                1,
                (index / GLASS_PANES) * Math.PI * 2,
                (Math.PI * 2) / GLASS_PANES,
              ]}
            />
            <meshBasicMaterial
              color={index % 2 === 0 ? color : deepColor}
              transparent
              opacity={pending ? 0.14 : 0.42}
              depthWrite={false}
              side={THREE.DoubleSide}
              userData={{ pane: true }}
            />
          </mesh>
        ))}
        <lineSegments geometry={leading}>
          <lineBasicMaterial color="#A89C82" transparent opacity={0.75} depthWrite={false} />
        </lineSegments>
        <mesh>
          <torusGeometry args={[GLASS_OUTER, 0.018, 6, 64]} />
          <meshBasicMaterial color="#A89C82" transparent opacity={0.85} depthWrite={false} />
        </mesh>
        <mesh>
          <torusGeometry args={[GLASS_INNER, 0.012, 6, 48]} />
          <meshBasicMaterial color="#A89C82" transparent opacity={0.7} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

function LabelProjector({
  nodeRefs,
  labelRefs,
  badgeRef,
  bugCount,
}: {
  nodeRefs: NodeRefMap;
  labelRefs: MutableRefObject<LabelRefMap>;
  badgeRef: MutableRefObject<HTMLDivElement | null>;
  bugCount: number;
}) {
  const { camera, size } = useThree();
  const world = useMemo(() => new THREE.Vector3(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const inset = size.width < 600 ? 14 : 0;
    const labelMax = labelMaxPx(size.width);
    const labelMaxValue = `${labelMax}px`;

    for (const stage of WORKFLOW_STAGES) {
      const node = nodeRefs[stage.id].current;
      const element = labelRefs.current[stage.id];
      if (!node || !element) continue;

      if (element.style.getPropertyValue("--label-max") !== labelMaxValue) {
        element.style.setProperty("--label-max", labelMaxValue);
      }

      world.copy(LABEL_OFFSET);
      node.localToWorld(world);
      projected.copy(world).project(camera);

      const inward =
        stage.id === "glitch_scanner" || stage.id === "exorcism_reasoning"
          ? -1
          : 1;
      const rawX = (projected.x * 0.5 + 0.5) * size.width + inward * inset;
      // Keep the whole label inside the canvas, however the graph is orbited.
      const halfLabel = element.offsetWidth / 2;
      const x = Math.min(
        size.width - EDGE_GAP_PX - halfLabel,
        Math.max(EDGE_GAP_PX + halfLabel, rawX),
      );
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      element.style.opacity = projected.z > 1 ? "0" : "1";
    }

    const scanner = nodeRefs.glitch_scanner.current;
    if (badgeRef.current && scanner) {
      world.copy(BADGE_OFFSET);
      scanner.localToWorld(world);
      projected.copy(world).project(camera);

      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      badgeRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      badgeRef.current.style.opacity =
        bugCount > 0 && projected.z <= 1 ? "1" : "0";
    }
  });

  return null;
}

function CentralRelic({ aura }: { aura: AuraState }) {
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Group>(null);
  const wireMat = useRef<THREE.MeshBasicMaterial>(null);
  const coreMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const rimMat = useRef<THREE.MeshBasicMaterial>(null);
  const innerWireMat = useRef<THREE.MeshBasicMaterial>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const light = useRef<THREE.PointLight>(null);
  const rimLight = useRef<THREE.PointLight>(null);

  const coreEdges = useMemo(() => {
    const source = new THREE.DodecahedronGeometry(0.96, 0);
    const edges = new THREE.EdgesGeometry(source);
    source.dispose();
    return edges;
  }, []);
  useEffect(() => () => coreEdges.dispose(), [coreEdges]);

  const targetColor = useMemo(() => new THREE.Color(AURA_HEX[aura]), [aura]);
  const currentColor = useRef(new THREE.Color(AURA_HEX[aura]));

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    currentColor.current.lerp(targetColor, 0.055);

    if (group.current) {
      group.current.rotation.y += delta * 0.26;
      const pulse =
        1 +
        Math.sin(t * (aura === "crimson" ? 6.2 : aura === "green" ? 2.3 : 3.4)) *
          (aura === "crimson" ? 0.065 : 0.035);
      group.current.scale.setScalar(pulse);
    }
    if (core.current) core.current.rotation.y -= delta * 0.48;

    wireMat.current?.color.copy(currentColor.current);
    ringMat.current?.color.copy(currentColor.current);
    rimMat.current?.color.copy(currentColor.current);
    innerWireMat.current?.color.copy(currentColor.current);
    edgeMat.current?.color.copy(currentColor.current);
    if (rimMat.current) {
      rimMat.current.opacity = 0.14 + (Math.sin(t * 1.7) * 0.5 + 0.5) * 0.12;
    }
    if (coreMat.current) {
      coreMat.current.color.copy(currentColor.current);
      coreMat.current.emissive.copy(currentColor.current);
      coreMat.current.emissiveIntensity =
        0.95 +
        Math.sin(t * (aura === "crimson" ? 5.4 : 2.2)) * (aura === "crimson" ? 0.55 : 0.3);
    }
    if (light.current) {
      light.current.color.copy(currentColor.current);
      light.current.intensity = aura === "crimson" ? 18 : 11;
    }
    if (rimLight.current) {
      rimLight.current.color.copy(currentColor.current);
    }
  });

  return (
    <group ref={group}>
      <mesh>
        <icosahedronGeometry args={[0.96, 1]} />
        <meshBasicMaterial
          ref={wireMat}
          color={AURA_HEX[aura]}
          wireframe
          transparent
          opacity={0.62}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Hologram rim: back faces glow at the silhouette edge. */}
      <mesh scale={1.08}>
        <icosahedronGeometry args={[0.96, 1]} />
        <meshBasicMaterial
          ref={rimMat}
          color={AURA_HEX[aura]}
          side={THREE.BackSide}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <group ref={core} scale={0.64}>
        {/* Inner counter-rotating wireframe lattice. */}
        <mesh scale={0.78}>
          <icosahedronGeometry args={[0.96, 1]} />
          <meshBasicMaterial
            ref={innerWireMat}
            color={AURA_HEX[aura]}
            wireframe
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <lineSegments geometry={coreEdges}>
          <lineBasicMaterial
            ref={edgeMat}
            color={AURA_HEX[aura]}
            transparent
            opacity={0.95}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
        <mesh>
          <dodecahedronGeometry args={[0.96, 0]} />
          <meshStandardMaterial
            ref={coreMat}
            color={AURA_HEX[aura]}
            emissive={AURA_HEX[aura]}
            emissiveIntensity={1.15}
            metalness={0.68}
            roughness={0.2}
            transparent
            opacity={0.42}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Skull sockets + glowing pupils */}
      <mesh position={[-0.25, 0.17, 0.72]} scale={[0.17, 0.11, 0.06]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#040408" />
      </mesh>
      <mesh position={[0.25, 0.17, 0.72]} scale={[0.17, 0.11, 0.06]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#040408" />
      </mesh>
      <mesh position={[-0.25, 0.17, 0.77]} scale={[0.048, 0.048, 0.02]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={AURA_HEX[aura]} />
      </mesh>
      <mesh position={[0.25, 0.17, 0.77]} scale={[0.048, 0.048, 0.02]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={AURA_HEX[aura]} />
      </mesh>
      <mesh position={[0, -0.1, 0.75]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.06, 0.16, 3]} />
        <meshBasicMaterial color="#040408" />
      </mesh>

      <pointLight
        ref={light}
        color={AURA_HEX[aura]}
        intensity={12}
        distance={7.5}
      />
      {/* Sharp rim lights behind the relic so its edges catch light. */}
      <pointLight
        ref={rimLight}
        position={[1.4, 1.1, -1.3]}
        color={AURA_HEX[aura]}
        intensity={9}
        distance={4.5}
      />
      <pointLight
        position={[-1.4, -0.9, -1.2]}
        color={AURA_HEX.purple}
        intensity={6}
        distance={4.5}
      />

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.34, 0.008, 8, 128]} />
        <meshBasicMaterial
          ref={ringMat}
          color={AURA_HEX[aura]}
          transparent
          opacity={0.46}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2.2, 0.35, 0]}>
        <torusGeometry args={[1.62, 0.004, 8, 128]} />
        <meshBasicMaterial
          color={AURA_HEX[aura]}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>

      <Sparkles
        count={34}
        scale={3.2}
        size={1.8}
        speed={0.35}
        opacity={0.5}
        color={AURA_HEX[aura]}
        noise={0.8}
      />
    </group>
  );
}

/**
 * Particle stream along a conduit. Positions are rewritten every frame into
 * one preallocated buffer (no per-frame allocation).
 */
function ConduitStream({
  from,
  to,
  color,
  count,
  speed,
  opacity,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  count: number;
  speed: number;
  opacity: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    return geo;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  // Unit normal in the graph plane, for a slight sinuous wobble.
  const nx = -dy / len;
  const ny = dx / len;

  useFrame((state) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const p = (t * speed + i / count) % 1;
      const wobble = Math.sin(p * Math.PI * 4 + t * 3 + i) * 0.045;
      array[i * 3] = from[0] + dx * p + nx * wobble;
      array[i * 3 + 1] = from[1] + dy * p + ny * wobble;
      array[i * 3 + 2] = from[2] + Math.sin(p * Math.PI) * 0.12;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <PointMaterial
        transparent
        color={color}
        size={0.11}
        sizeAttenuation
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function Segment({
  from,
  to,
  nodes,
  activeStage,
}: {
  from: StageId;
  to: StageId;
  nodes: NodeStatusMap;
  activeStage: StageId | null;
}) {
  const fromStatus = nodes[from];
  const toStatus = nodes[to];
  const color =
    toStatus === "error"
      ? AURA_HEX.crimson
      : toStatus === "done"
        ? AURA_HEX.green
        : toStatus === "active"
          ? AURA_HEX.purple
          : fromStatus === "done"
            ? AURA_HEX.green
            : "#374151";
  const lit = fromStatus !== "pending" || toStatus !== "pending";
  const flowing =
    toStatus === "active" ||
    activeStage === to ||
    (fromStatus === "done" && toStatus === "pending");

  return (
    <>
      <Line
        points={[POSITIONS[from], POSITIONS[to]]}
        color={color}
        lineWidth={lit ? 1.65 : 0.75}
        transparent
        opacity={lit ? 0.62 : 0.18}
        depthWrite={false}
      />
      {lit && (
        <ConduitStream
          from={POSITIONS[from]}
          to={POSITIONS[to]}
          color={color}
          count={flowing ? 14 : 6}
          speed={flowing ? 0.5 : 0.16}
          opacity={flowing ? 0.95 : 0.45}
        />
      )}
    </>
  );
}

/** Radial rune ticks (varying lengths) for one altar ring, as line segments. */
function runeTicks(count: number, inner: number, outer: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    // Deterministic rune rhythm: long, short, short, medium.
    const reach = [1, 0.45, 0.45, 0.72][i % 4];
    const r2 = inner + (outer - inner) * reach;
    positions.set(
      [Math.cos(angle) * inner, Math.sin(angle) * inner, 0, Math.cos(angle) * r2, Math.sin(angle) * r2, 0],
      i * 6,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Summoning-altar floor beneath the relic: concentric glowing rune rings,
 * tilted toward the floor and counter-rotating. Colors lerp to the aura.
 */
function AltarRings({ aura }: { aura: AuraState }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const materials = useRef<Array<THREE.MeshBasicMaterial | THREE.LineBasicMaterial | null>>([]);
  // Outer sigils burn ruby, inner sigils violet; both lean 25% toward the aura.
  const crimson = useMemo(() => new THREE.Color("#E0115F"), []);
  const violet = useMemo(() => new THREE.Color("#7B2CBF"), []);
  const auraColor = useMemo(() => new THREE.Color(AURA_HEX[aura]), [aura]);
  const outerTarget = useMemo(() => crimson.clone().lerp(auraColor, 0.25), [auraColor, crimson]);
  const innerTarget = useMemo(() => violet.clone().lerp(auraColor, 0.25), [auraColor, violet]);
  const outerColor = useRef(new THREE.Color("#E0115F"));
  const innerColor = useRef(new THREE.Color("#7B2CBF"));

  const outerTicks = useMemo(() => runeTicks(72, 1.62, 1.86), []);
  const innerTicks = useMemo(() => runeTicks(36, 1.06, 1.24), []);
  useEffect(
    () => () => {
      outerTicks.dispose();
      innerTicks.dispose();
    },
    [innerTicks, outerTicks],
  );

  useFrame((state, delta) => {
    outerColor.current.lerp(outerTarget, 0.05);
    innerColor.current.lerp(innerTarget, 0.05);
    const breathe = 0.85 + Math.sin(state.clock.elapsedTime * 1.6) * 0.15;
    materials.current.forEach((material, index) => {
      if (!material) return;
      material.color.copy(index < 3 ? outerColor.current : innerColor.current).multiplyScalar(breathe);
    });
    if (outer.current) outer.current.rotation.z += delta * 0.12;
    if (inner.current) inner.current.rotation.z -= delta * 0.2;
  });

  const bind = (index: number) => (material: THREE.MeshBasicMaterial | THREE.LineBasicMaterial | null) => {
    materials.current[index] = material;
  };

  const glow = {
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  } as const;

  return (
    <group position={[0, -0.92, -0.6]} rotation={[-1.12, 0, 0]}>
      <group ref={outer}>
        <mesh>
          <ringGeometry args={[1.9, 1.94, 128]} />
          <meshBasicMaterial ref={bind(0)} {...glow} opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <ringGeometry args={[1.56, 1.59, 128]} />
          <meshBasicMaterial ref={bind(1)} {...glow} opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
        <lineSegments geometry={outerTicks}>
          <lineBasicMaterial ref={bind(2)} {...glow} opacity={0.6} />
        </lineSegments>
      </group>
      <group ref={inner}>
        <mesh>
          <ringGeometry args={[1.28, 1.3, 96]} />
          <meshBasicMaterial ref={bind(3)} {...glow} opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
        <lineSegments geometry={innerTicks}>
          <lineBasicMaterial ref={bind(4)} {...glow} opacity={0.55} />
        </lineSegments>
        {/* Inner sigil: a triangle inscribed in the ring. */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <ringGeometry args={[0.98, 1.0, 3]} />
          <meshBasicMaterial ref={bind(5)} {...glow} opacity={0.35} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

const SHOCKWAVE_POOL = 3;
const SHOCKWAVE_SECONDS = 1.3;
const PULSE_SECONDS = 1.2;
const PULSE_ZOOM = 0.08;

/**
 * Ritual effects: a shockwave ring expands from the relic whenever the aura
 * changes (and when a run starts), and the camera does a short zoom pulse
 * when a run starts. Both are skipped under `prefers-reduced-motion`.
 */
function RitualFx({ running, aura }: { running: boolean; aura: AuraState }) {
  const { camera } = useThree();
  const waves = useRef<Array<THREE.Mesh | null>>([]);
  const starts = useRef<number[]>(Array(SHOCKWAVE_POOL).fill(-Infinity));
  const nextWave = useRef(0);
  const pulseStart = useRef(-Infinity);
  const clockNow = useRef(0);
  const reduced = useRef(false);
  const prevRunning = useRef(running);
  const prevAura = useRef(aura);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const fireWave = (hex: string) => {
    if (reduced.current) return;
    const index = nextWave.current;
    nextWave.current = (index + 1) % SHOCKWAVE_POOL;
    starts.current[index] = clockNow.current;
    const mesh = waves.current[index];
    if (mesh) (mesh.material as THREE.MeshBasicMaterial).color.set(hex);
  };

  useEffect(() => {
    if (running && !prevRunning.current && !reduced.current) {
      pulseStart.current = clockNow.current;
      fireWave(AURA_HEX[aura]);
    }
    prevRunning.current = running;
    // Only the rising edge of `running` matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  useEffect(() => {
    if (aura !== prevAura.current && aura !== "idle") fireWave(AURA_HEX[aura]);
    prevAura.current = aura;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aura]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    clockNow.current = t;

    waves.current.forEach((mesh, index) => {
      if (!mesh) return;
      const p = (t - starts.current[index]) / SHOCKWAVE_SECONDS;
      const alive = p >= 0 && p < 1;
      mesh.visible = alive;
      if (!alive) return;
      mesh.scale.setScalar(0.7 + p * 3.4);
      (mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * (1 - p) * 0.9;
    });

    const perspective = camera as THREE.PerspectiveCamera;
    if (!perspective.isPerspectiveCamera) return;
    const p = (t - pulseStart.current) / PULSE_SECONDS;
    const zoom = p >= 0 && p < 1 ? 1 + Math.sin(p * Math.PI) * PULSE_ZOOM : 1;
    if (perspective.zoom !== zoom) {
      perspective.zoom = zoom;
      perspective.updateProjectionMatrix();
    }
  });

  return (
    <>
      {Array.from({ length: SHOCKWAVE_POOL }, (_, index) => (
        <mesh
          key={index}
          visible={false}
          ref={(mesh) => {
            waves.current[index] = mesh;
          }}
        >
          <ringGeometry args={[0.92, 1, 96]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}

/** Central skull scale on the altar (the relic's own pulse runs inside). */
const RELIC_SCALE = 1.18;
const EMBER_COUNT = 64;

/**
 * Dark flames around the skull: ember particles spiral upward, tapering in
 * like a flame, with a flickering hellfire light beneath. Two clouds (ruby
 * and ember orange); positions reuse one buffer per cloud.
 */
function EmberCloud({ color, seed, size }: { color: string; seed: number; size: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(EMBER_COUNT * 3), 3));
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Deterministic per-particle phase, angle, and speed.
  const params = useMemo(
    () =>
      Array.from({ length: EMBER_COUNT }, (_, i) => {
        const h = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
        const r = h - Math.floor(h);
        return { phase: r, angle: r * Math.PI * 2 + i, speed: 0.22 + r * 0.25 };
      }),
    [seed],
  );

  useFrame((state) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = state.clock.elapsedTime;
    params.forEach((particle, i) => {
      const life = (t * particle.speed + particle.phase) % 1;
      const radius = 1.05 * (1 - life * 0.75) + Math.sin(t * 3 + i) * 0.04;
      const angle = particle.angle + t * 0.6 + life * 2.2;
      array[i * 3] = Math.cos(angle) * radius;
      array[i * 3 + 1] = -0.95 + life * 2.6;
      array[i * 3 + 2] = Math.sin(angle) * radius * 0.6;
    });
    attribute.needsUpdate = true;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <PointMaterial
        transparent
        color={color}
        size={size}
        sizeAttenuation
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function RelicEmbers() {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (!light.current) return;
    const t = state.clock.elapsedTime;
    light.current.intensity = 5 + Math.sin(t * 11) * 1.2 + Math.sin(t * 17.3) * 0.8;
  });
  return (
    <>
      <EmberCloud color="#FF2A4D" seed={1} size={0.08} />
      <EmberCloud color="#FF7A1A" seed={2} size={0.06} />
      <pointLight ref={light} position={[0, -0.9, 0.4]} color="#FF4A1A" intensity={5} distance={4} />
    </>
  );
}

function Graph({
  nodes,
  activeStage,
  bugCount,
  aura,
  selected,
  onSelect,
  nodeRefs,
  labelRefs,
  badgeRef,
  reserveTopPx,
  reserveBottomPx,
  running,
}: {
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  bugCount: number;
  aura: AuraState;
  selected: StageId | null;
  onSelect: (stage: StageId) => void;
  nodeRefs: NodeRefMap;
  labelRefs: MutableRefObject<LabelRefMap>;
  badgeRef: MutableRefObject<HTMLDivElement | null>;
  reserveTopPx: number;
  reserveBottomPx: number;
  running: boolean;
}) {
  const { size } = useThree();
  const { scale, offsetY } = fitGraph(
    size.width,
    size.height,
    reserveTopPx,
    reserveBottomPx,
  );

  return (
    <group scale={scale} position={[0, offsetY, 0]}>
      <mesh position={[0, 0, -1.4]}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color={AURA_HEX[aura]}
          transparent
          opacity={0.035}
          depthWrite={false}
        />
      </mesh>

      <Sparkles
        count={46}
        scale={[7.5, 5.5, 4]}
        size={1.5}
        speed={0.22}
        opacity={0.25}
        color={AURA_HEX[aura]}
        noise={0.65}
      />

      <AltarRings aura={aura} />
      <group scale={RELIC_SCALE}>
        <CentralRelic aura={aura} />
        <RelicEmbers />
      </group>
      <RitualFx running={running} aura={aura} />

      {EDGES.map(([from, to]) => (
        <Segment
          key={`${from}-${to}`}
          from={from}
          to={to}
          nodes={nodes}
          activeStage={activeStage}
        />
      ))}

      {WORKFLOW_STAGES.map((stage) => (
        <StageNode3D
          key={stage.id}
          position={POSITIONS[stage.id]}
          status={nodes[stage.id]}
          selected={selected === stage.id}
          onSelect={() => onSelect(stage.id)}
          nodeRef={nodeRefs[stage.id]}
        />
      ))}

      <LabelProjector
        nodeRefs={nodeRefs}
        labelRefs={labelRefs}
        badgeRef={badgeRef}
        bugCount={bugCount}
      />
    </group>
  );
}

export function ExecutionGraph3D({
  nodes,
  activeStage,
  bugCount,
  aura,
  selected,
  onSelect,
  onClear,
  reserveTopPx = 64,
  reserveBottomPx = 44,
  onContextLost,
  running = false,
}: {
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  bugCount: number;
  aura: AuraState;
  selected: StageId | null;
  onSelect: (stage: StageId) => void;
  onClear: () => void;
  /** Height of the HUD strip over the top of the canvas, in px. */
  reserveTopPx?: number;
  /** Height of the HUD strip (footer or timeline) over the bottom, in px. */
  reserveBottomPx?: number;
  /** Called if the browser drops the WebGL context (GPU reset, low memory). */
  onContextLost?: () => void;
  /** A ritual is streaming; its rising edge triggers the summoning pulse. */
  running?: boolean;
}) {
  const nodeRefs = useRef<NodeRefMap>({
    input_code: { current: null },
    glitch_scanner: { current: null },
    exorcism_reasoning: { current: null },
    clean_code_output: { current: null },
  });
  const labelRefs = useRef<LabelRefMap>({});
  const badgeRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 0.18, CAMERA_Z], fov: CAMERA_FOV }}
        dpr={[1, 1.8]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x040408, 0);
          gl.domElement.addEventListener(
            "webglcontextlost",
            () => onContextLost?.(),
            { once: true },
          );
        }}
        onPointerMissed={onClear}
        style={{ touchAction: "none" }}
      >
        <ambientLight intensity={0.5} />
        <pointLight
          position={[0, 0.4, 3.2]}
          intensity={aura === "crimson" ? 16 : 10}
          color={AURA_HEX[aura]}
          distance={12}
        />
        <Suspense fallback={null}>
          <Graph
            nodes={nodes}
            activeStage={activeStage}
            bugCount={bugCount}
            aura={aura}
            selected={selected}
            onSelect={onSelect}
            nodeRefs={nodeRefs.current}
            labelRefs={labelRefs}
            badgeRef={badgeRef}
            reserveTopPx={reserveTopPx}
            reserveBottomPx={reserveBottomPx}
            running={running}
          />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          rotateSpeed={0.55}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={(Math.PI * 2) / 3}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {WORKFLOW_STAGES.map((stage) => (
          <div
            key={stage.id}
            data-stage-label={stage.id}
            ref={(element) => {
              labelRefs.current[stage.id] = element;
            }}
            className="absolute left-0 top-0 opacity-0 transition-opacity duration-500 will-change-transform"
          >
            <StageLabel
              stage={stage}
              status={nodes[stage.id]}
              selected={selected === stage.id}
            />
          </div>
        ))}
        <div
          ref={badgeRef}
          data-bug-badge
          className="absolute left-0 top-0 opacity-0 transition-opacity duration-300 will-change-transform"
        >
          <div className="grid h-6 min-w-6 place-items-center rounded-full border border-crimson/60 bg-crimson px-1 font-mono text-[13px] font-bold text-black shadow-[0_0_22px_rgba(255,0,60,0.85)]">
            {bugCount}
          </div>
        </div>
      </div>
    </div>
  );
}
