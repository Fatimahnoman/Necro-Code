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

/** Banner anchor: the stone plaque under each window's glass. */
const LABEL_OFFSET = new THREE.Vector3(0, -0.64, 0.05);
const BADGE_OFFSET = new THREE.Vector3(0.52, 0.92, 0.05);

/** Seal orbit: half-width / half-height of the ritual square (local units). */
const ORBIT_X = 2.75;
const ORBIT_Y = 1.58;

const POSITIONS: Record<StageId, [number, number, number]> = {
  input_code: [-ORBIT_X, ORBIT_Y, 0],
  glitch_scanner: [ORBIT_X, ORBIT_Y, 0],
  exorcism_reasoning: [ORBIT_X, -ORBIT_Y, 0],
  clean_code_output: [-ORBIT_X, -ORBIT_Y, 0],
};

/** Seal centers pushed back to `CONDUIT_Z`, so conduits pass behind. */
const BACK_POSITIONS = Object.fromEntries(
  Object.entries(POSITIONS).map(([id, [x, y]]) => [id, [x, y, CONDUIT_Z]]),
) as Record<StageId, [number, number, number]>;

const CAMERA_Z = 6.0;
const CAMERA_FOV = 45;
const MAX_GRAPH_SCALE = 1.15;
const MIN_GRAPH_SCALE = 0.4;
/** Gothic lancet window seal (local units, centered on the seal). */
const WINDOW_HALF_W = 0.6;
const WINDOW_BOTTOM = -1.03;
const WINDOW_SPRING = 0.42;
const WINDOW_TOP = 1.03;
const GLASS_HALF_W = 0.46;
const GLASS_BOTTOM = -0.24;
const GLASS_SPRING = 0.36;
const GLASS_TOP = 0.9;
const WINDOW_HOVER_SCALE = 1.06;
/** Window extent incl. hover scale and float (0.04). */
const SEAL_HALF_W = WINDOW_HALF_W * WINDOW_HOVER_SCALE;
const SEAL_HALF_H = WINDOW_TOP * WINDOW_HOVER_SCALE + 0.04;
/** Banners sit inside the window plaque; allow a little overhang below it, in px. */
const LABEL_HALF_HEIGHT_PX = 10;

/** Tilted altar slab under the skull (local units). */
const ALTAR_Y = -1.05;
const ALTAR_W = 3.8;
const ALTAR_D = 2.6;
const ALTAR_H = 0.16;
const ALTAR_R = 1.22;
/** Conduits run behind the windows and the skull. */
const CONDUIT_Z = -0.9;
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
  const localTop = ORBIT_Y + SEAL_HALF_H;
  const localBottom = ORBIT_Y + SEAL_HALF_H;
  const byHeight = (top - bottom) / (localTop + localBottom);

  // Labels are clamped inside the canvas by LabelProjector, so only the
  // seals bound the width.
  const edge = EDGE_GAP_PX * unitsPerPx;
  const byWidth = (halfW - edge) / (ORBIT_X + SEAL_HALF_W);

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

/**
 * Gothic banner under a seal: a swallowtail pennant of carved stone with
 * brass edging. Line 1 is the stage title (Cinzel Decorative, status color);
 * line 2 is the live metadata from AgentCanvas (status · stage time).
 */
function StageLabel({
  stage,
  status,
  selected,
  meta,
}: {
  stage: StageDef;
  status: NodeStatus;
  selected: boolean;
  meta?: string;
}) {
  const color = STATUS_HEX[status];
  const glow =
    status === "pending"
      ? "drop-shadow(0 2px 4px rgba(0,0,0,0.8))"
      : `drop-shadow(0 0 ${selected ? 10 : 6}px ${color}88) drop-shadow(0 2px 4px rgba(0,0,0,0.8))`;

  return (
    // The filter lives on an unclipped wrapper so the glow survives clip-path.
    <div style={{ filter: glow }}>
      <div
        className="flex w-max max-w-[var(--label-max,176px)] flex-col items-center px-4 py-1 text-center [clip-path:polygon(0_0,100%_0,calc(100%-9px)_50%,100%_100%,0_100%,9px_50%)]"
        style={{
          background:
            "linear-gradient(180deg, rgba(26,18,24,0.96), rgba(10,7,11,0.96))",
          boxShadow: `inset 0 1.5px 0 #B08D57, inset 0 -1.5px 0 #5E4524, inset 0 0 14px ${color}33`,
        }}
      >
        <span
          className="flex items-center gap-1.5 font-brand text-[12px] font-bold uppercase leading-tight tracking-[0.06em]"
          style={{ color: status === "pending" ? "#E2D9C8" : color }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rotate-45"
            style={{ backgroundColor: color }}
          />
          {stage.label}
        </span>
        {meta && (
          <span className="mt-0.5 whitespace-nowrap font-mono text-[12px] leading-tight text-bone/80 tabular-nums">
            {meta}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Pointed (lancet) arch outline: straight jambs from `bottom` up to `spring`,
 * then two curves meeting at the apex `top`. Centered on x = 0.
 */
function archShape(halfWidth: number, bottom: number, spring: number, top: number): THREE.Shape {
  const shape = new THREE.Shape();
  const rise = spring + (top - spring) * 0.72;
  shape.moveTo(-halfWidth, bottom);
  shape.lineTo(halfWidth, bottom);
  shape.lineTo(halfWidth, spring);
  shape.quadraticCurveTo(halfWidth, rise, 0, top);
  shape.quadraticCurveTo(-halfWidth, rise, -halfWidth, spring);
  shape.lineTo(-halfWidth, bottom);
  return shape;
}

function outline(shape: THREE.Shape, z: number): Array<[number, number, number]> {
  return shape.getPoints(28).map((point) => [point.x, point.y, z]);
}

/** Stained-glass hue per stage (its identity); the live status rides on top. */
const SEAL_GLASS: Record<StageId, string> = {
  input_code: "#00C46A",
  glitch_scanner: "#9D4EDD",
  exorcism_reasoning: "#E0114B",
  clean_code_output: "#19E6A8",
};

/**
 * A stage seal as a tall Gothic lancet window: a carved stone frame with a
 * brass moulding, a pointed stained-glass light (stage hue, lead mullion and
 * transoms, a small rose roundel), a faceted crystal emblem in the live
 * status color, and a stone plaque below the glass where the DOM banner sits.
 * The stone frame is the click target.
 */
function StageNode3D({
  stageId,
  position,
  status,
  selected,
  onSelect,
  nodeRef,
}: {
  stageId: StageId;
  position: [number, number, number];
  status: NodeStatus;
  selected: boolean;
  onSelect: () => void;
  nodeRef: MutableRefObject<THREE.Group | null>;
}) {
  const crystal = useRef<THREE.Group>(null);
  const glassMat = useRef<THREE.MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const targetScale = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const statusColor = STATUS_HEX[status];
  const glassColor = status === "error" ? STATUS_HEX.error : SEAL_GLASS[stageId];
  const pending = status === "pending";
  const lit = status === "active" || status === "error";

  const shapes = useMemo(() => {
    const frame = archShape(WINDOW_HALF_W, WINDOW_BOTTOM, WINDOW_SPRING, WINDOW_TOP);
    const glass = archShape(GLASS_HALF_W, GLASS_BOTTOM, GLASS_SPRING, GLASS_TOP);
    return {
      frameGeometry: new THREE.ShapeGeometry(frame, 24),
      glassGeometry: new THREE.ShapeGeometry(glass, 24),
      frameLine: outline(frame, 0.012),
      glassLine: outline(glass, 0.02),
    };
  }, []);
  useEffect(
    () => () => {
      shapes.frameGeometry.dispose();
      shapes.glassGeometry.dispose();
    },
    [shapes],
  );

  // Lead came: a mullion, two transoms (clipped to the jambs), and the
  // horizontal sill between glass and plaque.
  const leadPoints = useMemo<Array<[number, number, number]>>(() => {
    const z = 0.022;
    return [
      [0, GLASS_BOTTOM, z], [0, GLASS_TOP - 0.22, z],
      [-GLASS_HALF_W, 0.02, z], [GLASS_HALF_W, 0.02, z],
      [-GLASS_HALF_W, GLASS_SPRING, z], [GLASS_HALF_W, GLASS_SPRING, z],
    ];
  }, []);

  const crystalEdges = useMemo(() => {
    const source = new THREE.OctahedronGeometry(0.2, 0);
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
      group.position.y = position[1] + Math.sin(t * 1.2 + position[0]) * 0.04;
      targetScale.setScalar(hovered || selected ? WINDOW_HOVER_SCALE : 1);
      group.scale.lerp(targetScale, 0.12);
    }
    if (crystal.current) {
      crystal.current.rotation.y += delta * (lit ? 1.2 : 0.35);
      crystal.current.scale.setScalar(lit ? 1 + Math.sin(t * (status === "error" ? 9 : 5)) * 0.15 : 1);
    }
    if (glassMat.current) {
      glassMat.current.opacity = pending
        ? 0.2
        : lit
          ? 0.55 + Math.sin(t * (status === "error" ? 8 : 4)) * 0.2
          : 0.62;
    }
  });

  return (
    <group ref={nodeRef} position={position}>
      {/* Carved stone frame (click target). */}
      <mesh
        geometry={shapes.frameGeometry}
        position={[0, 0, -0.02]}
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
        <meshStandardMaterial
          color="#1b141a"
          emissive={SEAL_GLASS[stageId]}
          emissiveIntensity={pending ? 0.03 : 0.09}
          roughness={0.92}
          metalness={0.1}
        />
      </mesh>
      <Line
        points={shapes.frameLine}
        color="#B08D57"
        lineWidth={selected ? 2.6 : 1.8}
        transparent
        opacity={pending ? 0.55 : 0.9}
      />

      {/* Stained-glass light. */}
      <mesh geometry={shapes.glassGeometry}>
        <meshBasicMaterial
          ref={glassMat}
          color={glassColor}
          transparent
          opacity={0.2}
          depthWrite={false}
        />
      </mesh>
      <Line points={leadPoints} segments color="#120c0a" lineWidth={2.2} />
      <Line
        points={shapes.glassLine}
        color={pending ? "#6B5E45" : statusColor}
        lineWidth={selected ? 2.8 : 2}
        transparent
        opacity={pending ? 0.6 : 1}
      />
      {/* Rose roundel near the apex. */}
      <mesh position={[0, GLASS_TOP - 0.3, 0.024]}>
        <ringGeometry args={[0.07, 0.1, 24]} />
        <meshBasicMaterial color="#B08D57" transparent opacity={0.85} />
      </mesh>

      {/* Crystal emblem in the live status color. */}
      <group ref={crystal} position={[0, 0.32, 0.12]}>
        <mesh scale={[1, 1.35, 1]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial
            color="#0b0a10"
            emissive={statusColor}
            emissiveIntensity={pending ? 0.08 : 0.7}
            metalness={0.85}
            roughness={0.2}
            flatShading
          />
        </mesh>
        <lineSegments geometry={crystalEdges} scale={[1.01, 1.36, 1.01]}>
          <lineBasicMaterial
            color={statusColor}
            transparent
            opacity={pending ? 0.4 : 1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      </group>
      <pointLight
        position={[0, 0.3, 0.5]}
        color={glassColor}
        intensity={lit ? 3.2 : pending ? 0.4 : 1.4}
        distance={2.6}
      />
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

/**
 * Procedural skeleton skull: cranium, maxilla, cheekbones, recessed dark eye
 * sockets with fiery pupils, a nasal cavity, an upper tooth row, and a
 * separate hinged jaw with its own teeth (chatters while a ritual runs).
 * Bone is lit by warm front fill plus crimson / amethyst rim lights behind;
 * pupils and rim lights lerp toward the aura.
 */
function SkeletonSkull({ aura, running }: { aura: AuraState; running: boolean }) {
  const head = useRef<THREE.Group>(null);
  const jaw = useRef<THREE.Group>(null);
  const pupilMats = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const boneMat = useRef<THREE.MeshStandardMaterial>(null);
  const rimA = useRef<THREE.PointLight>(null);
  const eyeLight = useRef<THREE.PointLight>(null);
  const target = useMemo(() => new THREE.Color(AURA_HEX[aura]), [aura]);
  const current = useRef(new THREE.Color(AURA_HEX[aura]));
  const fire = useMemo(() => new THREE.Color("#FF5A1F"), []);
  const pupil = useRef(new THREE.Color("#FF5A1F"));

  // Teeth sit on a shallow arc in front of the jaw line.
  const teeth = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const x = -0.21 + index * 0.06;
        return { x, z: 0.47 - x * x * 1.4 };
      }),
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    current.current.lerp(target, 0.05);
    // Pupils burn fire-orange, leaning 45% toward the aura.
    pupil.current.copy(fire).lerp(current.current, 0.45);
    for (const material of pupilMats.current) material?.color.copy(pupil.current);
    if (eyeLight.current) {
      eyeLight.current.color.copy(pupil.current);
      eyeLight.current.intensity = 2.4 + Math.sin(t * 13) * 0.5 + Math.sin(t * 7.1) * 0.3;
    }
    if (rimA.current) rimA.current.color.copy(current.current);
    if (boneMat.current) boneMat.current.emissive.copy(current.current);
    if (head.current) {
      head.current.position.y = Math.sin(t * 1.3) * 0.05;
      head.current.rotation.y = Math.sin(t * 0.45) * 0.32;
      head.current.rotation.x = Math.sin(t * 0.7) * 0.05;
      const beat = aura === "crimson" ? 1 + Math.max(0, Math.sin(t * 6.2)) * 0.03 : 1;
      head.current.scale.setScalar(beat);
    }
    if (jaw.current) {
      const chatter = running ? Math.abs(Math.sin(t * 9)) * 0.16 : 0;
      jaw.current.rotation.x = 0.06 + Math.sin(t * 1.1) * 0.03 + chatter;
    }
  });

  const bone = (
    <meshStandardMaterial
      ref={boneMat}
      color="#d8cdb9"
      emissive={AURA_HEX[aura]}
      emissiveIntensity={0.06}
      roughness={0.78}
      metalness={0.04}
    />
  );
  const boneProps = {
    color: "#cfc3ad",
    roughness: 0.8,
    metalness: 0.04,
  } as const;
  const hollow = <meshBasicMaterial color="#050307" />;

  return (
    <group ref={head}>
      {/* Cranium + maxilla + cheekbones. */}
      <mesh position={[0, 0.2, -0.02]} scale={[1, 1.04, 1.1]}>
        <sphereGeometry args={[0.6, 40, 32]} />
        {bone}
      </mesh>
      <mesh position={[0, -0.16, 0.2]} scale={[1.02, 0.78, 0.9]}>
        <sphereGeometry args={[0.42, 32, 24]} />
        <meshStandardMaterial {...boneProps} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`cheek-${side}`} position={[side * 0.32, -0.12, 0.36]} scale={[1.25, 0.7, 0.9]}>
          <sphereGeometry args={[0.15, 20, 16]} />
          <meshStandardMaterial {...boneProps} />
        </mesh>
      ))}

      {/* Recessed sockets, fiery pupils. */}
      {[-1, 1].map((side, index) => (
        <group key={`eye-${side}`} position={[side * 0.2, 0.02, 0.5]}>
          <mesh scale={[1.15, 0.92, 0.62]}>
            <sphereGeometry args={[0.15, 24, 18]} />
            {hollow}
          </mesh>
          <mesh position={[0, -0.01, 0.07]}>
            <sphereGeometry args={[0.05, 16, 12]} />
            <meshBasicMaterial
              ref={(material) => {
                pupilMats.current[index] = material;
              }}
              color="#FF5A1F"
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <pointLight ref={eyeLight} position={[0, 0.02, 0.95]} color="#FF5A1F" intensity={2.4} distance={2.2} />

      {/* Nasal cavity (inverted triangle). */}
      <mesh position={[0, -0.18, 0.58]} rotation={[0, 0, Math.PI]} scale={[1, 1.1, 0.5]}>
        <coneGeometry args={[0.07, 0.17, 3]} />
        {hollow}
      </mesh>

      {/* Upper teeth. */}
      {teeth.map((tooth) => (
        <mesh key={`upper-${tooth.x}`} position={[tooth.x, -0.37, tooth.z]}>
          <boxGeometry args={[0.05, 0.09, 0.05]} />
          <meshStandardMaterial color="#e7ddca" roughness={0.6} />
        </mesh>
      ))}

      {/* Hinged jaw with lower teeth. */}
      <group ref={jaw} position={[0, -0.36, 0.05]}>
        <mesh position={[0, -0.12, 0.17]} scale={[1, 0.42, 0.86]}>
          <sphereGeometry args={[0.34, 28, 18]} />
          <meshStandardMaterial {...boneProps} />
        </mesh>
        {teeth.map((tooth) => (
          <mesh key={`lower-${tooth.x}`} position={[tooth.x, -0.04, tooth.z - 0.06]}>
            <boxGeometry args={[0.048, 0.08, 0.05]} />
            <meshStandardMaterial color="#e2d7c3" roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* Lighting: warm front fill, aura + amethyst rim from behind. */}
      <pointLight position={[0, 0.4, 2]} color="#ffd9b0" intensity={1.6} distance={5} />
      <pointLight ref={rimA} position={[1.1, 0.8, -1.1]} color={AURA_HEX[aura]} intensity={9} distance={4} />
      <pointLight position={[-1.1, 0.4, -1]} color="#9D4EDD" intensity={6} distance={4} />
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
        points={[BACK_POSITIONS[from], BACK_POSITIONS[to]]}
        color={color}
        lineWidth={lit ? 1.65 : 0.75}
        transparent
        opacity={lit ? 0.62 : 0.18}
        depthWrite={false}
      />
      {lit && (
        <ConduitStream
          from={BACK_POSITIONS[from]}
          to={BACK_POSITIONS[to]}
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

/** Altar circle tint per aura: Crimson → Purple → Neon Green. */
const ALTAR_TINT: Record<AuraState, string> = {
  idle: "#FF003C",
  crimson: "#FF003C",
  purple: "#9D4EDD",
  green: "#00FF66",
};
const ALTAR_MAGENTA = "#FF2BD6";

/** Pentagram: a {5/2} star polygon inscribed in radius `r`, as line segments. */
function pentagram(radius: number): THREE.BufferGeometry {
  const points: number[] = [];
  const vertex = (i: number) => {
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 5;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
  };
  for (let i = 0; i < 5; i++) points.push(...vertex(i), ...vertex((i + 2) % 5));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/**
 * Tilted stone altar pedestal under the skull (`rotation.x = -π/2.4`) with a
 * glowing crimson-and-magenta ritual circle on its top face: rune rings,
 * radial rune ticks, a pentagram, and a counter-rotating inner ring. The
 * circle lerps to `ALTAR_TINT[aura]` and breathes.
 */
function AltarPedestal({ aura }: { aura: AuraState }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const tintMats = useRef<Array<THREE.MeshBasicMaterial | THREE.LineBasicMaterial | null>>([]);
  const magentaMats = useRef<Array<THREE.MeshBasicMaterial | THREE.LineBasicMaterial | null>>([]);
  const tint = useMemo(() => new THREE.Color(ALTAR_TINT[aura]), [aura]);
  const magentaTarget = useMemo(
    () => new THREE.Color(ALTAR_MAGENTA).lerp(tint, 0.5),
    [tint],
  );
  const tintNow = useRef(new THREE.Color(ALTAR_TINT[aura]));
  const magentaNow = useRef(new THREE.Color(ALTAR_MAGENTA));
  const glow = useRef<THREE.PointLight>(null);

  const geometries = useMemo(() => {
    const slab = new THREE.BoxGeometry(ALTAR_W, ALTAR_D, ALTAR_H);
    const slabEdges = new THREE.EdgesGeometry(slab);
    return {
      slab,
      slabEdges,
      outerTicks: runeTicks(60, ALTAR_R * 0.88, ALTAR_R),
      innerTicks: runeTicks(30, ALTAR_R * 0.36, ALTAR_R * 0.46),
      star: pentagram(ALTAR_R * 0.76),
    };
  }, []);
  useEffect(
    () => () => {
      for (const geometry of Object.values(geometries)) geometry.dispose();
    },
    [geometries],
  );

  useFrame((state, delta) => {
    const breathe = 0.82 + Math.sin(state.clock.elapsedTime * 1.6) * 0.18;
    tintNow.current.lerp(tint, 0.05);
    magentaNow.current.lerp(magentaTarget, 0.05);
    for (const material of tintMats.current) {
      material?.color.copy(tintNow.current).multiplyScalar(breathe);
    }
    for (const material of magentaMats.current) {
      material?.color.copy(magentaNow.current).multiplyScalar(breathe);
    }
    if (glow.current) glow.current.color.copy(tintNow.current);
    if (outer.current) outer.current.rotation.z += delta * 0.14;
    if (inner.current) inner.current.rotation.z -= delta * 0.24;
  });

  const bindTint = (index: number) => (material: THREE.MeshBasicMaterial | THREE.LineBasicMaterial | null) => {
    tintMats.current[index] = material;
  };
  const bindMagenta = (index: number) => (material: THREE.MeshBasicMaterial | THREE.LineBasicMaterial | null) => {
    magentaMats.current[index] = material;
  };
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const;
  const surface = ALTAR_H / 2 + 0.006;

  return (
    <group position={[0, ALTAR_Y, 0]} rotation={[-Math.PI / 2.4, 0, 0]}>
      {/* Stone slab. */}
      <mesh geometry={geometries.slab}>
        <meshStandardMaterial color="#1c161b" roughness={0.95} metalness={0.05} />
      </mesh>
      <lineSegments geometry={geometries.slabEdges}>
        <lineBasicMaterial color="#5E4524" transparent opacity={0.9} />
      </lineSegments>

      {/* Ritual circle on the top face. */}
      <group position={[0, 0, surface]}>
        <group ref={outer}>
          <mesh>
            <ringGeometry args={[ALTAR_R, ALTAR_R * 1.035, 128]} />
            <meshBasicMaterial ref={bindTint(0)} {...additive} opacity={0.95} />
          </mesh>
          <mesh>
            <ringGeometry args={[ALTAR_R * 0.86, ALTAR_R * 0.88, 128]} />
            <meshBasicMaterial ref={bindTint(1)} {...additive} opacity={0.75} />
          </mesh>
          <lineSegments geometry={geometries.outerTicks}>
            <lineBasicMaterial ref={bindTint(2)} {...additive} opacity={0.85} />
          </lineSegments>
          <lineSegments geometry={geometries.star}>
            <lineBasicMaterial ref={bindMagenta(0)} {...additive} opacity={1} />
          </lineSegments>
          <mesh>
            <ringGeometry args={[ALTAR_R * 0.75, ALTAR_R * 0.77, 96]} />
            <meshBasicMaterial ref={bindMagenta(1)} {...additive} opacity={0.8} />
          </mesh>
        </group>
        <group ref={inner}>
          <mesh>
            <ringGeometry args={[ALTAR_R * 0.46, ALTAR_R * 0.48, 72]} />
            <meshBasicMaterial ref={bindMagenta(2)} {...additive} opacity={0.75} />
          </mesh>
          <lineSegments geometry={geometries.innerTicks}>
            <lineBasicMaterial ref={bindMagenta(3)} {...additive} opacity={0.75} />
          </lineSegments>
        </group>
      </group>
      <pointLight ref={glow} position={[0, 0, surface + 0.5]} color={ALTAR_TINT[aura]} intensity={4} distance={3.5} />
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

/** Skull scale on the altar and its height above the graph center. */
const RELIC_SCALE = 1.35;
const SKULL_Y = 0.2;
const SPARK_COUNT = 60;

/**
 * Particle fire. Each particle rises from `baseY` by `height` over its life,
 * its orbit radius tapering from `radius` (×`taper` at the top) so the cloud
 * reads as a flame. One preallocated buffer, rewritten each frame.
 */
function FireCloud({
  color,
  seed,
  size,
  count,
  baseY,
  height,
  radius,
  taper,
  speed,
  opacity = 0.9,
}: {
  color: string;
  seed: number;
  size: number;
  count: number;
  baseY: number;
  height: number;
  radius: number;
  taper: number;
  speed: number;
  opacity?: number;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return geo;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const params = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const h = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
        const r = h - Math.floor(h);
        return { phase: r, angle: r * Math.PI * 2 + i, rate: speed * (0.7 + r * 0.6) };
      }),
    [count, seed, speed],
  );

  useFrame((state) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = state.clock.elapsedTime;
    params.forEach((particle, i) => {
      const life = (t * particle.rate + particle.phase) % 1;
      const r = radius * (1 - life * (1 - taper)) * (0.6 + particle.phase * 0.4);
      const angle = particle.angle + t * 0.8 + life * 3;
      array[i * 3] = Math.cos(angle) * r + Math.sin(t * 4 + i) * 0.02;
      array[i * 3 + 1] = baseY + life * height;
      array[i * 3 + 2] = Math.sin(angle) * r * 0.7;
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
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Red cosmic sparks orbiting the skull on tilted great circles. */
function CosmicSparks() {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARK_COUNT * 3), 3));
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const params = useMemo(
    () =>
      Array.from({ length: SPARK_COUNT }, (_, i) => {
        const h = Math.sin((i + 3) * 91.345) * 47453.5453;
        const r = h - Math.floor(h);
        return {
          tilt: (r - 0.5) * Math.PI,
          offset: r * Math.PI * 2 + i * 0.37,
          speed: (i % 2 === 0 ? 1 : -1) * (0.25 + r * 0.45),
          radius: 1.0 + r * 0.45,
        };
      }),
    [],
  );

  useFrame((state) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = state.clock.elapsedTime;
    params.forEach((spark, i) => {
      const a = spark.offset + t * spark.speed;
      const x = Math.cos(a) * spark.radius;
      const y = Math.sin(a) * spark.radius;
      array[i * 3] = x;
      array[i * 3 + 1] = y * Math.cos(spark.tilt);
      array[i * 3 + 2] = y * Math.sin(spark.tilt);
    });
    attribute.needsUpdate = true;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#FF003C"
        size={0.045}
        sizeAttenuation
        opacity={0.75}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * Fire around the skull: a flame crown burning from the top of the cranium
 * (white-hot core → orange → crimson), slow embers rising past the face, and
 * a flickering fire light above the head.
 */
function SkullFire() {
  const light = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (!light.current) return;
    const t = state.clock.elapsedTime;
    light.current.intensity = 5 + Math.sin(t * 11) * 1.4 + Math.sin(t * 17.3) * 0.9;
  });
  return (
    <>
      <FireCloud color="#FFD27A" seed={1} size={0.07} count={90} baseY={0.62} height={0.75} radius={0.22} taper={0.15} speed={0.9} />
      <FireCloud color="#FF7A1A" seed={2} size={0.09} count={130} baseY={0.5} height={1.0} radius={0.42} taper={0.12} speed={0.7} />
      <FireCloud color="#FF003C" seed={3} size={0.11} count={110} baseY={0.4} height={1.1} radius={0.58} taper={0.2} speed={0.55} opacity={0.75} />
      <FireCloud color="#8B0000" seed={4} size={0.06} count={60} baseY={-0.9} height={2.6} radius={1.05} taper={0.5} speed={0.18} opacity={0.7} />
      <CosmicSparks />
      <pointLight ref={light} position={[0, 1.1, 0.3]} color="#FF6A1A" intensity={5} distance={4} />
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

      <AltarPedestal aura={aura} />
      <group position={[0, SKULL_Y, 0]} scale={RELIC_SCALE}>
        <SkeletonSkull aura={aura} running={running} />
        <SkullFire />
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
          stageId={stage.id}
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
  stageMeta,
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
  /** Second banner line per stage, e.g. "SEALED · 312 ms". */
  stageMeta?: Partial<Record<StageId, string>>;
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
              meta={stageMeta?.[stage.id]}
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
