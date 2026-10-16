// Entrada e saída de dados: o JSON do Klick, o export do csTimer (ida e volta) e a migração da v1. Só texto e objetos puros, sem
// banco nem tela: quem chama (Ajustes, AppState) lê o arquivo e grava o resultado pelo repositório.
//
// Nada some em silêncio. Um arquivo do Klick ou do csTimer (ou um registro dele) que não bate com o formato é recusado por inteiro,
// com um erro claro. A migração da v1 não recusa: lê o que bate e conta o que ficou de fora (readV1Invalid), para a pessoa saber.
// O que fica de fora por falta de dados (sessão sem evento) também volta contado no resultado.
import { EVENT_IDS, eventFromCsTimer, eventInfo } from '../core/events';
import { seasonFrom } from '../core/season';
import { algChoiceFrom, lessonAtFrom, practiceFrom, trainOffFrom } from '../core/trail/validate';
import type { EventId, FinishId, Penalty, Session, Settings, Solve } from '../core/types';
import { T, TRAIL } from '../strings';
import { derivedId } from './ids';
import type { KlickExport, ProfilePatch } from './repository';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
// Finito: o JSON.parse devolve Infinity para um número como 1e999.
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isEventId = (v: unknown): v is EventId => typeof v === 'string' && (EVENT_IDS as readonly string[]).includes(v);
const isPenalty = (v: unknown): v is Penalty => v === null || v === '+2' || v === 'DNF';
const isDeletedAt = (v: unknown): v is number | null => v === null || isNum(v);

// undefined quando o texto não é JSON (um JSON válido nunca dá undefined).
function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Ordem de criação: depois da maior que existe, a excluída inclusive (a lixeira pode devolvê-la). Mesma conta do repositório.
const nextOrder = (sessions: readonly Session[]): number => sessions.reduce((max, s) => Math.max(max, s.order), -1) + 1;

export interface ImportResult {
  sessions: Session[]; // só as criadas
  solves: Solve[]; // só os novos
  duplicates: number; // solves que já existiam
  skippedSessions: number; // sessões sem evento: não entram, e os solves delas também não
}

// --- Formato do Klick ---

function isSession(v: unknown): v is Session {
  return (
    isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string' && isEventId(v.event) &&
    isNum(v.order) && isNum(v.createdAt) && isNum(v.updatedAt) && isDeletedAt(v.deletedAt)
  );
}

function isSolve(v: unknown): v is Solve {
  return (
    isRecord(v) && typeof v.id === 'string' && typeof v.sessionId === 'string' && isEventId(v.event) &&
    isNum(v.ms) && v.ms >= 0 && isPenalty(v.penalty) && isNum(v.at) &&
    typeof v.scramble === 'string' && typeof v.note === 'string' &&
    isNum(v.createdAt) && isNum(v.updatedAt) && isDeletedAt(v.deletedAt)
  );
}

// Registro por registro: o repositório confia no que recebe, e um evento desconhecido quebraria as estatísticas. Campos que o
// Klick ainda não conhece passam intactos.
function isKlickExport(v: unknown): v is KlickExport {
  return (
    isRecord(v) && v.format === 'klick' && v.version === 1 && isNum(v.exportedAt) &&
    Array.isArray(v.sessions) && v.sessions.every(isSession) &&
    Array.isArray(v.solves) && v.solves.every(isSolve) &&
    (v.profile === null || isRecord(v.profile))
  );
}

export function toKlickJson(data: KlickExport): string {
  return JSON.stringify(data, null, 2);
}

// --- Perfil do arquivo ---
// Campo por campo, porque a importação aplica o perfil por cima do daqui: o que não tem o tipo (ou um valor) que o Klick conhece
// fica de fora, e o resto passa. O arquivo não é recusado por isso: os solves valem mais que um ajuste estranho.

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const oneOf =
  <V extends string>(options: readonly V[]) =>
  (v: unknown): v is V =>
    typeof v === 'string' && (options as readonly string[]).includes(v);
const isFinish = oneOf<FinishId>(['fosco', 'brilho', 'gelo', 'carbono']);

type Check = (v: unknown) => boolean;
const SETTING_CHECKS: Record<keyof Omit<Settings, 'sound'>, Check> = {
  inspection: isBool,
  holdMs: (v) => isNum(v) && v >= 0,
  mobileArm: oneOf(['two', 'one']),
  theme: oneOf(['system', 'light', 'dark']),
  silent: isBool,
  reducedMotion: oneOf(['system', 'always']),
  dailyGoal: (v) => Number.isInteger(v) && (v as number) >= 1,
  scrambleImage: isBool,
  centro: oneOf(['animado', 'estatico', 'oculto']),
};
const SOUND_CHECKS: Record<keyof Settings['sound'], Check> = { klick: isBool, insp: isBool, pb: isBool };

// Só as chaves de `checks` que vieram e passam na checagem.
function keepValid(source: Record<string, unknown>, checks: Record<string, Check>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(checks).filter(([key, ok]) => key in source && ok(source[key])).map(([key]) => [key, source[key]]));
}

function profileOf(v: Record<string, unknown>): ProfilePatch {
  const profile: ProfilePatch = {};
  if (isRecord(v.settings)) {
    const settings: NonNullable<ProfilePatch['settings']> = keepValid(v.settings, SETTING_CHECKS);
    if (isRecord(v.settings.sound)) settings.sound = keepValid(v.settings.sound, SOUND_CHECKS);
    profile.settings = settings;
  }
  if (Array.isArray(v.trail) && v.trail.every(isBool)) profile.trail = v.trail.slice(0, TRAIL.length);
  if (isFinish(v.finish)) profile.finish = v.finish;
  if (isBool(v.onboarded)) profile.onboarded = v.onboarded;
  if (v.currentSessionId === null || typeof v.currentSessionId === 'string') profile.currentSessionId = v.currentSessionId;
  const season = seasonFrom(v.season);
  if (season) profile.season = season;
  // Trilha e treino: fica o que vale (escolha dentro dos algoritmos do caso, casos conhecidos, passos inteiros); o resto vira o padrão.
  const lessonAt = lessonAtFrom(v.lessonAt);
  if (lessonAt) profile.lessonAt = lessonAt;
  const algChoice = algChoiceFrom(v.algChoice);
  if (algChoice) profile.algChoice = algChoice;
  const trainOff = trainOffFrom(v.trainOff);
  if (trainOff) profile.trainOff = trainOff;
  return profile;
}

export function parseKlickJson(text: string): KlickExport {
  const data = tryParse(text);
  if (!isKlickExport(data)) throw new Error(T.transfer.klickInvalid);
  const { practice, ...rest } = data;
  const profile: unknown = rest.profile;
  const out: KlickExport = { ...rest, profile: isRecord(profile) ? profileOf(profile) : null };
  // O treino (spec do sub-projeto 4, seção 9.3): só as tentativas válidas, e o arquivo não é recusado por elas. Sem a lista (um arquivo de
  // antes do treino), o arquivo entra como veio.
  const list: unknown = practice;
  if (Array.isArray(list)) out.practice = practiceFrom(list);
  return out;
}

// --- csTimer ---

export interface CsTimerSolve {
  ms: number;
  penalty: Penalty;
  scramble: string;
  note: string;
  at: number;
}

export interface CsTimerSession {
  key: string; // "session1": a chave no arquivo, que o mapeamento da importação usa
  name: string;
  scrType: string | undefined;
  event: EventId | null; // null: tipo de embaralhamento fora do catálogo
  solves: CsTimerSolve[];
}

// Penalidade do csTimer: 0 sem, 2000 (+2 s) e -1 (DNF). O tempo guardado é o bruto, sem os 2 s.
const PENALTY_FROM_CS = new Map<number, Penalty>([[0, null], [2000, '+2'], [-1, 'DNF']]);
const penaltyToCs = (p: Penalty): number => (p === null ? 0 : p === '+2' ? 2000 : -1);

const SESSION_KEY = /^session\d+$/;
const sessionNumber = (key: string): number => Number(key.slice('session'.length));

// Ausente vale objeto vazio; presente e que não é objeto recusa o arquivo.
function optionalRecord(v: unknown): Record<string, unknown> {
  if (v === undefined) return {};
  if (!isRecord(v)) throw new Error(T.transfer.csTimerInvalid);
  return v;
}

// properties.sessionData: o csTimer grava como texto JSON; o objeto já aberto também vale.
function readSessionData(properties: unknown): Record<string, unknown> {
  const raw = optionalRecord(properties).sessionData;
  if (typeof raw !== 'string') return optionalRecord(raw);
  const data = tryParse(raw);
  if (!isRecord(data)) throw new Error(T.transfer.csTimerInvalid);
  return data;
}

// [[penalidade, ms, ...tempos das fases], embaralhamento, comentário, segundos]. Item torto recusa o arquivo.
function csSolve(item: unknown): CsTimerSolve {
  if (!Array.isArray(item) || !Array.isArray(item[0])) throw new Error(T.transfer.csTimerInvalid);
  const [[code, ms], scramble, comment, seconds] = item as [unknown[], unknown, unknown, unknown];
  const penalty = typeof code === 'number' ? PENALTY_FROM_CS.get(code) : undefined;
  const at = typeof seconds === 'number' ? seconds * 1000 : Number.NaN;
  if (penalty === undefined || !isNum(ms) || ms < 0 || typeof scramble !== 'string' || !Number.isFinite(at)) {
    throw new Error(T.transfer.csTimerInvalid);
  }
  return { ms, penalty, scramble, note: typeof comment === 'string' ? comment : '', at };
}

export function parseCsTimer(text: string): CsTimerSession[] {
  const data = tryParse(text);
  if (!isRecord(data)) throw new Error(T.transfer.csTimerInvalid);
  const keys = Object.keys(data).filter((k) => SESSION_KEY.test(k)).sort((a, b) => sessionNumber(a) - sessionNumber(b));
  if (keys.length === 0) throw new Error(T.transfer.csTimerInvalid);
  const sessionData = readSessionData(data.properties);
  return keys.map((key) => {
    const solves = data[key];
    if (!Array.isArray(solves)) throw new Error(T.transfer.csTimerInvalid);
    const n = sessionNumber(key);
    const entry = optionalRecord(sessionData[n]);
    const scrType = optionalRecord(entry.opt).scrType;
    if (scrType !== undefined && typeof scrType !== 'string') throw new Error(T.transfer.csTimerInvalid);
    // O csTimer dá a uma sessão sem nome o número dela como nome (um número, não um texto): vale o nome padrão.
    const name = typeof entry.name === 'string' ? entry.name.trim() : '';
    return { key, name: name || T.session.defaultName(n), scrType, event: eventFromCsTimer(scrType), solves: solves.map(csSolve) };
  });
}

// Só as sessões vivas e os solves que não foram excluídos. Cada sessão leva o tipo de embaralhamento do evento, para o csTimer
// reconhecer. Um solve vivo cuja sessão não está viva (excluída em outra aba, ou que nunca existiu) não some do arquivo: vai para
// uma sessão "Sem sessão", de 3×3, depois das outras.
export function toCsTimerJson(sessions: Session[], solves: Solve[]): string {
  const live = sessions.filter((s) => s.deletedAt === null).sort((a, b) => a.order - b.order);
  const liveIds = new Set(live.map((s) => s.id));
  const bySession = new Map<string, Solve[]>();
  const orphans: Solve[] = [];
  for (const solve of solves) {
    if (solve.deletedAt !== null) continue;
    if (!liveIds.has(solve.sessionId)) {
      orphans.push(solve);
      continue;
    }
    const list = bySession.get(solve.sessionId);
    if (list) list.push(solve);
    else bySession.set(solve.sessionId, [solve]);
  }
  const groups: { name: string; scrType: string; solves: Solve[] }[] = live.map((session) => ({
    name: session.name,
    scrType: eventInfo(session.event).csTimer,
    solves: bySession.get(session.id) ?? [],
  }));
  if (orphans.length > 0) groups.push({ name: T.transfer.orphanSession, scrType: eventInfo('333').csTimer, solves: orphans });
  const file: Record<string, unknown> = {};
  const sessionData: Record<number, { name: string; opt: { scrType: string }; rank: number }> = {};
  groups.forEach((group, i) => {
    const n = i + 1;
    const items = [...group.solves]
      .sort((a, b) => a.at - b.at)
      .map((s) => [[penaltyToCs(s.penalty), s.ms], s.scramble, s.note, Math.floor(s.at / 1000)]);
    file[`session${n}`] = items;
    sessionData[n] = { name: group.name, opt: { scrType: group.scrType }, rank: n };
  });
  file.properties = { sessionData: JSON.stringify(sessionData), sessionN: groups.length };
  return JSON.stringify(file);
}

// O csTimer guarda só segundos; o Klick guarda milissegundos. Por isso o mesmo solve é "mesmo ms no mesmo segundo": com o instante
// exato, exportar para o csTimer e importar o arquivo de volta duplicaria tudo.
const timeKey = (ms: number, at: number): string => `${ms}@${Math.floor(at / 1000)}`;

// Os ids vêm do próprio dado (spec 5.5): o mesmo arquivo importado em dois aparelhos dá os mesmos ids, e o sync junta em vez de
// duplicar. O solve é `cs-` mais um hash do evento, do instante, do tempo e do embaralhamento; a sessão, `cs-s-` mais um hash do
// evento, do nome e do instante do primeiro solve dela no arquivo.
export const csTimerSolveId = (event: EventId, s: Pick<CsTimerSolve, 'at' | 'ms' | 'scramble'>): string => derivedId('cs-', [event, s.at, s.ms, s.scramble]);
export const csTimerSessionId = (event: EventId, p: Pick<CsTimerSession, 'name' | 'solves'>): string =>
  derivedId('cs-s-', [event, p.name, p.solves[0]?.at ?? 0]);

// Cada sessão do arquivo vira uma sessão (nova, ou a mesma que outro aparelho criou com o mesmo arquivo). Fica de fora a que não tem
// evento (nem do tipo de embaralhamento, nem do mapeamento) e a que só traz solves que já existem; os que já existem (inclusive os
// excluídos, como vieram em ctx) ou se repetem no próprio arquivo contam em `duplicates`. A sessão que já existe aqui (o mesmo arquivo
// importado antes, mesmo na lixeira) recebe os solves novos e não é recriada: o registro daqui (renomeado, reordenado) fica como está.
//
// As datas também vêm do dado, não da hora da importação: o solve nasce no instante dele e a sessão no do primeiro solve dela no arquivo
// (nos dois, no máximo agora: um relógio adiantado no csTimer não dá data no futuro). O mesmo arquivo dá registros idênticos em qualquer
// aparelho, e uma edição ou exclusão feita depois num deles vence a importação feita mais tarde no outro.
export function csTimerToKlick(
  parsed: CsTimerSession[],
  mapping: Record<string, EventId | undefined>,
  ctx: { now: number; existingSessions: Session[]; existingSolves: Solve[] },
): ImportResult {
  const result: ImportResult = { sessions: [], solves: [], duplicates: 0, skippedSessions: 0 };
  const seen = new Set(ctx.existingSolves.map((s) => timeKey(s.ms, s.at)));
  const known = new Set(ctx.existingSessions.map((s) => s.id));
  let order = nextOrder(ctx.existingSessions);
  for (const p of parsed) {
    const mapped = mapping[p.key];
    const event = p.event ?? (isEventId(mapped) ? mapped : null);
    if (event === null) {
      result.skippedSessions++;
      continue;
    }
    const fresh: CsTimerSolve[] = [];
    for (const s of p.solves) {
      const key = timeKey(s.ms, s.at);
      if (seen.has(key)) {
        result.duplicates++;
        continue;
      }
      seen.add(key);
      fresh.push(s);
    }
    if (fresh.length === 0) continue;
    const sessionId = csTimerSessionId(event, p);
    if (!known.has(sessionId)) {
      known.add(sessionId);
      const born = Math.min(p.solves[0].at, ctx.now); // fresh não está vazio, então o arquivo tem o primeiro solve
      result.sessions.push({ id: sessionId, name: p.name, event, order: order++, createdAt: born, updatedAt: born, deletedAt: null });
    }
    for (const s of fresh) {
      const born = Math.min(s.at, ctx.now);
      result.solves.push({
        id: csTimerSolveId(event, s), sessionId, event, ms: s.ms, penalty: s.penalty, at: s.at, scramble: s.scramble, note: s.note,
        createdAt: born, updatedAt: born, deletedAt: null,
      });
    }
  }
  return result;
}

// --- Migração da v1 ---

// A v1 guardava as sessões na chave abaixo, no formato do persist do zustand: { state: { sessions, activeSessionId }, version }.
export const V1_KEY = 'klick-sessions';

export interface V1Solve {
  id: string;
  timeMs: number;
  penalty: 'NONE' | '+2' | 'DNF';
  scramble: string;
  createdAt: string;
  updatedAt?: string;
}

export interface V1Session {
  id: string;
  name: string;
  puzzleType: string;
  solves: V1Solve[];
  createdAt?: string;
}

const isDate = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

function isV1Solve(v: unknown): v is V1Solve {
  return (
    isRecord(v) && typeof v.id === 'string' && isNum(v.timeMs) && v.timeMs >= 0 &&
    (v.penalty === 'NONE' || v.penalty === '+2' || v.penalty === 'DNF') &&
    typeof v.scramble === 'string' && isDate(v.createdAt) && (v.updatedAt == null || isDate(v.updatedAt))
  );
}

// A v1 antiga não gravava puzzleType nem createdAt na sessão, e a própria v1 tratava a sessão sem puzzleType como 3x3.
// Sessão de formato torto dá null, e sai inteira. Dos solves só entram os que batem; os outros são contados em skippedSolves.
function toV1Session(v: unknown): { session: V1Session; skippedSolves: number } | null {
  if (!isRecord(v) || typeof v.id !== 'string' || typeof v.name !== 'string' || !Array.isArray(v.solves)) return null;
  const puzzleType = v.puzzleType ?? '3x3';
  const createdAt = v.createdAt ?? undefined;
  if (typeof puzzleType !== 'string' || (createdAt !== undefined && !isDate(createdAt))) return null;
  const solves = v.solves.filter(isV1Solve);
  return { session: { id: v.id, name: v.name, puzzleType, solves, createdAt }, skippedSolves: v.solves.length - solves.length };
}

// A leitura é registro por registro: o que não bate fica de fora e é contado, sem derrubar os outros. `skipped` soma as sessões e os
// solves deixados de fora. null quando não há o que ler: chave ausente, armazenamento bloqueado, JSON que não abre, ou um formato
// que não é o da v1.
function readV1Parts(storage: Pick<Storage, 'getItem'> | null): { sessions: V1Session[]; skipped: number } | null {
  let raw: unknown;
  try {
    raw = storage?.getItem(V1_KEY);
  } catch {
    return null;
  }
  if (typeof raw !== 'string') return null;
  const data = tryParse(raw);
  const list = isRecord(data) && isRecord(data.state) ? data.state.sessions : undefined;
  if (!Array.isArray(list)) return null;
  const sessions: V1Session[] = [];
  let skipped = 0;
  for (const item of list) {
    const read = toV1Session(item);
    if (!read) {
      skipped++; // a sessão inteira fica de fora, com os solves dela
      continue;
    }
    sessions.push(read.session);
    skipped += read.skippedSolves;
  }
  return { sessions, skipped };
}

// null quando não há dados da v1 para migrar: chave ausente, armazenamento bloqueado, JSON que não abre, formato que não é o dela,
// ou nenhum solve que bata. Um registro torto não derruba a leitura; readV1Invalid diz quantos ficaram de fora.
export function readV1(storage: Pick<Storage, 'getItem'> | null): V1Session[] | null {
  const read = readV1Parts(storage);
  if (!read || !read.sessions.some((s) => s.solves.length > 0)) return null;
  return read.sessions;
}

// Quantos registros (sessões e solves) readV1 deixou de fora. 0 quando não há nada a ler.
export function readV1Invalid(storage: Pick<Storage, 'getItem'> | null): number {
  return readV1Parts(storage)?.skipped ?? 0;
}

const V1_EVENTS: ReadonlyMap<string, EventId> = new Map<string, EventId>([
  ['3x3', '333'], ['2x2', '222'], ['4x4', '444'], ['5x5', '555'],
  ['pyraminx', 'pyram'], ['megaminx', 'minx'], ['skewb', 'skewb'], ['square1', 'sq1'],
]);

// Mantém os ids da v1, e é isso que impede duplicar: a sessão que já existe (pelo id, excluída ou não) não é recriada, mas os solves
// novos dela entram, no evento dela; o solve que já existe (pelo id) conta em `duplicates`. Sessão de um puzzle fora do mapa fica
// de fora, com os solves. A sessão vazia é criada, para a pessoa reencontrá-la.
export function v1ToKlick(v1: V1Session[], ctx: { now: number; existingSessions: Session[]; existingSolves: Solve[] }): ImportResult {
  const result: ImportResult = { sessions: [], solves: [], duplicates: 0, skippedSessions: 0 };
  const sessions = new Map(ctx.existingSessions.map((s) => [s.id, s]));
  const knownSolves = new Set(ctx.existingSolves.map((s) => s.id));
  let order = nextOrder(ctx.existingSessions);
  v1.forEach((v, index) => {
    let session = sessions.get(v.id);
    if (!session) {
      const event = V1_EVENTS.get(v.puzzleType);
      if (!event) {
        result.skippedSessions++;
        return;
      }
      const createdAt = v.createdAt === undefined ? ctx.now : Date.parse(v.createdAt);
      session = { id: v.id, name: v.name.trim() || T.session.defaultName(index + 1), event, order: order++, createdAt, updatedAt: createdAt, deletedAt: null };
      sessions.set(session.id, session);
      result.sessions.push(session);
    }
    for (const s of v.solves) {
      if (knownSolves.has(s.id)) {
        result.duplicates++;
        continue;
      }
      knownSolves.add(s.id);
      const at = Date.parse(s.createdAt);
      result.solves.push({
        id: s.id, sessionId: session.id, event: session.event, ms: s.timeMs, penalty: s.penalty === 'NONE' ? null : s.penalty, at,
        scramble: s.scramble, note: '', createdAt: at, updatedAt: Date.parse(s.updatedAt ?? s.createdAt), deletedAt: null,
      });
    }
  });
  return result;
}
