export type Penalty = 'NONE' | '+2' | 'DNF';

export type Solve = {
  id: string;
  timeMs: number;
  penalty: Penalty;
  effectiveMs: number;
  scramble: string;
  createdAt: string;
};

export type Session = {
  id: string;
  name: string;
  solves: Solve[];
};

export type TimerState = 'idle' | 'inspection' | 'running' | 'stopped';

export type Settings = {
  inspectionDuration: number;
  soundsEnabled: boolean;
  autoInspectionPenalty: boolean;
  theme: 'dark' | 'light';
};
