import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb, type BackupRecord } from '../../src/data/db';
import { createRepository, type KlickExport, type NewSolve, type Repository } from '../../src/data/repository';
import {
  BACKUP_KEEP, countSolveSaved, createBackup, createSaveQueue, decodeSnapshot, encodeSnapshot,
  planAfterSolve, planOnOpen, requestPersistence, restoreBackup, storageStatus, type SaveQueue,
} from '../../src/data/safety';
import type { Meta, Solve } from '../../src/core/types';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const meta = (p: Partial<Meta> = {}): Meta => ({
  schemaVersion: 1, deviceId: 'x', lastBackupAt: null, solvesSinceBackup: 0, lastBackupDay: null,
  lastExportAt: null, solvesSinceExport: 0, lastFolderSaveAt: null, solvesSinceFolderSave: 0,
  lastFolderSaveDay: null, v1ImportOffered: false, persistRequested: false, installGuideDismissed: false, ...p,
});

describe('decisões depois de um solve', () => {
  it('conta o solve nos três contadores', () => {
    expect(countSolveSaved(meta({ solvesSinceBackup: 4, solvesSinceExport: 9, solvesSinceFolderSave: 1 })))
      .toMatchObject({ solvesSinceBackup: 5, solvesSinceExport: 10, solvesSinceFolderSave: 2 });
  });
  it('cópia a cada 50, lembrete a cada 100 e pasta a cada 100 se configurada', () => {
    expect(planAfterSolve(meta({ solvesSinceBackup: 49 }), false).backup).toBeNull();
    expect(planAfterSolve(meta({ solvesSinceBackup: 50 }), false).backup).toBe('auto50');
    expect(planAfterSolve(meta({ solvesSinceExport: 100 }), false).remindExport).toBe(true);
    expect(planAfterSolve(meta({ solvesSinceExport: 150 }), false).remindExport).toBe(false);
    expect(planAfterSolve(meta({ solvesSinceExport: 200 }), false).remindExport).toBe(true);
    expect(planAfterSolve(meta({ solvesSinceFolderSave: 100 }), true).folderSave).toBe(true);
    expect(planAfterSolve(meta({ solvesSinceFolderSave: 100 }), false).folderSave).toBe(false);
  });
  it('ao abrir num dia novo com solves novos, faz a cópia do dia e salva na pasta', () => {
    expect(planOnOpen(meta({ solvesSinceBackup: 3, lastBackupDay: '2020-01-01' }), t, false).backup).toBe('daily');
    expect(planOnOpen(meta({ solvesSinceBackup: 0, lastBackupDay: '2020-01-01' }), t, false).backup).toBeNull();
    expect(planOnOpen(meta({ solvesSinceFolderSave: 2, lastFolderSaveDay: '2020-01-01' }), t, true).folderSave).toBe(true);
    expect(planOnOpen(meta({ solvesSinceFolderSave: 2, lastFolderSaveDay: '2020-01-01' }), t, false).folderSave).toBe(false);
  });
  it('no mesmo dia da última cópia não faz outra cópia do dia', () => {
    const d = new Date(t);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(planOnOpen(meta({ solvesSinceBackup: 3, lastBackupDay: local }), t, false).backup).toBeNull();
  });
});

describe('cópias automáticas', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = createRepository(await openKlickDb(`safety-${++n}`), { now, channel: null });
  });

  it('codifica e decodifica a cópia sem perda', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve({ sessionId: s.id, event: '333', ms: 61234, penalty: '+2', at: 5, scramble: 'R U' });
    const data = await repo.exportAll();
    const enc = await encodeSnapshot(data);
    expect(await decodeSnapshot(enc)).toEqual(data);
  });

  it('cria cópias, poda para as 10 últimas e zera o contador', async () => {
    await repo.saveMeta({ solvesSinceBackup: 50 });
    for (let i = 0; i < BACKUP_KEEP + 2; i++) {
      t += 1000;
      await createBackup(repo, 'auto50', t);
    }
    const list = await repo.listBackups();
    expect(list).toHaveLength(BACKUP_KEEP);
    expect(list[0].createdAt).toBe(t);
    const m = await repo.getMeta();
    expect(m).toMatchObject({ solvesSinceBackup: 0, lastBackupAt: t });
    expect(m.lastBackupDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('restaurar volta o estado da cópia e guarda o atual antes', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve({ sessionId: s.id, event: '333', ms: 60000, penalty: null, at: 1, scramble: '' });
    const b = await createBackup(repo, 'manual', t);
    await repo.addSolve({ sessionId: s.id, event: '333', ms: 70000, penalty: null, at: 2, scramble: '' });
    t += 1000;
    await restoreBackup(repo, b.id, t);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.ms)).toEqual([60000]);
    expect((await repo.listBackups()).some((r) => r.reason === 'pre-restore')).toBe(true);
  });
});

describe('armazenamento persistente', () => {
  it('pede persistência e informa o resultado', async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe('granted');
    expect(await requestPersistence({ persist: async () => false })).toBe('denied');
    expect(await requestPersistence(null)).toBe('unsupported');
  });
  it('lê o estado e o espaço em uso', async () => {
    expect(await storageStatus({ persisted: async () => true, estimate: async () => ({ usage: 10, quota: 100 }) }))
      .toEqual({ persisted: true, usage: 10, quota: 100 });
    expect(await storageStatus(null)).toEqual({ persisted: null, usage: null, quota: null });
  });
});

describe('fila de gravação', () => {
  it('quando gravar falha, guarda o solve, avisa e grava na nova tentativa', async () => {
    let fails = 2;
    const saved: number[] = [];
    let pendingSeen: number[] = [];
    let scheduled: (() => void) | null = null;
    const q = createSaveQueue(
      async (s) => {
        if (fails-- > 0) throw new Error('quota');
        saved.push(s.ms);
        return { ...s, id: 'i' + s.ms, note: '', createdAt: 0, updatedAt: 0, deletedAt: null };
      },
      { onChange: (p) => pendingSeen.push(p), schedule: (fn) => { scheduled = fn; return () => { scheduled = null; }; } },
    );
    const r = await q.enqueue({ sessionId: 's', event: '333', ms: 1, penalty: null, at: 1, scramble: '' });
    expect(r).toBeNull();
    expect(q.pending()).toBe(1);
    expect(pendingSeen).toEqual([1]);
    await q.enqueue({ sessionId: 's', event: '333', ms: 2, penalty: null, at: 2, scramble: '' });
    expect(q.pending()).toBe(2);
    scheduled!();
    await q.flush();
    expect(saved).toEqual([1, 2]);
    expect(q.pending()).toBe(0);
    expect(pendingSeen.at(-1)).toBe(0);
  });
});

// --- Acréscimos além do plano ---

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const ns = (ms: number, sessionId = 's'): NewSolve => ({ sessionId, event: '333', ms, penalty: null, at: ms, scramble: '' });
const stored = (s: NewSolve): Solve => ({ ...s, id: `i${s.ms}`, note: '', createdAt: 0, updatedAt: 0, deletedAt: null });
const msOf = (list: Solve[]): number[] => list.map((x) => x.ms);
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0)); // deixa as microtasks e as promessas correrem

// Cópia sintética grande, determinística, com embaralhamentos de verdade (quase incompressíveis, para o gzip não colapsar).
function bigExport(count: number): KlickExport {
  let seed = 123_456_789;
  const rnd = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 2 ** 32;
  };
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  const turns = ['', "'", '2'];
  const scramble = () => Array.from({ length: 20 }, () => faces[Math.floor(rnd() * 6)] + turns[Math.floor(rnd() * 3)]).join(' ');
  const base = 1_700_000_000_000;
  return {
    format: 'klick',
    version: 1,
    exportedAt: base,
    sessions: Array.from({ length: 40 }, (_, i) => ({
      id: `sessao-${i}`, name: `Sessão ${i + 1}`, event: '333' as const, order: i, createdAt: base, updatedAt: base, deletedAt: null,
    })),
    solves: Array.from({ length: count }, (_, i): Solve => ({
      id: i.toString(36).padStart(17, '0'),
      sessionId: `sessao-${i % 40}`,
      event: '333',
      ms: 8000 + Math.floor(rnd() * 40_000),
      penalty: i % 29 === 0 ? '+2' : i % 101 === 0 ? 'DNF' : null,
      at: base + i * 60_000,
      scramble: scramble(),
      note: i % 7 === 0 ? `ótimo — ação ${i}` : '',
      createdAt: base + i * 60_000,
      updatedAt: base + i * 60_000,
      deletedAt: i % 997 === 0 ? base + i * 60_000 + 5 : null,
    })),
    profile: null,
  };
}

describe('decisões depois de um solve: limites', () => {
  it('contadores zerados não pedem nada, nem depois de um solve nem ao abrir', () => {
    expect(planAfterSolve(meta(), true)).toEqual({ backup: null, remindExport: false, folderSave: false });
    expect(planOnOpen(meta(), t, true)).toEqual({ backup: null, remindExport: false, folderSave: false });
  });

  it('passou do limite porque a cópia anterior falhou: continua pedindo (>=, não ===)', () => {
    expect(planAfterSolve(meta({ solvesSinceBackup: 120 }), false).backup).toBe('auto50');
    expect(planAfterSolve(meta({ solvesSinceFolderSave: 130 }), true).folderSave).toBe(true);
    expect(planAfterSolve(meta({ solvesSinceFolderSave: 99 }), true).folderSave).toBe(false);
  });

  it('o lembrete de exportar só vem depois de um solve, nunca ao abrir', () => {
    expect(planOnOpen(meta({ solvesSinceExport: 100 }), t, true).remindExport).toBe(false);
  });

  it('nunca copiou antes (sem dia gravado): a primeira abertura com solves faz a cópia e salva na pasta', () => {
    expect(planOnOpen(meta({ solvesSinceBackup: 1, lastBackupDay: null }), t, false).backup).toBe('daily');
    expect(planOnOpen(meta({ solvesSinceFolderSave: 1, lastFolderSaveDay: null }), t, true).folderSave).toBe(true);
  });

  it('no mesmo dia da última salva na pasta, não salva de novo ao abrir', () => {
    const d = new Date(t);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(planOnOpen(meta({ solvesSinceFolderSave: 5, lastFolderSaveDay: local }), t, true).folderSave).toBe(false);
  });

  it('contar um solve devolve outro Meta e deixa o resto como estava', () => {
    const before = meta({ solvesSinceBackup: 1, lastBackupDay: '2026-10-09', persistRequested: true });
    const copy = { ...before };
    const after = countSolveSaved(before);
    expect(after).not.toBe(before);
    expect(before).toEqual(copy);
    expect(after).toEqual({ ...copy, solvesSinceBackup: 2, solvesSinceExport: 1, solvesSinceFolderSave: 1 });
  });
});

describe('cópia de muitos solves', () => {
  it('com compressão (gzip + base64): 20 000 solves, mais de 2 MB de JSON, voltam sem perda', async () => {
    const data = bigExport(20_000);
    expect(JSON.stringify(data).length).toBeGreaterThan(2_000_000);
    expect(typeof CompressionStream).toBe('function'); // o ambiente de teste tem; sem isso este teste não prova o caminho gzip
    expect(typeof DecompressionStream).toBe('function');
    const enc = await encodeSnapshot(data);
    expect(enc.encoding).toBe('gzip-base64');
    expect(enc.payload).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    // Bem acima do que String.fromCharCode(...bytes) aguenta (RangeError em dezenas de milhares de argumentos).
    expect(enc.payload.length).toBeGreaterThan(200_000);
    expect(await decodeSnapshot(enc)).toEqual(data);
  });

  it('sem CompressionStream: JSON puro, os mesmos 20 000 solves voltam sem perda', async () => {
    const data = bigExport(20_000);
    vi.stubGlobal('CompressionStream', undefined);
    const enc = await encodeSnapshot(data);
    expect(enc.encoding).toBe('json');
    expect(enc.payload).toBe(JSON.stringify(data));
    expect(await decodeSnapshot(enc)).toEqual(data);
  });

  it('as duas codificações abrem no mesmo navegador: a cópia antiga em JSON puro e a nova, comprimida', async () => {
    const data = bigExport(50);
    vi.stubGlobal('CompressionStream', undefined);
    const plain = await encodeSnapshot(data);
    vi.unstubAllGlobals();
    const packed = await encodeSnapshot(data);
    expect([plain.encoding, packed.encoding]).toEqual(['json', 'gzip-base64']);
    expect(await decodeSnapshot(plain)).toEqual(data);
    expect(await decodeSnapshot(packed)).toEqual(data);
  });

  it('acento, ideograma e caractere fora do plano básico voltam iguais (UTF-8 ida e volta)', async () => {
    const data = bigExport(3);
    data.solves[0].note = 'ótimo — ação 練習 \u{1F3AF} fim';
    data.sessions[0].name = 'Sessão \u{10348}';
    expect(await decodeSnapshot(await encodeSnapshot(data))).toEqual(data);
  });

  it('cópia vazia (sem sessões nem solves) também volta', async () => {
    const empty: KlickExport = { format: 'klick', version: 1, exportedAt: 1, sessions: [], solves: [], profile: null };
    expect(await decodeSnapshot(await encodeSnapshot(empty))).toEqual(empty);
  });
});

describe('cópia ilegível', () => {
  const valid = '{"format":"klick","version":1,"exportedAt":1,"sessions":[],"solves":[],"profile":null}';
  const cases: Array<[string, 'json' | 'gzip-base64', string | (() => Promise<string>)]> = [
    ['texto que não é JSON', 'json', 'isto não é JSON'],
    ['JSON cortado no meio', 'json', valid.slice(0, 60)],
    ['JSON que não é objeto', 'json', '[]'],
    ['JSON null', 'json', 'null'],
    ['JSON sem o formato do Klick', 'json', '{"sessions":[],"solves":[],"profile":null}'],
    ['formato de outro app, mesma versão', 'json', valid.replace('"format":"klick"', '"format":"cstimer"')],
    ['versão desconhecida', 'json', valid.replace('"version":1', '"version":2')],
    ['sem a lista de solves', 'json', '{"format":"klick","version":1,"exportedAt":1,"sessions":[],"profile":null}'],
    ['sem a lista de sessões', 'json', '{"format":"klick","version":1,"exportedAt":1,"solves":[],"profile":null}'],
    ['gzip vazio', 'gzip-base64', ''],
    ['gzip com caracteres que não são base64', 'gzip-base64', 'isto não é base64!'],
    ['base64 válido que não é gzip', 'gzip-base64', btoa('isto nao e gzip, e so texto')],
    ['gzip cortado', 'gzip-base64', async () => { const p = (await encodeSnapshot(bigExport(40))).payload; return p.slice(0, 4 * Math.floor(p.length / 8)); }],
    ['gzip com um byte trocado', 'gzip-base64', async () => {
      const p = (await encodeSnapshot(bigExport(40))).payload;
      const at = Math.floor(p.length / 2);
      return p.slice(0, at) + (p[at] === 'A' ? 'B' : 'A') + p.slice(at + 1);
    }],
  ];

  it.each(cases)('decodeSnapshot rejeita: %s', async (_name, encoding, payload) => {
    const text = typeof payload === 'string' ? payload : await payload();
    await expect(decodeSnapshot({ encoding, payload: text })).rejects.toThrow();
  });

  it('codificação que esta versão não conhece: rejeita, em vez de tentar abrir como gzip', async () => {
    const future = { encoding: 'zstd-base64', payload: 'AAAA' } as unknown as Parameters<typeof decodeSnapshot>[0];
    await expect(decodeSnapshot(future)).rejects.toThrow(/zstd-base64/);
  });

  it('cópia comprimida num navegador sem DecompressionStream: rejeita com explicação, em vez de devolver lixo', async () => {
    const enc = await encodeSnapshot(bigExport(2));
    expect(enc.encoding).toBe('gzip-base64');
    vi.stubGlobal('DecompressionStream', undefined);
    await expect(decodeSnapshot(enc)).rejects.toThrow(/comprim/i);
  });
});

describe('cópias automáticas: detalhes', () => {
  let repo: Repository;
  let sessionId: string;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = createRepository(await openKlickDb(`safety-${++n}`), { now, channel: null });
    sessionId = (await repo.createSession({ event: '333' })).id;
  });
  const current = async () => msOf(await repo.listSolves({ sessionId }));

  it('o registro guarda motivo, hora, quantos solves a pessoa tem e a cópia inteira, lixeira inclusa', async () => {
    const first = await repo.addSolve(ns(1000, sessionId));
    await repo.addSolve(ns(2000, sessionId));
    await repo.addSolve(ns(3000, sessionId));
    await repo.deleteSolve(first.id);
    const rec = await createBackup(repo, 'daily', t);
    expect(rec).toMatchObject({ reason: 'daily', createdAt: t, solveCount: 2, encoding: 'gzip-base64' });
    expect(rec.id).toMatch(/^[0-9a-z]{17}$/);
    expect(await repo.getBackup(rec.id)).toEqual(rec);
    const inside = await decodeSnapshot(rec);
    expect(inside.solves).toHaveLength(3); // o solve na lixeira também vai na cópia
    expect(inside.solves.filter((x) => x.deletedAt !== null)).toHaveLength(1);
    expect(inside.sessions).toHaveLength(1);
  });

  it('a poda tira as mais antigas, qualquer que seja o motivo, e guarda as BACKUP_KEEP mais novas', async () => {
    const reasons = ['auto50', 'daily', 'manual', 'pre-restore'] as const;
    const made: string[] = [];
    for (let i = 0; i < BACKUP_KEEP + 3; i++) {
      t += 1000;
      made.push((await createBackup(repo, reasons[i % reasons.length], t)).id);
    }
    expect((await repo.listBackups()).map((r) => r.id)).toEqual(made.slice(3).reverse()); // a mais recente primeiro
  });

  it('com menos cópias que o limite, não apaga nenhuma', async () => {
    for (let i = 0; i < BACKUP_KEEP - 1; i++) {
      t += 1000;
      await createBackup(repo, 'manual', t);
    }
    expect(await repo.listBackups()).toHaveLength(BACKUP_KEEP - 1);
  });

  it('com o relógio atrasado, a cópia nova continua na lista (a poda não a leva por parecer a mais antiga)', async () => {
    const made: string[] = [];
    for (let i = 0; i < BACKUP_KEEP; i++) {
      t += 1000;
      made.push((await createBackup(repo, 'auto50', t)).id);
    }
    const early = await createBackup(repo, 'manual', t - 60_000); // o relógio voltou
    const kept = (await repo.listBackups()).map((r) => r.id);
    expect(kept).toHaveLength(BACKUP_KEEP);
    expect(kept).toContain(early.id);
    expect(kept).not.toContain(made[0]); // saiu a mais antiga das outras
  });

  it('se gravar a cópia falha, rejeita e o contador fica como estava (o próximo solve tenta de novo)', async () => {
    await repo.saveMeta({ solvesSinceBackup: 50 });
    const failing: Repository = { ...repo, saveBackup: async () => { throw new Error('cota cheia'); } };
    await expect(createBackup(failing, 'auto50', t)).rejects.toThrow('cota cheia');
    expect((await repo.getMeta()).solvesSinceBackup).toBe(50);
    expect(await repo.listBackups()).toEqual([]);
  });

  it('se a poda falha, rejeita e o contador também fica (só zera com a cópia e a poda feitas)', async () => {
    for (let i = 0; i < BACKUP_KEEP; i++) {
      t += 1000;
      await createBackup(repo, 'manual', t);
    }
    await repo.saveMeta({ solvesSinceBackup: 50 });
    const failing: Repository = { ...repo, deleteBackup: async () => { throw new Error('banco travou'); } };
    t += 1000;
    await expect(createBackup(failing, 'auto50', t)).rejects.toThrow('banco travou');
    expect((await repo.getMeta()).solvesSinceBackup).toBe(50);
  });

  it('restaurar uma cópia que não existe rejeita e não mexe em nada, nem cria cópia pre-restore', async () => {
    await repo.addSolve(ns(60000, sessionId));
    await expect(restoreBackup(repo, 'nao-existe', t)).rejects.toThrow('nao-existe');
    expect(await current()).toEqual([60000]);
    expect(await repo.listBackups()).toEqual([]);
  });

  it('a cópia pre-restore guarda o estado de antes: restaurar ela desfaz a restauração', async () => {
    await repo.addSolve(ns(60000, sessionId));
    const b = await createBackup(repo, 'manual', t);
    await repo.addSolve(ns(70000, sessionId));
    t += 1000;
    await restoreBackup(repo, b.id, t);
    expect(await current()).toEqual([60000]);
    const pre = (await repo.listBackups()).find((r) => r.reason === 'pre-restore')!;
    expect(pre).toMatchObject({ createdAt: t, solveCount: 2 });
    t += 1000;
    await restoreBackup(repo, pre.id, t);
    expect(await current()).toEqual([60000, 70000]);
  });

  // BACKUP_KEEP cópias boas, a de número k com os k primeiros solves (1000, 2000, ...). Devolve os ids, da mais antiga à mais nova.
  async function fullListOfGoodCopies(): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 1; i <= BACKUP_KEEP; i++) {
      await repo.addSolve(ns(i * 1000, sessionId));
      t += 1000;
      ids.push((await createBackup(repo, 'auto50', t)).id);
    }
    expect(await repo.listBackups()).toHaveLength(BACKUP_KEEP);
    return ids;
  }

  it('restaurar a cópia mais antiga com a lista cheia funciona, e ela continua na lista: a pre-restore tira a vaga de outra', async () => {
    const ids = await fullListOfGoodCopies();
    t += 1000;
    await restoreBackup(repo, ids[0], t); // a mais antiga: só tinha o primeiro solve
    expect(await current()).toEqual([1000]);
    const list = (await repo.listBackups()).map((r) => r.id);
    expect(list).toHaveLength(BACKUP_KEEP);
    expect(list).toContain(ids[0]); // a escolhida nunca é podada
    expect(list).not.toContain(ids[1]); // a vaga da pre-restore sai da mais antiga das outras
  });

  it('createBackup com keepId poupa essa cópia na poda e mantém o total em BACKUP_KEEP; sem ela na lista, poda como sempre', async () => {
    const ids = await fullListOfGoodCopies();
    t += 1000;
    const kept = await createBackup(repo, 'manual', t, ids[0]); // a mais antiga seria a podada
    let list = (await repo.listBackups()).map((r) => r.id);
    expect(list).toHaveLength(BACKUP_KEEP);
    expect(list).toContain(ids[0]);
    expect(list).toContain(kept.id);
    expect(list).not.toContain(ids[1]); // saiu a mais antiga das outras
    t += 1000;
    await createBackup(repo, 'manual', t, 'id-que-nao-existe'); // keepId fora da lista: poda a mais antiga de verdade
    list = (await repo.listBackups()).map((r) => r.id);
    expect(list).toHaveLength(BACKUP_KEEP);
    expect(list).not.toContain(ids[0]);
  });

  it('replaceAll falhando ao restaurar a cópia mais antiga da lista cheia: rejeita, a escolhida continua lá e os dados também; tentar de novo funciona', async () => {
    const ids = await fullListOfGoodCopies();
    const failing: Repository = { ...repo, replaceAll: async () => { throw new Error('banco fechou'); } };
    t += 1000;
    await expect(restoreBackup(failing, ids[0], t)).rejects.toThrow('banco fechou');
    expect(await repo.getBackup(ids[0])).toBeDefined();
    expect(await current()).toEqual(Array.from({ length: BACKUP_KEEP }, (_, i) => (i + 1) * 1000)); // dados de agora intactos
    const list = await repo.listBackups();
    expect(list).toHaveLength(BACKUP_KEEP);
    expect(list.filter((r) => r.reason === 'pre-restore')).toHaveLength(1);
    t += 1000;
    await restoreBackup(repo, ids[0], t); // a pessoa tenta de novo, agora com o banco bom
    expect(await current()).toEqual([1000]);
  });

  const unreadable: Array<[string, Pick<BackupRecord, 'encoding' | 'payload'>]> = [
    ['gzip que não abre', { encoding: 'gzip-base64', payload: btoa('isto nao e gzip') }],
    ['JSON cortado', { encoding: 'json', payload: '{"format":"klick","version":1,' }],
    ['JSON que não é uma cópia do Klick', { encoding: 'json', payload: '{"sessions":[],"solves":[]}' }],
    ['versão futura do Klick', { encoding: 'json', payload: '{"format":"klick","version":2,"exportedAt":1,"sessions":[],"solves":[],"profile":null}' }],
    ['codificação que esta versão não conhece', { encoding: 'zstd-base64', payload: 'AAAA' } as unknown as Pick<BackupRecord, 'encoding' | 'payload'>],
  ];

  it.each(unreadable)('cópia corrompida (%s): restaurar rejeita; dados, lista de cópias e Meta continuam como estavam', async (_name, bad) => {
    await repo.addSolve(ns(60000, sessionId));
    const profile = await repo.saveProfile({ finish: 'gelo' });
    await repo.saveBackup({ id: 'ruim', createdAt: t, reason: 'manual', solveCount: 9, ...bad });
    const idsBefore = (await repo.listBackups()).map((r) => r.id);
    const metaBefore = await repo.getMeta();
    t += 1000;
    await expect(restoreBackup(repo, 'ruim', t)).rejects.toThrow();
    expect(await current()).toEqual([60000]);
    expect(await repo.listSessions()).toHaveLength(1);
    expect(await repo.getProfile()).toEqual(profile);
    expect((await repo.listBackups()).map((r) => r.id)).toEqual(idsBefore); // nenhuma pre-restore escrita
    expect(await repo.getMeta()).toEqual(metaBefore); // e o Meta das cópias intocado
  });

  // Cada clique em "Restaurar" numa cópia ruim, com a lista cheia, gastava uma cópia boa: nove cliques e a história acabava.
  it.each(unreadable)('lista cheia e cópia corrompida (%s): restaurar várias vezes não gasta a história (ids e Meta iguais)', async (_name, bad) => {
    for (let i = 0; i < BACKUP_KEEP - 1; i++) {
      await repo.addSolve(ns((i + 1) * 1000, sessionId));
      t += 1000;
      await createBackup(repo, 'auto50', t);
    }
    t += 1000;
    await repo.saveBackup({ id: 'ruim', createdAt: t, reason: 'manual', solveCount: 9, ...bad });
    const idsBefore = (await repo.listBackups()).map((r) => r.id);
    expect(idsBefore).toHaveLength(BACKUP_KEEP);
    const metaBefore = await repo.getMeta();
    for (let attempt = 0; attempt < 3; attempt++) {
      t += 1000;
      await expect(restoreBackup(repo, 'ruim', t)).rejects.toThrow();
    }
    expect((await repo.listBackups()).map((r) => r.id)).toEqual(idsBefore);
    expect(await repo.getMeta()).toEqual(metaBefore);
  });

  it('se a substituição falha, a falha chega a quem chamou, e a cópia pre-restore já estava guardada', async () => {
    await repo.addSolve(ns(60000, sessionId));
    const b = await createBackup(repo, 'manual', t);
    await repo.addSolve(ns(70000, sessionId));
    const failing: Repository = { ...repo, replaceAll: async () => { throw new Error('banco fechou'); } };
    t += 1000;
    await expect(restoreBackup(failing, b.id, t)).rejects.toThrow('banco fechou');
    expect(await current()).toEqual([60000, 70000]);
    expect((await repo.listBackups()).filter((r) => r.reason === 'pre-restore')).toHaveLength(1);
  });

  it('se não dá para guardar a cópia pre-restore, não restaura: nada é substituído', async () => {
    const b = await createBackup(repo, 'manual', t); // cópia boa, sem solves
    await repo.addSolve(ns(70000, sessionId));
    const replaceAll = vi.fn(repo.replaceAll);
    const failing: Repository = { ...repo, replaceAll, saveBackup: async () => { throw new Error('cota cheia'); } };
    t += 1000;
    await expect(restoreBackup(failing, b.id, t)).rejects.toThrow('cota cheia');
    expect(replaceAll).not.toHaveBeenCalled();
    expect(await current()).toEqual([70000]);
  });
});

describe('armazenamento persistente: detalhes', () => {
  it('storage sem os métodos: não suportado, e o estado vem todo null', async () => {
    expect(await requestPersistence({})).toBe('unsupported');
    expect(await storageStatus({})).toEqual({ persisted: null, usage: null, quota: null });
  });

  it('só parte dos dados disponível: o que falta vira null', async () => {
    expect(await storageStatus({ estimate: async () => ({ usage: 5 }) })).toEqual({ persisted: null, usage: 5, quota: null });
    expect(await storageStatus({ persisted: async () => false })).toEqual({ persisted: false, usage: null, quota: null });
    expect(await storageStatus({ estimate: async () => ({}) })).toEqual({ persisted: null, usage: null, quota: null });
  });

  it('uma leitura que rejeita (ou lança na hora) vira null e não derruba a outra', async () => {
    const down = async (): Promise<never> => { throw new Error('indisponível'); };
    expect(await storageStatus({ persisted: async () => true, estimate: down })).toEqual({ persisted: true, usage: null, quota: null });
    expect(await storageStatus({ persisted: down, estimate: async () => ({ usage: 3, quota: 9 }) })).toEqual({ persisted: null, usage: 3, quota: 9 });
    expect(await storageStatus({ persisted: () => { throw new Error('na hora'); }, estimate: async () => ({ usage: 1 }) }))
      .toEqual({ persisted: null, usage: 1, quota: null });
    expect(await storageStatus({ persisted: down, estimate: down })).toEqual({ persisted: null, usage: null, quota: null });
  });

  it('chama os métodos no próprio storage (o do navegador exige o this)', async () => {
    class Store {
      ok = true;
      async persist() { return this.ok; }
      async persisted() { return this.ok; }
      async estimate() { return { usage: 1, quota: 2 }; }
    }
    const store = new Store();
    expect(await requestPersistence(store)).toBe('granted');
    expect(await storageStatus(store)).toEqual({ persisted: true, usage: 1, quota: 2 });
  });

  it('sem argumento usa navigator.storage', async () => {
    expect(await requestPersistence()).toBe('unsupported'); // o jsdom não tem navigator.storage
    expect(await storageStatus()).toEqual({ persisted: null, usage: null, quota: null });
    vi.stubGlobal('navigator', {
      storage: { persist: async () => true, persisted: async () => true, estimate: async () => ({ usage: 3, quota: 9 }) },
    });
    expect(await requestPersistence()).toBe('granted');
    expect(await storageStatus()).toEqual({ persisted: true, usage: 3, quota: 9 });
  });
});

describe('fila de gravação: garantias', () => {
  it('duas gravações seguidas com o banco lento: cada solve grava uma vez, na ordem, sem gravar em paralelo', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const release: Array<() => void> = [];
    let inFlight = 0;
    let most = 0;
    const q = createSaveQueue(async (s) => {
      started.push(s.ms);
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise<void>((resolve) => release.push(resolve)); // o banco só responde quando o teste libera
      inFlight--;
      finished.push(s.ms);
      return stored(s);
    });

    const first = q.enqueue(ns(1));
    const second = q.enqueue(ns(2)); // chega com a gravação do 1 ainda em andamento
    await tick();
    expect(started).toEqual([1]); // o 2 espera a vez
    expect(q.pending()).toBe(2); // o 1 só sai da fila depois que a gravação dele responde

    release[0]();
    await tick();
    expect(started).toEqual([1, 2]);
    expect(q.pending()).toBe(1);

    release[1]();
    expect(await first).toMatchObject({ ms: 1 });
    expect(await second).toMatchObject({ ms: 2 });
    expect(started).toEqual([1, 2]); // cada um uma vez só
    expect(finished).toEqual([1, 2]);
    expect(most).toBe(1);
    expect(q.pending()).toBe(0);
  });

  it('flush espera a gravação em andamento terminar, inclusive o que chegou enquanto ela rodava', async () => {
    const saved: number[] = [];
    const release: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      await new Promise<void>((resolve) => release.push(resolve));
      saved.push(s.ms);
      return stored(s);
    });
    void q.enqueue(ns(1));
    await tick();
    let flushed = false;
    const waiting = q.flush().then(() => { flushed = true; });
    void q.enqueue(ns(2)); // chega durante o flush
    await tick();
    expect(flushed).toBe(false);
    release[0]();
    await tick();
    release[1]();
    await waiting;
    expect(saved).toEqual([1, 2]);
    expect(q.pending()).toBe(0);
  });

  it('flush com a fila parada volta na hora, mesmo com solves esperando a nova tentativa', async () => {
    const q = createSaveQueue(async () => { throw new Error('banco fora'); }, { schedule: () => () => {} });
    await q.enqueue(ns(1));
    await q.flush();
    expect(q.pending()).toBe(1);
  });

  it('rajada de 200 solves com gravações de duração variada: todos gravam, uma vez, na ordem', async () => {
    const saved: number[] = [];
    const q = createSaveQueue(async (s) => {
      for (let i = 0; i < s.ms % 5; i++) await Promise.resolve(); // demora variável
      if (s.ms % 11 === 0) await tick();
      saved.push(s.ms);
      return stored(s);
    });
    const results: Array<Promise<Solve | null>> = [];
    for (let i = 1; i <= 200; i++) {
      results.push(q.enqueue(ns(i)));
      if (i % 7 === 0) await tick();
      else if (i % 3 === 0) await Promise.resolve();
    }
    const all = await Promise.all(results);
    expect(saved).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(all.map((s) => s?.ms)).toEqual(saved);
    expect(q.pending()).toBe(0);
  });

  it('com o banco falhando de vez em quando, nada se perde, nada duplica e a ordem se mantém', async () => {
    let calls = 0;
    const saved: number[] = [];
    const timers: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      if (++calls % 3 === 0) throw new Error('falha de vez em quando');
      saved.push(s.ms);
      return stored(s);
    }, { schedule: (fn) => { timers.push(fn); return () => {}; } });
    const results: Array<Promise<Solve | null>> = [];
    for (let i = 1; i <= 30; i++) results.push(q.enqueue(ns(i)));
    await Promise.all(results);
    for (let guard = 0; q.pending() > 0 && guard < 200; guard++) {
      timers.at(-1)!();
      await q.flush();
    }
    expect(q.pending()).toBe(0);
    expect(saved).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('a falha do primeiro segura os seguintes: nada grava fora de ordem; quando o banco volta, grava tudo na ordem', async () => {
    const attempts: number[] = [];
    const saved: number[] = [];
    let down = true;
    const timers: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      attempts.push(s.ms);
      if (down) throw new Error('banco fora');
      saved.push(s.ms);
      return stored(s);
    }, { schedule: (fn) => { timers.push(fn); return () => {}; } });

    expect(await q.enqueue(ns(1))).toBeNull();
    expect(await q.enqueue(ns(2))).toBeNull();
    expect(await q.enqueue(ns(3))).toBeNull();
    expect(attempts).toEqual([1, 1, 1]); // cada tentativa recomeça pelo mais antigo; o 2 e o 3 nem são tentados
    expect(q.pending()).toBe(3);

    down = false;
    timers.at(-1)!();
    await q.flush();
    expect(saved).toEqual([1, 2, 3]);
    expect(q.pending()).toBe(0);
  });

  it('falha no segundo: o primeiro devolve o solve gravado, o segundo devolve null e fica pendente', async () => {
    const changes: number[] = [];
    const q = createSaveQueue(async (s) => {
      if (s.ms === 2) throw new Error('banco fora');
      return stored(s);
    }, { onChange: (p) => changes.push(p), schedule: () => () => {} });
    const [a, b] = await Promise.all([q.enqueue(ns(1)), q.enqueue(ns(2))]);
    expect(a).toMatchObject({ ms: 1 });
    expect(b).toBeNull();
    expect(q.pending()).toBe(1);
    expect(changes).toEqual([1]);
  });

  it('banco que funciona: ninguém é avisado de pendência, cada solve chega ao onSaved e o enqueue devolve o solve', async () => {
    const changes: number[] = [];
    const savedBy: number[] = [];
    const q = createSaveQueue(async (s) => stored(s), { onChange: (p) => changes.push(p), onSaved: (s) => savedBy.push(s.ms) });
    expect(await q.enqueue(ns(1))).toMatchObject({ id: 'i1', ms: 1 });
    expect(await q.enqueue(ns(2))).toMatchObject({ id: 'i2', ms: 2 });
    expect(changes).toEqual([]); // sem falha, o aviso fixo nunca aparece
    expect(savedBy).toEqual([1, 2]);
    expect(q.pending()).toBe(0);
    await q.flush(); // ocioso: volta na hora
  });

  it('o que ficou na fila e grava depois chega ao onSaved, na ordem, e o aviso zera uma vez só no fim', async () => {
    let down = true;
    const events: string[] = [];
    const timers: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      return stored(s);
    }, {
      onChange: (p) => events.push(`pendentes:${p}`),
      onSaved: (s) => events.push(`gravado:${s.ms}`),
      schedule: (fn) => { timers.push(fn); return () => {}; },
    });
    await q.enqueue(ns(1));
    await q.enqueue(ns(2));
    down = false;
    timers.at(-1)!();
    await q.flush();
    expect(events).toEqual(['pendentes:1', 'pendentes:2', 'gravado:1', 'gravado:2', 'pendentes:0']);
  });

  it('um solve só sai da fila depois que a gravação responde: durante a gravação ele ainda conta', async () => {
    let release: () => void = () => {};
    const q = createSaveQueue(async (s) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return stored(s);
    });
    const pending = q.enqueue(ns(1));
    await tick();
    expect(q.pending()).toBe(1);
    release();
    await pending;
    expect(q.pending()).toBe(0);
  });

  it('save que lança na hora (sem devolver uma promessa rejeitada) também deixa o solve pendente', async () => {
    const timers: Array<() => void> = [];
    const q = createSaveQueue(() => { throw new Error('na hora'); }, { schedule: (fn) => { timers.push(fn); return () => {}; } });
    expect(await q.enqueue(ns(1))).toBeNull();
    expect(q.pending()).toBe(1);
    expect(timers).toHaveLength(1); // e a nova tentativa ficou agendada
  });

  it('agenda a nova tentativa em 3000 ms por padrão (ou em retryMs) e mantém um relógio só', async () => {
    const delays: number[] = [];
    let canceled = 0;
    const fail = async (): Promise<Solve> => { throw new Error('banco fora'); };
    const schedule = (_fn: () => void, ms: number) => { delays.push(ms); return () => { canceled++; }; };
    const standard = createSaveQueue(fail, { schedule });
    await standard.enqueue(ns(1));
    await standard.enqueue(ns(2));
    expect(delays).toEqual([3000, 3000]);
    expect(canceled).toBe(1); // a segunda tentativa agendada cancela a primeira: nunca dois relógios

    delays.length = 0;
    const quick = createSaveQueue(fail, { schedule, retryMs: 250 });
    await quick.enqueue(ns(1));
    expect(delays).toEqual([250]);
  });

  it('gravar tudo cancela a tentativa que estava agendada (não sobra relógio solto)', async () => {
    let down = true;
    let canceled = 0;
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      return stored(s);
    }, { schedule: () => () => { canceled++; } });
    await q.enqueue(ns(1)); // falha: fica uma tentativa agendada
    down = false;
    expect(await q.enqueue(ns(2))).toMatchObject({ ms: 2 }); // grava o 1 e o 2
    expect(q.pending()).toBe(0);
    expect(canceled).toBe(1);
  });

  it('a tentativa que já disparou não é cancelada de novo quando a gravação seguinte começa', async () => {
    let down = true;
    let canceled = 0;
    const timers: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      return stored(s);
    }, { schedule: (fn) => { timers.push(fn); return () => { canceled++; }; } });
    await q.enqueue(ns(1));
    down = false;
    timers[0](); // o relógio dispara
    await q.flush();
    expect(q.pending()).toBe(0);
    expect(canceled).toBe(0);
  });

  it('sem schedule próprio, tenta de novo depois de 3 s com setTimeout', async () => {
    vi.useFakeTimers();
    let fails = 1;
    const saved: number[] = [];
    const q = createSaveQueue(async (s) => {
      if (fails-- > 0) throw new Error('banco fora');
      saved.push(s.ms);
      return stored(s);
    });
    expect(await q.enqueue(ns(1))).toBeNull();
    await vi.advanceTimersByTimeAsync(2999);
    expect(saved).toEqual([]);
    expect(q.pending()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual([1]);
    expect(q.pending()).toBe(0);
    expect(vi.getTimerCount()).toBe(0); // sem relógio sobrando
  });

  it('continua tentando enquanto o banco não volta, a cada retryMs, sem desistir', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const q = createSaveQueue(async (s) => {
      if (++calls < 6) throw new Error('banco fora');
      return stored(s);
    }, { retryMs: 1000 });
    expect(await q.enqueue(ns(1))).toBeNull();
    await vi.advanceTimersByTimeAsync(4000);
    expect(calls).toBe(5);
    expect(q.pending()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(6);
    expect(q.pending()).toBe(0);
  });

  it('onSaved que lança não regrava o solve nem trava a fila: o erro vai para onError', async () => {
    const calls: number[] = [];
    const errors: unknown[] = [];
    const boom = new Error('ouvinte quebrado');
    const q = createSaveQueue(async (s) => { calls.push(s.ms); return stored(s); }, {
      onSaved: () => { throw boom; },
      onError: (e) => errors.push(e),
    });
    const [a, b] = await Promise.all([q.enqueue(ns(1)), q.enqueue(ns(2))]);
    expect([a?.ms, b?.ms]).toEqual([1, 2]);
    expect(calls).toEqual([1, 2]); // cada um uma vez só
    expect(errors).toEqual([boom, boom]);
    expect(q.pending()).toBe(0);
  });

  it('onChange que lança durante uma falha não impede a nova tentativa', async () => {
    let down = true;
    const errors: unknown[] = [];
    const timers: Array<() => void> = [];
    const saved: number[] = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      saved.push(s.ms);
      return stored(s);
    }, {
      onChange: () => { throw new Error('ouvinte quebrado'); },
      onError: (e) => errors.push(e),
      schedule: (fn) => { timers.push(fn); return () => {}; },
    });
    expect(await q.enqueue(ns(1))).toBeNull();
    expect(timers).toHaveLength(1); // a tentativa ficou agendada apesar do ouvinte quebrado
    down = false;
    timers[0]();
    await q.flush();
    expect(saved).toEqual([1]);
    expect(errors).toHaveLength(2); // o aviso de pendência e o aviso de fila vazia
  });

  it('sem onError, o erro do ouvinte é relançado numa microtask, para seguir visível', async () => {
    const agendadas: Array<() => void> = [];
    vi.stubGlobal('queueMicrotask', (cb: () => void) => { agendadas.push(cb); });
    const boom = new Error('ouvinte quebrado');
    const q = createSaveQueue(async (s) => stored(s), { onSaved: () => { throw boom; } });
    expect(await q.enqueue(ns(1))).toMatchObject({ ms: 1 });
    expect(agendadas).toHaveLength(1);
    expect(() => agendadas[0]()).toThrow(boom);
  });

  it('onError que lança, ao receber o erro de um ouvinte, não trava a fila: os dois erros saem pelo relançar-depois', async () => {
    const agendadas: Array<() => void> = [];
    vi.stubGlobal('queueMicrotask', (cb: () => void) => { agendadas.push(cb); });
    const fromListener = new Error('ouvinte quebrado');
    const fromHandler = new Error('onError quebrado');
    const calls: number[] = [];
    const q = createSaveQueue(async (s) => { calls.push(s.ms); return stored(s); }, {
      onSaved: () => { throw fromListener; },
      onError: () => { throw fromHandler; },
    });
    const [a, b] = await Promise.all([q.enqueue(ns(1)), q.enqueue(ns(2))]);
    expect([a?.ms, b?.ms]).toEqual([1, 2]);
    expect(calls).toEqual([1, 2]); // nenhum regravado
    expect(agendadas).toHaveLength(2);
    let surfaced: unknown;
    try {
      agendadas[0]();
    } catch (err) {
      surfaced = err;
    }
    expect(surfaced).toBeInstanceOf(AggregateError);
    expect((surfaced as AggregateError).errors).toEqual([fromListener, fromHandler]);
  });

  it('solve enfileirado de dentro de um ouvinte (onSaved, ou onChange(0) no fim) não fica para trás', async () => {
    let down = true;
    const saved: number[] = [];
    const timers: Array<() => void> = [];
    const q: SaveQueue = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      saved.push(s.ms);
      return stored(s);
    }, {
      onSaved: (s) => { if (s.ms === 1) void q.enqueue(ns(2)); },
      onChange: (p) => { if (p === 0) void q.enqueue(ns(3)); },
      schedule: (fn) => { timers.push(fn); return () => {}; },
    });
    await q.enqueue(ns(1)); // falha: fica pendente
    down = false;
    timers.at(-1)!();
    await q.flush();
    expect(saved).toEqual([1, 2, 3]);
    expect(q.pending()).toBe(0);
  });

  // --- pendentes à mostra (exportação de emergência) ---

  it('pendingItems devolve cópias dos pendentes, na ordem de chegada; mexer no resultado não mexe na fila', async () => {
    let down = true;
    const saved: number[] = [];
    const timers: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      saved.push(s.ms);
      return stored(s);
    }, { schedule: (fn) => { timers.push(fn); return () => {}; } });
    expect(q.pendingItems()).toEqual([]);

    await q.enqueue(ns(1));
    await q.enqueue(ns(2));
    await q.enqueue(ns(3));
    const items = q.pendingItems();
    expect(items).toEqual([ns(1), ns(2), ns(3)]);
    expect(items).toHaveLength(q.pending());

    items[0].ms = 999; // mexe num item
    items.reverse(); // reordena
    items.pop(); // e tira da lista
    expect(q.pendingItems()).toEqual([ns(1), ns(2), ns(3)]);
    expect(q.pending()).toBe(3);
    expect(q.pendingItems()[0]).not.toBe(q.pendingItems()[0]); // cada chamada traz cópias novas

    down = false;
    timers.at(-1)!();
    await q.flush();
    expect(saved).toEqual([1, 2, 3]); // o que grava é o original, na ordem
    expect(q.pendingItems()).toEqual([]);
  });

  it('pendingItems inclui o solve que está sendo gravado (só sai quando o save responde) e esvazia depois', async () => {
    let release: () => void = () => {};
    const q = createSaveQueue(async (s) => {
      await new Promise<void>((resolve) => { release = resolve; });
      return stored(s);
    });
    const first = q.enqueue(ns(1));
    await tick();
    expect(q.pendingItems()).toEqual([ns(1)]);
    release();
    await first;
    expect(q.pendingItems()).toEqual([]);
  });

  it('mexer no objeto depois de enfileirar não muda o que a fila guarda nem o que ela grava', async () => {
    let down = true;
    const saved: NewSolve[] = [];
    const timers: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      saved.push(s);
      return stored(s);
    }, { schedule: (fn) => { timers.push(fn); return () => {}; } });
    const mine = ns(1);
    await q.enqueue(mine); // falha: fica pendente
    mine.ms = 999; // quem enfileirou mexe no objeto dele
    expect(q.pendingItems()).toEqual([ns(1)]);
    down = false;
    timers.at(-1)!();
    await q.flush();
    expect(saved).toEqual([ns(1)]);
  });

  // --- a causa da falha de gravação ---

  it('onSaveError recebe o erro de cada tentativa que falha, antes do aviso e da nova tentativa agendada', async () => {
    const events: string[] = [];
    const received: unknown[] = [];
    const causes = [new Error('cota cheia'), new Error('banco bloqueado')];
    const q = createSaveQueue(async () => { throw causes.shift() ?? new Error('outra'); }, {
      onSaveError: (err) => { received.push(err); events.push(`erro:${(err as Error).message}`); },
      onChange: (n) => events.push(`pendentes:${n}`),
      schedule: () => { events.push('agendou'); return () => {}; },
    });
    await q.enqueue(ns(1));
    expect(events).toEqual(['erro:cota cheia', 'pendentes:1', 'agendou']);
    await q.enqueue(ns(2)); // nova tentativa, outra causa
    expect(events.slice(3)).toEqual(['erro:banco bloqueado', 'pendentes:2', 'agendou']);
    expect(received[0]).toBeInstanceOf(Error); // o próprio erro que o save lançou, não uma cópia ou texto
    expect((received[0] as Error).message).toBe('cota cheia');
  });

  it('onSaveError recebe o valor lançado como veio, mesmo que não seja um Error', async () => {
    const received: unknown[] = [];
    const quota = { name: 'QuotaExceededError' };
    const q = createSaveQueue(() => Promise.reject(quota), { onSaveError: (err) => received.push(err), schedule: () => () => {} });
    await q.enqueue(ns(1));
    expect(received).toEqual([quota]);
    expect(received[0]).toBe(quota);
  });

  it('onSaveError não é chamado quando grava, nem quando a nova tentativa dá certo', async () => {
    let down = true;
    const timers: Array<() => void> = [];
    const causes: unknown[] = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      return stored(s);
    }, { onSaveError: (err) => causes.push(err), schedule: (fn) => { timers.push(fn); return () => {}; } });
    await q.enqueue(ns(1));
    expect(causes).toHaveLength(1);
    down = false;
    timers[0]();
    await q.flush();
    await q.enqueue(ns(2));
    expect(causes).toHaveLength(1); // só a falha; as gravações que deram certo não chamam
  });

  it('onSaveError que lança vai para onError: o aviso sai, a nova tentativa fica agendada e a fila grava quando o banco volta', async () => {
    let down = true;
    const errors: unknown[] = [];
    const changes: number[] = [];
    const saved: number[] = [];
    const timers: Array<() => void> = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      saved.push(s.ms);
      return stored(s);
    }, {
      onSaveError: () => { throw new Error('ouvinte quebrado'); },
      onError: (err) => errors.push(err),
      onChange: (n) => changes.push(n),
      schedule: (fn) => { timers.push(fn); return () => {}; },
    });
    expect(await q.enqueue(ns(1))).toBeNull();
    expect(errors).toEqual([new Error('ouvinte quebrado')]);
    expect(changes).toEqual([1]); // o aviso fixo saiu mesmo com o ouvinte quebrado
    expect(timers).toHaveLength(1); // e a nova tentativa ficou agendada
    down = false;
    timers[0]();
    await q.flush();
    expect(saved).toEqual([1]);
    expect(q.pending()).toBe(0);
  });

  // --- schedule também é isolado ---

  it('schedule que lança: o aviso sai, o solve fica pendente, o erro vai para onError e a fila não trava', async () => {
    let down = true;
    const errors: unknown[] = [];
    const changes: number[] = [];
    const saved: number[] = [];
    const q = createSaveQueue(async (s) => {
      if (down) throw new Error('banco fora');
      saved.push(s.ms);
      return stored(s);
    }, {
      onChange: (n) => changes.push(n),
      onError: (err) => errors.push(err),
      schedule: () => { throw new Error('sem relógio'); },
    });
    expect(await q.enqueue(ns(1))).toBeNull(); // sem erro não tratado: o enqueue resolve
    expect(changes).toEqual([1]); // o aviso fixo aparece, mesmo sem relógio
    expect(q.pending()).toBe(1); // e o solve continua na fila
    expect(q.pendingItems()).toEqual([ns(1)]);
    expect(errors).toEqual([new Error('sem relógio')]);
    down = false;
    expect(await q.enqueue(ns(2))).toMatchObject({ ms: 2 }); // a próxima enqueue ainda drena: grava o 1 e o 2
    expect(saved).toEqual([1, 2]);
    expect(changes).toEqual([1, 0]);
  });

  it('o aviso (onChange) sai antes de a nova tentativa ser agendada', async () => {
    const events: string[] = [];
    const q = createSaveQueue(async () => { throw new Error('banco fora'); }, {
      onChange: (n) => events.push(`pendentes:${n}`),
      schedule: () => { events.push('agendou'); return () => {}; },
    });
    await q.enqueue(ns(1));
    expect(events).toEqual(['pendentes:1', 'agendou']);
  });

  it('com o repositório de verdade: banco indisponível segura o solve; quando volta, grava uma vez só', async () => {
    const name = `safety-${++n}`;
    const db = await openKlickDb(name);
    const down = createRepository(db, { now, channel: null });
    const { id: sessionId } = await down.createSession({ event: '333' });
    let repo: Repository = down;
    const timers: Array<() => void> = [];
    const warnings: number[] = [];
    const q = createSaveQueue((s) => repo.addSolve(s), { onChange: (p) => warnings.push(p), schedule: (fn) => { timers.push(fn); return () => {}; } });

    db.close(); // o banco some
    expect(await q.enqueue(ns(60000, sessionId))).toBeNull();
    expect(q.pending()).toBe(1);
    expect(warnings).toEqual([1]);

    repo = createRepository(await openKlickDb(name), { now, channel: null }); // o banco volta
    timers.at(-1)!();
    await q.flush();
    expect(q.pending()).toBe(0);
    expect(warnings).toEqual([1, 0]);
    expect(msOf(await repo.listSolves({ sessionId }))).toEqual([60000]);
  });
});
