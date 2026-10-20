// Camadas de segurança dos dados (spec 6.2): quando copiar e lembrar, cópias automáticas no próprio banco, armazenamento
// persistente e a fila de gravação em memória. Nada aqui conhece a tela: quem chama (AppState) liga os resultados à interface.
//
// Nada some em silêncio. Cada falha de gravação rejeita (cópias) ou fica na fila com aviso (solves), e a fila só tira um solve
// da lista depois que o save respondeu por ele.
import { dayKey } from '../core/stats';
import type { Meta, Solve } from '../core/types';
import type { BackupRecord } from './db';
import { newId } from './ids';
import type { KlickExport, NewSolve, Repository } from './repository';

export const BACKUP_EVERY = 50;
export const BACKUP_KEEP = 10;
export const EXPORT_REMIND_EVERY = 100;
export const FOLDER_SAVE_EVERY = 100;
export const TRASH_MS = 30 * 86_400_000;
// As cópias que protegem um passo sem volta (spec 5.6 e 4.3) ficam fora da poda por quantidade, e fora da conta das BACKUP_KEEP: a "antes
// da v3" por 90 dias; as 'pre-sync' sem rótulo (antes do primeiro login e de um lote com muitas exclusões) por 30, as 5 mais novas.
export const V3_COPY_KEEP_MS = 90 * 86_400_000;
export const PRE_SYNC_KEEP_MS = 30 * 86_400_000;
export const PRE_SYNC_PINNED = 5;

export interface SafetyPlan {
  backup: 'auto50' | 'daily' | null;
  remindExport: boolean;
  folderSave: boolean;
}

// --- Decisões: o que fazer depois de um solve e ao abrir o app ---

export function countSolveSaved(meta: Meta): Meta {
  return {
    ...meta,
    solvesSinceBackup: meta.solvesSinceBackup + 1,
    solvesSinceExport: meta.solvesSinceExport + 1,
    solvesSinceFolderSave: meta.solvesSinceFolderSave + 1,
  };
}

// `meta` já traz o solve contado. >= na cópia e na pasta: se uma tentativa falhou, o contador passou do limite e a próxima insiste.
// O lembrete é só nos múltiplos: ignorá-lo uma vez não o repete a cada solve seguinte.
export function planAfterSolve(meta: Meta, folderConfigured: boolean): SafetyPlan {
  return {
    backup: meta.solvesSinceBackup >= BACKUP_EVERY ? 'auto50' : null,
    remindExport: meta.solvesSinceExport > 0 && meta.solvesSinceExport % EXPORT_REMIND_EVERY === 0,
    folderSave: folderConfigured && meta.solvesSinceFolderSave >= FOLDER_SAVE_EVERY,
  };
}

// Primeira abertura do dia (dia local) com solves novos desde a última cópia. Sem lembrete de exportação: nunca ao abrir.
export function planOnOpen(meta: Meta, now: number, folderConfigured: boolean): SafetyPlan {
  const today = dayKey(now);
  return {
    backup: meta.solvesSinceBackup > 0 && meta.lastBackupDay !== today ? 'daily' : null,
    remindExport: false,
    folderSave: folderConfigured && meta.solvesSinceFolderSave > 0 && meta.lastFolderSaveDay !== today,
  };
}

// --- Cópia codificada: JSON comprimido com gzip em base64, ou JSON puro onde o navegador não comprime ---

type Snapshot = Pick<BackupRecord, 'encoding' | 'payload'>;
type Bytes = Uint8Array<ArrayBuffer>;

// String.fromCharCode(...bytes) estoura a pilha com dezenas de milhares de argumentos, e um histórico de milhares de solves
// comprimido passa disso. Por isso a conversão com base64 anda em blocos de 24 KB (3 × 8192: múltiplo de 3, então nenhum bloco
// termina em "=" no meio do texto; e 32 768 caracteres de base64 por bloco, múltiplo de 4, na volta).
const BLOCK_BYTES = 24_576;
const BLOCK_CHARS = (BLOCK_BYTES / 3) * 4;

function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += BLOCK_BYTES) parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + BLOCK_BYTES))));
  return parts.join('');
}

// atob lança InvalidCharacterError para texto que não é base64: a cópia corrompida rejeita aqui.
function base64ToBytes(text: string): Bytes {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += BLOCK_CHARS) parts.push(atob(text.slice(i, i + BLOCK_CHARS)));
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of parts) for (let j = 0; j < part.length; j++) bytes[at++] = part.charCodeAt(j);
  return bytes;
}

// Passa os bytes pelo CompressionStream ou DecompressionStream. Escrever e ler andam juntos: esperar a escrita acabar antes de
// ler travaria quando a saída enche (contrapressão). Se a escrita rejeita (gzip inválido), a leitura rejeita junto.
async function pipeThrough(transform: CompressionStream | DecompressionStream, input: Bytes): Promise<Bytes> {
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  const write = async () => {
    await writer.write(input);
    await writer.close();
  };
  const read = async () => {
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return chunks;
      chunks.push(value);
    }
  };
  const [, chunks] = await Promise.all([write(), read()]);
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export async function encodeSnapshot(data: KlickExport): Promise<Snapshot> {
  const json = JSON.stringify(data);
  if (typeof CompressionStream === 'undefined') return { encoding: 'json', payload: json };
  const packed = await pipeThrough(new CompressionStream('gzip'), new TextEncoder().encode(json));
  return { encoding: 'gzip-base64', payload: bytesToBase64(packed) };
}

// Só aceita o que o Klick escreveu: um JSON de outra coisa (ou de uma versão futura) não pode virar "a cópia" e apagar os dados.
export function isKlickExport(value: unknown): value is KlickExport {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.format === 'klick' && v.version === 1 && Array.isArray(v.sessions) && Array.isArray(v.solves);
}

export async function decodeSnapshot(r: Snapshot): Promise<KlickExport> {
  let json: string;
  switch (r.encoding) {
    case 'json':
      json = r.payload;
      break;
    case 'gzip-base64':
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir cópias comprimidas.');
      json = new TextDecoder().decode(await pipeThrough(new DecompressionStream('gzip'), base64ToBytes(r.payload)));
      break;
    default:
      throw new Error(`Codificação de cópia desconhecida: ${String(r.encoding)}`);
  }
  const data: unknown = JSON.parse(json);
  if (!isKlickExport(data)) throw new Error('A cópia não está no formato do Klick.');
  return data;
}

// --- Cópias automáticas guardadas no banco ---

// Exporta tudo (a lixeira inclusa), codifica, grava, poda e só então zera o contador: se qualquer passo falha, rejeita e o
// contador fica, e a próxima rodada tenta de novo. solveCount é o que a pessoa vê (solves ativos): restaurar a cópia devolve esse
// tanto ao histórico. A poda tira a mais antiga das outras e poupa a cópia que acabou de gravar, a keepId (a que está sendo
// restaurada) e as que pinnedBackups poupa.
export async function createBackup(repo: Repository, reason: BackupRecord['reason'], now: number, keepId?: string): Promise<BackupRecord> {
  const data = await repo.exportAll();
  const { encoding, payload } = await encodeSnapshot(data);
  const record: BackupRecord = {
    id: newId(now),
    createdAt: now,
    reason,
    solveCount: data.solves.filter((s) => s.deletedAt === null).length,
    encoding,
    payload,
  };
  await repo.saveBackup(record);
  // A cópia nova fica sempre: com o relógio atrasado ela seria a "mais antiga" e sumiria logo depois de gravada. A keepId também. As
  // duas ocupam vagas das BACKUP_KEEP (a não ser que estejam entre as poupadas, que não contam), e o resto das vagas vai às mais novas.
  const all = await repo.listBackups();
  const pinned = pinnedBackups(all, now);
  const counted = all.filter((r) => !pinned.has(r.id));
  const held = counted.filter((r) => r.id === record.id || r.id === keepId);
  const prunable = counted.filter((r) => r.id !== record.id && r.id !== keepId);
  for (const old of prunable.slice(Math.max(0, BACKUP_KEEP - held.length))) await repo.deleteBackup(old.id);
  await repo.saveMeta({ solvesSinceBackup: 0, lastBackupAt: now, lastBackupDay: dayKey(now) });
  return record;
}

// As cópias que a poda por quantidade não leva agora. `list` vem da mais nova para a mais antiga (listBackups). A "antes da v3" fica
// enquanto tem menos de 90 dias; das 'pre-sync' sem rótulo com menos de 30 dias, ficam as 5 mais novas. Passado o prazo (ou fora das 5),
// cada uma volta a ser uma cópia como as outras, e a poda de sempre decide.
export function pinnedBackups(list: readonly BackupRecord[], now: number): Set<string> {
  const pinned = new Set<string>();
  let preSync = 0;
  for (const r of list) {
    const age = now - r.createdAt;
    if (r.label === 'v3') {
      if (age < V3_COPY_KEEP_MS) pinned.add(r.id);
    } else if (r.reason === 'pre-sync' && age < PRE_SYNC_KEEP_MS && preSync < PRE_SYNC_PINNED) {
      pinned.add(r.id);
      preSync++;
    }
  }
  return pinned;
}

// Troca tudo pelo da cópia escolhida, numa transação (replaceAll). Antes de escrever qualquer coisa, a cópia é lida e decodificada:
// uma que não abre é recusada sem efeito nenhum (nenhuma pre-restore gasta a vaga de uma cópia boa, e o Meta não muda). Só então o
// estado de agora vai para uma cópia 'pre-restore', cuja poda poupa a escolhida (restaurar a mais antiga de uma lista cheia não a
// perde, nem se a troca falhar). Qualquer falha chega a quem chamou e os dados continuam como estavam.
export async function restoreBackup(repo: Repository, id: string, now: number): Promise<void> {
  const record = await repo.getBackup(id);
  if (!record) throw new Error(`Cópia não encontrada: ${id}`);
  const data = await decodeSnapshot(record);
  await createBackup(repo, 'pre-restore', now, id);
  await repo.replaceAll(data);
}

// A restauração de uma cópia que não veio do banco daqui (a que o aparelho baixou da nuvem, já conferida por quem chama): o estado de agora
// vai antes para uma cópia 'pre-restore' e então replaceAll aplica só as diferenças. Se a cópia local falha, rejeita sem gravar a troca.
// `floor`: o piso da restauração pelo aparelho (A1), que replaceAll guarda com ela.
export async function restoreExport(repo: Repository, data: KlickExport, now: number, floor?: number): Promise<void> {
  await createBackup(repo, 'pre-restore', now);
  await repo.replaceAll(data, { floor });
}

// --- Armazenamento persistente ---

export type PersistResult = 'granted' | 'denied' | 'unsupported';

export interface StorageLike {
  persist?(): Promise<boolean>;
  persisted?(): Promise<boolean>;
  estimate?(): Promise<{ usage?: number; quota?: number }>;
}

const defaultStorage = (): StorageLike | null => globalThis.navigator?.storage ?? null;

// Os métodos saem sempre do próprio storage: soltos de lá, o do navegador recusa.
export async function requestPersistence(storage: StorageLike | null = defaultStorage()): Promise<PersistResult> {
  if (!storage || typeof storage.persist !== 'function') return 'unsupported';
  return (await storage.persist()) ? 'granted' : 'denied';
}

// Cada leitura vale por si: a que rejeita (ou lança na hora) vira null e não leva a outra junto.
async function readOrNull<T>(read: () => Promise<T> | null): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export async function storageStatus(
  storage: StorageLike | null = defaultStorage(),
): Promise<{ persisted: boolean | null; usage: number | null; quota: number | null }> {
  const [persisted, estimate] = await Promise.all([
    readOrNull(() => (storage && typeof storage.persisted === 'function' ? storage.persisted() : null)),
    readOrNull(() => (storage && typeof storage.estimate === 'function' ? storage.estimate() : null)),
  ]);
  return { persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
}

// --- Fila de gravação ---

export interface SaveQueue {
  enqueue(s: NewSolve): Promise<Solve | null>; // o solve gravado; null se ficou na fila (a gravação falhou)
  pending(): number; // solves que o save ainda não confirmou
  pendingItems(): NewSolve[]; // cópias desses solves, na ordem de chegada (para uma exportação de emergência); mexer nelas não mexe na fila
  flush(): Promise<void>; // espera a gravação em andamento terminar
}

// onError padrão: o erro de um ouvinte reaparece numa microtask (no navegador, como erro não tratado). Mesmo padrão do timer e
// do repositório.
const rethrowLater = (err: unknown): void =>
  queueMicrotask(() => {
    throw err;
  });

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const handle = globalThis.setTimeout(fn, ms);
  return () => globalThis.clearTimeout(handle);
};

// Guarda os solves em memória, na ordem de chegada, e os grava um de cada vez. Quando o save falha (cota cheia, banco bloqueado),
// a gravação para no primeiro que falhou, o aviso sai por onChange(n) e uma nova tentativa fica agendada para daqui a retryMs;
// os solves seguintes esperam atrás dele, para continuarem na ordem. Um solve só sai da lista depois que o save respondeu por ele.
// Só uma gravação roda por vez: enqueue com uma em andamento só põe o solve na fila, e a que está rodando chega até ele. A fila
// guarda uma cópia do que recebe, e pendingItems devolve cópias dela: o que seria exportado é o que seria gravado.
export function createSaveQueue(
  save: (s: NewSolve) => Promise<Solve>,
  {
    retryMs = 3000,
    onChange,
    onSaved,
    onSaveError,
    schedule = defaultSchedule,
    onError = rethrowLater,
  }: {
    retryMs?: number;
    onChange?: (pending: number) => void; // só depois de uma falha (n > 0) e quando a fila esvazia depois disso (0)
    onSaved?: (s: Solve) => void; // cada solve gravado, inclusive os que ficaram na fila e gravaram depois
    onSaveError?: (err: unknown) => void; // o erro de cada tentativa de gravar que falhou (cota cheia, conexão fechada...), antes do aviso e da nova tentativa
    schedule?: (fn: () => void, ms: number) => () => void; // devolve o cancelamento
    // Erro de onChange, onSaved, onSaveError ou schedule (o solve já foi gravado, ou continua na fila). Se ele mesmo lançar, os dois
    // erros saem por relançar-depois.
    onError?: (err: unknown) => void;
  } = {},
): SaveQueue {
  interface Entry {
    solve: NewSolve;
    settle: (saved: Solve | null) => void;
  }
  const queue: Entry[] = [];
  let running = false;
  let current: Promise<void> = Promise.resolve();
  let cancelRetry: (() => void) | null = null;
  let warned = false; // onChange(n > 0) já saiu e o 0 ainda não

  function report(err: unknown): void {
    try {
      onError(err);
    } catch (failure) {
      rethrowLater(new AggregateError([err, failure], 'onError lançou ao receber um erro'));
    }
  }

  // Um ouvinte que lança não pode derrubar a fila: o solve gravado voltaria a ser tentado (e duplicaria), ou a fila pararia
  // com solves dentro.
  function tell(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      report(err);
    }
  }

  function fail(err: unknown): void {
    for (const entry of queue) entry.settle(null); // quem espera o enqueue recebe null: o solve ficou na fila
    warned = true;
    const count = queue.length;
    tell(() => onSaveError?.(err)); // a causa antes do aviso: quem mostra o aviso já a tem
    tell(() => onChange?.(count));
    try {
      cancelRetry = schedule(() => {
        cancelRetry = null;
        void drain();
      }, retryMs);
    } catch (failure) {
      report(failure); // sem relógio: o solve segue na fila e a próxima enqueue tenta de novo
    }
  }

  async function run(): Promise<void> {
    try {
      for (;;) {
        const entry = queue[0];
        if (!entry) {
          if (!warned) return;
          warned = false;
          tell(() => onChange?.(0));
          continue; // um ouvinte pode ter enfileirado algo: o fim só vale depois de olhar a fila de novo
        }
        let saved: Solve;
        try {
          saved = await save(entry.solve);
        } catch (err) {
          fail(err);
          return;
        }
        queue.shift();
        entry.settle(saved);
        tell(() => onSaved?.(saved));
      }
    } finally {
      running = false; // no mesmo trecho síncrono da última olhada na fila: nenhum enqueue cai entre as duas
    }
  }

  function drain(): Promise<void> {
    if (running) return current;
    if (cancelRetry) {
      const cancel = cancelRetry;
      cancelRetry = null;
      cancel(); // esta rodada já tenta agora; a agendada ficaria sobrando
    }
    running = true;
    current = run();
    return current;
  }

  return {
    enqueue(solve) {
      return new Promise<Solve | null>((settle) => {
        queue.push({ solve: { ...solve }, settle });
        void drain();
      });
    },
    pending: () => queue.length,
    pendingItems: () => queue.map((entry) => ({ ...entry.solve })),
    flush: () => (running ? current : Promise.resolve()),
  };
}
