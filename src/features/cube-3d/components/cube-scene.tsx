import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useState, useRef, useEffect } from 'react';
import { useCubeInteraction } from '../hooks/use-cube-interaction';
import type { MoveDefinition } from '../lib/moves';
import type { CubieData } from '../lib/types';
import { RubiksCube } from './rubiks-cube';

interface CubeSceneProps {
  cubies?: CubieData[];
  moveQueue?: MoveDefinition[];
  completeMove?: () => void;
  startMove?: () => void;
  applyMove?: (move: string) => void;
  cubeGeneration?: number;
  realignCounter?: number;
}

export function CubeScene({
  cubies = [],
  moveQueue = [],
  completeMove = () => {},
  startMove = () => {},
  applyMove = () => {},
  cubeGeneration = 0,
  realignCounter = 0,
}: CubeSceneProps) {
  const [orbitEnabled, setOrbitEnabled] = useState(true);

  // We use any here to avoid complex three-stdlib resolution issues while still
  // allowing access to the .reset() method of the OrbitControls instance.
  const controlsRef = useRef<any>(null);

  // Realign camera when counter changes
  useEffect(() => {
    if (controlsRef.current && realignCounter > 0) {
      controlsRef.current.reset();
    }
  }, [realignCounter]);

  const { handlePointerDown, handlePointerUp } = useCubeInteraction({
    enabled: true,
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
      {/* Lighting setup - Premium balance (No HDRI to prevent crash) */}
      <ambientLight intensity={0.7} />
      <hemisphereLight intensity={0.5} color="#ffffff" groundColor="#000000" />
      <directionalLight position={[10, 10, 5]} intensity={1.8} castShadow />
      <directionalLight position={[-10, -5, -5]} intensity={0.8} />
      <spotLight position={[0, 10, 0]} intensity={1} angle={0.5} penumbra={1} />

      <group position={[0, 0.5, 0]}>
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
        enabled={orbitEnabled}
      />
    </Canvas>
  );
}
