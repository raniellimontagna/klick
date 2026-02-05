import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useRef } from 'react';
import { Vector2 } from 'three';
import type { CubieFace, Vec3 } from '../lib/types';

interface DragState {
  isDragging: boolean;
  startPos: Vector2;
  cubiePos: Vec3;
  faceNormal: Vec3;
  faceId: string;
}

interface UseCubeInteractionProps {
  enabled: boolean;
  applyMove: (move: string) => void;
  setOrbitEnabled: (enabled: boolean) => void;
}

// Threshold to consider a drag as a swipe (in pixels)
const SWIPE_THRESHOLD = 20;

export function useCubeInteraction({
  enabled,
  applyMove,
  setOrbitEnabled,
}: UseCubeInteractionProps) {
  const dragState = useRef<DragState | null>(null);

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>, cubiePos: Vec3, face: CubieFace) => {
      if (!enabled) return;

      // Stop propagation to prevent OrbitControls from handling this pointer down
      e.stopPropagation();
      setOrbitEnabled(false);

      dragState.current = {
        isDragging: true,
        startPos: new Vector2(e.clientX, e.clientY),
        cubiePos,
        faceNormal: face.normal,
        faceId: face.id,
      };

      // Ensure we get the pointerup event even if released outside the cubie
      // In R3F, we need to capture the pointer on the canvas element
      if (e.nativeEvent.target instanceof Element) {
        e.nativeEvent.target.setPointerCapture(e.pointerId);
      }
    },
    [enabled, setOrbitEnabled],
  );

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const state = dragState.current;
      if (!state || !state.isDragging) return;

      e.stopPropagation();
      setOrbitEnabled(true);

      if (e.nativeEvent.target instanceof Element) {
        try {
          e.nativeEvent.target.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore release errors if pointer wasn't captured
        }
      }

      const endPos = new Vector2(e.clientX, e.clientY);
      const delta = endPos.sub(state.startPos);

      // If drag was long enough, process it
      if (delta.length() > SWIPE_THRESHOLD) {
        const { cubiePos, faceNormal } = state;
        const [nx, ny, nz] = faceNormal;
        const [cx, cy, cz] = cubiePos;

        // Determine swipe direction dominance (horizontal vs vertical)
        const isHorizontal = Math.abs(delta.x) > Math.abs(delta.y);
        const directionSign = isHorizontal ? Math.sign(delta.x) : Math.sign(delta.y);

        let move: string | null = null;

        // Mapping 2D swipe to 3D move based on face normal
        if (Math.abs(ny) === 1) {
          // UP/DOWN
          const isUp = ny === 1;
          if (isHorizontal) {
            if (cz === 1) move = directionSign > 0 ? "F'" : 'F';
            else if (cz === 0) move = directionSign > 0 ? "S'" : 'S';
            else if (cz === -1) move = directionSign > 0 ? 'B' : "B'";
          } else {
            if (cx === 1) move = directionSign > 0 ? "R'" : 'R';
            else if (cx === 0) move = directionSign > 0 ? "M'" : 'M';
            else if (cx === -1) move = directionSign > 0 ? 'L' : "L'";
          }
          // Flip logic for DOWN face
          if (!isUp && move) {
            move = move.includes("'") ? move.replace("'", '') : move + "'";
          }
        } else if (Math.abs(nx) === 1) {
          // RIGHT/LEFT
          const isRight = nx === 1;
          const dir = isRight ? directionSign : -directionSign;
          if (isHorizontal) {
            if (cy === 1) move = dir > 0 ? "U'" : 'U';
            else if (cy === 0) move = dir > 0 ? "E'" : 'E';
            else if (cy === -1) move = dir > 0 ? 'D' : "D'";
          } else {
            if (cz === 1) move = dir > 0 ? "F'" : 'F';
            else if (cz === 0) move = dir > 0 ? "S'" : 'S';
            else if (cz === -1) move = dir > 0 ? 'B' : "B'";
          }
        } else if (Math.abs(nz) === 1) {
          // FRONT/BACK
          const isFront = nz === 1;
          const dir = isFront ? directionSign : -directionSign;
          if (isHorizontal) {
            if (cy === 1) move = dir > 0 ? "U'" : 'U';
            else if (cy === 0) move = dir > 0 ? "E'" : 'E';
            else if (cy === -1) move = dir > 0 ? 'D' : "D'";
          } else {
            if (cx === 1) move = dir > 0 ? "R'" : 'R';
            else if (cx === 0) move = dir > 0 ? "M'" : 'M';
            else if (cx === -1) move = dir > 0 ? 'L' : "L'";
          }
        }

        if (move) applyMove(move);
      }

      dragState.current = null;
    },
    [setOrbitEnabled, applyMove],
  );

  return { handlePointerDown, handlePointerUp };
}
