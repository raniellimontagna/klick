import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { RubiksCube } from './rubiks-cube';

export function CubeScene() {
  return (
    <div className="w-full h-full min-h-[400px]">
      <Canvas dpr={[1, 2]} camera={{ position: [4, 4, 4], fov: 50 }}>
        <color attach="background" args={['#0D1117']} /> {/* Match app background or keep transparent */}
        
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        {/* Stage handles environment and centering nicely, but manual lights give more control. 
            Let's stick to manual lights for now for predictability. */}
        
        <group>
          <RubiksCube />
        </group>

        <OrbitControls 
          enablePan={false}
          minDistance={3}
          maxDistance={10}
        />
      </Canvas>
    </div>
  );
}
