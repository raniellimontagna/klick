import type { CubeCameraPreset, CubeCameraPresetId } from './types';

const cubeCameraPresets: Record<CubeCameraPresetId, CubeCameraPreset> = {
  home: {
    id: 'home',
    position: [5.4, 4.2, 5.9],
    target: [0, 0.35, 0],
    minDistance: 5.5,
    maxDistance: 8.5,
    fov: 38,
  },
  tutorial: {
    id: 'tutorial',
    position: [5.8, 4.9, 5.1],
    target: [0, 0.45, 0],
    minDistance: 5.5,
    maxDistance: 9,
    fov: 40,
  },
  training: {
    id: 'training',
    position: [6.2, 4.1, 6.2],
    target: [0, 0.3, 0],
    minDistance: 5.5,
    maxDistance: 9.5,
    fov: 40,
  },
  explorer: {
    id: 'explorer',
    position: [6, 5, 6],
    target: [0, 0.4, 0],
    minDistance: 6,
    maxDistance: 12,
    fov: 40,
  },
  front: {
    id: 'front',
    position: [0, 4.7, 7.2],
    target: [0, 0.35, 0],
    minDistance: 5.5,
    maxDistance: 9.5,
    fov: 38,
  },
  'top-front': {
    id: 'top-front',
    position: [0, 6.6, 5.6],
    target: [0, 0.35, 0],
    minDistance: 5.5,
    maxDistance: 10,
    fov: 40,
  },
  'front-right': {
    id: 'front-right',
    position: [6.7, 3.8, 4.8],
    target: [0, 0.3, 0],
    minDistance: 5.5,
    maxDistance: 9.5,
    fov: 38,
  },
};

export function getCubeCameraPreset(presetId: CubeCameraPresetId = 'explorer'): CubeCameraPreset {
  return cubeCameraPresets[presetId];
}
