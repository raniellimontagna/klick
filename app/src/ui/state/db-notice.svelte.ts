// Avisos sobre a conexão com o banco que vêm de fora do app: outra aba abriu uma versão nova (esta já largou o banco e precisa
// recarregar) ou esta é a versão nova e espera uma aba antiga largar o banco. Fica fora do AppState porque o segundo caso acontece
// no boot, antes de o AppState existir. O DbNotice mostra; o boot liga os eventos do banco aqui (dbEvents).
import type { DbEvents } from '../../data/db';
import type { AppState } from './app.svelte';

export type DbNoticeKind = 'updated' | 'closeOthers' | null;

let notice = $state<DbNoticeKind>(null);

export function dbNotice(): DbNoticeKind {
  return notice;
}

// null tira o aviso (os testes limpam assim; o boot tira o "feche as outras abas" quando a abertura termina).
export function setDbNotice(next: DbNoticeKind): void {
  notice = next;
}

// Uma abertura do banco que pode ter esperado outras abas: o "feche as outras abas" sai quando ela termina, com sucesso ou com erro
// (com erro, a casca mostra o aviso de banco indisponível no lugar).
export async function clearingCloseOthers<R>(opening: Promise<R>): Promise<R> {
  try {
    return await opening;
  } finally {
    if (notice === 'closeOthers') notice = null;
  }
}

// Os eventos que o boot passa ao abrir o banco. `getApp` porque o AppState nasce depois da primeira abertura. Depois de `blocking`
// esta aba não grava mais (o banco é da versão nova): o app para de tentar reabrir e de repetir avisos de leitura.
export function dbEvents(getApp: () => AppState | null | undefined): DbEvents {
  return {
    blocking: () => {
      setDbNotice('updated');
      getApp()?.supersede();
    },
    blocked: () => setDbNotice('closeOthers'),
    terminated: () => getApp()?.connectionLost(),
  };
}
