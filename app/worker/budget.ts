// As reservas dos tetos no D1 (spec 4 e 7). Cada uma é um lote do D1, que roda como uma transação: um INSERT que garante a linha e um
// UPDATE com a condição na própria cláusula WHERE (count + n <= teto). O D1 escreve numa fila só, e o UPDATE confere e soma no mesmo
// passo: pedidos em paralelo não passam do teto, e o `meta.changes` diz se passou. Recusado, nada é somado. O teto vem de limits.ts
// (capOf/capsOf), onde uma var torta já vale 0: com o teto 0, nada passa.
import { STORAGE_HEADROOM, utcDay, utcMonth } from './limits';
import type { Caps } from './limits';

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

// O uso recontado (listando snap/) troca o que estava; counted_at guarda quando.
export async function setStorage(db: D1Database, bytes: number, now: number): Promise<void> {
  await db
    .prepare('INSERT INTO r2_storage (id, bytes, counted_at) VALUES (1, ?1, ?2) ON CONFLICT (id) DO UPDATE SET bytes = excluded.bytes, counted_at = excluded.counted_at')
    .bind(bytes, now)
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
