import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { MoveDefinition } from '../lib/moves';
import type { CubieData } from '../lib/types';
import { RubiksCube } from './rubiks-cube';

interface CubeSceneProps {
  cubies?: CubieData[]; // Optional initially to prevent immediate crash if parent not updated
  moveQueue?: MoveDefinition[];
  completeMove?: () => void;
}

export function CubeScene({
  cubies = [],
  moveQueue = [],
  completeMove = () => {},
}: CubeSceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [6, 5, 6], fov: 40 }}
      style={{ background: '#0D1117' }}
    >
      {/* Lighting setup - simple but effective */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} />
      <pointLight position={[0, 5, 0]} intensity={0.5} />

      <group>
        {cubies.length > 0 && (
          <RubiksCube cubies={cubies} moveQueue={moveQueue} completeMove={completeMove} />
        )}
      </group>

      <OrbitControls
        enablePan={false}
        minDistance={6}
        maxDistance={12}
        autoRotate={false}
        autoRotateSpeed={0.8}
      />
    </Canvas>
  );
}
