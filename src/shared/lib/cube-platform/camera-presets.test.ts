import { describe, expect, it } from 'vitest';
import { getCubeCameraPreset } from './camera-presets';

describe('getCubeCameraPreset', () => {
  it('returns stable home preview orientation', () => {
    const preset = getCubeCameraPreset('home');

    expect(preset.id).toBe('home');
    expect(preset.position).toEqual([5.4, 4.2, 5.9]);
    expect(preset.target).toEqual([0, 0.35, 0]);
  });

  it('exposes guided top-front orientation for didactic cases', () => {
    const preset = getCubeCameraPreset('top-front');

    expect(preset.id).toBe('top-front');
    expect(preset.position[1]).toBeGreaterThan(preset.position[2]);
    expect(preset.maxDistance).toBeGreaterThan(preset.minDistance);
  });
});
