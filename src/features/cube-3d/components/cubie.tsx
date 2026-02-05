import { RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { forwardRef } from 'react';
import type { Group } from 'three';
import { useCubeTheme } from '../hooks/use-cube-theme';
import type { CubieFace, CubieFaces, Vec3 } from '../lib/types';

interface CubieProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  faces: CubieFaces;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, position: Vec3, face: CubieFace) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
}

// Configuration for placement of face plates
const OFFSET = 0.46;
const THICKNESS = 0.04;
const FACE_SIZE = 0.86;
const BASE_SIZE = 0.92;

// Face configs indexed by standard order: RIGHT, LEFT, UP, DOWN, FRONT, BACK
const FACE_CONFIGS = [
  { pos: [OFFSET, 0, 0], rot: [0, Math.PI / 2, 0] }, // RIGHT (+X)
  { pos: [-OFFSET, 0, 0], rot: [0, -Math.PI / 2, 0] }, // LEFT (-X)
  { pos: [0, OFFSET, 0], rot: [-Math.PI / 2, 0, 0] }, // UP (+Y)
  { pos: [0, -OFFSET, 0], rot: [Math.PI / 2, 0, 0] }, // DOWN (-Y)
  { pos: [0, 0, OFFSET], rot: [0, 0, 0] }, // FRONT (+Z)
  { pos: [0, 0, -OFFSET], rot: [0, Math.PI, 0] }, // BACK (-Z)
] as const;

/**
 * Maps a normal vector to its corresponding face index.
 * Uses Math.round to handle floating point precision issues.
 * [1,0,0]→0, [-1,0,0]→1, [0,1,0]→2, [0,-1,0]→3, [0,0,1]→4, [0,0,-1]→5
 */
function normalToFaceIndex(normal: Vec3): number {
  const x = Math.round(normal[0]);
  const y = Math.round(normal[1]);
  const z = Math.round(normal[2]);

  if (x === 1) return 0; // RIGHT
  if (x === -1) return 1; // LEFT
  if (y === 1) return 2; // UP
  if (y === -1) return 3; // DOWN
  if (z === 1) return 4; // FRONT
  if (z === -1) return 5; // BACK

  return -1; // Should never happen
}

export const Cubie = forwardRef<Group, CubieProps>(function Cubie(
  { position, faces, rotation, ...props },
  ref,
) {
  const { getCurrentPalette } = useCubeTheme();
  const palette = getCurrentPalette();

  return (
    <group
      position={position}
      rotation={rotation}
      ref={ref}
      {...props}
      frustumCulled={false}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {/* Black Rounded Base */}
      <RoundedBox
        args={[BASE_SIZE, BASE_SIZE, BASE_SIZE]}
        radius={0.08}
        smoothness={4}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color={palette.BLACK}
          roughness={0.5}
          metalness={0.1}
          depthWrite={true}
        />
      </RoundedBox>

      {/* Face Plates - positioned based on each face's current normal */}
      {faces.map((face) => {
        // Resolve color from palette using the key
        const faceColor = palette[face.colorKey] || face.color;

        if (face.colorKey === 'BLACK') return null;

        const visualIndex = normalToFaceIndex(face.normal);
        if (visualIndex === -1) return null;

        const config = FACE_CONFIGS[visualIndex];

        return (
          <group
            key={face.id}
            position={config.pos as [number, number, number]}
            rotation={config.rot as [number, number, number]}
            frustumCulled={false}
            onPointerDown={(e) => {
              props.onPointerDown?.(e, position, face);
            }}
            onPointerUp={props.onPointerUp}
          >
            <RoundedBox
              args={[FACE_SIZE, FACE_SIZE, THICKNESS]}
              radius={0.04}
              smoothness={4}
              frustumCulled={false}
            >
              <meshPhysicalMaterial
                color={faceColor}
                roughness={0.2}
                metalness={0.0}
                clearcoat={1}
                clearcoatRoughness={0.15}
                reflectivity={0.5}
                depthWrite={true}
                polygonOffset={true}
                polygonOffsetFactor={-1}
              />
            </RoundedBox>
          </group>
        );
      })}
    </group>
  );
});
