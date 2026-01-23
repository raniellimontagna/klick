import { useRef } from 'react';
import { Group } from 'three';
import { useCubeState } from '../use-cube-state';
import { Cubie } from './cubie';

export function RubiksCube() {
  const groupRef = useRef<Group>(null);
  const { cubies } = useCubeState();

  return (
    <group ref={groupRef}>
      {cubies.map((cubie) => (
        <Cubie
          key={cubie.id}
          position={cubie.position}
          colors={cubie.faces}
        />
      ))}
    </group>
  );
}
