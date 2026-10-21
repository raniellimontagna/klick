import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import type { Goal } from '../../src/core/goals';
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

  it('com conta, só o que mudou ganha data nova e entra na fila: o que sobrou vira exclusão, as chaves da conta que diferem voltam, o resto fica', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const kept = await repo.addSolve(ns(s.id, 1000));
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false] });
    const backup = await createBackup(repo, 'manual', t);
    const keptBefore = (await db.get('solves', kept.id))!;
    t += 1000;
    const extra = await repo.addSolve(ns(s.id, 2000));
    await repo.saveProfile({ trail: [true, true, false, false, false, false, false, false, false], lessonAt: { 3: 2 } });
    await db.clear('outbox');
    t += 60_000;
    await restoreBackup(repo, backup.id, t);
    // O solve e a sessão que a cópia tem e a conta já tem iguais não são regravados nem entram na fila.
    expect(await db.get('solves', kept.id)).toEqual(keptBefore);
    const extraAfter = (await db.get('solves', extra.id))!;
    expect(extraAfter.updatedAt).toBeGreaterThanOrEqual(t);
    expect(extraAfter.deletedAt).toBe(extraAfter.updatedAt);
    expect(extraAfter.deletionStamp).toBe(extraAfter.updatedAt);
    const queued = (await db.getAllKeys('outbox')) as string[];
    expect(queued.sort()).toEqual([`solves/${extra.id}`, 'prefs/lessonAt.3', 'prefs/trail.1'].sort());
    expect(await db.get('prefs', 'trail.1')).toMatchObject({ value: false, updatedAt: extraAfter.updatedAt });
    expect(await db.get('prefs', 'lessonAt.3')).toMatchObject({ value: null, updatedAt: extraAfter.updatedAt });
    expect((await repo.getProfile()).trail.slice(0, 2)).toEqual([true, false]);
  });

  it('um registro que a cópia tem diferente do daqui volta com data nova e entra na fila', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const kept = await repo.addSolve(ns(s.id, 1000));
    const other = await repo.addSolve(ns(s.id, 3000));
    const backup = await createBackup(repo, 'manual', t);
    t += 1000;
    await repo.updateSolve(kept.id, { note: 'depois da cópia' });
    await db.clear('outbox');
    t += 60_000;
    await restoreBackup(repo, backup.id, t);
    const restored = (await db.get('solves', kept.id))!;
    expect(restored).toMatchObject({ note: '', deletedAt: null });
    expect(restored.updatedAt).toBeGreaterThanOrEqual(t);
    expect(restored.deletionStamp).toBe(restored.updatedAt);
    expect((await db.get('solves', other.id))!.updatedAt).toBeLessThan(t);
    expect((await db.getAllKeys('outbox')) as string[]).toEqual([`solves/${kept.id}`]);
  });

  it('restaurar uma cópia igual à conta não grava nem enfileira nada', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false] });
    const backup = await createBackup(repo, 'manual', t);
    await db.clear('outbox');
    const snapshot = async () => ({
      sessions: await db.getAll('sessions'),
      solves: await db.getAll('solves'),
      practice: await db.getAll('practice'),
      prefs: await db.getAll('prefs'),
    });
    const before = await snapshot();
    t += 60_000;
    await restoreBackup(repo, backup.id, t);
    expect(await snapshot()).toEqual(before);
    expect(await db.getAllKeys('outbox')).toEqual([]);
  });

  // O acabamento (A2): perto da cota, o servidor recusaria o que volta da lixeira (ou chega) antes de as exclusões abrirem as vagas. Na
  // fila, as exclusões da restauração vão antes de tudo; dentro de cada grupo, a ordem de sempre (a chave).
  it('na fila, as exclusões da restauração vão antes do que volta ou chega; dentro de cada grupo, a ordem de sempre', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const gone = await repo.createSession({ event: '333', name: 'Na lixeira' });
    for (const id of ['z1', 'z2']) await repo.addSolve({ id, ...ns(s.id, 1000) });
    const here = await repo.exportAll();
    await repo.deleteSession(gone.id);
    // A cópia: a sessão que está na lixeira volta, e os dois solves daqui saem para dar lugar a dois que só ela tem.
    const copy: KlickExport = { ...here, solves: here.solves.map((x, i) => ({ ...x, id: `a${i + 1}` })) };
    await db.clear('outbox');
    t += 60_000;
    await repo.replaceAll(copy);
    const { sent } = await repo.outboxBatch(10);
    expect(sent.map((e) => `${e.store}/${e.id}`)).toEqual(['solves/z1', 'solves/z2', `sessions/${gone.id}`, 'solves/a1', 'solves/a2']);
    // Só a ordem da fila muda: os registros têm a data da restauração, todos a mesma.
    const stamps = await Promise.all(['z1', 'z2', 'a1', 'a2'].map(async (id) => (await db.get('solves', id))!.updatedAt));
    expect(new Set([...stamps, (await db.get('sessions', gone.id))!.updatedAt]).size).toBe(1);
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
  it('a fila fica com cada registro que a restauração gravou (o que mudou e as marcas de exclusão), e cada um passa no checkChange', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    const backup = await createBackup(repo, 'manual', t);
    t += 1000;
    const extra = await repo.addSolve(ns(s.id, 2000));
    const other = await repo.createSession({ event: '222' });
    await repo.addPractice({ id: 'p2', caseId: 'oll2-sune', ms: 2500, ok: false, helped: false, at: t });
    await repo.updateSolve(a.id, { note: 'depois da cópia' });
    await repo.saveProfile({ trail: [false, true, false, false, false, false, false, false, false] });
    await db.clear('outbox');
    t += 1000;
    await restoreBackup(repo, backup.id, t);
    const stamp = (await db.get('solves', a.id))!.updatedAt;
    const written: string[] = [];
    for (const store of ['sessions', 'solves', 'practice'] as const) {
      for (const r of await db.getAll(store)) if (r.updatedAt === stamp) written.push(`${store}/${r.id}`);
    }
    for (const item of await db.getAll('prefs')) if (item.updatedAt === stamp) written.push(`prefs/${item.key}`);
    // O solve editado volta (copy); o solve, a sessão e a tentativa de depois ganham a marca de exclusão; a chave da trilha que difere volta.
    expect(written.sort()).toEqual(
      [`solves/${a.id}`, `solves/${extra.id}`, `sessions/${other.id}`, 'practice/p2', 'prefs/trail.1'].sort(),
    );
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
    const stamp = (await db.get('solves', 'apagado-com-fracao'))!.updatedAt;
    expect(stamp).toBeGreaterThanOrEqual(t);
    expect((await db.get('solves', a.id))!.updatedAt).toBeLessThan(t); // o solve e a sessão que a cópia tem iguais não são regravados
    expect(await db.get('solves', 'apagado-com-fracao')).toMatchObject({ deletedAt: 1_500 });
    expect(await db.get('solves', 'apagado-no-ano-3000')).toMatchObject({ deletedAt: stamp });
    expect(await db.get('solves', 'apagado-em-1e300')).toMatchObject({ deletedAt: stamp });
    expect((await repo.listSolves()).map((x) => x.id).sort()).toEqual([a.id, 'sem-sessao'].sort());
    const queued = (await db.getAllKeys('outbox')) as string[];
    expect(queued).toEqual(expect.arrayContaining(['solves/apagado-com-fracao', 'solves/apagado-no-ano-3000', 'solves/apagado-em-1e300']));
    expect(queued).not.toContain(`solves/${a.id}`);
    expect(queued).not.toContain(`sessions/${s.id}`);
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

// As metas (estatísticas, spec 5), do mesmo jeito: uma cópia de antes delas (o perfil sem `goals`) não as apaga; a que traz `goals`, mesmo
// vazio, vale, e apagar é gravar o padrão (null) na chave da meta.
describe('restaurar uma cópia de antes das metas', () => {
  const copy = (profile: KlickExport['profile']): KlickExport => ({ format: 'klick', version: 1, exportedAt: t, sessions: [], solves: [], profile });
  const single: Goal = { kind: 'single', event: '333', targetMs: 11_000, startMs: 12_400, createdAt: 1_791_000_000_000, reachedAt: null };
  const ao5: Goal = { kind: 'ao5', event: '222', targetMs: 4_000, startMs: null, createdAt: 1_791_000_000_100, reachedAt: 1_791_000_000_200 };

  it('restaurar cópia sem goals mantém as metas; com goals {} apaga', async () => {
    const { db, repo } = await fresh('conta-1');
    await repo.saveProfile({ goals: { a1: single } });
    const saved = await db.get('prefs', 'goal.a1');
    await db.clear('outbox');
    t += 1000;
    await repo.replaceAll(copy({ finish: 'fosco', onboarded: true, trail: Array<boolean>(9).fill(false) }));
    expect((await repo.getProfile()).goals).toEqual({ a1: single });
    expect(await db.get('prefs', 'goal.a1')).toEqual(saved); // nem regravada, nem na fila
    expect(await db.getAllKeys('outbox')).not.toContain('prefs/goal.a1');

    // A cópia que traz metas vale: a de agora que ela não tem volta ao padrão, e a dela entra.
    t += 1000;
    await repo.replaceAll(copy({ goals: { b2: ao5 } }));
    expect((await repo.getProfile()).goals).toEqual({ b2: ao5 });
    expect(await db.get('prefs', 'goal.a1')).toMatchObject({ value: null });

    t += 1000;
    await repo.replaceAll(copy({ goals: {} }));
    expect((await repo.getProfile()).goals).toEqual({});
    expect(await db.get('prefs', 'goal.b2')).toMatchObject({ value: null });
    expect(await db.getAllKeys('outbox')).toEqual(expect.arrayContaining(['prefs/goal.a1', 'prefs/goal.b2']));
  });
});

// O acabamento (A1): a restauração pelo aparelho é "a última restauração vence". Dentro da transação dela, o aparelho tira uma data do
// relógio (o piso), acima de tudo o que ele já viu, e as datas da restauração ficam acima dele; o piso fica guardado (pendingFloor) com ela:
// o sync o manda, e o servidor faz perder o que vem de antes dela. O que espera na fila daqui (ou só neste aparelho, pela cota) e a
// restauração deixa como está também é dela: ganha a data dela, senão perderia para o piso do próprio aparelho quando subisse.
describe('o piso da restauração pelo aparelho', () => {
  it('o piso fica acima de tudo o que o aparelho já viu, e cada data da restauração (e de depois dela) fica acima do piso', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve({ id: 'x', ...ns(s.id, 1000) });
    const copy: KlickExport = { ...(await repo.exportAll()), solves: [] }; // o x vai para a lixeira
    const seen = (await repo.getSyncState()).clock; // o relógio de agora (t) não passa: as datas vêm do relógio do sync
    await repo.replaceAll(copy, { floor: true });
    const floor = (await repo.getSyncState()).pendingFloor!;
    expect(floor).toBeGreaterThan(seen);
    expect((await db.get('solves', 'x'))!.updatedAt).toBeGreaterThan(floor);
    const after = await repo.addSolve(ns(s.id, 2000));
    expect((await db.get('solves', after.id))!.updatedAt).toBeGreaterThan(floor);
  });

  it('com o piso, a restauração o guarda, os passos dela ficam acima dele, e o que esperava aqui e ela deixa como está ganha a data dela', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    for (const id of ['p', 'q', 'h', 'd', 'x']) await repo.addSolve({ id, ...ns(s.id, 1000) });
    await db.clear('outbox');
    await repo.updateSolve('p', { note: 'na fila' }); // espera na fila
    await repo.deleteSolve('d'); // a exclusão espera na fila
    await db.put('meta', ['solves/h'], 'held'); // a conta o recusou pela cota: só neste aparelho
    const here = await repo.exportAll();
    // A cópia é o estado daqui, sem o x e com um n que só ela tem: o p, o d e o h ela deixa como estão.
    const copy: KlickExport = { ...here, solves: [...here.solves.filter((x) => x.id !== 'x'), { ...here.solves.find((x) => x.id === 'q')!, id: 'n' }] };
    const before = (id: string) => db.get('solves', id);
    const q = (await before('q'))!;
    const dGone = (await before('d'))!.deletedAt;
    t += 60_000;
    await repo.replaceAll(copy, { floor: true });
    const floor = (await repo.getSyncState()).pendingFloor!;
    expect(floor).toBeGreaterThanOrEqual(t);
    const at = (await before('n'))!.updatedAt;
    expect(at).toBeGreaterThan(floor);
    expect(await before('x')).toMatchObject({ updatedAt: at, deletedAt: at, deletionStamp: at });
    expect(await before('p')).toMatchObject({ note: 'na fila', updatedAt: at, deletionStamp: at, deletedAt: null });
    expect(await before('d')).toMatchObject({ updatedAt: at, deletionStamp: at, deletedAt: dGone });
    expect(await before('h')).toMatchObject({ updatedAt: at, deletionStamp: at, deletedAt: null });
    expect(await before('q')).toEqual(q); // nem na fila nem guardado: fica como estava
    // Na fila, as exclusões na frente (A2); o h continua só neste aparelho, fora dela.
    const { sent } = await repo.outboxBatch(10);
    expect(sent.map((e) => `${e.store}/${e.id}`)).toEqual(['solves/d', 'solves/x', 'solves/n', 'solves/p']);
    expect(await db.get('meta', 'held')).toEqual(['solves/h']);
  });

  it('sem o piso (a cópia deste aparelho), nada é guardado e o que espera na fila fica com a data dele', async () => {
    const { db, repo } = await fresh('conta-1');
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve({ id: 'p', ...ns(s.id, 1000) });
    const here = await repo.exportAll();
    const p = (await db.get('solves', 'p'))!;
    t += 60_000;
    await repo.replaceAll(here);
    expect((await repo.getSyncState()).pendingFloor).toBeNull();
    expect(await db.get('solves', 'p')).toEqual(p);
  });

  it('o piso sai do estado quando o servidor confirma o que foi mandado; um mais novo, gravado no meio, fica', async () => {
    const { repo } = await fresh('conta-1');
    await repo.saveSyncState({ pendingFloor: t - 10 });
    await repo.applyRemote([], t, 'conta-1', { cursor: 1, lastSyncAt: t }); // sem a confirmação
    expect((await repo.getSyncState()).pendingFloor).toBe(t - 10);
    await repo.applyRemote([], t, 'conta-1', { cursor: 2, lastSyncAt: t, floorSent: t - 10 });
    expect((await repo.getSyncState()).pendingFloor).toBeNull();
    await repo.saveSyncState({ pendingFloor: t - 5 }); // outra restauração enquanto o pedido do piso de antes estava na rede
    await repo.applyRemote([], t, 'conta-1', { cursor: 3, lastSyncAt: t, floorSent: t - 10 });
    expect((await repo.getSyncState()).pendingFloor).toBe(t - 5);
  });

  it('o primeiro login noutra conta tira o piso da conta de antes; a mesma conta o guarda', async () => {
    const { repo } = await fresh('conta-1');
    await repo.saveSyncState({ pendingFloor: t });
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    expect((await repo.getSyncState()).pendingFloor).toBe(t);
    await repo.beginFirstSync({ accountId: 'conta-2', email: 'a@b.c' });
    expect((await repo.getSyncState()).pendingFloor).toBeNull();
  });
});
