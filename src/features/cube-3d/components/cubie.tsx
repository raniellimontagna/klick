import { RoundedBox } from '@react-three/drei';
import { forwardRef } from 'react';
import type { Group } from 'three';
import { CUBE_3D_COLORS, type CubieFaces, type Vec3 } from '../lib/types';

interface CubieProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  faces: CubieFaces;
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
 * [1,0,0]→0, [-1,0,0]→1, [0,1,0]→2, [0,-1,0]→3, [0,0,1]→4, [0,0,-1]→5
 */
function normalToFaceIndex(normal: Vec3): number {
  const [x, y, z] = normal;

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
  return (
    <group position={position} rotation={rotation} ref={ref} {...props} frustumCulled={false}>
      {/* 
        1. Core: Black Rounded Base 
      */}
      <RoundedBox
        args={[BASE_SIZE, BASE_SIZE, BASE_SIZE]}
        radius={0.08}
        smoothness={4}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color={CUBE_3D_COLORS.BLACK}
          roughness={0.5}
          metalness={0.1}
          depthWrite={true}
        />
      </RoundedBox>

      {/* 
        2. Face Plates - positioned based on each face's current normal
      */}
      {faces.map((face) => {
        if (face.color === CUBE_3D_COLORS.BLACK) return null;

        // Get the visual index based on where this face's normal points NOW
        const visualIndex = normalToFaceIndex(face.normal);
        if (visualIndex === -1) return null;

        const config = FACE_CONFIGS[visualIndex];

        return (
          <group
            key={face.id}
            position={config.pos as [number, number, number]}
            rotation={config.rot as [number, number, number]}
            frustumCulled={false}
          >
            {/* The colored plate */}
            <RoundedBox
              args={[FACE_SIZE, FACE_SIZE, THICKNESS]}
              radius={0.04}
              smoothness={4}
              frustumCulled={false}
            >
              <meshPhysicalMaterial
                color={face.color}
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
