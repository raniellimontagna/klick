import { create } from 'zustand';
import type {
  CubePlaybackMode,
  CubePlaybackSpeed,
  CubePuzzleType,
} from '@/shared/lib/cube-platform/types';

export type CubePlatformTelemetryAction =
  | 'play'
  | 'pause'
  | 'next-step'
  | 'previous-step'
  | 'restart'
  | 'finish'
  | 'speed-change';

export interface CubePlatformTelemetryEvent {
  id: string;
  action: CubePlatformTelemetryAction;
  context?: string;
  cubeType: CubePuzzleType;
  mode: CubePlaybackMode;
  speed: CubePlaybackSpeed;
  stepIndex: number;
  stepCount: number;
  reducedMotion: boolean;
  createdAt: string;
}

interface CubePlatformTelemetryStore {
  events: CubePlatformTelemetryEvent[];
  recordEvent: (
    event: Omit<CubePlatformTelemetryEvent, 'createdAt' | 'id'>,
  ) => CubePlatformTelemetryEvent;
  clearEvents: () => void;
}

let telemetryCounter = 0;

export const useCubePlatformTelemetryStore = create<CubePlatformTelemetryStore>((set) => ({
  events: [],
  recordEvent: (event) => {
    const nextEvent: CubePlatformTelemetryEvent = {
      ...event,
      id: `cube-telemetry-${++telemetryCounter}`,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      events: [...state.events.slice(-99), nextEvent],
    }));

    return nextEvent;
  },
  clearEvents: () => set({ events: [] }),
}));
