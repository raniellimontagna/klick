import { CubeScene } from './components/cube-scene';

export function Cube3D() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full p-4">
      <div className="w-full h-full max-h-[600px] max-w-[800px] border border-white/10 rounded-xl overflow-hidden bg-surface/50 shadow-2xl relative">
        <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h1 className="text-xl font-bold text-white/90">3D Visualizer</h1>
          <p className="text-xs text-white/50">Drag to rotate • Scroll to zoom</p>
        </div>
        
        <CubeScene />
      </div>
    </div>
  );
}
