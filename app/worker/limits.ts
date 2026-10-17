// Os tetos do Worker (spec 4, 7.1, 7.6 e 7.7). Os que mudam por ambiente (o espaço das cópias, as operações do R2 por mês, os e-mails por
// dia e por mês) são vars do wrangler.jsonc, lidas por capOf/capsOf; os que valem para todos são as constantes daqui. Uma var ausente,
// vazia ou que não seja um inteiro maior que 0 vale 0 (falha fechada: nada passa) e vai para o log, nunca "sem teto".
import type { Env } from './env';

export interface Caps {
  snapshotBytes: number;
  classAMonth: number;
  classBMonth: number;
  mailDay: number;
  mailMonth: number;
}

export type CapName = 'SNAPSHOT_BYTES_CAP' | 'R2_CLASS_A_MONTH' | 'R2_CLASS_B_MONTH' | 'MAIL_PER_DAY' | 'MAIL_PER_MONTH';

export const DAILY_WRITE_BUDGET = 20_000; // mudanças gravadas por conta por dia UTC (spec 7.6)
export const RESTORES_PER_DAY = 3; // restaurações por conta por dia UTC (spec 7.1)
export const COPIES_CACHE_MS = 600_000; // a lista de cópias guardada (spec 7.1)
export const COMPACT_PER_DAY = 2_000; // marcas compactadas por alarme
export const STORAGE_HEADROOM = 0.95; // grava só até 95% do teto do espaço
// O conteúdo gravado de uma conta, em bytes (a soma dos `data`). A cota conta registros, não tamanho: 16 KB de nota em cada solve levariam
// uma conta só a ~1,6 GB dos 5 GB de Durable Objects que todas dividem no grátis. Folgado: 100 mil solves comuns ficam em ~25 MB.
export const ACCOUNT_BYTES_CAP = 50_000_000;

const DAY_MS = 86_400_000;
export const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const utcMonth = (t: number): string => new Date(t).toISOString().slice(0, 7);
export const nextUtcDay = (t: number): number => (Math.floor(t / DAY_MS) + 1) * DAY_MS;

// Só dígitos, sem zero à frente, e dentro dos inteiros seguros: "1GB", "-5", "1.5", "1e3", "0" e " 10" não valem.
export function capOf(env: Env, name: CapName): number {
  const raw: unknown = env[name];
  const n = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(n) || n <= 0) {
    console.log(JSON.stringify({ evt: 'cap-missing', name }));
    return 0;
  }
  return n;
}

export function capsOf(env: Env): Caps {
  return {
    snapshotBytes: capOf(env, 'SNAPSHOT_BYTES_CAP'),
    classAMonth: capOf(env, 'R2_CLASS_A_MONTH'),
    classBMonth: capOf(env, 'R2_CLASS_B_MONTH'),
    mailDay: capOf(env, 'MAIL_PER_DAY'),
    mailMonth: capOf(env, 'MAIL_PER_MONTH'),
  };
}
