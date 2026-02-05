import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import type { MoveDefinition } from '../lib/moves';
import type { CubieData } from '../lib/types';
import { Cubie } from './cubie';

interface RubiksCubeProps {
  cubies: CubieData[];
  moveQueue: MoveDefinition[];
  completeMove: () => void;
}

export function RubiksCube({ cubies, moveQueue, completeMove }: RubiksCubeProps) {
  const groupRef = useRef<Group>(null);
  const pivotRef = useRef<Group>(null);

  // Animation state Refs (mutable to avoid re-renders during loop)
  const isAnimating = useRef(false);
  const currentMove = useRef<MoveDefinition | null>(null);
  const currentAngle = useRef(0);

  // Map of cubie IDs to their ThreeJS Group objects
  const cubieRefs = useRef<Record<string, Group>>({});

  useFrame((_, delta) => {
    // 1. Start Animation if idle and queue has moves
    if (!isAnimating.current) {
      if (moveQueue.length === 0) return;

      const move = moveQueue[0];
      currentMove.current = move;
      isAnimating.current = true;
      currentAngle.current = 0;

      // Reset pivot to origin
      if (pivotRef.current) {
        const pivot = pivotRef.current;
        pivot.rotation.set(0, 0, 0);
        pivot.position.set(0, 0, 0);
        pivot.updateMatrixWorld();

        // Attach affected cubies to pivot group
        // Axis mapping: x=0, y=1, z=2 in position array
        const coordIndex = move.axis === 'x' ? 0 : move.axis === 'y' ? 1 : 2;

        cubies.forEach((cubie) => {
          // Check if cubie is in the rotating layer
          if (move.layers.includes(cubie.position[coordIndex])) {
            const mesh = cubieRefs.current[cubie.uid];
            // Using THREE.Object3D.attach preserves world transform
            if (mesh) pivot.attach(mesh);
          }
        });
      }
      return;
    }

    // 2. Process active Animation Frame
    if (isAnimating.current && currentMove.current && pivotRef.current) {
      const move = currentMove.current;
      // Apply rotation in the direction specified by the move
      // Direction is unified across visual, position, and face updates
      const target = (Math.PI / 2) * move.direction;
      const speed = 5; // Slower speed (approx 0.3s per move)

      const diff = target - currentAngle.current;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * delta);

      currentAngle.current += step;

      // Apply rotation to pivot
      pivotRef.current.rotation[move.axis] = currentAngle.current;
      pivotRef.current.updateMatrixWorld();

      // Check completion (snap distance)
      if (Math.abs(target - currentAngle.current) < 0.001) {
        // Snap to exact target rotation
        pivotRef.current.rotation[move.axis] = target;
        pivotRef.current.updateMatrixWorld();

        // Detach children back to main group
        while (pivotRef.current.children.length > 0) {
          const child = pivotRef.current.children[0];
          groupRef.current?.attach(child);

          // CRITICAL: Reset physical rotation to zero.
          // The logical state update will calculate the correct faces for the new position.
          child.rotation.set(0, 0, 0);
          child.updateMatrix();
        }

        // Reset pivot for next use
        pivotRef.current.rotation.set(0, 0, 0);
        pivotRef.current.updateMatrixWorld();

        // Reset Logic state
        isAnimating.current = false;
        currentMove.current = null;

        // Signal logical update
        completeMove();
      }
    }
  });

  return (
    <group ref={groupRef} frustumCulled={false}>
      {/* Invisible pivot group for rotations */}
      <group ref={pivotRef} frustumCulled={false} />

      {cubies.map((cubie) => (
        <Cubie
          key={cubie.uid}
          ref={(el) => {
            if (el) cubieRefs.current[cubie.uid] = el;
          }}
          position={cubie.position}
          rotation={[0, 0, 0]} // Explicitly force rotation reset on render
          faces={cubie.faces}
        />
      ))}
    </group>
  );
}
