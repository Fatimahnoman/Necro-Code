"use client";

import { Line, OrbitControls, Sparkles } from "@react-three/drei";
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

const LABEL_OFFSET = new THREE.Vector3(0, -0.88, 0);
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
/** Seal ring radius × hover scale + float amplitude. */
const SEAL_REACH = 0.82;
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
  pending: "#4B5563",
  active: "#A855F7",
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
      className="flex w-max max-w-[var(--label-max,176px)] items-center justify-center gap-1.5 rounded-md border border-white/15 bg-[#0a0b14]/90 px-2 py-1 text-center font-mono text-[12px] font-medium uppercase leading-tight tracking-[0.08em] text-zinc-200 backdrop-blur-md"
      style={{
        borderColor: `${color}66`,
        color: status === "pending" ? "#E5E7EB" : color,
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
  const [hovered, setHovered] = useState(false);
  const targetScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const color = STATUS_HEX[status];
  const lit = status === "active" || status === "error";

  useEffect(() => {
    return () => {
      document.body.style.cursor = "auto";
    };
  }, []);

  useFrame((state, delta) => {
    if (nodeRef.current) {
      const group = nodeRef.current;
      const t = state.clock.elapsedTime;
      group.position.y = position[1] + Math.sin(t * 1.45 + position[0]) * 0.065;
      const desired = hovered || selected ? 1.16 : 1;
      targetScale.setScalar(desired);
      group.scale.lerp(targetScale, 0.12);
    }
    if (spinGroup.current) {
      spinGroup.current.rotation.y += delta * (lit ? 0.85 : 0.22);
    }
  });

  return (
    <group ref={nodeRef} position={position}>
      <group ref={spinGroup}>
        <mesh
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
          <icosahedronGeometry args={[0.48, 1]} />
          <meshStandardMaterial
            color={status === "pending" ? "#111827" : color}
            emissive={color}
            emissiveIntensity={status === "pending" ? 0.08 : 1.15}
            metalness={0.58}
            roughness={0.3}
            wireframe={status === "pending"}
            transparent
            opacity={0.96}
          />
        </mesh>
        <mesh scale={0.62}>
          <octahedronGeometry args={[0.48, 0]} />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={status === "pending" ? 0.18 : 0.65}
            depthWrite={false}
          />
        </mesh>
        <pointLight
          color={color}
          intensity={lit ? 4.2 : 1.15}
          distance={3.6}
        />
      </group>

      {selected && (
        <mesh>
          <torusGeometry args={[0.64, 0.009, 8, 72]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} />
        </mesh>
      )}
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
        <meshBasicMaterial color="#06060c" />
      </mesh>
      <mesh position={[0.25, 0.17, 0.72]} scale={[0.17, 0.11, 0.06]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#06060c" />
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
        <meshBasicMaterial color="#06060c" />
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

function FlowOrb({
  from,
  to,
  color,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const a = useMemo(() => new THREE.Vector3(from[0], from[1], from[2]), [from]);
  const b = useMemo(() => new THREE.Vector3(to[0], to[1], to[2]), [to]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime * 0.55) % 1;
    ref.current.position.lerpVectors(a, b, t);
    const material = ref.current.material as THREE.MeshBasicMaterial;
    material.opacity = 0.55 + Math.sin(t * Math.PI) * 0.45;
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 10, 10]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
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
      {flowing && <FlowOrb from={POSITIONS[from]} to={POSITIONS[to]} color={color} />}
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

      <CentralRelic aura={aura} />

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
        onCreated={({ gl }) => gl.setClearColor(0x06060c, 0)}
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
