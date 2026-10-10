// Cópia numa pasta do aparelho, pela File System Access API (Chrome no desktop). O handle da pasta mora no IndexedDB
// (repo.saveFolderHandle); aqui ficam só as funções sobre ele, sem tela e sem depender de `window`.
//
// Os métodos do handle e do navegador são chamados sempre no próprio objeto: soltos de lá, o navegador recusa ("Illegal invocation").
import { dayKey } from '../core/stats';

export interface DirHandleLike {
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, o: { create: true }): Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> }>;
}

type PickerHost = { showDirectoryPicker?: (o: { mode: 'readwrite' }) => Promise<DirHandleLike> };

export function folderSupported(win: { showDirectoryPicker?: unknown } = globalThis as { showDirectoryPicker?: unknown }): boolean {
  return typeof win.showDirectoryPicker === 'function';
}

// Abre o seletor de pastas. null se a pessoa cancela (AbortError). Sem seletor no navegador também devolve null: quem chama
// consulta folderSupported antes. Qualquer outro erro (SecurityError por falta de gesto, por exemplo) sobe.
export async function pickFolder(win: PickerHost = globalThis as PickerHost): Promise<DirHandleLike | null> {
  if (typeof win.showDirectoryPicker !== 'function') return null;
  try {
    return await win.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if ((err as { name?: unknown } | null)?.name === 'AbortError') return null;
    throw err;
  }
}

// A permissão da pasta vence entre visitas: sem gesto da pessoa só dá para consultar. `ask` só pode ser verdadeiro dentro de um
// gesto (clique), porque o pedido abre uma janela do navegador. Um handle sem queryPermission não tem como informar: tenta gravar.
async function canWrite(handle: DirHandleLike, ask: boolean): Promise<boolean> {
  const mode = { mode: 'readwrite' } as const;
  let state: PermissionState = handle.queryPermission ? await handle.queryPermission(mode) : 'granted';
  if (state !== 'granted' && ask && handle.requestPermission) state = await handle.requestPermission(mode);
  return state === 'granted';
}

// false: sem permissão (quem chama mostra o pedido, num clique). Qualquer falha ao gravar (disco cheio, pasta apagada) rejeita,
// para a pessoa ficar sabendo; só o close() confirma o arquivo.
export async function saveToFolder(handle: DirHandleLike, name: string, text: string, { ask = false }: { ask?: boolean } = {}): Promise<boolean> {
  if (!(await canWrite(handle, ask))) return false;
  const file = await handle.getFileHandle(name, { create: true });
  const out = await file.createWritable();
  await out.write(text);
  await out.close();
  return true;
}

// A pasta ainda deixa gravar, sem pedir nada à pessoa (nada de janela). Sem como saber, não alarma: a próxima cópia diz.
export async function folderGranted(handle: DirHandleLike): Promise<boolean> {
  try {
    return await canWrite(handle, false);
  } catch {
    return true;
  }
}

// 'klick-AAAA-MM-DD-HHmm.json' no horário local.
export function backupFileName(now: number): string {
  const d = new Date(now);
  const hhmm = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  return `klick-${dayKey(now)}-${hhmm}.json`;
}
