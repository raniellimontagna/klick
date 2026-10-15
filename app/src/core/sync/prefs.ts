// Os ajustes da conta (store prefs) e os do aparelho (store profile), spec 5.2. O app monta o mesmo Profile de sempre a partir das
// duas partes (joinProfile), e as telas não percebem a divisão. Cada chave da conta segue "o mais recente vence", com a temporada à parte.
import { defaultSeason, seasonFrom } from '../season';
import { caseById } from '../trail/cases';
import { defaultSettings, type FinishId, type Profile, type SeasonProgress, type Settings } from '../types';
import { canonicalJson } from './merge';
import type { DeviceProfile, DeviceSettings, PrefItem } from './types';

export const TRAIL_STEPS = 9;
const FINISHES: readonly FinishId[] = ['fosco', 'brilho', 'gelo', 'carbono'];

// O que do perfil é da conta: trilha, aulas, treino, acabamento, tour, inspeção, meta diária e temporada.
export interface AccountProfile {
  trail: boolean[];
  lessonAt: Profile['lessonAt'];
  algChoice: Record<string, number>;
  trainOff: string[];
  finish: FinishId;
  onboarded: boolean;
  season: SeasonProgress;
  settings: Pick<Settings, 'inspection' | 'dailyGoal'>;
}

const isWhole = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;
const stepOf = (key: string, prefix: string): number | null => {
  const m = key.slice(prefix.length);
  return /^[0-8]$/.test(m) ? Number(m) : null;
};

// O valor que uma chave tem quando ninguém a gravou. Sumir uma aula, uma escolha ou um caso fora do sorteio é gravar este valor.
export function defaultPrefValue(key: string): unknown {
  if (key.startsWith('trail.')) return false;
  if (key.startsWith('lessonAt.')) return null;
  if (key.startsWith('algChoice.')) return 0;
  if (key.startsWith('trainOff.')) return false;
  switch (key) {
    case 'finish':
      return 'fosco';
    case 'onboarded':
      return false;
    case 'settings.inspection':
      return true;
    case 'settings.dailyGoal':
      return 20;
    case 'season':
      return defaultSeason();
    default:
      return undefined;
  }
}

// A chave existe e o valor tem o tipo dela. O servidor recusa o resto (spec 6.1, passo 1); o app ignora.
export function isPrefValue(key: string, value: unknown): boolean {
  if (key.startsWith('trail.')) return stepOf(key, 'trail.') !== null && typeof value === 'boolean';
  if (key.startsWith('lessonAt.')) return stepOf(key, 'lessonAt.') !== null && (value === null || isWhole(value, 0));
  if (key.startsWith('algChoice.')) {
    const c = caseById(key.slice('algChoice.'.length));
    return c !== undefined && isWhole(value, 0) && value < c.algs.length;
  }
  if (key.startsWith('trainOff.')) return caseById(key.slice('trainOff.'.length)) !== undefined && typeof value === 'boolean';
  switch (key) {
    case 'finish':
      return typeof value === 'string' && (FINISHES as readonly string[]).includes(value);
    case 'onboarded':
    case 'settings.inspection':
      return typeof value === 'boolean';
    case 'settings.dailyGoal':
      return isWhole(value, 1);
    case 'season':
      return seasonFrom(value) !== null;
    default:
      return false;
  }
}

// O perfil da conta como itens. Sem `withDefaults`, só as chaves com valor diferente do padrão: é o que a migração grava (spec 5.6), e
// um aparelho com tudo no padrão não apaga o progresso do outro no primeiro login.
export function prefsFromProfile(p: AccountProfile, { withDefaults = false }: { withDefaults?: boolean } = {}): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (let i = 0; i < TRAIL_STEPS; i++) out.set(`trail.${i}`, p.trail[i] === true);
  for (const [step, at] of Object.entries(p.lessonAt)) if (at !== undefined) out.set(`lessonAt.${step}`, at);
  for (const [id, index] of Object.entries(p.algChoice)) if (index !== 0) out.set(`algChoice.${id}`, index);
  for (const id of p.trainOff) out.set(`trainOff.${id}`, true);
  out.set('finish', p.finish);
  out.set('onboarded', p.onboarded);
  out.set('settings.inspection', p.settings.inspection);
  out.set('settings.dailyGoal', p.settings.dailyGoal);
  out.set('season', p.season);
  if (withDefaults) return out;
  for (const [key, value] of out) if (canonicalJson(value) === canonicalJson(defaultPrefValue(key))) out.delete(key);
  return out;
}

// O perfil da conta a partir dos itens: o padrão por baixo, e cada item válido por cima. Um item que esta versão não conhece fica de fora.
// Os casos fora do sorteio saem na ordem em que foram tirados (updatedAt, depois a chave).
export function profileFromPrefs(items: Iterable<PrefItem>): AccountProfile {
  const p: AccountProfile = {
    trail: Array<boolean>(TRAIL_STEPS).fill(false),
    lessonAt: {},
    algChoice: {},
    trainOff: [],
    finish: 'fosco',
    onboarded: false,
    season: defaultSeason(),
    settings: { inspection: true, dailyGoal: 20 },
  };
  const off: PrefItem[] = [];
  for (const item of items) {
    const { key, value } = item;
    if (!isPrefValue(key, value)) continue;
    if (key.startsWith('trail.')) p.trail[stepOf(key, 'trail.')!] = value as boolean;
    else if (key.startsWith('lessonAt.')) {
      if (value !== null) (p.lessonAt as Record<number, number>)[stepOf(key, 'lessonAt.')!] = value as number;
    } else if (key.startsWith('algChoice.')) {
      if (value !== 0) p.algChoice[key.slice('algChoice.'.length)] = value as number;
    } else if (key.startsWith('trainOff.')) {
      if (value === true) off.push(item);
    } else if (key === 'finish') p.finish = value as FinishId;
    else if (key === 'onboarded') p.onboarded = value as boolean;
    else if (key === 'settings.inspection') p.settings.inspection = value as boolean;
    else if (key === 'settings.dailyGoal') p.settings.dailyGoal = value as number;
    else if (key === 'season') p.season = seasonFrom(value)!;
  }
  p.trainOff = off
    .sort((a, b) => a.updatedAt - b.updatedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((i) => i.key.slice('trainOff.'.length));
  return p;
}

export function defaultDeviceProfile(): DeviceProfile {
  const { inspection: _i, dailyGoal: _d, ...settings } = defaultSettings();
  return { settings, currentSessionId: null };
}

// Divide o perfil da tela nas duas partes.
export function splitProfile(p: Profile): { device: DeviceProfile; account: AccountProfile } {
  const { inspection, dailyGoal, ...settings } = p.settings;
  return {
    device: { settings: settings as DeviceSettings, currentSessionId: p.currentSessionId },
    account: {
      trail: p.trail,
      lessonAt: p.lessonAt,
      algChoice: p.algChoice,
      trainOff: p.trainOff,
      finish: p.finish,
      onboarded: p.onboarded,
      season: p.season,
      settings: { inspection, dailyGoal },
    },
  };
}

// Junta as duas partes no Profile de sempre. Um perfil do aparelho de antes (sem algum ajuste) lê os padrões por baixo.
export function joinProfile(device: DeviceProfile | undefined, account: AccountProfile): Profile {
  const base = defaultDeviceProfile();
  const d = device ?? base;
  return {
    settings: { ...base.settings, ...d.settings, sound: { ...base.settings.sound, ...d.settings?.sound }, ...account.settings },
    trail: account.trail,
    finish: account.finish,
    onboarded: account.onboarded,
    currentSessionId: d.currentSessionId ?? null,
    season: account.season,
    lessonAt: account.lessonAt,
    algChoice: account.algChoice,
    trainOff: account.trainOff,
  };
}
