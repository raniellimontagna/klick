// O cliente HTTP do servidor do Klick (spec 6.1 e 8.1): mesma origem, com o cookie da sessão. Os erros viram tipos que o motor e as telas
// entendem; nada aqui guarda estado.
import type { SyncRequest, SyncResponse } from '../core/sync/types';

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
}

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const kindOf = (status: number): ApiErrorKind =>
  status === 401 ? 'auth' : status === 426 ? 'update' : status >= 500 ? 'server' : 'client';

export function createSyncApi(fetcher: Fetcher = (input, init) => fetch(input, init), base = ''): SyncApi {
  async function call(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetcher(base + path, { credentials: 'same-origin', ...init });
    } catch {
      throw new ApiError('offline', 0);
    }
    if (!res.ok) throw new ApiError(kindOf(res.status), res.status);
    return res;
  }
  const post = (path: string, body: unknown): Promise<Response> =>
    call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    async health() {
      try {
        const data = (await (await call('/api/health')).json()) as Partial<Health> | null;
        if (typeof data?.accounts !== 'boolean') return null;
        return { accounts: data.accounts, turnstileSiteKey: typeof data.turnstileSiteKey === 'string' ? data.turnstileSiteKey : null };
      } catch {
        return null; // sem servidor, ou uma resposta que não é a dele (o index.html do vite preview)
      }
    },
    async sync(req) {
      const res = await post('/api/sync', req);
      try {
        return (await res.json()) as SyncResponse;
      } catch {
        throw new ApiError('server', res.status); // uma resposta que não é JSON não é a do Worker: o motor tenta de novo mais tarde
      }
    },
  };
}
