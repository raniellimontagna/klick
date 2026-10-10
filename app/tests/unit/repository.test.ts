import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, type ChannelLike, type KlickExport, type Repository } from '../../src/data/repository';

let dbn = 0;
let t = 1_791_500_000_000;
const now = () => t;

function bus() {
  const members: ChannelLike[] = [];
  const make = (): ChannelLike => {
    const ch: ChannelLike = {
      onmessage: null,
      postMessage(data) {
        for (const m of members) if (m !== ch) m.onmessage?.({ data });
      },
    };
    members.push(ch);
    return ch;
  };
  return { make };
}

async function fresh(channel: ChannelLike | null = null): Promise<Repository> {
  const db = await openKlickDb(`klick-test-${++dbn}`);
  return createRepository(db, { now, channel });
}

const ns = (sessionId: string, ms: number, at: number) => ({ sessionId, event: '333' as const, ms, penalty: null, at, scramble: "R U R'" });

describe('repositório', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = await fresh();
  });

  it('cria sessões com nome padrão numerado por evento', async () => {
    const a = await repo.createSession({ event: '333' });
    const b = await repo.createSession({ event: '333' });
    const c = await repo.createSession({ event: '222' });
    expect([a.name, b.name, c.name]).toEqual(['Sessão 1', 'Sessão 2', 'Sessão 1']);
    expect((await repo.listSessions()).map((s) => s.id)).toEqual([a.id, b.id, c.id]);
  });

  it('renomear ignora nome vazio', async () => {
    const s = await repo.createSession({ event: '333', name: 'Treino' });
    await repo.renameSession(s.id, '   ');
    expect((await repo.listSessions())[0].name).toBe('Treino');
    await repo.renameSession(s.id, ' Cruz ');
    expect((await repo.listSessions())[0].name).toBe('Cruz');
  });

  it('grava e lista solves por sessão e por evento, em ordem de data', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 60000, 3000));
    await repo.addSolve(ns(s.id, 58000, 1000));
    const list = await repo.listSolves({ sessionId: s.id });
    expect(list.map((x) => x.ms)).toEqual([58000, 60000]);
    expect(list[0]).toMatchObject({ note: '', penalty: null, deletedAt: null, createdAt: t, updatedAt: t });
    expect((await repo.listSolves({ event: '333' })).length).toBe(2);
    expect((await repo.listSolves({ event: '222' })).length).toBe(0);
  });

  it('atualiza penalidade e nota, mexendo em updatedAt', async () => {
    const s = await repo.createSession({ event: '333' });
    const solve = await repo.addSolve(ns(s.id, 60000, 1000));
    t += 5000;
    const up = await repo.updateSolve(solve.id, { penalty: '+2', note: 'cruz' });
    expect(up).toMatchObject({ penalty: '+2', note: 'cruz', updatedAt: t });
  });

  it('excluir vai para a lixeira, restaurar volta, e purgeTrash apaga depois do prazo', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    const b = await repo.addSolve(ns(s.id, 61000, 2000));
    await repo.deleteSolve(a.id);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([b.id]);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([a.id]);
    await repo.restoreSolve(a.id);
    expect((await repo.listSolves({ sessionId: s.id })).length).toBe(2);
    await repo.deleteSolve(a.id);
    t += 31 * 86_400_000;
    expect(await repo.purgeTrash(30 * 86_400_000)).toBe(1);
    expect((await repo.listSolves({ includeDeleted: true })).map((x) => x.id)).toEqual([b.id]);
  });

  it('excluir a sessão leva os solves dela; restaurar devolve os dois', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 60000, 1000));
    t += 1000;
    await repo.deleteSession(s.id);
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.listSolves({ sessionId: s.id })).toEqual([]);
    await repo.restoreSession(s.id);
    expect((await repo.listSessions()).length).toBe(1);
    expect((await repo.listSolves({ sessionId: s.id })).length).toBe(1);
  });

  it('perfil e meta têm padrão e fazem merge', async () => {
    const p = await repo.getProfile();
    expect(p).toMatchObject({ finish: 'fosco', onboarded: false, currentSessionId: null });
    expect(p.trail).toEqual([false, false, false, false, false, false, false, false, false]);
    const up = await repo.saveProfile({ settings: { ...p.settings, holdMs: 550 } });
    expect(up.settings.holdMs).toBe(550);
    expect(up.settings.inspection).toBe(true);
    const m = await repo.getMeta();
    expect(m).toMatchObject({ schemaVersion: 1, solvesSinceBackup: 0, solvesSinceExport: 0, v1ImportOffered: false });
    expect(m.deviceId).toMatch(/^[0-9a-z]{17}$/);
    expect((await repo.saveMeta({ solvesSinceExport: 3 })).solvesSinceExport).toBe(3);
    expect((await repo.getMeta()).deviceId).toBe(m.deviceId);
  });

  it('exporta, importa juntando sem duplicar e substitui tudo', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 60000, 1000));
    const data = await repo.exportAll();
    expect(data).toMatchObject({ format: 'klick', version: 1, exportedAt: t });
    const other = await fresh();
    expect(await other.importAll(data)).toEqual({ sessionsAdded: 1, solvesAdded: 1, solvesUpdated: 0, skipped: 0 });
    expect(await other.importAll(data)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 1 });
    const edited = structuredClone(data);
    edited.solves[0].note = 'mais novo';
    edited.solves[0].updatedAt += 10;
    expect((await other.importAll(edited)).solvesUpdated).toBe(1);
    await other.replaceAll({ ...data, solves: [], sessions: [] });
    expect(await other.listSolves({ includeDeleted: true })).toEqual([]);
  });

  it('guarda e lista cópias, mais recente primeiro', async () => {
    const r = { id: 'b1', createdAt: 1, reason: 'manual' as const, solveCount: 0, encoding: 'json' as const, payload: '{}' };
    await repo.saveBackup(r);
    await repo.saveBackup({ ...r, id: 'b2', createdAt: 2 });
    expect((await repo.listBackups()).map((b) => b.id)).toEqual(['b2', 'b1']);
    await repo.deleteBackup('b1');
    expect((await repo.getBackup('b1'))).toBeUndefined();
  });

  it('avisa a outra aba quando um solve é gravado', async () => {
    const b = bus();
    const name = `klick-test-${++dbn}`;
    const tabA = createRepository(await openKlickDb(name), { now, channel: b.make() });
    const tabB = createRepository(await openKlickDb(name), { now, channel: b.make() });
    const seen: string[] = [];
    tabB.onChange((k) => seen.push(k));
    const s = await tabA.createSession({ event: '333' });
    await tabA.addSolve(ns(s.id, 60000, 1000));
    expect(seen).toEqual(['sessions', 'solves']);
    expect((await tabB.listSolves({ sessionId: s.id })).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Daqui para baixo: o que o repositório garante além dos testes do plano.

const dbName = () => `klick-test-${++dbn}`;

// Envolve o banco para ver como o repositório abre as transações: guarda modo e durability, conta as gravações confirmadas
// e, com abortWrites, aborta cada gravação logo depois de aberta (o efeito de uma cota estourada no meio dela).
function spyOn(real: IDBPDatabase<KlickDB>) {
  const spy = {
    abortWrites: false,
    commits: 0,
    opened: [] as { mode?: string; durability?: string }[],
    db: undefined as unknown as IDBPDatabase<KlickDB>,
  };
  spy.db = new Proxy(real, {
    get(target, prop) {
      if (prop === 'transaction') {
        return (names: unknown, mode?: string, options?: { durability?: string }) => {
          const open = target.transaction.bind(target) as unknown as (...a: unknown[]) => { done: Promise<void>; abort(): void };
          const tx = open(names, mode, options);
          spy.opened.push({ mode, durability: options?.durability });
          if (mode === 'readwrite') {
            if (spy.abortWrites) {
              queueMicrotask(() => {
                try {
                  tx.abort();
                } catch {
                  // já terminou
                }
              });
            } else {
              void tx.done.then(
                () => {
                  spy.commits++;
                },
                () => {},
              );
            }
          }
          return tx;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return spy;
}

// Canal que só guarda o que o repositório posta.
function recordingChannel() {
  const posted: unknown[] = [];
  const channel: ChannelLike = {
    onmessage: null,
    postMessage(data) {
      posted.push(data);
    },
  };
  return { channel, posted };
}

// O relançar-depois do repositório usa queueMicrotask. Aqui o erro que ele lançaria é guardado, em vez de derrubar a rodada
// do Vitest. Quem usa precisa de vi.unstubAllGlobals() no afterEach.
function captureRethrown(): unknown[] {
  const surfaced: unknown[] = [];
  const realQueue = globalThis.queueMicrotask.bind(globalThis);
  vi.stubGlobal('queueMicrotask', (fn: () => void) =>
    realQueue(() => {
      try {
        fn();
      } catch (err) {
        surfaced.push(err);
      }
    }),
  );
  return surfaced;
}

describe('repositório: falha de gravação', () => {
  it('banco fechado: a gravação rejeita, e ninguém é avisado', async () => {
    const { channel, posted } = recordingChannel();
    const db = await openKlickDb(dbName());
    const repo = createRepository(db, { now, channel });
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));
    db.close();
    await expect(repo.addSolve(ns('s', 60000, 1000))).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(repo.createSession({ event: '333' })).rejects.toMatchObject({ name: 'InvalidStateError' });
    await expect(repo.saveProfile({ finish: 'gelo' })).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(seen).toEqual([]);
    expect(posted).toEqual([]);
  });

  it('transação abortada no meio: rejeita, não grava nada e não avisa; depois que o banco volta, grava', async () => {
    const name = dbName();
    const { channel, posted } = recordingChannel();
    const spy = spyOn(await openKlickDb(name));
    const repo = createRepository(spy.db, { now, channel });
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));

    spy.abortWrites = true;
    await expect(repo.createSession({ event: '333' })).rejects.toMatchObject({ name: 'AbortError' });
    await expect(repo.addSolve(ns('s', 60000, 1000))).rejects.toMatchObject({ name: 'AbortError' });
    await expect(repo.saveMeta({ solvesSinceBackup: 5 })).rejects.toMatchObject({ name: 'AbortError' });
    const other = createRepository(await openKlickDb(name), { now, channel: null });
    expect(await other.listSessions({ includeDeleted: true })).toEqual([]);
    expect(await other.listSolves({ includeDeleted: true })).toEqual([]);
    expect((await other.getMeta()).solvesSinceBackup).toBe(0);
    expect(seen).toEqual([]);
    expect(posted).toEqual([]);

    // O mesmo pedido, de novo, com o banco de volta: grava e avisa uma vez.
    spy.abortWrites = false;
    const solve = await repo.addSolve(ns('s', 60000, 1000));
    expect((await other.listSolves({ includeDeleted: true })).map((x) => x.id)).toEqual([solve.id]);
    expect(seen).toEqual(['solves']);
    expect(posted).toEqual([{ kind: 'solves' }]);
  });

  it('erro no meio de uma gravação em várias partes desfaz tudo: substituir tudo com um registro inválido deixa os dados como estavam', async () => {
    const seen: string[] = [];
    const repo = await fresh();
    repo.onChange((k) => seen.push(k));
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    const good = { ...a, id: 'zzy', ms: 1 };
    const bad = { ...a, id: 'zzz', scramble: (() => 1) as unknown as string }; // uma função não passa pelo clone estruturado
    const file: KlickExport = { format: 'klick', version: 1, exportedAt: t, sessions: [], solves: [good, bad], profile: null };
    seen.length = 0;
    await expect(repo.replaceAll(file)).rejects.toMatchObject({ name: 'DataCloneError' });
    expect((await repo.listSolves({ includeDeleted: true })).map((x) => x.id)).toEqual([a.id]);
    expect((await repo.listSessions()).map((x) => x.id)).toEqual([s.id]);
    expect(seen).toEqual([]);
  });

  it('id que não existe rejeita e não avisa', async () => {
    const seen: string[] = [];
    const repo = await fresh();
    repo.onChange((k) => seen.push(k));
    await expect(repo.updateSolve('nada', { note: 'x' })).rejects.toThrow('nada');
    await expect(repo.deleteSolve('nada')).rejects.toThrow('nada');
    await expect(repo.restoreSolve('nada')).rejects.toThrow('nada');
    await expect(repo.renameSession('nada', 'x')).rejects.toThrow('nada');
    await expect(repo.deleteSession('nada')).rejects.toThrow('nada');
    await expect(repo.restoreSession('nada')).rejects.toThrow('nada');
    expect(seen).toEqual([]);
  });
});

describe('repositório: avisos', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = await fresh();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('toda gravação usa durability strict, e o aviso sai só depois do commit', async () => {
    const spy = spyOn(await openKlickDb(dbName()));
    const spied = createRepository(spy.db, { now, channel: null });
    const commitsAtNotice: number[] = [];
    spied.onChange(() => commitsAtNotice.push(spy.commits));
    const s = await spied.createSession({ event: '333' });
    await spied.addSolve(ns(s.id, 60000, 1000));
    expect(commitsAtNotice).toEqual([1, 2]); // quando o aviso saiu, a transação daquela gravação já tinha confirmado

    // Um de cada método que grava (17 no total, cada um com uma transação só), para a conta pegar qualquer um que fuja do padrão.
    const solve = (await spied.listSolves())[0];
    await spied.renameSession(s.id, 'Outro nome');
    await spied.updateSolve(solve.id, { note: 'x' });
    await spied.deleteSolve(solve.id);
    await spied.restoreSolve(solve.id);
    await spied.deleteSession(s.id);
    await spied.restoreSession(s.id);
    await spied.purgeTrash(1);
    await spied.saveProfile({ finish: 'gelo' });
    await spied.getMeta();
    await spied.saveMeta({ solvesSinceBackup: 1 });
    await spied.saveFolderHandle({ name: 'pasta' });
    await spied.saveBackup({ id: 'b', createdAt: 1, reason: 'manual', solveCount: 0, encoding: 'json', payload: '{}' });
    await spied.deleteBackup('b');
    const data = await spied.exportAll();
    await spied.importAll(data);
    await spied.replaceAll(data);
    const writes = spy.opened.filter((o) => o.mode === 'readwrite');
    expect(writes).toHaveLength(17);
    expect(writes.every((o) => o.durability === 'strict')).toBe(true);
  });

  it('cada gravação avisa o seu tipo, e o que não muda nada não avisa', async () => {
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));
    const took = () => seen.splice(0);

    const s = await repo.createSession({ event: '333' });
    expect(took()).toEqual(['sessions']);
    await repo.renameSession(s.id, 'A');
    expect(took()).toEqual(['sessions']);
    await repo.renameSession(s.id, '   ');
    await repo.renameSession(s.id, 'A');
    expect(took()).toEqual([]);

    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    expect(took()).toEqual(['solves']);
    await repo.updateSolve(a.id, { note: 'x' });
    expect(took()).toEqual(['solves']);
    expect((await repo.updateSolve(a.id, {})).note).toBe('x');
    expect(took()).toEqual([]);
    await repo.deleteSolve(a.id);
    expect(took()).toEqual(['solves']);
    await repo.deleteSolve(a.id);
    expect(took()).toEqual([]);
    await repo.restoreSolve(a.id);
    expect(took()).toEqual(['solves']);
    await repo.restoreSolve(a.id);
    expect(took()).toEqual([]);

    await repo.deleteSession(s.id);
    expect(took()).toEqual(['sessions', 'solves']);
    await repo.deleteSession(s.id);
    expect(took()).toEqual([]);
    await repo.restoreSession(s.id);
    expect(took()).toEqual(['sessions', 'solves']);
    await repo.restoreSession(s.id);
    expect(took()).toEqual([]);
    const empty = await repo.createSession({ event: '222' });
    took();
    await repo.deleteSession(empty.id);
    expect(took()).toEqual(['sessions']); // sem solves, só a sessão mudou

    await repo.saveProfile({ finish: 'gelo' });
    expect(took()).toEqual(['profile']);
    await repo.saveMeta({ solvesSinceBackup: 1 });
    expect(took()).toEqual(['meta']);
    await repo.saveFolderHandle({ name: 'pasta' });
    expect(took()).toEqual(['meta']);
    await repo.saveFolderHandle(null);
    expect(took()).toEqual(['meta']);
    await repo.saveBackup({ id: 'b', createdAt: 1, reason: 'manual', solveCount: 0, encoding: 'json', payload: '{}' });
    await repo.deleteBackup('b');
    expect(took()).toEqual([]); // as cópias não têm tipo de aviso

    const data = await repo.exportAll();
    await repo.replaceAll(data);
    expect(took()).toEqual(['all']);
    await repo.importAll({ ...data, sessions: [{ ...data.sessions[0], id: 'nova' }] });
    expect(took()).toEqual(['all']);
    await repo.importAll(data); // nada novo
    expect(took()).toEqual([]);
  });

  it('purgeTrash avisa o que apagou', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSolve(a.id);
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));
    t += 10_000;
    expect(await repo.purgeTrash(60_000)).toBe(0);
    expect(seen).toEqual([]);
    expect(await repo.purgeTrash(1000)).toBe(1);
    expect(seen).toEqual(['solves']);
    await repo.deleteSession(s.id);
    seen.length = 0;
    t += 10_000;
    expect(await repo.purgeTrash(1000)).toBe(1);
    expect(seen).toEqual(['sessions']);
  });

  it('quem sai da lista não é mais avisado, e a mesma função em dois registros sai uma de cada vez', async () => {
    const seen: string[] = [];
    const fn = (k: string) => seen.push(k);
    const off1 = repo.onChange(fn);
    const off2 = repo.onChange(fn);
    await repo.createSession({ event: '333' });
    expect(seen).toEqual(['sessions', 'sessions']);
    off1();
    await repo.createSession({ event: '333' });
    expect(seen).toEqual(['sessions', 'sessions', 'sessions']);
    off2();
    off2();
    await repo.createSession({ event: '333' });
    expect(seen.length).toBe(3);
  });

  it('ouvinte que lança não derruba a gravação nem os outros ouvintes: o erro vai para onError', async () => {
    const errors: unknown[] = [];
    const repo = createRepository(await openKlickDb(dbName()), { now, channel: null, onError: (e) => errors.push(e) });
    const boom = new Error('ouvinte quebrado');
    const seen: string[] = [];
    repo.onChange(() => {
      throw boom;
    });
    repo.onChange((k) => seen.push(k));
    const s = await repo.createSession({ event: '333' });
    expect(s.name).toBe('Sessão 1');
    expect(seen).toEqual(['sessions']);
    expect(errors).toEqual([boom]);
  });

  it('canal que lança ao postar não faz a gravação rejeitar: o erro vai para onError', async () => {
    const errors: unknown[] = [];
    const broken: ChannelLike = {
      onmessage: null,
      postMessage() {
        throw new Error('canal fechado');
      },
    };
    const repo = createRepository(await openKlickDb(dbName()), { now, channel: broken, onError: (e) => errors.push(e) });
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));
    await repo.createSession({ event: '333' });
    expect(seen).toEqual(['sessions']);
    expect(errors).toHaveLength(1);
  });

  it('onError que lança, ao receber o erro de um ouvinte, não rejeita a gravação já confirmada: o solve fica gravado uma vez e os dois erros continuam visíveis', async () => {
    const surfaced = captureRethrown();
    const fromListener = new Error('ouvinte quebrado');
    const fromHandler = new Error('onError quebrado');
    const received: unknown[] = [];
    const repo = createRepository(await openKlickDb(dbName()), {
      now,
      channel: null,
      onError: (err) => {
        received.push(err);
        throw fromHandler;
      },
    });
    const seen: string[] = [];
    repo.onChange(() => {
      throw fromListener;
    });
    repo.onChange((k) => seen.push(k));

    const s = await repo.createSession({ event: '333' });
    const solve = await repo.addSolve(ns(s.id, 60000, 1000)); // resolve com o solve; a fila não vai repetir
    expect(solve).toMatchObject({ sessionId: s.id, ms: 60000 });
    expect((await repo.listSolves({ includeDeleted: true })).map((x) => x.id)).toEqual([solve.id]); // gravado uma vez só
    expect(seen).toEqual(['sessions', 'solves']); // o outro ouvinte foi avisado mesmo assim
    expect(received).toEqual([fromListener, fromListener]);
    // Nada some: cada falha do onError sai pelo relançar-depois, com o erro que ele recebia e o que ele lançou.
    expect(surfaced).toHaveLength(2);
    for (const err of surfaced) {
      expect(err).toBeInstanceOf(AggregateError);
      expect((err as AggregateError).errors).toEqual([fromListener, fromHandler]);
    }
  });

  it('onError que lança, ao receber o erro do canal, também não rejeita a gravação já confirmada', async () => {
    const surfaced = captureRethrown();
    const fromChannel = new Error('canal fechado');
    const fromHandler = new Error('onError quebrado');
    const broken: ChannelLike = {
      onmessage: null,
      postMessage() {
        throw fromChannel;
      },
    };
    const repo = createRepository(await openKlickDb(dbName()), {
      now,
      channel: broken,
      onError: () => {
        throw fromHandler;
      },
    });

    const s = await repo.createSession({ event: '333' });
    const solve = await repo.addSolve(ns(s.id, 60000, 1000));
    expect((await repo.listSolves({ includeDeleted: true })).map((x) => x.id)).toEqual([solve.id]);
    expect(surfaced).toHaveLength(2);
    for (const err of surfaced) expect((err as AggregateError).errors).toEqual([fromChannel, fromHandler]);
  });
});

describe('repositório: canal entre abas', () => {
  it('ignora mensagem malformada e aceita só { kind } conhecido', async () => {
    const b = bus();
    const sender = b.make(); // a outra aba, vista só pelo canal
    const own = b.make();
    const repo = createRepository(await openKlickDb(dbName()), { now, channel: own });
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));
    const junk: unknown[] = [undefined, null, 'solves', 42, true, [], ['solves'], {}, { kind: 'lixo' }, { kind: 1 }, { kind: null }, { kind: ['solves'] }, { kind: 'constructor' }, { kind: 'toString' }];
    for (const data of junk) sender.postMessage(data);
    own.onmessage?.(undefined as never); // evento sem nada dentro
    own.onmessage?.({} as never);
    expect(seen).toEqual([]);
    sender.postMessage({ kind: 'profile' });
    sender.postMessage({ kind: 'all', extra: 1 });
    expect(seen).toEqual(['profile', 'all']);
  });

  it('o aviso que chega de outra aba vai aos ouvintes daqui e não volta ao canal', async () => {
    const b = bus();
    const name = dbName();
    const tabA = createRepository(await openKlickDb(name), { now, channel: b.make() });
    const tabB = createRepository(await openKlickDb(name), { now, channel: b.make() });
    const watcher = b.make();
    const heard: unknown[] = [];
    watcher.onmessage = (ev) => heard.push(ev.data);
    const onA: string[] = [];
    const onB: string[] = [];
    tabA.onChange((k) => onA.push(k));
    tabB.onChange((k) => onB.push(k));
    await tabA.createSession({ event: '333' });
    expect(onA).toEqual(['sessions']); // o aviso local, sem eco
    expect(onB).toEqual(['sessions']);
    expect(heard).toEqual([{ kind: 'sessions' }]); // a aba B não repostou
  });

  describe('canal padrão', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sem BroadcastChannel no ambiente, funciona só com os avisos locais', async () => {
      vi.stubGlobal('BroadcastChannel', undefined);
      const repo = createRepository(await openKlickDb(dbName()), { now });
      const seen: string[] = [];
      repo.onChange((k) => seen.push(k));
      await repo.createSession({ event: '333' });
      expect(seen).toEqual(['sessions']);
    });

    it('com o construtor lançando (iframe isolado), também funciona sem canal', async () => {
      vi.stubGlobal(
        'BroadcastChannel',
        class {
          constructor() {
            throw new Error('SecurityError');
          }
        },
      );
      const repo = createRepository(await openKlickDb(dbName()), { now });
      const seen: string[] = [];
      repo.onChange((k) => seen.push(k));
      await repo.createSession({ event: '333' });
      expect(seen).toEqual(['sessions']);
    });

    it('omitido e com BroadcastChannel disponível: usa o canal "klick-data" para postar e para ouvir', async () => {
      const made: { name: string; onmessage: ((ev: { data: unknown }) => void) | null; posted: unknown[] }[] = [];
      vi.stubGlobal(
        'BroadcastChannel',
        class {
          name: string;
          onmessage: ((ev: { data: unknown }) => void) | null = null;
          posted: unknown[] = [];
          constructor(name: string) {
            this.name = name;
            made.push(this);
          }
          postMessage(data: unknown) {
            this.posted.push(data);
          }
        },
      );
      const repo = createRepository(await openKlickDb(dbName()), { now });
      expect(made.map((c) => c.name)).toEqual(['klick-data']);
      const seen: string[] = [];
      repo.onChange((k) => seen.push(k));
      await repo.createSession({ event: '333' });
      expect(made[0].posted).toEqual([{ kind: 'sessions' }]);
      made[0].onmessage?.({ data: { kind: 'solves' } });
      expect(seen).toEqual(['sessions', 'solves']);
    });

    it('channel: null desliga o canal mesmo com BroadcastChannel disponível', async () => {
      const made: unknown[] = [];
      vi.stubGlobal(
        'BroadcastChannel',
        class {
          constructor() {
            made.push(this);
          }
        },
      );
      const repo = createRepository(await openKlickDb(dbName()), { now, channel: null });
      await repo.createSession({ event: '333' });
      expect(made).toEqual([]);
    });
  });
});

describe('repositório: perfil e meta', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = await fresh();
  });

  it('o perfil padrão é uma cópia nova e mutável a cada leitura', async () => {
    const a = await repo.getProfile();
    expect(a.settings).toEqual(DEFAULT_SETTINGS);
    expect(Object.isFrozen(a.settings)).toBe(false);
    expect(Object.isFrozen(a.settings.sound)).toBe(false);
    a.settings.holdMs = 999;
    a.settings.sound.klick = false;
    a.trail[0] = true;
    const b = await repo.getProfile();
    expect(b.settings).toEqual(DEFAULT_SETTINGS);
    expect(b.trail).toEqual(Array(9).fill(false));
    expect(b.settings).not.toBe(a.settings);
    expect(b.settings.sound).not.toBe(a.settings.sound);
    expect(DEFAULT_SETTINGS.holdMs).toBe(300);
    expect(DEFAULT_SETTINGS.sound.klick).toBe(true);
  });

  it('o perfil devolvido por saveProfile também é uma cópia: alterá-lo não muda o gravado', async () => {
    const trail = [true, true, false, false, false, false, false, false, false];
    const saved = await repo.saveProfile({ finish: 'gelo', trail });
    saved.settings.holdMs = 1;
    saved.settings.sound.pb = false;
    saved.trail.push(true);
    trail[0] = false; // a trilha do patch também não fica ligada ao resultado
    const again = await repo.getProfile();
    expect(again.settings).toEqual(DEFAULT_SETTINGS);
    expect(again.trail).toEqual([true, true, false, false, false, false, false, false, false]);
    expect(again.finish).toBe('gelo');
  });

  it('ler o perfil não grava o padrão: o arquivo importado ainda pode trazer o dele', async () => {
    const source = await fresh();
    await source.saveProfile({ finish: 'carbono', onboarded: true });
    const data = await source.exportAll();
    await repo.getProfile();
    expect((await repo.exportAll()).profile).toBeNull();
    await repo.importAll(data);
    expect(await repo.getProfile()).toMatchObject({ finish: 'carbono', onboarded: true });
  });

  it('saveProfile junta ajustes parciais e sons parciais com o que está gravado, e ignora undefined', async () => {
    await repo.saveProfile({ settings: { holdMs: 550, sound: { klick: false } }, finish: 'gelo', currentSessionId: 'abc' });
    await repo.saveProfile({ settings: { dailyGoal: 30 }, finish: undefined, currentSessionId: null });
    const p = await repo.getProfile();
    expect(p.settings).toEqual({ ...DEFAULT_SETTINGS, holdMs: 550, dailyGoal: 30, sound: { klick: false, insp: true, pb: true } });
    expect(p.finish).toBe('gelo');
    expect(p.currentSessionId).toBeNull(); // null é valor, não ausência
    expect(p.onboarded).toBe(false);
  });

  it('duas conexões lendo o meta pela primeira vez ficam com o mesmo deviceId', async () => {
    const name = dbName();
    const a = createRepository(await openKlickDb(name), { now, channel: null });
    const b = createRepository(await openKlickDb(name), { now, channel: null });
    const [ma, mb] = await Promise.all([a.getMeta(), b.getMeta()]);
    expect(ma.deviceId).toBe(mb.deviceId);
    expect((await a.getMeta()).deviceId).toBe(ma.deviceId);
  });

  it('criar o meta na primeira leitura não avisa ninguém; salvar avisa, e undefined não apaga', async () => {
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));
    const m = await repo.getMeta();
    expect(seen).toEqual([]);
    await repo.saveMeta({ solvesSinceExport: 4, lastExportAt: 99 });
    await repo.saveMeta({ solvesSinceExport: undefined, solvesSinceBackup: 2 });
    expect(seen).toEqual(['meta', 'meta']);
    expect(await repo.getMeta()).toEqual({ ...m, solvesSinceExport: 4, lastExportAt: 99, solvesSinceBackup: 2 });
  });

  it('a pasta de cópias vai e volta do banco, e null a remove', async () => {
    expect(await repo.getFolderHandle()).toBeNull();
    await repo.saveFolderHandle({ kind: 'directory', name: 'Klick' });
    expect(await repo.getFolderHandle()).toEqual({ kind: 'directory', name: 'Klick' });
    expect(await repo.getMeta()).toMatchObject({ schemaVersion: 1 }); // convive com o meta na mesma store
    await repo.saveFolderHandle(null);
    expect(await repo.getFolderHandle()).toBeNull();
  });
});

describe('repositório: sessões, solves e lixeira', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = await fresh();
  });

  it('o nome padrão segue o maior "Sessão N" ativo do evento; nome vazio vale como omitido', async () => {
    await repo.createSession({ event: '333', name: 'Sessão 7' });
    await repo.createSession({ event: '333', name: 'Treino' });
    await repo.createSession({ event: '222', name: 'Sessão 40' });
    const a = await repo.createSession({ event: '333' });
    expect(a.name).toBe('Sessão 8');
    await repo.deleteSession(a.id);
    expect((await repo.createSession({ event: '333', name: '   ' })).name).toBe('Sessão 8'); // a excluída não conta
    expect((await repo.createSession({ event: '333', name: ' Cruz ' })).name).toBe('Cruz');
    expect((await repo.createSession({ event: '444' })).name).toBe('Sessão 1');
  });

  it('order é 1 + o maior já usado, inclusive o das excluídas', async () => {
    const a = await repo.createSession({ event: '333' });
    const b = await repo.createSession({ event: '333' });
    await repo.deleteSession(b.id);
    const c = await repo.createSession({ event: '333' });
    expect([a.order, b.order, c.order]).toEqual([0, 1, 2]);
    expect((await repo.listSessions()).map((s) => s.id)).toEqual([a.id, c.id]);
    expect((await repo.listSessions({ includeDeleted: true })).map((s) => s.id)).toEqual([a.id, b.id, c.id]);
  });

  it('restaurar a sessão não traz de volta o solve que já tinha sido excluído antes dela', async () => {
    const s = await repo.createSession({ event: '333' });
    const early = await repo.addSolve(ns(s.id, 60000, 1000));
    const kept = await repo.addSolve(ns(s.id, 61000, 2000));
    await repo.deleteSolve(early.id);
    t += 1000;
    await repo.deleteSession(s.id);
    t += 1000;
    await repo.restoreSession(s.id);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([kept.id]);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([early.id]);
  });

  it('excluir de novo o que já está na lixeira mantém a primeira data', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSolve(a.id);
    const firstAt = t;
    t += 5000;
    await repo.deleteSolve(a.id);
    expect((await repo.listTrash()).solves[0].deletedAt).toBe(firstAt);
  });

  it('restaurar o solve limpa a marca de exclusão e mexe em updatedAt', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSolve(a.id);
    t += 5000;
    await repo.restoreSolve(a.id);
    expect((await repo.listSolves({ sessionId: s.id }))[0]).toMatchObject({ id: a.id, deletedAt: null, updatedAt: t });
  });

  it('restaurar um solve cuja sessão está na lixeira traz de volta a sessão, e só ela', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    const b = await repo.addSolve(ns(s.id, 61000, 2000));
    t += 1000;
    await repo.deleteSession(s.id);
    expect(await repo.listSessions()).toEqual([]);
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));

    t += 1000;
    await repo.restoreSolve(a.id);
    expect(seen).toEqual(['solves', 'sessions']);
    expect(await repo.listSessions()).toMatchObject([{ id: s.id, deletedAt: null, updatedAt: t }]);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([a.id]);
    const trash = await repo.listTrash();
    expect(trash.sessions).toEqual([]);
    expect(trash.solves.map((x) => x.id)).toEqual([b.id]); // o outro solve da sessão continua na lixeira
    const copy = await repo.exportAll({ includeDeleted: false }); // a cópia sem lixeira leva a sessão junto com o solve
    expect(copy.sessions.map((x) => x.id)).toEqual([s.id]);
    expect(copy.solves.map((x) => x.id)).toEqual([a.id]);

    seen.length = 0;
    await repo.restoreSolve(b.id); // a sessão já está ativa: só os solves mudam
    expect(seen).toEqual(['solves']);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it('depois de restaurar um solve de sessão excluída, o purge não deixa solve ativo sem sessão', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.addSolve(ns(s.id, 61000, 2000));
    await repo.deleteSession(s.id);
    await repo.restoreSolve(a.id);
    t += 31 * 86_400_000;
    expect(await repo.purgeTrash(30 * 86_400_000)).toBe(1); // só o outro solve, que ficou na lixeira
    expect((await repo.listSessions()).map((x) => x.id)).toEqual([s.id]);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([a.id]);
    const copy = await repo.exportAll({ includeDeleted: false });
    expect(copy.solves.every((x) => copy.sessions.some((y) => y.id === x.sessionId))).toBe(true);
  });

  it('restaurar um solve cuja sessão já foi apagada de vez devolve só o solve, sem inventar a sessão', async () => {
    const a = await repo.addSolve(ns('sessao-apagada', 60000, 1000));
    await repo.deleteSolve(a.id);
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));
    await repo.restoreSolve(a.id);
    expect(seen).toEqual(['solves']);
    expect((await repo.listSolves()).map((x) => x.id)).toEqual([a.id]);
    expect(await repo.listSessions({ includeDeleted: true })).toEqual([]);
  });

  it('devolver o solve e a sessão é uma gravação só: uma transação strict, e se ela aborta nenhum dos dois volta', async () => {
    const name = dbName();
    const spy = spyOn(await openKlickDb(name));
    const spied = createRepository(spy.db, { now, channel: null });
    const s = await spied.createSession({ event: '333' });
    const a = await spied.addSolve(ns(s.id, 60000, 1000));
    await spied.deleteSession(s.id);
    const seen: string[] = [];
    spied.onChange((k) => seen.push(k));

    spy.abortWrites = true;
    await expect(spied.restoreSolve(a.id)).rejects.toMatchObject({ name: 'AbortError' });
    const other = createRepository(await openKlickDb(name), { now, channel: null });
    const trash = await other.listTrash();
    expect(trash.solves.map((x) => x.id)).toEqual([a.id]);
    expect(trash.sessions.map((x) => x.id)).toEqual([s.id]);
    expect(seen).toEqual([]);

    spy.abortWrites = false;
    spy.opened.length = 0;
    await spied.restoreSolve(a.id);
    expect(spy.opened.filter((o) => o.mode === 'readwrite')).toEqual([{ mode: 'readwrite', durability: 'strict' }]);
    expect(seen).toEqual(['solves', 'sessions']);
  });

  it('updateSolve aceita penalty null para limpar a penalidade e nota vazia para limpar a nota', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.updateSolve(a.id, { penalty: 'DNF', note: 'x' });
    const up = await repo.updateSolve(a.id, { penalty: null, note: '' });
    expect(up).toMatchObject({ penalty: null, note: '' });
    expect(await repo.updateSolve(a.id, { note: 'só nota' })).toMatchObject({ penalty: null, note: 'só nota' });
  });

  it('lista por sessão e evento juntos, com a lixeira só quando pedida e empate de data pela ordem de criação', async () => {
    const s1 = await repo.createSession({ event: '333' });
    const s2 = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s1.id, 1000, 5000));
    const b = await repo.addSolve({ ...ns(s1.id, 2000, 5000), event: '222' as const });
    const c = await repo.addSolve(ns(s2.id, 3000, 1000));
    const ids = async (f?: Parameters<Repository['listSolves']>[0]) => (await repo.listSolves(f)).map((x) => x.id);
    expect(await ids()).toEqual([c.id, a.id, b.id]);
    expect(await ids({ sessionId: s1.id })).toEqual([a.id, b.id]);
    expect(await ids({ sessionId: s1.id, event: '222' })).toEqual([b.id]);
    expect(await ids({ event: '333' })).toEqual([c.id, a.id]);
    await repo.deleteSolve(a.id);
    expect(await ids({ sessionId: s1.id })).toEqual([b.id]);
    expect(await ids({ sessionId: s1.id, includeDeleted: true })).toEqual([a.id, b.id]);
    expect(await ids({ event: '333', includeDeleted: true })).toEqual([c.id, a.id]);
  });

  it('a lixeira lista o excluído mais recentemente primeiro; purgeTrash conta sessões e solves e poupa o que está ativo', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000, 1000));
    const b = await repo.addSolve(ns(s.id, 2000, 2000));
    const c = await repo.addSolve(ns(s.id, 3000, 3000));
    const live = await repo.addSolve(ns(s.id, 4000, 4000));
    await repo.deleteSolve(a.id); // t0
    t += 1000;
    await repo.deleteSolve(b.id); // t0 + 1000
    t += 1000;
    await repo.deleteSolve(live.id);
    await repo.restoreSolve(live.id);
    await repo.deleteSession(s.id); // t0 + 2000: leva o c e o live junto com a sessão
    const trash = await repo.listTrash();
    expect(trash.sessions.map((x) => x.id)).toEqual([s.id]);
    expect(trash.solves.map((x) => x.id)).toEqual([c.id, live.id, b.id, a.id]); // empate de data (c e live) pela ordem de criação
    expect(await repo.purgeTrash(1500)).toBe(1); // só o a passou do prazo
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([c.id, live.id, b.id]);
    t += 10_000;
    expect(await repo.purgeTrash(1000)).toBe(4); // b, c, live e a sessão
    expect(await repo.listTrash()).toEqual({ sessions: [], solves: [] });
  });

  it('purgeTrash só apaga o que foi excluído ANTES de now - olderThanMs: no limite exato ainda fica, um milissegundo depois vai', async () => {
    const day = 86_400_000;
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    await repo.deleteSolve(a.id);
    await repo.deleteSession(s.id); // o solve e a sessão com a mesma marca de exclusão
    t += 30 * day; // exatamente 30 dias depois
    expect(await repo.purgeTrash(30 * day)).toBe(0);
    const trash = await repo.listTrash();
    expect(trash.solves.map((x) => x.id)).toEqual([a.id]);
    expect(trash.sessions.map((x) => x.id)).toEqual([s.id]);
    t += 1;
    expect(await repo.purgeTrash(30 * day)).toBe(2);
    expect(await repo.listTrash()).toEqual({ sessions: [], solves: [] });
  });

  it('a lixeira lista também as sessões com a excluída mais recentemente primeiro, e desempata pela ordem de criação', async () => {
    const a = await repo.createSession({ event: '333' });
    const b = await repo.createSession({ event: '333' });
    const c = await repo.createSession({ event: '333' });
    const d = await repo.createSession({ event: '333' });
    const e = await repo.createSession({ event: '333' });
    await repo.deleteSession(b.id); // t0
    t += 1000;
    await repo.deleteSession(c.id); // t0 + 1000
    t += 1000;
    await repo.deleteSession(e.id); // t0 + 2000
    await repo.deleteSession(a.id); // t0 + 2000, o mesmo instante do e: pela ordem de criação, o a vem antes
    // d fica ativa
    const trash = await repo.listTrash();
    expect(trash.sessions.map((x) => x.id)).toEqual([a.id, e.id, c.id, b.id]);
    expect(trash.sessions.map((x) => x.id)).not.toContain(d.id);
  });
});

describe('repositório: exportar e importar', () => {
  let repo: Repository;
  beforeEach(async () => {
    t = 1_791_500_000_000;
    repo = await fresh();
  });

  it('exporta com a lixeira por padrão, e sem ela quando pedido', async () => {
    const s1 = await repo.createSession({ event: '333' });
    const s2 = await repo.createSession({ event: '222' });
    const a = await repo.addSolve(ns(s1.id, 1000, 1000));
    const b = await repo.addSolve(ns(s1.id, 2000, 2000));
    await repo.deleteSolve(a.id);
    await repo.deleteSession(s2.id);
    const all = await repo.exportAll();
    expect(all.sessions.map((x) => x.id)).toEqual([s1.id, s2.id]);
    expect(all.solves.map((x) => x.id)).toEqual([a.id, b.id]);
    const live = await repo.exportAll({ includeDeleted: false });
    expect(live.sessions.map((x) => x.id)).toEqual([s1.id]);
    expect(live.solves.map((x) => x.id)).toEqual([b.id]);
  });

  it('o perfil exportado é null até haver um gravado, e então vem completo', async () => {
    expect((await repo.exportAll()).profile).toBeNull();
    await repo.saveProfile({ settings: { holdMs: 450 } });
    const p = (await repo.exportAll()).profile;
    expect(p?.settings).toEqual({ ...DEFAULT_SETTINGS, holdMs: 450 });
  });

  it('importar não troca a sessão que já existe, mesmo com o arquivo mais novo, e não a conta', async () => {
    const s = await repo.createSession({ event: '333', name: 'Original' });
    const data = await repo.exportAll();
    const other = await fresh();
    await other.importAll(data);
    const renamed = structuredClone(data);
    renamed.sessions[0].name = 'Renomeada';
    renamed.sessions[0].updatedAt += 10;
    expect(await other.importAll(renamed)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 });
    expect((await other.listSessions())[0]).toMatchObject({ id: s.id, name: 'Original' });
  });

  it('importar traz a exclusão mais nova, pula o mais velho e junta solves repetidos no arquivo', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000, 1000));
    const b = await repo.addSolve(ns(s.id, 2000, 2000));
    const data = await repo.exportAll();
    const other = await fresh();
    await other.importAll(data);

    const edited = structuredClone(data);
    edited.solves[0] = { ...edited.solves[0], deletedAt: t + 20, updatedAt: t + 20 }; // a, excluído na outra ponta
    edited.solves[1] = { ...edited.solves[1], note: 'velho', updatedAt: edited.solves[1].updatedAt - 1 }; // b, mais antigo que o daqui
    const report = await other.importAll(edited);
    expect(report).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 1, skipped: 1 });
    expect((await other.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([b.id]);
    expect((await other.listTrash()).solves.map((x) => x.id)).toEqual([a.id]);

    const twice = structuredClone(data);
    const target = await fresh();
    twice.solves.push({ ...twice.solves[0], note: 'segunda cópia', updatedAt: twice.solves[0].updatedAt + 1 });
    expect(await target.importAll(twice)).toEqual({ sessionsAdded: 1, solvesAdded: 2, solvesUpdated: 1, skipped: 0 });
    expect((await target.listSolves({ includeDeleted: true })).find((x) => x.id === a.id)?.note).toBe('segunda cópia');
  });

  it('o perfil do arquivo só entra se não houver um gravado', async () => {
    const source = await fresh();
    await source.saveProfile({ finish: 'gelo', onboarded: true });
    const data = await source.exportAll();

    const empty = await fresh();
    expect(await empty.importAll(data)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 });
    expect(await empty.getProfile()).toMatchObject({ finish: 'gelo', onboarded: true });

    const has = await fresh();
    await has.saveProfile({ finish: 'carbono' });
    await has.importAll(data);
    expect((await has.getProfile()).finish).toBe('carbono');
  });

  it('substituir troca solves, sessões e perfil e deixa meta, cópias e pasta como estão', async () => {
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000, 1000));
    await repo.saveProfile({ finish: 'gelo' });
    const meta = await repo.saveMeta({ solvesSinceBackup: 7 });
    await repo.saveBackup({ id: 'b', createdAt: 1, reason: 'manual', solveCount: 1, encoding: 'json', payload: '{}' });
    await repo.saveFolderHandle({ name: 'pasta' });

    const incoming = await fresh();
    const s2 = await incoming.createSession({ event: '444', name: 'De fora' });
    await incoming.addSolve({ ...ns(s2.id, 9000, 9000), event: '444' as const });
    await incoming.saveProfile({ finish: 'carbono' });
    await repo.replaceAll(await incoming.exportAll());

    expect((await repo.listSessions()).map((x) => x.name)).toEqual(['De fora']);
    expect((await repo.listSolves()).map((x) => x.ms)).toEqual([9000]);
    expect((await repo.getProfile()).finish).toBe('carbono');
    expect(await repo.getMeta()).toEqual(meta);
    expect((await repo.listBackups()).map((x) => x.id)).toEqual(['b']);
    expect(await repo.getFolderHandle()).toEqual({ name: 'pasta' });

    await repo.replaceAll({ format: 'klick', version: 1, exportedAt: t, sessions: [], solves: [], profile: null });
    expect((await repo.exportAll()).profile).toBeNull(); // o arquivo sem perfil limpa o perfil
  });

  it('importar com um solve inválido no meio desfaz tudo: nada do arquivo entra e nada do que já existia muda', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));

    const file: KlickExport = {
      format: 'klick',
      version: 1,
      exportedAt: t,
      sessions: [{ ...s, id: 'sessao-nova', name: 'Nova' }],
      solves: [
        { ...a, note: 'mais novo', updatedAt: a.updatedAt + 10 }, // atualização válida do que já existe
        { ...a, id: 'solve-novo', ms: 1 }, // solve novo e válido
        { ...a, id: 'solve-ruim', scramble: (() => 1) as unknown as string }, // uma função não passa pelo clone estruturado
      ],
      profile: { ...(await repo.getProfile()), finish: 'gelo' },
    };
    await expect(repo.importAll(file)).rejects.toMatchObject({ name: 'DataCloneError' });
    expect((await repo.listSessions({ includeDeleted: true })).map((x) => x.id)).toEqual([s.id]);
    expect(await repo.listSolves({ includeDeleted: true })).toEqual([a]); // igual ao que era: nota vazia e updatedAt antigo
    expect((await repo.exportAll()).profile).toBeNull();
    expect(seen).toEqual([]);
  });

  it('importar com perfil inválido, depois de sessões e solves já gravados na transação, também desfaz tudo', async () => {
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 60000, 1000));
    const seen: string[] = [];
    repo.onChange((k) => seen.push(k));

    const file: KlickExport = {
      format: 'klick',
      version: 1,
      exportedAt: t,
      sessions: [{ ...s, id: 'sessao-nova', name: 'Nova' }],
      solves: [{ ...a, id: 'solve-novo', ms: 1 }],
      profile: { ...(await repo.getProfile()), finish: (() => 1) as never },
    };
    await expect(repo.importAll(file)).rejects.toMatchObject({ name: 'DataCloneError' });
    expect((await repo.listSessions({ includeDeleted: true })).map((x) => x.id)).toEqual([s.id]);
    expect((await repo.listSolves({ includeDeleted: true })).map((x) => x.id)).toEqual([a.id]);
    expect((await repo.exportAll()).profile).toBeNull();
    expect(seen).toEqual([]);
  });
});
