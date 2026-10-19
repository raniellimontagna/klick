// Tipos do domínio, compartilhados por core, data e ui. Em tempo de execução só existem DEFAULT_SETTINGS e defaultSettings().
import type { TrailStep } from './trail/types';

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
  // Trilha e treino (spec do sub-projeto 4, seção 9.2). Um perfil antigo, sem eles, lê {}, {} e [].
  lessonAt: Partial<Record<TrailStep, number>>; // o passo em que cada aula parou (some ao concluir)
  algChoice: Record<string, number>; // id do caso → índice em algs (sem a chave: o padrão, 0)
  trainOff: string[]; // ids dos casos fora do sorteio
  // O nome que a pessoa mostra nos links de desafio (spec do desafio, seção 5): texto simples de uma linha, aparado, até 20 caracteres. É da
  // conta (vai no sync, como o acabamento e o tour), não do aparelho. Um perfil de antes dos desafios, sem ele, lê ''.
  duelName: string;
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
  trailPromptDismissed: boolean; // o aviso "Já resolve? Marque o que já sabe" foi dispensado neste aparelho
}

// Alteração do perfil. Os ajustes (e o grupo de sons) podem vir parciais: o repositório junta com o que está gravado dentro
// da própria transação, e duas abas que mudam ajustes diferentes não desfazem uma à outra.
export type ProfilePatch = Omit<Partial<Profile>, 'settings'> & {
  settings?: Partial<Omit<Settings, 'sound'>> & { sound?: Partial<Settings['sound']> };
};

// O arquivo do Klick (exportar, importar, cópias). Mora aqui, e não no repositório, porque o Worker também o escreve (as cópias diárias).
export interface KlickExport {
  format: 'klick';
  version: 1;
  exportedAt: number;
  sessions: Session[];
  solves: Solve[];
  profile: ProfilePatch | null; // o export sai completo; o que vem de um arquivo pode faltar campo (quem grava junta com o perfil daqui)
  practice?: Practice[]; // o treino (spec do sub-projeto 4, seção 9.3); um arquivo de antes do treino não tem
  duels?: Duel[]; // os desafios (spec do desafio, seção 7); um arquivo de antes deles não tem
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

// O desafio por link (spec do desafio, seções 3 e 4). Um tempo do desafio: `ms` é o tempo cru; o +2 só entra na comparação.
export interface DuelTime {
  ms: number;
  penalty: Penalty;
}

export type DuelSide = 'a' | 'b'; // a = quem desafia

// O que viaja no fragmento do link. `b` só existe na resposta (mesmos campos de `a`).
export interface DuelLink {
  v: 1;
  id: string;
  event: EventId;
  scrambles: string[];
  a: { name: string; times: DuelTime[] };
  b?: { name: string; times: DuelTime[] };
}

export type DuelStatus = 'playing' | 'waiting' | 'done'; // jogando, esperando a resposta, terminado

// Um desafio guardado neste aparelho (spec do desafio, seção 7): um registro por lado da partida, com o id `${linkId}-${side}` (desafiar a
// si mesmo grava os dois lados sem colidir). Os tempos do desafio ficam só aqui, nunca em `solves`: nada dele entra nas estatísticas.
export interface Duel {
  id: string;
  linkId: string; // o id do link (DuelLink.id)
  side: DuelSide; // o lado deste aparelho
  event: EventId;
  scrambles: string[];
  mine: DuelTime[]; // os tempos deste lado, na ordem dos embaralhamentos
  theirs: DuelTime[] | null; // os do outro lado; null enquanto a resposta não chega
  myName: string;
  theirName: string;
  status: DuelStatus;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null; // marca de exclusão (lixeira), como nos solves
}
