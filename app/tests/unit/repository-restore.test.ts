import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { merge } from '../../src/core/sync/merge';
import { prefToChange, toChange, type RecordStore } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import type { Change } from '../../src/core/sync/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { defaultSessionId } from '../../src/data/ids';
import { createRepository, type KlickExport, type Repository } from '../../src/data/repository';
import { createBackup, restoreBackup } from '../../src/data/safety';
import { csTimerToKlick, parseCsTimer, parseKlickJson, v1ToKlick, type V1Session } from '../../src/data/transfer';
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

  // Fix round 1: com updatedAt = agora, a "Sessão 1" de um aparelho novo trocaria, no sync, a default-333 que outro aparelho já renomeou.
  it('a sessão padrão nasce com as datas em 1: um renomear de verdade, em qualquer aparelho, vence a de um aparelho novo, e ela entra na fila', async () => {
    const devices: { db: IDBPDatabase<KlickDB>; repo: Repository }[] = [];
    for (let i = 0; i < 2; i++) {
      const device = await fresh('conta-1');
      await new AppState({ repo: device.repo, queue: createScrambleQueue({ generate: async () => 'R' }), now, storage: null, storageManager: null }).init();
      devices.push(device);
    }
    const [established, newcomer] = devices;
    t += 1000;
    await established.repo.renameSession(defaultSessionId('333'), 'Treino');
    const renamed = (await established.db.get('sessions', defaultSessionId('333')))!;
    const fresh333 = (await newcomer.db.get('sessions', defaultSessionId('333')))!;
    expect(fresh333).toMatchObject({ name: 'Sessão 1', order: 0, createdAt: 1, updatedAt: 1, deletedAt: null, deletionStamp: 1 });
    expect(await newcomer.db.getAllKeys('outbox')).toContain(`sessions/${defaultSessionId('333')}`);
    const a = toChange('sessions', renamed);
    const b = toChange('sessions', fresh333);
    for (const merged of [merge(a, b), merge(b, a)]) expect(merged).toMatchObject({ data: { name: 'Treino' }, updatedAt: renamed.updatedAt, deletedAt: null });
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

describe('importar do csTimer: as datas vêm do dado, como os ids (spec 5.5)', () => {
  // Dois solves de 3×3, como o csTimer grava: [[penalidade, ms], embaralhamento, nota, segundos].
  const csFile = JSON.stringify({
    session1: [[[0, 30_000], 'R U', '', 1_791_400_000], [[0, 31_000], 'F R', '', 1_791_400_060]],
    properties: { sessionData: JSON.stringify({ 1: { name: 'Main', opt: { scrType: '333' } } }) },
  });
  // O que AppState.importCsTimer faz: converte com o relógio de agora e importa o plano.
  const importCs = async (repo: Repository) => {
    const plan = csTimerToKlick(parseCsTimer(csFile), {}, { now: t, existingSessions: [], existingSolves: [] });
    await repo.importAll({ format: 'klick', version: 1, exportedAt: t, sessions: plan.sessions, solves: plan.solves, profile: null });
    return plan;
  };

  it('o mesmo arquivo em dois aparelhos, em horas diferentes, dá registros iguais; uma edição feita num deles vence a importação do outro', async () => {
    const phone = await fresh('conta-1');
    const desktop = await fresh('conta-1');
    const plan = await importCs(phone.repo);
    const [first, second] = plan.solves;
    t += 1000;
    await phone.repo.updateSolve(first.id, { penalty: 'DNF' });
    await phone.repo.deleteSolve(second.id);
    t += 3_600_000; // o desktop importa o mesmo arquivo uma hora depois da edição
    await importCs(desktop.repo);
    const sessionId = plan.sessions[0].id;
    expect(await desktop.db.get('sessions', sessionId)).toEqual(await phone.db.get('sessions', sessionId));
    for (const id of [first.id, second.id]) {
      const mine = toChange('solves', (await phone.db.get('solves', id))!);
      const theirs = toChange('solves', (await desktop.db.get('solves', id))!);
      expect(merge(mine, theirs)).toEqual(mine);
      expect(merge(theirs, mine)).toEqual(mine);
    }
    expect(await phone.db.get('solves', first.id)).toMatchObject({ penalty: 'DNF', deletedAt: null });
    expect((await phone.db.get('solves', second.id))!.deletedAt).not.toBeNull();
  });
});

// Fix round 2: recusar uma sessão (pela data, pelo tamanho) não pode deixar entrar os solves dela sem sessão nenhuma: o reviveSession não acha
// registro para devolver, e um solve ativo sem sessão subiria pelo sync.
describe('importar não deixa solve ativo sem sessão (solve ativo => sessão ativa)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const fileOf = (sessionUpdatedAt: number): KlickExport => ({
    format: 'klick',
    version: 1,
    exportedAt: t,
    profile: null,
    sessions: [{ id: 's', name: 'S', event: '333', order: 0, createdAt: 1_000, updatedAt: sessionUpdatedAt, deletedAt: null }],
    solves: [{ id: 'x', sessionId: 's', event: '333', ms: 9_000, penalty: null, at: 1_000, scramble: 'R', note: '', createdAt: 1_000, updatedAt: 1_000, deletedAt: null }],
  });
  // Os solves ativos sem a sessão gravada e ativa.
  const orphans = async (repo: Repository) => {
    const live = new Set((await repo.listSessions()).map((s) => s.id));
    return (await repo.listSolves()).filter((s) => !live.has(s.sessionId)).map((s) => s.id);
  };

  it('a sessão recusada (uma data três dias à frente) leva junto o solve dela: os dois contam, nada entra, a fila fica vazia', async () => {
    const { db, repo } = await fresh('conta-1');
    expect(await repo.importAll(fileOf(t + 3 * DAY))).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0, refused: 2 });
    expect(await repo.listSolves({ includeDeleted: true })).toEqual([]);
    expect(await db.getAllKeys('outbox')).toEqual([]);
  });

  it('com uma sessão daqui com o mesmo id, o solve entra nela, mesmo com a do arquivo recusada', async () => {
    const { repo } = await fresh('conta-1');
    await repo.importAll({ ...fileOf(1_000), solves: [] });
    expect(await repo.importAll(fileOf(t + 3 * DAY))).toEqual({ sessionsAdded: 0, solvesAdded: 1, solvesUpdated: 0, skipped: 0, refused: 1 });
    expect((await repo.listSolves()).map((s) => s.id)).toEqual(['x']);
    expect(await orphans(repo)).toEqual([]);
  });

  it('do csTimer, um primeiro tempo negativo não deixa solve sem sessão: a sessão e os dois solves entram, sem recusa', async () => {
    const { db, repo } = await fresh('conta-1');
    const file = JSON.stringify({
      session1: [[[0, 30_000], 'R U', '', -5], [[0, 31_000], 'F R', '', 1_791_400_060]],
      properties: { sessionData: JSON.stringify({ 1: { name: 'Main', opt: { scrType: '333' } } }) },
    });
    const plan = csTimerToKlick(parseCsTimer(file), {}, { now: t, existingSessions: [], existingSolves: [] });
    const report = await repo.importAll({ format: 'klick', version: 1, exportedAt: t, sessions: plan.sessions, solves: plan.solves, profile: null });
    expect(report).toEqual({ sessionsAdded: 1, solvesAdded: 2, solvesUpdated: 0, skipped: 0 });
    expect(await orphans(repo)).toEqual([]);
    expect(refusedBy(await pendingChanges(db))).toEqual([]);
  });

  it('da v1, um relógio adiantado e uma data antes de 1970 entram, com datas que o sync aceita', async () => {
    const { db, repo } = await fresh('conta-1');
    const ahead = new Date(t + 30 * DAY).toISOString();
    const solveOf = (id: string, createdAt: string) => ({ id, timeMs: 30_000, penalty: 'NONE' as const, scramble: 'R', createdAt });
    const v1: V1Session[] = [
      { id: 'v1-sessao', name: 'Antiga', puzzleType: '3x3', createdAt: ahead, solves: [solveOf('v1-futuro', ahead), solveOf('v1-antigo', '1969-07-20T20:17:00.000Z')] },
    ];
    const plan = v1ToKlick(v1, { now: t, existingSessions: [], existingSolves: [] });
    const report = await repo.importAll({ format: 'klick', version: 1, exportedAt: t, sessions: plan.sessions, solves: plan.solves, profile: null });
    expect(report).toEqual({ sessionsAdded: 1, solvesAdded: 2, solvesUpdated: 0, skipped: 0 });
    const queued = await pendingChanges(db);
    expect(queued).toHaveLength(3);
    expect(refusedBy(queued)).toEqual([]);
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
        { ...session, id: 'boa' },
        { ...session, id: 'negativa', updatedAt: -5 },
        { ...session, id: 'com espaço' },
        { ...session, id: 'com:dois-pontos' },
        { ...session, id: '' },
      ],
      solves: [
        { ...solve, id: 'ok' },
        { ...solve, id: 'fracao', updatedAt: 2_000.5 },
        { ...solve, id: 'criacao-fracao', createdAt: 1_500.75 },
        { ...solve, id: 'negativa', updatedAt: -3, deletedAt: -3 },
        { ...solve, id: 'apagado-fracao', deletedAt: 1_000.5 },
        { ...solve, id: 'a:b' },
        { ...solve, id: '   ' },
        { ...solve, id: 'sessao-vazia', sessionId: '' },
        { ...solve, id: 'sessao-com-espaco', sessionId: 'com espaço' },
      ],
      practice: [
        { ...attempt, id: 'p-boa' },
        { ...attempt, id: 'p:ruim' },
        { ...attempt, id: 'p-fracao', at: 1_000.5 },
        { ...attempt, id: 'p-negativa', at: -1 },
      ],
    });

  it('id, sessão ou data que não servem ficam de fora e contam (nada é ajustado); a fila só tem o que o servidor aceita', async () => {
    const { db, repo } = await fresh('conta-1');
    const report = await repo.importAll(parseKlickJson(handEdited()));
    expect(report).toEqual({ sessionsAdded: 1, solvesAdded: 1, solvesUpdated: 0, skipped: 0, refused: 15 });
    const queued = await pendingChanges(db);
    expect(queued.map((c) => `${c.store}/${c.id}`).sort()).toEqual(['practice/p-boa', 'sessions/boa', 'solves/ok']);
    expect(refusedBy(queued)).toEqual([]);
  });

  it('o resumo da importação diz quantos registros ficaram de fora', async () => {
    const { repo } = await fresh();
    const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R' }), now, storage: null, storageManager: null });
    await app.init();
    const summary = await app.importKlick(parseKlickJson(handEdited()));
    expect(summary).toMatchObject({ solves: 1, refused: 15 });
    expect(summaryLines(summary!)).toContain(T.importDialog.refused(15));
  });

  // Uma data no futuro subiria, pelo sync, o relógio de todos os aparelhos até ela (spec 5.4); em 2^53 - 1 ele travaria, e toda gravação
  // seguinte seria recusada. Uma do ano 3000 adiantaria todos em mil anos.
  const inTheFuture = (date: number): string =>
    JSON.stringify({
      format: 'klick',
      version: 1,
      exportedAt: 1_000,
      profile: null,
      sessions: [
        { ...session, id: 'editada-no-futuro', updatedAt: date },
        { ...session, id: 'criada-no-futuro', createdAt: date, updatedAt: date },
      ],
      solves: [
        { ...solve, id: 'editado-no-futuro', updatedAt: date },
        { ...solve, id: 'criado-no-futuro', createdAt: date },
        { ...solve, id: 'apagado-no-futuro', deletedAt: date },
      ],
      practice: [{ ...attempt, id: 'treino-no-futuro', at: date }],
    });

  it.each([
    ['no ano 3000', Date.UTC(3000, 0, 1)],
    ['em 1e300', 1e300],
  ])('uma data %s: os registros ficam de fora, contados; nada entra na fila e o relógio não sai do lugar', async (_label, date) => {
    const { db, repo } = await fresh('conta-1');
    const clock = (await repo.getSyncState()).clock;
    const report = await repo.importAll(parseKlickJson(inTheFuture(date)));
    expect(report).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0, refused: 6 });
    expect(await db.getAllKeys('outbox')).toEqual([]);
    expect((await db.count('sessions')) + (await db.count('solves')) + (await db.count('practice'))).toBe(0);
    expect((await repo.getSyncState()).clock).toBe(clock);
  });

  it('até um dia à frente do relógio do aparelho a data entra (um relógio um pouco adiantado); um milissegundo além, não', async () => {
    const { repo } = await fresh('conta-1');
    const DAY = 24 * 60 * 60 * 1000;
    const file = (id: string, updatedAt: number): KlickExport => ({
      format: 'klick',
      version: 1,
      exportedAt: t,
      profile: null,
      sessions: [{ ...session, event: '333', id, updatedAt }],
      solves: [],
    });
    expect(await repo.importAll(file('no-limite', t + DAY))).toMatchObject({ sessionsAdded: 1 });
    expect(await repo.importAll(file('alem-do-limite', t + DAY + 1))).toMatchObject({ sessionsAdded: 0, refused: 1 });
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
    expect(written).toHaveLength(6 + 15); // 2 sessões, 2 solves, 2 tentativas; as 15 chaves da conta (trilha, acabamento, tour, inspeção, meta, temporada, nome dos desafios)
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
      solves: [
        ...data.solves,
        { ...data.solves[0], id: 'apagado-com-fracao', deletedAt: 1_500.5 },
        // Uma marca de exclusão depois da própria restauração não faz sentido, e no futuro ela travaria o relógio (como no import).
        { ...data.solves[0], id: 'apagado-no-ano-3000', deletedAt: Date.UTC(3000, 0, 1) },
        { ...data.solves[0], id: 'apagado-em-1e300', deletedAt: 1e300 },
        { ...data.solves[0], id: 'sem-sessao', sessionId: null as never },
      ],
    });
    const stamp = (await db.get('solves', a.id))!.updatedAt;
    expect(await db.get('solves', 'apagado-com-fracao')).toMatchObject({ deletedAt: 1_500 });
    expect(await db.get('solves', 'apagado-no-ano-3000')).toMatchObject({ deletedAt: stamp });
    expect(await db.get('solves', 'apagado-em-1e300')).toMatchObject({ deletedAt: stamp });
    expect((await repo.listSolves()).map((x) => x.id).sort()).toEqual([a.id, 'sem-sessao'].sort());
    const queued = (await db.getAllKeys('outbox')) as string[];
    expect(queued).toEqual(
      expect.arrayContaining([`solves/${a.id}`, 'solves/apagado-com-fracao', 'solves/apagado-no-ano-3000', 'solves/apagado-em-1e300', `sessions/${s.id}`]),
    );
    expect(queued).not.toContain('solves/sem-sessao');
    expect(queued).not.toContain(`prefs/${unknown.key}`);
    expect(await db.get('prefs', unknown.key)).toEqual(unknown);
    expect(refusedBy(await pendingChanges(db))).toEqual([]);
  });
});

// Uma cópia de antes do nome dos desafios não o traz: restaurar não pode gravar '' por cima do nome do aparelho (e subir para a conta).
describe('restaurar uma cópia de antes do nome dos desafios', () => {
  const copy = (profile: KlickExport['profile']): KlickExport => ({ format: 'klick', version: 1, exportedAt: t, sessions: [], solves: [], profile });

  it('a cópia sem o nome deixa o nome daqui, e nenhum item "" é gravado', async () => {
    const { db, repo } = await fresh('conta-1');
    await repo.saveProfile({ duelName: 'Ana' });
    await db.clear('outbox');
    t += 1000;
    await repo.replaceAll(copy({ finish: 'fosco', onboarded: true, trail: Array<boolean>(9).fill(false) }));
    expect((await repo.getProfile()).duelName).toBe('Ana');
    expect(await db.get('prefs', 'duelName')).toMatchObject({ value: 'Ana' });
    expect(await db.getAll('prefs')).not.toContainEqual(expect.objectContaining({ key: 'duelName', value: '' }));
  });

  it('a cópia que traz o nome vale, mesmo vazio', async () => {
    const { repo } = await fresh('conta-1');
    await repo.saveProfile({ duelName: 'Ana' });
    t += 1000;
    await repo.replaceAll(copy({ duelName: 'Bia' }));
    expect((await repo.getProfile()).duelName).toBe('Bia');
    t += 1000;
    await repo.replaceAll(copy({ duelName: '' }));
    expect((await repo.getProfile()).duelName).toBe('');
  });
});
