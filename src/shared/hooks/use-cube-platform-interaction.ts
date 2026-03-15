import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useMemo, useRef } from 'react';
import { Vector2 } from 'three';
import { getCubePuzzleDefinition } from '../lib/cube-platform/puzzles';
import type { CubePuzzleType, CubieFace, Vec3 } from '../lib/cube-platform/types';

interface DragState {
  isDragging: boolean;
  startPos: Vector2;
  cubiePos: Vec3;
  faceNormal: Vec3;
}

type LayerRole = 'positive' | 'middle' | 'negative';

interface UseCubePlatformInteractionProps {
  enabled: boolean;
  cubeType: CubePuzzleType;
  applyMove: (move: string) => void;
  setOrbitEnabled: (enabled: boolean) => void;
}

const SWIPE_THRESHOLD = 20;
const LAYER_EPSILON = 0.000001;

function invertMove(move: string): string {
  return move.includes("'") ? move.replace("'", '') : `${move}'`;
}

function byLayerRole(
  role: LayerRole,
  moves: { positive: string; middle?: string; negative: string },
): string | null {
  if (role === 'positive') {
    return moves.positive;
  }

  if (role === 'middle') {
    return moves.middle ?? null;
  }

  return moves.negative;
}

function resolveLayerRole(
  coordinate: number,
  layers: { outerPositive: number; outerNegative: number; middle?: number },
): LayerRole {
  if (layers.middle !== undefined && Math.abs(coordinate - layers.middle) < LAYER_EPSILON) {
    return 'middle';
  }

  return coordinate > 0 ? 'positive' : 'negative';
}

interface UseCubePlatformInteractionReturn {
  handlePointerDown: (e: ThreeEvent<PointerEvent>, cubiePos: Vec3, face: CubieFace) => void;
  handlePointerUp: (e: ThreeEvent<PointerEvent>) => void;
}

export const useCubePlatformInteraction = ({
  enabled,
  cubeType,
  applyMove,
  setOrbitEnabled,
}: UseCubePlatformInteractionProps): UseCubePlatformInteractionReturn => {
  const dragState = useRef<DragState | null>(null);
  const puzzleDefinition = useMemo(() => getCubePuzzleDefinition(cubeType), [cubeType]);

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>, cubiePos: Vec3, face: CubieFace) => {
      if (!enabled) return;

      e.stopPropagation();
      setOrbitEnabled(false);
      document.body.style.cursor = 'grabbing';

      dragState.current = {
        isDragging: true,
        startPos: new Vector2(e.clientX, e.clientY),
        cubiePos,
        faceNormal: face.normal,
      };

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
      document.body.style.cursor = 'default';

      if (e.nativeEvent.target instanceof Element) {
        try {
          e.nativeEvent.target.releasePointerCapture(e.pointerId);
        } catch {
          // Ignore
        }
      }

      const endPos = new Vector2(e.clientX, e.clientY);
      const delta = endPos.sub(state.startPos);

      if (delta.length() > SWIPE_THRESHOLD) {
        const { cubiePos, faceNormal } = state;
        const [nx, ny, nz] = faceNormal;
        const [cx, cy, cz] = cubiePos;

        const isHorizontal = Math.abs(delta.x) > Math.abs(delta.y);
        const directionSign = isHorizontal ? Math.sign(delta.x) : Math.sign(delta.y);

        const xRole = resolveLayerRole(cx, puzzleDefinition.layers);
        const yRole = resolveLayerRole(cy, puzzleDefinition.layers);
        const zRole = resolveLayerRole(cz, puzzleDefinition.layers);

        let move: string | null = null;

        if (Math.abs(ny) === 1) {
          const isUp = ny === 1;
          if (isHorizontal) {
            move = directionSign > 0
              ? byLayerRole(zRole, { positive: "F'", middle: "S'", negative: 'B' })
              : byLayerRole(zRole, { positive: 'F', middle: 'S', negative: "B'" });
          } else {
            move = directionSign > 0
              ? byLayerRole(xRole, { positive: "R'", middle: "M'", negative: 'L' })
              : byLayerRole(xRole, { positive: 'R', middle: 'M', negative: "L'" });
          }

          if (!isUp && move) {
            move = invertMove(move);
          }
        } else if (Math.abs(nx) === 1) {
          const isRight = nx === 1;
          const dir = isRight ? directionSign : -directionSign;

          if (isHorizontal) {
            move = dir > 0
              ? byLayerRole(yRole, { positive: "U'", middle: "E'", negative: 'D' })
              : byLayerRole(yRole, { positive: 'U', middle: 'E', negative: "D'" });
          } else {
            move = dir > 0
              ? byLayerRole(zRole, { positive: "F'", middle: "S'", negative: 'B' })
              : byLayerRole(zRole, { positive: 'F', middle: 'S', negative: "B'" });
          }
        } else if (Math.abs(nz) === 1) {
          const isFront = nz === 1;
          const dir = isFront ? directionSign : -directionSign;

          if (isHorizontal) {
            move = dir > 0
              ? byLayerRole(yRole, { positive: "U'", middle: "E'", negative: 'D' })
              : byLayerRole(yRole, { positive: 'U', middle: 'E', negative: "D'" });
          } else {
            move = dir > 0
              ? byLayerRole(xRole, { positive: "R'", middle: "M'", negative: 'L' })
              : byLayerRole(xRole, { positive: 'R', middle: 'M', negative: "L'" });
          }
        }

        if (move) {
          applyMove(move);
        }
      }

      dragState.current = null;
    },
    [setOrbitEnabled, applyMove, puzzleDefinition],
  );

  return { handlePointerDown, handlePointerUp };
};
