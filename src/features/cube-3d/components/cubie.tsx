import { forwardRef } from 'react';
import { RoundedBox } from '@react-three/drei';
import { CUBE_3D_COLORS, type CubieFaces } from '../lib/types';
import type { Group } from 'three';

interface CubieProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  colors: CubieFaces;
}

// Configuration for placement of face plates
const OFFSET = 0.46;
const THICKNESS = 0.04;
const FACE_SIZE = 0.86;
const BASE_SIZE = 0.92;

const FACE_CONFIGS = [
  { pos: [OFFSET, 0, 0], rot: [0, Math.PI / 2, 0] }, // Right
  { pos: [-OFFSET, 0, 0], rot: [0, -Math.PI / 2, 0] }, // Left
  { pos: [0, OFFSET, 0], rot: [-Math.PI / 2, 0, 0] }, // Up
  { pos: [0, -OFFSET, 0], rot: [Math.PI / 2, 0, 0] }, // Down
  { pos: [0, 0, OFFSET], rot: [0, 0, 0] }, // Front
  { pos: [0, 0, -OFFSET], rot: [0, Math.PI, 0] }, // Back
] as const;

export const Cubie = forwardRef<Group, CubieProps>(function Cubie(
  { position, colors, rotation, ...props },
  ref,
) {
  return (
    <group position={position} rotation={rotation} ref={ref} {...props}>
      {/* 
        1. Core: Black Rounded Base 
      */}
      <RoundedBox args={[BASE_SIZE, BASE_SIZE, BASE_SIZE]} radius={0.08} smoothness={4}>
        <meshStandardMaterial color={CUBE_3D_COLORS.BLACK} roughness={0.5} metalness={0.1} />
      </RoundedBox>

      {/* 
        2. Face Plates (Stickers/Tiles)
      */}
      {colors.map((color: string, index: number) => {
        if (color === CUBE_3D_COLORS.BLACK) return null;

        const config = FACE_CONFIGS[index];

        return (
          <group
            key={index}
            position={config.pos as [number, number, number]}
            rotation={config.rot as [number, number, number]}
          >
            {/* The colored plate */}
            <RoundedBox args={[FACE_SIZE, FACE_SIZE, THICKNESS]} radius={0.04} smoothness={4}>
              <meshPhysicalMaterial
                color={color}
                roughness={0.2}
                metalness={0.0}
                clearcoat={1}
                clearcoatRoughness={0.15}
                reflectivity={0.5}
              />
            </RoundedBox>
          </group>
        );
      })}
    </group>
  );
});
