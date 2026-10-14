// Tipos do domínio, compartilhados por core, data e ui. Em tempo de execução só existem DEFAULT_SETTINGS e defaultSettings().

export type Penalty = null | '+2' | 'DNF';

export type EventId = '333' | '222' | '444' | '555' | '666' | '777' | '333oh' | '333bf' | 'minx' | 'pyram' | 'skewb' | 'sq1' | 'clock';

export interface Solve {
  id: string;
  sessionId: string;
  event: EventId;
  ms: number; // tempo bruto, sem a penalidade
  penalty: Penalty;
  at: number; // momento do solve (ms desde 1970)
  scramble: string;
  note: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null; // marca de exclusão (lixeira); null enquanto o solve está ativo
}

export interface Session {
  id: string;
  name: string;
  event: EventId;
  order: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

// Uma tentativa do treino de algoritmos (spec 9.1). Fica fora dos solves: nada do treino entra nas estatísticas, nos recordes, nas
// temporadas nem nos marcos.
export interface Practice {
  id: string; // newId()
  caseId: string; // id de um TrainCase (core/trail/cases.ts)
  ms: number; // o tempo do timer
  ok: boolean;
  helped: boolean; // a pessoa viu o algoritmo antes de começar
  at: number;
}

export type Theme = 'system' | 'light' | 'dark';

// O Centro no Timer (spec do sub-projeto 3, seção 6.5): animado, estático (sem movimento) ou oculto (fora do Timer).
export type CentroMode = 'animado' | 'estatico' | 'oculto';

export interface Settings {
  inspection: boolean;
  holdMs: number; // quanto tempo segurar para armar
  mobileArm: 'two' | 'one'; // no celular: dois polegares ou um toque
  theme: Theme;
  sound: { klick: boolean; insp: boolean; pb: boolean };
  silent: boolean;
  reducedMotion: 'system' | 'always';
  dailyGoal: number;
  scrambleImage: boolean;
  centro: CentroMode;
}

export type FinishId = 'fosco' | 'brilho' | 'gelo' | 'carbono';

// Temporadas (spec do sub-projeto 3, seção 5). As metas de tempo são em ms e valem estritamente abaixo.
export type MarkKind = 'count' | 'single' | 'ao5' | 'ao12' | 'streak' | 'steady';

export interface SeasonMark {
  kind: MarkKind;
  target: number; // count: solves; single, ao5 e ao12: ms; streak: dias; steady: folga em ms
}

// As marcas que geraram as metas de uma temporada (nulas na T1, que tem metas fixas).
export interface SeasonBasis {
  single: number | null;
  ao5: number | null;
  ao12: number | null;
}

export interface SeasonState {
  n: number; // 1, 2, 3…
  startedAt: number; // contam os solves com at > startedAt (a T1 começa em 0)
  marks: SeasonMark[]; // sempre 9, na ordem da lista
  basis: SeasonBasis;
}

export interface SeasonRecord {
  n: number;
  startedAt: number;
  endedAt: number; // o momento do solve que fechou a temporada
  solves: number; // solves de 3×3 da temporada
  startAo12: number | null; // basis.ao12 (nula na T1)
  endAo12: number | null; // a melhor média de 12 dentro da temporada
}

export interface SeasonProgress {
  current: SeasonState;
  past: SeasonRecord[];
}

export interface Profile {
  settings: Settings;
  trail: boolean[];
  finish: FinishId;
  onboarded: boolean;
  currentSessionId: string | null;
  season: SeasonProgress; // a temporada atual e as fechadas (spec do sub-projeto 3, seção 5.1)
}

// Estado local deste aparelho: versão do esquema, contadores e marcas das cópias de segurança, e sinalizadores de avisos já tratados.
export interface Meta {
  schemaVersion: number;
  deviceId: string;
  lastBackupAt: number | null;
  solvesSinceBackup: number;
  lastBackupDay: string | null;
  lastExportAt: number | null;
  solvesSinceExport: number;
  lastFolderSaveAt: number | null;
  solvesSinceFolderSave: number;
  lastFolderSaveDay: string | null;
  v1ImportOffered: boolean;
  persistRequested: boolean;
  installGuideDismissed: boolean;
}

// Congelado por inteiro, inclusive o grupo de sons: quem precisar alterar trabalha numa cópia (defaultSettings).
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  inspection: true,
  holdMs: 300,
  mobileArm: 'two',
  theme: 'system',
  sound: Object.freeze({ klick: true, insp: true, pb: true }),
  silent: false,
  reducedMotion: 'system',
  dailyGoal: 20,
  scrambleImage: true,
  centro: 'animado',
});

// Cópia nova, profunda e mutável dos ajustes padrão, para montar um perfil ou um estado que a interface vá alterar.
export function defaultSettings(): Settings {
  return structuredClone(DEFAULT_SETTINGS);
}
