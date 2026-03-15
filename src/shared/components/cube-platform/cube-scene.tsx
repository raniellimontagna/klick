import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useCubePlatformInteraction } from '@/shared/hooks/use-cube-platform-interaction';
import {
  getCubePuzzleDefinition,
  type MoveDefinition,
  type CubePuzzleType,
  type CubieData,
} from '@/shared/lib/cube-platform';
import { RubiksCube } from './rubiks-cube';

interface CubePlatformSceneProps {
  cubies?: CubieData[];
  moveQueue?: MoveDefinition[];
  completeMove?: () => void;
  startMove?: () => void;
  applyMove?: (move: string) => void;
  cubeType?: CubePuzzleType;
  cubeGeneration?: number;
  realignCounter?: number;
  interactive?: boolean;
}

export const CubePlatformScene: React.FC<CubePlatformSceneProps> = ({
  cubies = [],
  moveQueue = [],
  completeMove = (): void => {},
  startMove = (): void => {},
  applyMove = (): void => {},
  cubeType = '3x3',
  cubeGeneration = 0,
  realignCounter = 0,
  interactive = true,
}: CubePlatformSceneProps): React.ReactElement => {
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const renderScale = useMemo(() => getCubePuzzleDefinition(cubeType).renderScale, [cubeType]);

  useEffect(() => {
    if (controlsRef.current && realignCounter > 0) {
      controlsRef.current.reset();
    }
  }, [realignCounter]);

  const { handlePointerDown, handlePointerUp } = useCubePlatformInteraction({
    enabled: interactive,
    cubeType,
    applyMove,
    setOrbitEnabled,
  });

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [6, 5, 6], fov: 40 }}
      style={{ touchAction: 'none' }}
      gl={{ alpha: true }}
      shadows
    >
      <ambientLight intensity={0.7} />
      <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#000000" />
      <directionalLight position={[10, 10, 5]} intensity={1.8} castShadow />
      <directionalLight position={[-10, -5, -5]} intensity={0.8} />
      <spotLight position={[0, 10, 0]} intensity={1} angle={0.5} penumbra={1} />

      <group position={[0, 0.5, 0]} scale={[renderScale, renderScale, renderScale]}>
        {cubies.length > 0 && (
          <RubiksCube
            cubies={cubies}
            moveQueue={moveQueue}
            completeMove={completeMove}
            startMove={startMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            cubeGeneration={cubeGeneration}
          />
        )}
      </group>

      <ContactShadows
        position={[0, -1.5, 0]}
        opacity={0.4}
        scale={10}
        blur={2.5}
        far={4.5}
        resolution={256}
        color="#000000"
      />

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        minDistance={6}
        maxDistance={12}
        autoRotate={false}
        autoRotateSpeed={0.8}
        makeDefault
        enabled={orbitEnabled || !interactive}
      />
    </Canvas>
  );
};
