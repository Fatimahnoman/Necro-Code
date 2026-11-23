"use client";

import { Line, OrbitControls, PointMaterial, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { AURA_HEX, type AuraState } from "@/lib/aura";
import { playBatSwarmFlutter } from "@/lib/sound";
import { installThreeConsoleGuard } from "@/lib/three-runtime";
import type { NodeStatus, StageId } from "@/lib/types";
import { WORKFLOW_STAGES } from "@/lib/types";

installThreeConsoleGuard();

type NodeStatusMap = Record<StageId, NodeStatus>;
type NodeRefMap = Record<StageId, MutableRefObject<THREE.Group | null>>;

/** Bug-badge anchor above the scanner window. */
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

/** Conduits run behind the windows and the skull. */
const CONDUIT_Z = -0.9;

/** Seal centers pushed back to `CONDUIT_Z`, so conduits pass behind. */
const BACK_POSITIONS = Object.fromEntries(
  Object.entries(POSITIONS).map(([id, [x, y]]) => [id, [x, y, CONDUIT_Z]]),
) as Record<StageId, [number, number, number]>;

const CAMERA_Z = 5.4;
const CAMERA_FOV = 45;
/** Uniform boost applied to the fitted ritual group (bigger skull + seals). */
const GRAPH_SCALE_BOOST = 1.25;
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
/** Gap kept between labels and the canvas edge, in px. */
const EDGE_GAP_PX = 8;

/**
 * Largest pre-boost graph scale (capped at `MAX_GRAPH_SCALE`) whose boosted
 * size keeps the seals and the reserved HUD strips inside the canvas, plus the
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
  const byHeight =
    (top - bottom) / ((localTop + localBottom) * GRAPH_SCALE_BOOST);

  // Only the seals bound the width; the HUD reserves bound the height.
  const edge = EDGE_GAP_PX * unitsPerPx;
  const byWidth =
    (halfW - edge) / ((ORBIT_X + SEAL_HALF_W) * GRAPH_SCALE_BOOST);

  const scale = Math.min(
    MAX_GRAPH_SCALE,
    Math.max(MIN_GRAPH_SCALE, Math.min(byHeight, byWidth)),
  );
  const effectiveScale = scale * GRAPH_SCALE_BOOST;
  const offsetY =
    (top + bottom) / 2 - (effectiveScale * (localTop - localBottom)) / 2;
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

function BadgeProjector({
  nodeRefs,
  badgeRef,
  bugCount,
}: {
  nodeRefs: NodeRefMap;
  badgeRef: MutableRefObject<HTMLDivElement | null>;
  bugCount: number;
}) {
  const { camera, size } = useThree();
  const world = useMemo(() => new THREE.Vector3(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
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

/** Roar on ritual start; emerald burn when a ritual ends purified. */
const ROAR_SECONDS = 1.5;
const BURN_SECONDS = 2.4;
const BLOOD = "#FF0A2A";
const NECROTIC = "#00FF66";
/** How far the pupils can travel inside the sockets (local units). */
const GAZE_RANGE = 0.034;

/**
 * Pointer position normalized to the canvas (-1..1 at its edges, clamped to
 * ±1.6 beyond them), tracked on the window so the skull keeps watching even
 * when the cursor is over the side panels.
 */
function useGaze() {
  const { gl } = useThree();
  const gaze = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      gaze.current.x = Math.max(-1.6, Math.min(1.6, x));
      gaze.current.y = Math.max(-1.6, Math.min(1.6, y));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [gl]);
  return gaze;
}

/**
 * Possessed demon skull: cranium, heavy brow ridge, swept-back horns,
 * maxilla, sharp cheekbones, deep hollow sockets with pinpoint pupils
 * (blood red; necrotic green once purified) that track the cursor, a nasal
 * cavity, teeth with fangs, and a hinged jaw. Harsh crimson under-lighting
 * from below casts the face in sinister relief.
 *
 * - Running: the jaw chatters; on the rising edge the skull ROARS (jaw wide,
 *   violent shudder) for `ROAR_SECONDS`.
 * - Purified finish: crimson burns away into a blinding necrotic-emerald
 *   flare (light spike + expanding glow shell) over `BURN_SECONDS`.
 * Shudder/flare are skipped under `prefers-reduced-motion`.
 */
function SkeletonSkull({ aura, running }: { aura: AuraState; running: boolean }) {
  const head = useRef<THREE.Group>(null);
  const jaw = useRef<THREE.Group>(null);
  const pupils = useRef<Array<THREE.Mesh | null>>([]);
  const pupilMats = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const boneMat = useRef<THREE.MeshStandardMaterial>(null);
  const rimA = useRef<THREE.PointLight>(null);
  const eyeLight = useRef<THREE.PointLight>(null);
  const underLight = useRef<THREE.PointLight>(null);
  const flareLight = useRef<THREE.PointLight>(null);
  const flare = useRef<THREE.Mesh>(null);
  const gaze = useGaze();
  const look = useRef({ x: 0, y: 0 });

  const auraTarget = useMemo(() => new THREE.Color(AURA_HEX[aura]), [aura]);
  const auraNow = useRef(new THREE.Color(AURA_HEX[aura]));
  const blood = useMemo(() => new THREE.Color(BLOOD), []);
  const necrotic = useMemo(() => new THREE.Color(NECROTIC), []);
  const pupilNow = useRef(new THREE.Color(BLOOD));
  const underNow = useRef(new THREE.Color(BLOOD));

  const clockNow = useRef(0);
  const roarStart = useRef(-Infinity);
  const burnStart = useRef(-Infinity);
  const prevRunning = useRef(running);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (running && !prevRunning.current) roarStart.current = clockNow.current;
    if (!running && prevRunning.current && aura === "green") {
      burnStart.current = clockNow.current;
    }
    prevRunning.current = running;
    // `aura` is read at the edge only; the complete event updates both together.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const teeth = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const x = -0.21 + index * 0.06;
        return { x, z: 0.47 - x * x * 1.4 };
      }),
    [],
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    clockNow.current = t;
    const roar = (t - roarStart.current) / ROAR_SECONDS;
    const roaring = roar >= 0 && roar < 1 && !reduced.current;
    const burn = (t - burnStart.current) / BURN_SECONDS;
    const burning = burn >= 0 && burn < 1;
    const purified = aura === "green";

    auraNow.current.lerp(auraTarget, 0.05);
    // Pupils + under-light: blood red, burning to necrotic green when purified.
    const goal = purified || burning ? necrotic : blood;
    pupilNow.current.lerp(goal, burning ? 0.2 : 0.06);
    underNow.current.lerp(goal, burning ? 0.12 : 0.04);
    for (const material of pupilMats.current) material?.color.copy(pupilNow.current);

    // Eased gaze toward the cursor.
    const k = 1 - Math.pow(0.0025, delta);
    look.current.x += (gaze.current.x - look.current.x) * k;
    look.current.y += (gaze.current.y - look.current.y) * k;
    const gx = Math.max(-1, Math.min(1, look.current.x));
    const gy = Math.max(-1, Math.min(1, look.current.y));
    pupils.current.forEach((pupil) => {
      if (!pupil) return;
      pupil.position.x = gx * GAZE_RANGE;
      pupil.position.y = -0.01 + gy * GAZE_RANGE * 0.8;
    });

    if (eyeLight.current) {
      eyeLight.current.color.copy(pupilNow.current);
      eyeLight.current.intensity = 2.2 + Math.sin(t * 13) * 0.5 + Math.sin(t * 7.1) * 0.3 + (roaring ? 3 : 0);
    }
    if (underLight.current) {
      underLight.current.color.copy(underNow.current);
      underLight.current.intensity = 15 + Math.sin(t * 9.3) * 2.5 + Math.sin(t * 23) * 1.2 + (roaring ? 10 : 0);
    }
    if (rimA.current) rimA.current.color.copy(auraNow.current);
    if (boneMat.current) {
      boneMat.current.emissive.copy(burning ? necrotic : auraNow.current);
      boneMat.current.emissiveIntensity = burning ? 0.06 + (1 - burn) * 1.4 : 0.06;
    }

    if (head.current) {
      const shake = roaring ? (1 - roar) * (1 - roar) : 0;
      head.current.position.set(
        Math.sin(t * 71) * 0.045 * shake,
        Math.sin(t * 1.3) * 0.05 + Math.sin(t * 63) * 0.03 * shake,
        0,
      );
      head.current.rotation.set(
        -gy * 0.2 + Math.sin(t * 0.7) * 0.04 - (roaring ? Math.sin(roar * Math.PI) * 0.25 : 0),
        gx * 0.42 + Math.sin(t * 0.45) * 0.06,
        Math.sin(t * 57) * 0.1 * shake,
      );
      const beat = aura === "crimson" ? 1 + Math.max(0, Math.sin(t * 6.2)) * 0.03 : 1;
      head.current.scale.setScalar(beat * (roaring ? 1 + Math.sin(roar * Math.PI) * 0.12 : 1));
    }
    if (jaw.current) {
      const chatter = running ? Math.abs(Math.sin(t * 9)) * 0.14 : 0;
      const gape = roaring ? Math.sin(Math.min(1, roar * 1.6) * Math.PI * 0.5) * 0.62 * (1 - roar * 0.6) : 0;
      jaw.current.rotation.x = 0.06 + Math.sin(t * 1.1) * 0.03 + Math.max(chatter, gape);
    }

    if (flare.current && flareLight.current) {
      const glow = burning && !reduced.current ? (1 - burn) * (1 - burn) : 0;
      flare.current.visible = glow > 0.001;
      flare.current.scale.setScalar(0.9 + burn * 2.6);
      (flare.current.material as THREE.MeshBasicMaterial).opacity = glow * 0.85;
      flareLight.current.intensity = burning ? 40 * (1 - burn) * (1 - burn) : 0;
    }
  });

  const boneProps = { color: "#cfc3ad", roughness: 0.82, metalness: 0.04 } as const;
  const hornProps = { color: "#3b2c27", roughness: 0.55, metalness: 0.2 } as const;
  const hollow = <meshBasicMaterial color="#020103" />;

  return (
    <group ref={head}>
      {/* Cranium + brow ridge + maxilla + cheekbones. */}
      <mesh position={[0, 0.2, -0.02]} scale={[1, 1.04, 1.1]}>
        <sphereGeometry args={[0.6, 40, 32]} />
        <meshStandardMaterial
          ref={boneMat}
          color="#d8cdb9"
          emissive={AURA_HEX[aura]}
          emissiveIntensity={0.06}
          roughness={0.78}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0.2, 0.4]} scale={[1.35, 0.32, 0.55]}>
        <sphereGeometry args={[0.3, 28, 16]} />
        <meshStandardMaterial {...boneProps} />
      </mesh>
      <mesh position={[0, -0.16, 0.2]} scale={[1.02, 0.78, 0.9]}>
        <sphereGeometry args={[0.42, 32, 24]} />
        <meshStandardMaterial {...boneProps} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`cheek-${side}`} position={[side * 0.33, -0.1, 0.35]} scale={[1.35, 0.6, 0.85]} rotation={[0, 0, side * -0.35]}>
          <sphereGeometry args={[0.15, 20, 16]} />
          <meshStandardMaterial {...boneProps} />
        </mesh>
      ))}

      {/* Swept-back demon horns. */}
      {[-1, 1].map((side) => (
        <group key={`horn-${side}`} position={[side * 0.4, 0.58, 0.02]} rotation={[-0.55, 0, side * -0.55]}>
          <mesh position={[0, 0.2, 0]}>
            <coneGeometry args={[0.075, 0.46, 14]} />
            <meshStandardMaterial {...hornProps} />
          </mesh>
          <mesh position={[0, 0.48, -0.06]} rotation={[-0.6, 0, 0]}>
            <coneGeometry args={[0.035, 0.2, 10]} />
            <meshStandardMaterial {...hornProps} />
          </mesh>
        </group>
      ))}

      {/* Deep hollow sockets with pinpoint pupils that track the cursor. */}
      {[-1, 1].map((side, index) => (
        <group key={`eye-${side}`} position={[side * 0.2, 0.02, 0.5]}>
          <mesh scale={[1.15, 0.92, 0.7]}>
            <sphereGeometry args={[0.15, 24, 18]} />
            {hollow}
          </mesh>
          <mesh
            ref={(mesh) => {
              pupils.current[index] = mesh;
            }}
            position={[0, -0.01, 0.075]}
          >
            <sphereGeometry args={[0.036, 16, 12]} />
            <meshBasicMaterial
              ref={(material) => {
                pupilMats.current[index] = material;
              }}
              color={BLOOD}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <pointLight ref={eyeLight} position={[0, 0.02, 0.95]} color={BLOOD} intensity={2.2} distance={2.2} />

      {/* Nasal cavity (inverted triangle). */}
      <mesh position={[0, -0.18, 0.58]} rotation={[0, 0, Math.PI]} scale={[1, 1.1, 0.5]}>
        <coneGeometry args={[0.07, 0.17, 3]} />
        {hollow}
      </mesh>

      {/* Upper teeth + fangs. */}
      {teeth.map((tooth) => (
        <mesh key={`upper-${tooth.x}`} position={[tooth.x, -0.37, tooth.z]}>
          <boxGeometry args={[0.05, 0.09, 0.05]} />
          <meshStandardMaterial color="#e7ddca" roughness={0.6} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`fang-${side}`} position={[side * 0.15, -0.45, 0.46]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.03, 0.15, 8]} />
          <meshStandardMaterial color="#f0e6d2" roughness={0.45} />
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

      {/* Lighting: harsh blood under-light, faint front fill, aura + amethyst rims. */}
      <pointLight ref={underLight} position={[0, -1.25, 0.75]} color={BLOOD} intensity={15} distance={4.5} decay={2} />
      <pointLight position={[0, 0.4, 2]} color="#ffd9b0" intensity={0.35} distance={5} />
      <pointLight ref={rimA} position={[1.1, 0.8, -1.1]} color={AURA_HEX[aura]} intensity={9} distance={4} />
      <pointLight position={[-1.1, 0.4, -1]} color="#9D4EDD" intensity={6} distance={4} />

      {/* Necrotic-emerald purification flare. */}
      <mesh ref={flare} visible={false}>
        <sphereGeometry args={[0.7, 24, 16]} />
        <meshBasicMaterial
          color={NECROTIC}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={flareLight} position={[0, 0, 1.2]} color={NECROTIC} intensity={0} distance={7} />
    </group>
  );
}

/**
 * Ghostly soul-chain path between two seals: bows away from the skull and
 * writhes. Shared by the tendril strands and the particles riding them.
 */
function tendrilPoint(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  p: number,
  t: number,
  phase: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  // Bow outward (away from the graph center, where the skull sits).
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  if (nx * mx + ny * my < 0) {
    nx = -nx;
    ny = -ny;
  }
  const envelope = Math.sin(p * Math.PI);
  const offset = envelope * 0.32 + Math.sin(p * Math.PI * 5 - t * 2.2 + phase) * 0.09 * envelope;
  return out.set(
    from[0] + dx * p + nx * offset,
    from[1] + dy * p + ny * offset,
    from[2] + Math.sin(p * Math.PI * 3 + t * 1.3 + phase) * 0.08 * envelope,
  );
}

const TENDRIL_SEGMENTS = 48;

/** One writhing tendril strand (a THREE.Line rebuilt each frame in place). */
function TendrilStrand({
  from,
  to,
  color,
  opacity,
  phase,
  animate,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  opacity: number;
  phase: number;
  animate: boolean;
}) {
  const line = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array((TENDRIL_SEGMENTS + 1) * 3), 3),
    );
    const material = new THREE.LineBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return new THREE.Line(geometry, material);
  }, []);
  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );
  useEffect(() => {
    const material = line.material as THREE.LineBasicMaterial;
    material.color.set(color);
    material.opacity = opacity;
  }, [color, line, opacity]);

  const point = useMemo(() => new THREE.Vector3(), []);
  const written = useRef(false);
  useFrame((state) => {
    if (!animate && written.current) return;
    written.current = true;
    const attribute = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = animate ? state.clock.elapsedTime : 0;
    for (let i = 0; i <= TENDRIL_SEGMENTS; i++) {
      tendrilPoint(from, to, i / TENDRIL_SEGMENTS, t, phase, point);
      array[i * 3] = point.x;
      array[i * 3 + 1] = point.y;
      array[i * 3 + 2] = point.z;
    }
    attribute.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  });

  return <primitive object={line} />;
}

/**
 * Soul particles riding a tendril. Positions are rewritten every frame into
 * one preallocated buffer (no per-frame allocation).
 */
function ConduitStream({
  from,
  to,
  color,
  count,
  speed,
  opacity,
  phase,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  count: number;
  speed: number;
  opacity: number;
  phase: number;
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
  const point = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const p = (t * speed + i / count) % 1;
      tendrilPoint(from, to, p, t, phase, point);
      array[i * 3] = point.x;
      array[i * 3 + 1] = point.y;
      array[i * 3 + 2] = point.z;
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

/** Soul chain between two seals: two writhing strands + riding soul particles. */
function Segment({
  from,
  to,
  nodes,
  activeStage,
  phase,
}: {
  from: StageId;
  to: StageId;
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  phase: number;
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
            : "#5a4a52";
  const lit = fromStatus !== "pending" || toStatus !== "pending";
  const flowing =
    toStatus === "active" ||
    activeStage === to ||
    (fromStatus === "done" && toStatus === "pending");

  return (
    <>
      <TendrilStrand
        from={BACK_POSITIONS[from]}
        to={BACK_POSITIONS[to]}
        color={color}
        opacity={lit ? 0.75 : 0.22}
        phase={phase}
        animate={lit}
      />
      <TendrilStrand
        from={BACK_POSITIONS[from]}
        to={BACK_POSITIONS[to]}
        color={color}
        opacity={lit ? 0.35 : 0.1}
        phase={phase + 2.1}
        animate={lit}
      />
      {lit && (
        <ConduitStream
          from={BACK_POSITIONS[from]}
          to={BACK_POSITIONS[to]}
          color={color}
          count={flowing ? 16 : 6}
          speed={flowing ? 0.45 : 0.14}
          opacity={flowing ? 0.95 : 0.45}
          phase={phase}
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
/** Second circle color: eldritch violet. */
const ALTAR_VIOLET = "#A13CFF";

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
    () => new THREE.Color(ALTAR_VIOLET).lerp(tint, 0.5),
    [tint],
  );
  const tintNow = useRef(new THREE.Color(ALTAR_TINT[aura]));
  const magentaNow = useRef(new THREE.Color(ALTAR_VIOLET));
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
const RELIC_SCALE = 1.9;
const SKULL_Y = 0.28;
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

/**
 * Ash and embers rising off the summoning circle: points spawn across the
 * altar disc and drift upward with a slow sideways sway, fading by height.
 */
function AshRise() {
  const count = 110;
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const params = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const h = Math.sin((i + 7) * 45.164) * 24634.6345;
        const r = h - Math.floor(h);
        const angle = r * Math.PI * 2 + i * 2.4;
        const radius = Math.sqrt((i + 0.5) / count) * ALTAR_R;
        return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius * 0.45, phase: r, rate: 0.08 + r * 0.12 };
      }),
    [],
  );

  useFrame((state) => {
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const t = state.clock.elapsedTime;
    params.forEach((ash, i) => {
      const life = (t * ash.rate + ash.phase) % 1;
      array[i * 3] = ash.x + Math.sin(t * 0.9 + i) * 0.12 * life;
      array[i * 3 + 1] = ALTAR_Y + 0.05 + life * 2.8;
      array[i * 3 + 2] = ash.z + Math.cos(t * 0.7 + i) * 0.08 * life;
    });
    attribute.needsUpdate = true;
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#FF4A3A"
        size={0.05}
        sizeAttenuation
        opacity={0.6}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Procedural low-poly bat rig: a dark silhouette with a bright crimson outline. */
interface BatRefs {
  group: THREE.Group | null;
  left: THREE.Group | null;
  right: THREE.Group | null;
}
interface BatMaterials {
  body: THREE.MeshBasicMaterial;
  wing: THREE.MeshBasicMaterial;
  rim: THREE.MeshBasicMaterial;
}

const AMBIENT_BATS = [
  { x: -2.0, y: 1.95, z: -1.85, scale: 0.62, phase: 0.4, speed: 0.42 },
  { x: 0.2, y: 2.3, z: -2.25, scale: 0.5, phase: 2.2, speed: 0.33 },
  { x: 1.95, y: 1.75, z: -1.7, scale: 0.68, phase: 4.1, speed: 0.38 },
] as const;

const SWARM_TARGETS: Array<[number, number]> = [
  [-2.5, 2.05],
  [-1.55, 2.4],
  [-0.6, 2.25],
  [0.55, 2.35],
  [1.5, 2.15],
  [2.45, 1.95],
];
const BAT_SWARM_SECONDS = 1.8;
const BAT_SWARM_COOLDOWN = 2.2;

function batWingGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.03);
  shape.lineTo(0.14, 0.12);
  shape.lineTo(0.32, 0.16);
  shape.lineTo(0.5, 0.08);
  shape.lineTo(0.42, 0);
  shape.lineTo(0.52, -0.08);
  shape.lineTo(0.36, -0.06);
  shape.lineTo(0.28, -0.16);
  shape.lineTo(0.16, -0.07);
  shape.lineTo(0.08, -0.14);
  shape.lineTo(0, -0.05);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function createBatMaterials(opacity: number): BatMaterials {
  const common = {
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  } as const;
  return {
    body: new THREE.MeshBasicMaterial({ ...common, color: "#241329", opacity }),
    wing: new THREE.MeshBasicMaterial({ ...common, color: "#1a0d22", opacity }),
    // A slightly larger flat wing behind the dark one reads as a glowing rim
    // even at small sizes, where WebGL 1px lines would disappear.
    rim: new THREE.MeshBasicMaterial({
      ...common,
      color: "#ff2b55",
      opacity: opacity * 0.85,
    }),
  };
}

function disposeBatMaterials(materials: BatMaterials) {
  materials.body.dispose();
  materials.wing.dispose();
  materials.rim.dispose();
}

function emptyBatRefs(): BatRefs {
  return { group: null, left: null, right: null };
}

function BatSilhouette({
  index,
  register,
  wingGeometry,
  materials,
  scale = 1,
  visible = true,
}: {
  index: number;
  register: (index: number, refs: BatRefs) => void;
  wingGeometry: THREE.ShapeGeometry;
  materials: BatMaterials;
  scale?: number;
  visible?: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);

  useEffect(() => {
    register(index, {
      group: group.current,
      left: left.current,
      right: right.current,
    });
    return () => register(index, emptyBatRefs());
  }, [index, register]);

  return (
    <group ref={group} scale={scale} visible={visible}>
      <mesh material={materials.body}>
        <sphereGeometry args={[0.075, 8, 6]} />
      </mesh>
      <mesh material={materials.body} position={[-0.045, 0.075, 0]} rotation={[0, 0, 0.28]}>
        <coneGeometry args={[0.032, 0.09, 4]} />
      </mesh>
      <mesh material={materials.body} position={[0.045, 0.075, 0]} rotation={[0, 0, -0.28]}>
        <coneGeometry args={[0.032, 0.09, 4]} />
      </mesh>
      <group ref={left} position={[-0.055, 0.01, 0]} scale={[-1, 1, 1]}>
        <mesh geometry={wingGeometry} material={materials.rim} scale={1.13} position={[0, 0, -0.004]} />
        <mesh geometry={wingGeometry} material={materials.wing} />
      </group>
      <group ref={right} position={[0.055, 0.01, 0]}>
        <mesh geometry={wingGeometry} material={materials.rim} scale={1.13} position={[0, 0, -0.004]} />
        <mesh geometry={wingGeometry} material={materials.wing} />
      </group>
    </group>
  );
}

/**
 * Three ambient bats drift behind the altar. On a ritual start or while the
 * scanner/exorcist stages are active, six more erupt from behind the skull,
 * swoop toward the camera and fade out within ~1.8s, all inside this canvas.
 */
function RitualBats({
  running,
  activeStage,
  fxEnabled,
}: {
  running: boolean;
  activeStage: StageId | null;
  fxEnabled: boolean;
}) {
  const ambientRefs = useRef<BatRefs[]>(AMBIENT_BATS.map(() => emptyBatRefs()));
  const swarmRefs = useRef<BatRefs[]>(SWARM_TARGETS.map(() => emptyBatRefs()));
  const ambientMaterials = useMemo(() => createBatMaterials(0.85), []);
  const swarmMaterials = useMemo(
    () => SWARM_TARGETS.map(() => createBatMaterials(0.95)),
    [],
  );
  const wingGeometry = useMemo(() => batWingGeometry(), []);

  const registerAmbient = useCallback((index: number, refs: BatRefs) => {
    ambientRefs.current[index] = refs;
  }, []);
  const registerSwarm = useCallback((index: number, refs: BatRefs) => {
    swarmRefs.current[index] = refs;
  }, []);

  const pendingBurst = useRef(false);
  const burstStart = useRef(-Infinity);
  const prevRunning = useRef(running);
  const prevStage = useRef(activeStage);
  const fxEnabledRef = useRef(fxEnabled);

  useEffect(() => {
    fxEnabledRef.current = fxEnabled;
  }, [fxEnabled]);

  useEffect(() => {
    const swarmStage =
      activeStage === "glitch_scanner" || activeStage === "exorcism_reasoning";
    const enteringStage = swarmStage && prevStage.current !== activeStage;
    const starting = running && !prevRunning.current;
    prevRunning.current = running;
    prevStage.current = activeStage;
    if (starting || enteringStage) pendingBurst.current = true;
  }, [running, activeStage]);

  useEffect(() => () => {
    wingGeometry.dispose();
    disposeBatMaterials(ambientMaterials);
    swarmMaterials.forEach(disposeBatMaterials);
  }, [ambientMaterials, swarmMaterials, wingGeometry]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    if (pendingBurst.current) {
      pendingBurst.current = false;
      if (t - burstStart.current > BAT_SWARM_COOLDOWN) {
        burstStart.current = t;
        playBatSwarmFlutter(fxEnabledRef.current);
      }
    }

    AMBIENT_BATS.forEach((bat, index) => {
      const refs = ambientRefs.current[index];
      if (!refs.group) return;
      refs.group.position.set(
        bat.x + Math.sin(t * bat.speed + bat.phase) * 0.35,
        bat.y + Math.sin(t * 0.6 + bat.phase) * 0.12,
        bat.z + Math.cos(t * 0.4 + bat.phase) * 0.15,
      );
      const flap = Math.sin(t * 6.5 + bat.phase) * 0.5;
      if (refs.left) refs.left.rotation.z = -flap;
      if (refs.right) refs.right.rotation.z = flap;
    });

    SWARM_TARGETS.forEach((target, index) => {
      const refs = swarmRefs.current[index];
      const materials = swarmMaterials[index];
      if (!refs.group || !materials) return;
      const p = (t - burstStart.current - index * 0.05) / BAT_SWARM_SECONDS;
      if (p <= 0 || p >= 1) {
        refs.group.visible = false;
        return;
      }
      refs.group.visible = true;
      const eased = 1 - (1 - p) * (1 - p);
      refs.group.position.set(
        target[0] * eased + Math.sin(p * Math.PI * 2 + index) * 0.12 * (1 - p),
        0.15 + target[1] * eased - Math.sin(p * Math.PI) * 0.3,
        -0.8 + 4.2 * p,
      );
      refs.group.scale.setScalar(0.46 * (0.8 + p * 0.7));
      const flap = Math.sin(t * 13 + index * 0.7) * 0.75;
      if (refs.left) refs.left.rotation.z = -flap;
      if (refs.right) refs.right.rotation.z = flap;
      const fade = p < 0.65 ? 0.95 : (Math.max(0, (1 - p) / 0.35) * 0.95);
      materials.body.opacity = fade;
      materials.wing.opacity = fade;
      materials.rim.opacity = fade * 0.85;
    });
  });

  return (
    <group>
      {AMBIENT_BATS.map((bat, index) => (
        <BatSilhouette
          key={`ambient-${index}`}
          index={index}
          register={registerAmbient}
          wingGeometry={wingGeometry}
          materials={ambientMaterials}
          scale={bat.scale}
        />
      ))}
      {SWARM_TARGETS.map((_, index) => (
        <BatSilhouette
          key={`swarm-${index}`}
          index={index}
          register={registerSwarm}
          wingGeometry={wingGeometry}
          materials={swarmMaterials[index]}
          scale={0.46}
          visible={false}
        />
      ))}
    </group>
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
  badgeRef,
  reserveTopPx,
  reserveBottomPx,
  running,
  fxEnabled,
}: {
  nodes: NodeStatusMap;
  activeStage: StageId | null;
  bugCount: number;
  aura: AuraState;
  selected: StageId | null;
  onSelect: (stage: StageId) => void;
  nodeRefs: NodeRefMap;
  badgeRef: MutableRefObject<HTMLDivElement | null>;
  reserveTopPx: number;
  reserveBottomPx: number;
  running: boolean;
  fxEnabled: boolean;
}) {
  const { size } = useThree();
  const { scale, offsetY } = fitGraph(
    size.width,
    size.height,
    reserveTopPx,
    reserveBottomPx,
  );

  return (
    <group scale={scale * GRAPH_SCALE_BOOST} position={[0, offsetY, 0]}>
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
      <AshRise />
      <RitualBats running={running} activeStage={activeStage} fxEnabled={fxEnabled} />
      <group position={[0, SKULL_Y, 0]} scale={RELIC_SCALE}>
        <SkeletonSkull aura={aura} running={running} />
        <SkullFire />
      </group>
      <RitualFx running={running} aura={aura} />

      {EDGES.map(([from, to], index) => (
        <Segment
          key={`${from}-${to}`}
          phase={index * 1.7}
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

      <BadgeProjector
        nodeRefs={nodeRefs}
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
  fxEnabled = false,
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
  /** Mirrors the `3D AUDIO FX` toggle for the bat-swarm flutter cue. */
  fxEnabled?: boolean;
}) {
  const nodeRefs = useRef<NodeRefMap>({
    input_code: { current: null },
    glitch_scanner: { current: null },
    exorcism_reasoning: { current: null },
    clean_code_output: { current: null },
  });
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
            badgeRef={badgeRef}
            reserveTopPx={reserveTopPx}
            reserveBottomPx={reserveBottomPx}
            running={running}
            fxEnabled={fxEnabled}
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
