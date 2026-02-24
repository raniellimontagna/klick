import type { ThreeEvent } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import type { MoveDefinition } from '../lib/moves';
import type { CubieData, CubieFace, Vec3 } from '../lib/types';
import { Cubie } from './cubie';

interface RubiksCubeProps {
  cubies: CubieData[];
  moveQueue: MoveDefinition[];
  completeMove: () => void;
  startMove?: () => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>, position: Vec3, face: CubieFace) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
  cubeGeneration?: number;
}

// Extended type to access uid if present
interface QueuedMove extends MoveDefinition {
  uid?: string;
}

export const RubiksCube: React.FC<RubiksCubeProps> = ({
  cubies,
  moveQueue,
  completeMove,
  startMove,
  onPointerDown,
  onPointerUp,
  cubeGeneration = 0,
}: RubiksCubeProps): React.ReactElement => {
  const groupRef = useRef<Group>(null);
  const pivotRef = useRef<Group>(null);

  // Animation state
  const isAnimating = useRef(false);
  const currentMoveUid = useRef<string | null>(null);
  const currentAngle = useRef(0);
  const targetAngle = useRef(0);
  const currentAxis = useRef<'x' | 'y' | 'z'>('x');

  // Map of cubie IDs to their ThreeJS Group objects
  const cubieRefs = useRef<Record<string, Group>>({});

  useFrame((_, delta) => {
    const queuedMove = moveQueue[0] as QueuedMove | undefined;

    // 1. Handle animation abort (e.g. Skip Scramble or Reset mid-animation)
    if (isAnimating.current && (!queuedMove || queuedMove.uid !== currentMoveUid.current)) {
      if (pivotRef.current) {
        // Force detach all cubies back to main group
        while (pivotRef.current.children.length > 0) {
          const child = pivotRef.current.children[0];
          groupRef.current?.attach(child);
          child.rotation.set(0, 0, 0); // Ensure rotation is reset
          child.updateMatrix();
        }
        // Reset pivot
        pivotRef.current.rotation.set(0, 0, 0);
        pivotRef.current.updateMatrixWorld();
      }
      isAnimating.current = false;
      currentMoveUid.current = null;
      return;
    }

    // 2. Start new animation if not animating and queue has moves
    if (!isAnimating.current) {
      if (!queuedMove) return;

      // Skip if we already animated this exact move (StrictMode protection)
      if (queuedMove.uid && currentMoveUid.current === queuedMove.uid) {
        return;
      }

      // Start animation
      currentMoveUid.current = queuedMove.uid || null;
      currentAxis.current = queuedMove.axis;
      targetAngle.current = (Math.PI / 2) * queuedMove.direction;
      currentAngle.current = 0;
      isAnimating.current = true;

      // Notify state manager that animation started
      startMove?.();

      // Setup pivot
      if (pivotRef.current) {
        const pivot = pivotRef.current;
        pivot.rotation.set(0, 0, 0);
        pivot.position.set(0, 0, 0);
        pivot.updateMatrixWorld();

        // Attach affected cubies
        const coordIndex = queuedMove.axis === 'x' ? 0 : queuedMove.axis === 'y' ? 1 : 2;
        cubies.forEach((cubie) => {
          if (queuedMove.layers.includes(cubie.position[coordIndex])) {
            const mesh = cubieRefs.current[cubie.uid];
            if (mesh) pivot.attach(mesh);
          }
        });
      }
      return;
    }

    // 2. Process animation frame
    if (isAnimating.current && pivotRef.current) {
      const duration = 0.25; // seconds
      const progress = Math.min(1, currentAngle.current + delta / duration);
      currentAngle.current = progress;

      // Cubic ease-out: f(t) = 1 - (1 - t)^3
      const easeOutCubic = 1 - (1 - progress) ** 3;
      const angle = targetAngle.current * easeOutCubic;

      pivotRef.current.rotation[currentAxis.current] = angle;
      pivotRef.current.updateMatrixWorld();

      // Check completion
      if (progress >= 1) {
        // Snap to target
        pivotRef.current.rotation[currentAxis.current] = targetAngle.current;
        pivotRef.current.updateMatrixWorld();

        // Detach children back to main group
        while (pivotRef.current.children.length > 0) {
          const child = pivotRef.current.children[0];
          groupRef.current?.attach(child);
          child.rotation.set(0, 0, 0);
          child.updateMatrix();
        }

        // Reset pivot
        pivotRef.current.rotation.set(0, 0, 0);
        pivotRef.current.updateMatrixWorld();

        // Reset animation state
        isAnimating.current = false;

        // Signal completion to state
        completeMove();
      }
    }
  });

  return (
    <group ref={groupRef} frustumCulled={false}>
      <group ref={pivotRef} frustumCulled={false} />

      {cubies.map((cubie) => (
        <Cubie
          key={`${cubeGeneration}-${cubie.uid}`}
          ref={(el) => {
            if (el) cubieRefs.current[cubie.uid] = el;
          }}
          position={cubie.position}
          rotation={[0, 0, 0]}
          faces={cubie.faces}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        />
      ))}
    </group>
  );
};
