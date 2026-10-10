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

export type Theme = 'system' | 'light' | 'dark';

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
}

export type FinishId = 'fosco' | 'brilho' | 'gelo' | 'carbono';

export interface Profile {
  settings: Settings;
  trail: boolean[];
  finish: FinishId;
  onboarded: boolean;
  currentSessionId: string | null;
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
});

// Cópia nova, profunda e mutável dos ajustes padrão, para montar um perfil ou um estado que a interface vá alterar.
export function defaultSettings(): Settings {
  return structuredClone(DEFAULT_SETTINGS);
}
