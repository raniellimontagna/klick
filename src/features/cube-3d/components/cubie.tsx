import type { CubieFaces } from '../lib/types';

interface CubieProps {
  position: [number, number, number];
  colors: CubieFaces;
}

export function Cubie({ position, colors }: CubieProps) {
  return (
    <mesh position={position}>
      {/* Box with slightly reduced size to create gaps */}
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      {/* Map colors to the 6 faces: Right, Left, Top, Bottom, Front, Back */}
      {colors.map((color, index) => (
        <meshStandardMaterial 
          key={index} 
          attach={`material-${index}`} 
          color={color} 
          roughness={0.5}
          metalness={0.1}
        />
      ))}
    </mesh>
  );
}
