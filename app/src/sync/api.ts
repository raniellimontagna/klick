// O cliente HTTP do servidor do Klick (spec 6.1 e 8.1): mesma origem, com o cookie da sessão. Os erros viram tipos que o motor e as telas
// entendem; nada aqui guarda estado.
import { ACCOUNT_HEADER, type CloudCopy, type Rejected, type SyncRequest, type SyncResponse } from '../core/sync/types';

export type { CloudCopy } from '../core/sync/types';

export type ApiErrorKind = 'offline' | 'auth' | 'update' | 'server' | 'client';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  constructor(kind: ApiErrorKind, status: number) {
    super(`api: ${kind} (${status})`);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

// O que /api/health diz: se a conta está ligada neste ambiente (spec 8.4) e a site key do Turnstile.
export interface Health {
  accounts: boolean;
  turnstileSiteKey: string | null;
}

export interface SyncApi {
  health(): Promise<Health | null>; // null: sem servidor (sem rede, ou o app servido sem o Worker, como no vite preview)
  sync(req: SyncRequest): Promise<SyncResponse>;
  // As rotas da conta levam a conta que o aparelho espera (`account`, no cabeçalho ACCOUNT_HEADER): a sessão de outra conta é 401 ('auth').
  cloudCopies(account: string): Promise<CloudCopy[]>; // as cópias dos últimos 30 dias, a mais nova primeiro (spec 8.3)
  restoreCloudCopy(name: string, account: string): Promise<void>; // a cópia que não existe mais: ApiError com status 404
  deleteAccount(email: string, account: string): Promise<void>; // spec 7.7: o e-mail digitado confirma
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

// Prazos dos pedidos: uma rede parada não pode prender a saída da conta (que espera o motor) nem a aba líder para sempre. Estourado o
// prazo, o pedido é tratado como sem rede; o corpo que para no meio, como resposta que não é a do Worker (erro do servidor).
export const HEALTH_TIMEOUT_MS = 15_000;
export const SYNC_TIMEOUT_MS = 60_000;

// AbortSignal.timeout, ou o mesmo com um AbortController onde ele não existe (Safari antes do 16).
function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  if (typeof AbortController === 'undefined') return undefined;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

const kindOf = (status: number): ApiErrorKind =>
  status === 401 ? 'auth' : status === 426 ? 'update' : status >= 500 ? 'server' : 'client';

// A resposta do sync tem a forma que o motor usa? Uma que não tem (um proxy no meio, um Worker de outra versão) não pode tirar nada da fila
// nem mexer no cursor. O cursor é uma revisão: inteiro seguro >= 0. Sem `rejected`, a lista vem vazia.
function syncResponseOf(body: unknown): SyncResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const r = body as Record<string, unknown>;
  if (!Number.isSafeInteger(r.cursor) || (r.cursor as number) < 0 || !Array.isArray(r.changes) || typeof r.more !== 'boolean') return null;
  if (r.rejected !== undefined && !Array.isArray(r.rejected)) return null;
  return { ...(r as unknown as SyncResponse), rejected: (r.rejected as Rejected[] | undefined) ?? [] };
}

// Uma cópia da lista com a forma que o diálogo mostra (o nome é a chave da lista e vai na rota de restaurar).
const isCopy = (c: unknown): c is CloudCopy => {
  if (typeof c !== 'object' || c === null) return false;
  const r = c as Record<string, unknown>;
  return typeof r.name === 'string' && typeof r.day === 'string' && (r.kind === 'daily' || r.kind === 'pre-restore') && Number.isFinite(r.solves);
};

export function createSyncApi(
  fetcher: Fetcher = (input, init) => fetch(input, init),
  base = '',
  timeouts: { health: number; sync: number } = { health: HEALTH_TIMEOUT_MS, sync: SYNC_TIMEOUT_MS },
): SyncApi {
  async function call(path: string, ms: number, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetcher(base + path, { credentials: 'same-origin', signal: timeoutSignal(ms), ...init });
    } catch {
      throw new ApiError('offline', 0);
    }
    if (!res.ok) throw new ApiError(kindOf(res.status), res.status);
    return res;
  }
  const post = (path: string, body: unknown, ms: number, headers: Record<string, string> = {}): Promise<Response> =>
    call(path, ms, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  return {
    async health() {
      try {
        const data = (await (await call('/api/health', timeouts.health)).json()) as Partial<Health> | null;
        if (typeof data?.accounts !== 'boolean') return null;
        return { accounts: data.accounts, turnstileSiteKey: typeof data.turnstileSiteKey === 'string' ? data.turnstileSiteKey : null };
      } catch {
        return null; // sem servidor, ou uma resposta que não é a dele (o index.html do vite preview)
      }
    },
    async sync(req) {
      const res = await post('/api/sync', req, timeouts.sync);
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null; // uma resposta que não é JSON (ou cujo corpo parou no meio, até o prazo) não é a do Worker
      }
      const parsed = syncResponseOf(body);
      if (!parsed) throw new ApiError('server', res.status); // o motor tenta de novo mais tarde
      return parsed;
    },
    // As cópias na nuvem e apagar a conta (spec 7.7 e 8.3) usam o prazo do sync: restaurar e apagar mexem na conta inteira.
    async cloudCopies(account) {
      const res = await call('/api/snapshots', timeouts.sync, { headers: { [ACCOUNT_HEADER]: account } });
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null; // o index.html do vite preview, sem o Worker
      }
      const copies = (body as { copies?: unknown } | null)?.copies;
      if (!Array.isArray(copies)) throw new ApiError('server', res.status);
      return copies.filter(isCopy);
    },
    async restoreCloudCopy(name, account) {
      await post(`/api/snapshots/${encodeURIComponent(name)}/restore`, {}, timeouts.sync, { [ACCOUNT_HEADER]: account });
    },
    async deleteAccount(email, account) {
      const headers = { 'Content-Type': 'application/json', [ACCOUNT_HEADER]: account };
      const init: RequestInit = { method: 'DELETE', headers, body: JSON.stringify({ email }) };
      await call('/api/account', timeouts.sync, init);
    },
  };
}
