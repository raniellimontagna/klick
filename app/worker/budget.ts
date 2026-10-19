// Os tetos do grátis contados no D1 (spec 4 e 7): as operações do R2 por mês, o espaço das cópias, os e-mails e as linhas gravadas por dia
// nos objetos das contas. Cada reserva (takeOps, reserveStorage, reserveMail) é um lote do D1, que roda como uma transação: um INSERT que
// garante a linha e um UPDATE com a condição na própria cláusula WHERE (count + n <= teto); a das linhas (reserveRows) é uma instrução só,
// um upsert com a mesma condição. O D1 escreve numa fila só, e a instrução confere e soma no mesmo passo: pedidos em paralelo não passam
// do teto, e o `meta.changes` diz se passou. Recusado, nada é somado. O teto vem de limits.ts (capOf/capsOf), onde uma var torta já
// vale 0: com o teto 0, nada passa. Além das reservas: countOps conta sem recusar (o que já foi feito), releaseStorage devolve uma reserva
// de espaço que não virou cópia, reserveCopy junta o espaço e a operação A de um put, copyRoom confere os dois sem reservar (antes de ler a
// conta), e recountStorage lista snap/ no R2 (cada página, uma operação A reservada antes) e troca o espaço contado pelo que existe.
import type { CopiesPaused } from '../src/core/sync/types';
import type { Env } from './env';
import { capsOf, STORAGE_HEADROOM, utcDay, utcMonth } from './limits';
import type { Caps } from './limits';
import { SNAPSHOTS_ROOT } from './snapshots';

export type OpClass = 'A' | 'B';

const isCount = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

// Reserva `n` operações do R2 na classe, neste mês UTC, se couberem no teto. false: recusado, nada foi contado.
export async function takeOps(db: D1Database, cls: OpClass, n: number, now: number, cap: number): Promise<boolean> {
  if (!isCount(n) || !isCount(cap)) return false;
  const month = utcMonth(now);
  const [, taken] = await db.batch([
    db.prepare('INSERT INTO r2_ops (month, class, count) VALUES (?1, ?2, 0) ON CONFLICT (month, class) DO NOTHING').bind(month, cls),
    db.prepare('UPDATE r2_ops SET count = count + ?3 WHERE month = ?1 AND class = ?2 AND count + ?3 <= ?4').bind(month, cls, n, cap),
  ]);
  return taken.meta.changes > 0;
}

// Conta `n` operações sem recusar: o que já foi feito (apagar a conta lista e apaga as cópias) entra na conta do mês.
export async function countOps(db: D1Database, cls: OpClass, n: number, now: number): Promise<void> {
  if (!isCount(n) || n === 0) return;
  await db
    .prepare('INSERT INTO r2_ops (month, class, count) VALUES (?1, ?2, ?3) ON CONFLICT (month, class) DO UPDATE SET count = count + excluded.count')
    .bind(utcMonth(now), cls, n)
    .run();
}

// Reserva `bytes` do espaço das cópias: o usado mais `bytes` tem de caber em 95% do teto. false: recusado, nada foi contado. A recontagem
// (setStorage) corrige o que as cópias apagadas pela regra de 30 dias liberaram.
export async function reserveStorage(db: D1Database, bytes: number, now: number, cap: number): Promise<boolean> {
  if (!isCount(bytes) || !isCount(cap)) return false;
  const [, taken] = await db.batch([
    db.prepare('INSERT INTO r2_storage (id, bytes, counted_at) VALUES (1, 0, ?1) ON CONFLICT (id) DO NOTHING').bind(now),
    db.prepare('UPDATE r2_storage SET bytes = bytes + ?1 WHERE id = 1 AND bytes + ?1 <= ?2').bind(bytes, Math.floor(cap * STORAGE_HEADROOM)),
  ]);
  return taken.meta.changes > 0;
}

export async function storageUsed(db: D1Database): Promise<number> {
  return (await db.prepare('SELECT bytes FROM r2_storage WHERE id = 1').first<{ bytes: number }>())?.bytes ?? 0;
}

// O uso recontado (listando snap/) troca o que estava; counted_at guarda quando. Com `seen`, o uso lido antes de a listagem começar, o que
// foi reservado enquanto ela corria fica por cima do recontado: a cópia reservada nesse meio pode chegar ao R2 depois de a listagem passar
// pelo nome dela. Uma que ela já viu conta duas vezes até a recontagem seguinte (a mais, nunca a menos).
export async function setStorage(db: D1Database, bytes: number, now: number, seen?: number): Promise<void> {
  const reserved = seen === undefined ? '' : ' + max(0, r2_storage.bytes - ?3)';
  await db
    .prepare(`INSERT INTO r2_storage (id, bytes, counted_at) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET bytes = excluded.bytes${reserved}, counted_at = excluded.counted_at`)
    .bind(...(seen === undefined ? [bytes, now] : [bytes, now, seen]))
    .run();
}

// Devolve uma reserva de espaço que não virou cópia (a operação A foi recusada depois dela).
export async function releaseStorage(db: D1Database, bytes: number): Promise<void> {
  if (!isCount(bytes) || bytes === 0) return;
  await db.prepare('UPDATE r2_storage SET bytes = max(0, bytes - ?1) WHERE id = 1').bind(bytes).run();
}

// Antes de gravar uma cópia no R2 (a do dia, a de antes de restaurar): o espaço dela e a operação A do put, nessa ordem. O espaço vem
// primeiro: com ele cheio, nenhuma operação é gasta (o que, dia após dia, numa conta pausada, comeria as do mês). Recusado, volta o que
// falta ('space' ou 'ops'), e nada fica reservado.
export async function reserveCopy(db: D1Database, bytes: number, now: number, caps: Pick<Caps, 'snapshotBytes' | 'classAMonth'>): Promise<CopiesPaused | null> {
  if (!(await reserveStorage(db, bytes, now, caps.snapshotBytes))) return 'space';
  if (await takeOps(db, 'A', 1, now, caps.classAMonth)) return null;
  await releaseStorage(db, bytes);
  return 'ops';
}

// Antes de ler e comprimir uma conta para uma cópia (a do dia, a de antes de restaurar), com o tamanho estimado dela (o da última cópia da
// conta): ela cabe no espaço, e sobra a operação A do put? Só lê, numa consulta, sem reservar nada: a reserva com o tamanho de verdade
// (reserveCopy) continua a autoridade. Volta o que falta ('space' ou 'ops'), na mesma ordem de reserveCopy, ou null.
export async function copyRoom(db: D1Database, bytes: number, now: number, caps: Pick<Caps, 'snapshotBytes' | 'classAMonth'>): Promise<CopiesPaused | null> {
  const row = await db
    .prepare("SELECT (SELECT bytes FROM r2_storage WHERE id = 1) AS used, (SELECT count FROM r2_ops WHERE month = ?1 AND class = 'A') AS ops")
    .bind(utcMonth(now))
    .first<{ used: number | null; ops: number | null }>();
  if (!isCount(bytes) || !isCount(caps.snapshotBytes) || (row?.used ?? 0) + bytes > Math.floor(caps.snapshotBytes * STORAGE_HEADROOM)) return 'space';
  if (!isCount(caps.classAMonth) || (row?.ops ?? 0) + 1 > caps.classAMonth) return 'ops';
  return null;
}

// A recontagem diária do espaço das cópias (o Cron, worker/index.ts): lista snap/ inteiro e troca o uso contado pela soma do que existe, para
// que o que a regra de 30 dias do bucket apagou saia da conta. Cada página é uma operação A, reservada antes; sem ela (no começo ou no meio),
// a conta pela metade não vale e o valor fica (null). O uso é lido antes da primeira página: o que for reservado durante a listagem fica por
// cima (setStorage). Sobra de fora só o put que já estava a caminho quando a recontagem começou e chega depois de a listagem passar pelo
// nome dele: uma cópia por put em voo, coberta pela folga de 5% do teto (STORAGE_HEADROOM). Devolve o total listado.
export async function recountStorage(env: Env, now: number): Promise<number | null> {
  const cap = capsOf(env).classAMonth;
  const seen = await storageUsed(env.DB);
  let total = 0;
  let cursor: string | undefined;
  do {
    if (!(await takeOps(env.DB, 'A', 1, now, cap))) return null;
    const page = await env.SNAPSHOTS.list({ prefix: SNAPSHOTS_ROOT, cursor });
    for (const o of page.objects) total += o.size;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await setStorage(env.DB, total, now, seen);
  return total;
}

// Reserva `n` linhas gravadas nos objetos das contas no dia UTC de `now`, somadas entre todas as contas do ambiente, se couberem no teto
// (ROWS_WRITTEN_DAY_CAP). Uma instrução: a linha do dia nasce com `n`, ou soma `n` à que existe, só com count + n <= teto (o WHERE do SELECT
// também separa o ON CONFLICT do upsert de um JOIN, para o SQLite). false: recusado, nada foi contado.
export async function reserveRows(db: D1Database, n: number, now: number, cap: number): Promise<boolean> {
  if (!isCount(n) || !isCount(cap)) return false;
  const taken = await db
    .prepare(
      `INSERT INTO rows_day (day, count) SELECT ?1, ?2 WHERE ?2 <= ?3
         ON CONFLICT (day) DO UPDATE SET count = rows_day.count + excluded.count WHERE rows_day.count + excluded.count <= ?3`,
    )
    .bind(utcDay(now), n, cap)
    .run();
  return taken.meta.changes > 0;
}

// Antes de reservar, quando a reserva ainda não pode sair (a restauração, antes do R2): o dia UTC de `now` mais `n` linhas cabe no teto? Só
// lê; a reserva de depois (reserveRows) continua a autoridade.
export async function rowsRoom(db: D1Database, n: number, now: number, cap: number): Promise<boolean> {
  if (!isCount(n) || !isCount(cap)) return false;
  const row = await db.prepare('SELECT count FROM rows_day WHERE day = ?').bind(utcDay(now)).first<{ count: number }>();
  return (row?.count ?? 0) + n <= cap;
}

// Soma `n` linhas sem recusar: as que um objeto gravou além do que tinha reservado (account-store.ts, settleRows), que já estão gravadas.
export async function countRows(db: D1Database, n: number, now: number): Promise<void> {
  if (!isCount(n) || n === 0) return;
  await db
    .prepare('INSERT INTO rows_day (day, count) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET count = count + excluded.count')
    .bind(utcDay(now), n)
    .run();
}

// Reserva um e-mail no dia e no mês UTC, juntos ou nenhum: o UPDATE confere as duas linhas antes de somar nas duas (as subconsultas não
// dependem da linha, e o SQLite as calcula antes da primeira soma), e as duas somadas (changes = 2) dizem que passou.
export async function reserveMail(db: D1Database, now: number, caps: Pick<Caps, 'mailDay' | 'mailMonth'>): Promise<boolean> {
  if (!isCount(caps.mailDay) || !isCount(caps.mailMonth)) return false;
  const [day, month] = [`d:${utcDay(now)}`, `m:${utcMonth(now)}`];
  const [, taken] = await db.batch([
    db.prepare("INSERT INTO mail_sent (period, count) VALUES (?1, 0), (?2, 0) ON CONFLICT (period) DO NOTHING").bind(day, month),
    db
      .prepare(
        `UPDATE mail_sent SET count = count + 1 WHERE period IN (?1, ?2)
           AND (SELECT count FROM mail_sent WHERE period = ?1) < ?3 AND (SELECT count FROM mail_sent WHERE period = ?2) < ?4`,
      )
      .bind(day, month, caps.mailDay, caps.mailMonth),
  ]);
  return taken.meta.changes === 2;
}
