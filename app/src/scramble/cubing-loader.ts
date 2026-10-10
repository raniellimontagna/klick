import type { EventId } from '../core/types';
import { eventInfo } from '../core/events';

export interface CubingModule {
  randomScrambleForEvent(eventId: string): Promise<{ toString(): string }>;
  TwistyPlayer: new (config: Record<string, unknown>) => HTMLElement;
}

let cached: Promise<CubingModule> | null = null;

export function loadCubing(): Promise<CubingModule> {
  const url = `${location.origin}${import.meta.env.BASE_URL}vendor/cubing/cubing.js`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached ??= import(/* @vite-ignore */ url) as Promise<any>;
  return cached;
}

export async function generateScramble(event: EventId): Promise<string> {
  const cubing = await loadCubing();
  return (await cubing.randomScrambleForEvent(eventInfo(event).scrambleId)).toString();
}
