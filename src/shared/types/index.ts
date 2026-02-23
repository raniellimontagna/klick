import { z } from 'zod';

export const PenaltySchema = z.enum(['NONE', '+2', 'DNF']);

export const SolveSchema = z.object({
  id: z.uuid(),
  timeMs: z.number().min(0),
  penalty: PenaltySchema,
  effectiveMs: z.number(),
  scramble: z.string(),
  createdAt: z.date(),
});

export const PuzzleTypeSchema = z.enum([
  '3x3',
  '2x2',
  '4x4',
  '5x5',
  'pyraminx',
  'megaminx',
  'skewb',
  'square1',
]);

export const SessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  puzzleType: PuzzleTypeSchema,
  solves: z.array(SolveSchema),
});

export const SettingsSchema = z.object({
  inspectionDuration: z.number().min(0),
  soundsEnabled: z.boolean(),
  autoInspectionPenalty: z.boolean(),
  theme: z.enum(['dark', 'light']),
});

export type Penalty = z.infer<typeof PenaltySchema>;
export type Solve = z.infer<typeof SolveSchema>;
export type PuzzleType = z.infer<typeof PuzzleTypeSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export type TimerState = 'idle' | 'inspection' | 'running' | 'stopped';
