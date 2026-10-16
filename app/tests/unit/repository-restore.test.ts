import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { prefToChange, toChange, type RecordStore } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import type { Change } from '../../src/core/sync/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { defaultSessionId } from '../../src/data/ids';
import { createRepository, type KlickExport, type Repository } from '../../src/data/repository';
import { createBackup, restoreBackup } from '../../src/data/safety';
import { parseKlickJson } from '../../src/data/transfer';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { summaryLines } from '../../src/ui/import-flow';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const ns = (sessionId: string, ms: number) => ({ sessionId, event: '333' as const, ms, penalty: null, at: t, scramble: "R U R'" });

async function fresh(account: string | null = null): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository }> {
  const db = await openKlickDb(`restore-${++n}`);
  const repo = createRepository(db, { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, signedIn: true });
  return { db, repo };
}

describe('a sessão padrão de um aparelho novo (spec 5.5)', () => {
  it('dois aparelhos novos criam a mesma "Sessão 1", com id fixo por evento', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const { repo } = await fresh();
      const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R' }), now, storage: null, storageManager: null });
      await app.init();
      ids.push(app.sessions[0].id);
    }
    expect(ids).toEqual([defaultSessionId('333'), defaultSessionId('333')]);
  });

  it('com o id padrão já usado (a sessão está na lixeira), a sessão nova ganha um id novo', async () => {
    const { repo } = await fresh();
    const first = await repo.createSession({ event: '333', id: defaultSessionId('333') });
    await repo.deleteSession(first.id);
    const second = await repo.createSession({ event: '333', id: defaultSessionId('333') });
    expect(first.id).toBe('default-333');
    expect(second.id).not.toBe('default-333');
  });
});

describe('restaurar uma cópia é gravação (spec 5.5)', () => {
  it('sem conta, a tela fica como a cópia; o que não estava nela vai para a lixeira', async () => {
    const { repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const kept = await repo.addSolve(ns(s.id, 1000));
    const backup = await createBackup(repo, 'manual', t);
    t += 1000;
    const extra = await repo.addSolve(ns(s.id, 2000));
    await repo.updateSolve(kept.id, { note: 'depois da cópia' });
    t += 1000;
    await restoreBackup(repo, backup.id, t);
    expect((await repo.listSolves()).map((x) => [x.id, x.note])).toEqual([[kept.id, '']]);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([extra.id]);
    expect((await repo.listSessions()).map((x) => x.id)).toEqual([s.id]);
  });

  it('com conta, cada registro da cópia ganha data nova e tudo entra na fila, inclusive as chaves da conta', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const kept = await repo.addSolve(ns(s.id, 1000));
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false] });
    const backup = await createBackup(repo, 'manual', t);
    t += 1000;
    const extra = await repo.addSolve(ns(s.id, 2000));
    await repo.saveProfile({ trail: [true, true, false, false, false, false, false, false, false], lessonAt: { 3: 2 } });
    await db.clear('outbox');
    t += 60_000;
    await restoreBackup(repo, backup.id, t);
    const restored = (await db.get('solves', kept.id))!;
    expect(restored).toMatchObject({ deletedAt: null });
    expect(restored.updatedAt).toBeGreaterThanOrEqual(t);
    expect(restored.deletionStamp).toBe(restored.updatedAt);
    expect((await db.get('solves', extra.id))!.deletedAt).toBe(restored.updatedAt);
    const queued = (await db.getAllKeys('outbox')) as string[];
    expect(queued).toEqual(expect.arrayContaining([`solves/${kept.id}`, `solves/${extra.id}`, `sessions/${s.id}`, 'prefs/trail.1', 'prefs/lessonAt.3', 'prefs/finish']));
    expect(await db.get('prefs', 'trail.1')).toMatchObject({ value: false });
    expect(await db.get('prefs', 'lessonAt.3')).toMatchObject({ value: null });
    expect((await repo.getProfile()).trail.slice(0, 2)).toEqual([true, false]);
  });
});

describe('importar sessões (spec 5.5)', () => {
  it('a sessão segue "o mais recente vence": renomear e excluir no outro aparelho chegam pelo arquivo', async () => {
    const { repo: phone } = await fresh();
    const { repo: desktop } = await fresh();
    const s = await phone.createSession({ event: '333', name: 'Treino' });
    await desktop.importAll(await phone.exportAll());
    t += 1000;
    await phone.renameSession(s.id, 'Treino da manhã');
    t += 1000;
    await phone.deleteSession(s.id);
    await desktop.importAll(await phone.exportAll());
    expect(await desktop.listSessions()).toEqual([]);
    expect((await desktop.listTrash()).sessions).toMatchObject([{ id: s.id, name: 'Treino da manhã' }]);
  });
});

// --- Acrescentados (notas da revisão, além do brief) ---

// O registro atual de cada entrada da fila, como o motor vai mandar (spec 6.1).
async function pendingChanges(db: IDBPDatabase<KlickDB>): Promise<Change[]> {
  const out: Change[] = [];
  for (const e of await db.getAll('outbox')) {
    if (e.store === 'prefs') out.push(prefToChange((await db.get('prefs', e.id))!));
    else out.push(toChange(e.store as RecordStore, (await db.get(e.store, e.id))!));
  }
  return out;
}
const refusedBy = (changes: Change[]) => changes.filter((c) => !checkChange(c).ok).map((c) => `${c.store}/${c.id}`);

describe('importar sessões: o invariante "solve ativo => sessão ativa" (spec 5.5)', () => {
  it('a exclusão que chega pelo arquivo não deixa um solve ativo daqui (fora do arquivo) sob a sessão na lixeira: a sessão volta', async () => {
    const { repo: phone } = await fresh();
    const { repo: desktop } = await fresh();
    const s = await phone.createSession({ event: '333', name: 'Treino' });
    await desktop.importAll(await phone.exportAll());
    t += 1000;
    const mine = await desktop.addSolve(ns(s.id, 3000)); // só no desktop
    t += 1000;
    await phone.renameSession(s.id, 'Treino da manhã');
    await phone.deleteSession(s.id);
    await desktop.importAll(await phone.exportAll());
    expect(await desktop.listSessions()).toMatchObject([{ id: s.id, name: 'Treino da manhã', deletedAt: null }]);
    expect((await desktop.listSolves()).map((x) => x.id)).toEqual([mine.id]);
  });
});

describe('importar não deixa entrar o que o sync recusaria (spec 6.6: um registro do app nunca é recusado)', () => {
  const session = { name: 'Sessão', event: '333', order: 0, createdAt: 1_000, updatedAt: 1_000, deletedAt: null };
  const solve = { sessionId: 'boa', event: '333', ms: 9_000, penalty: null, at: 1_000, scramble: 'R', note: '', createdAt: 1_000, updatedAt: 1_000, deletedAt: null };
  const attempt = { caseId: 'oll2-sune', ms: 2_000, ok: true, helped: false, at: 1_000 };
  // Um arquivo do Klick editado à mão: o leitor do arquivo aceita tudo isto (os tipos batem), e é o repositório que separa.
  const handEdited = (): string =>
    JSON.stringify({
      format: 'klick',
      version: 1,
      exportedAt: 1_000,
      profile: null,
      sessions: [
        { ...session, id: 'boa', updatedAt: -5 },
        { ...session, id: 'com espaço' },
        { ...session, id: 'com:dois-pontos' },
        { ...session, id: '' },
      ],
      solves: [
        { ...solve, id: 'fracao', updatedAt: 2_000.5, createdAt: 1_500.75 },
        { ...solve, id: 'negativa', updatedAt: -3, deletedAt: -3 },
        { ...solve, id: 'a:b' },
        { ...solve, id: '   ' },
        { ...solve, id: 'sessao-vazia', sessionId: '' },
        { ...solve, id: 'sessao-com-espaco', sessionId: 'com espaço' },
      ],
      practice: [
        { ...attempt, id: 'p-boa' },
        { ...attempt, id: 'p:ruim' },
      ],
    });

  it('id ou sessão que não servem ficam de fora e contam; datas quebradas viram inteiros seguros; a fila só tem o que o servidor aceita', async () => {
    const { db, repo } = await fresh('conta-1');
    const report = await repo.importAll(parseKlickJson(handEdited()));
    expect(report).toEqual({ sessionsAdded: 1, solvesAdded: 2, solvesUpdated: 0, skipped: 0, refused: 8 });
    expect(await db.get('sessions', 'boa')).toMatchObject({ updatedAt: 0, deletedAt: null });
    expect(await db.get('solves', 'fracao')).toMatchObject({ updatedAt: 2_000, createdAt: 1_500.75, deletedAt: null });
    expect(await db.get('solves', 'negativa')).toMatchObject({ updatedAt: 0, deletedAt: 0 });
    const queued = await pendingChanges(db);
    expect(queued.map((c) => `${c.store}/${c.id}`).sort()).toEqual(['practice/p-boa', 'sessions/boa', 'solves/fracao', 'solves/negativa']);
    expect(refusedBy(queued)).toEqual([]);
  });

  it('o resumo da importação diz quantos registros ficaram de fora', async () => {
    const { repo } = await fresh();
    const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R' }), now, storage: null, storageManager: null });
    await app.init();
    const summary = await app.importKlick(parseKlickJson(handEdited()));
    expect(summary).toMatchObject({ solves: 2, refused: 8 });
    expect(summaryLines(summary!)).toContain(T.importDialog.refused(8));
  });
});

describe('importar um perfil com valores da conta inválidos (spec 6.6)', () => {
  it('o valor inválido do arquivo fica de fora antes de juntar: o válido daqui continua e nada entra na fila', async () => {
    const { db, repo } = await fresh('conta-1');
    await repo.saveProfile({ algChoice: { 'oll2-h': 1 }, lessonAt: { 2: 3 }, settings: { inspection: false, dailyGoal: 30 } });
    await db.clear('outbox');
    const file: KlickExport = {
      format: 'klick',
      version: 1,
      exportedAt: t,
      sessions: [],
      solves: [],
      profile: {
        algChoice: { 'oll2-h': 99, 'caso-que-nao-existe': 0 }, // além dos algoritmos do caso; um caso que esta versão não conhece
        lessonAt: { 2: -1, 9: 1 } as never, // passo negativo; etapa que não existe
        trainOff: ['caso-que-nao-existe'],
        settings: { inspection: 'sim' as never, dailyGoal: 0 },
      },
    };
    await repo.importAll(file);
    const p = await repo.getProfile();
    expect(p).toMatchObject({ algChoice: { 'oll2-h': 1 }, lessonAt: { 2: 3 }, trainOff: [] });
    expect(p.settings).toMatchObject({ inspection: false, dailyGoal: 30 });
    expect(await db.getAllKeys('outbox')).toEqual([]);
  });
});

describe('restaurar com conta põe na fila tudo o que grava, e só o que o servidor aceita (decisão 9, spec 6.6)', () => {
  it('a fila fica com cada registro que a restauração gravou (os da cópia e as marcas de exclusão), e cada um passa no checkChange', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    const backup = await createBackup(repo, 'manual', t);
    t += 1000;
    await repo.addSolve(ns(s.id, 2000));
    await repo.createSession({ event: '222' });
    await repo.addPractice({ id: 'p2', caseId: 'oll2-sune', ms: 2500, ok: false, helped: false, at: t });
    await db.clear('outbox');
    t += 1000;
    await restoreBackup(repo, backup.id, t);
    const stamp = (await db.get('solves', a.id))!.updatedAt;
    const written: string[] = [];
    for (const store of ['sessions', 'solves', 'practice'] as const) {
      for (const r of await db.getAll(store)) if (r.updatedAt === stamp) written.push(`${store}/${r.id}`);
    }
    for (const item of await db.getAll('prefs')) if (item.updatedAt === stamp) written.push(`prefs/${item.key}`);
    expect(written).toHaveLength(6 + 14); // 2 sessões, 2 solves, 2 tentativas; as 14 chaves da conta (trilha, acabamento, tour, inspeção, meta, temporada)
    expect(((await db.getAllKeys('outbox')) as string[]).sort()).toEqual(written.sort());
    expect(refusedBy(await pendingChanges(db))).toEqual([]);
  });

  it('o que a cópia traz e o sync recusaria volta à tela sem entrar na fila; uma data de exclusão quebrada vira inteiro; uma chave desconhecida fica', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const unknown = { key: 'trainOff.caso-que-saiu', value: true, updatedAt: 1 }; // de uma versão com outro catálogo
    await db.put('prefs', unknown);
    const data = await repo.exportAll();
    await db.clear('outbox');
    t += 1000;
    await repo.replaceAll({
      ...data,
      solves: [...data.solves, { ...data.solves[0], id: 'apagado-com-fracao', deletedAt: 1_500.5 }, { ...data.solves[0], id: 'sem-sessao', sessionId: null as never }],
    });
    expect(await db.get('solves', 'apagado-com-fracao')).toMatchObject({ deletedAt: 1_500 });
    expect((await repo.listSolves()).map((x) => x.id).sort()).toEqual([a.id, 'sem-sessao'].sort());
    const queued = (await db.getAllKeys('outbox')) as string[];
    expect(queued).toEqual(expect.arrayContaining([`solves/${a.id}`, 'solves/apagado-com-fracao', `sessions/${s.id}`]));
    expect(queued).not.toContain('solves/sem-sessao');
    expect(queued).not.toContain(`prefs/${unknown.key}`);
    expect(await db.get('prefs', unknown.key)).toEqual(unknown);
    expect(refusedBy(await pendingChanges(db))).toEqual([]);
  });
});
