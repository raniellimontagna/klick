import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { averageOf, bestSingle, currentStreak, solvesOnDay } from '../../src/core/stats';
import type { Duel, DuelTime } from '../../src/core/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, DuelConflictError, type ChangeKind, type Repository } from '../../src/data/repository';
import { parseKlickJson, toKlickJson } from '../../src/data/transfer';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const DAY = 86_400_000;
async function fresh(): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository }> {
  const db = await openKlickDb(`duels-${++n}`);
  return { db, repo: createRepository(db, { now, channel: null }) };
}

type NewDuel = Omit<Duel, 'createdAt' | 'updatedAt' | 'deletedAt'>;
const time = (ms: number, penalty: DuelTime['penalty'] = null): DuelTime => ({ ms, penalty });
const SCRAMBLES = Array.from({ length: 7 }, (_, i) => `R U R' U' F${i}`);
let seq = 0;
// Um lado de um desafio como a tela o grava: sem as datas, que o repositório põe. O id é `${linkId}-${side}`.
const duel = (o: Partial<NewDuel> = {}): NewDuel => {
  const linkId = o.linkId ?? `duel${String(++seq).padStart(8, '0')}`;
  const side = o.side ?? 'a';
  return {
    id: `${linkId}-${side}`, linkId, side, event: '333', scrambles: SCRAMBLES, mine: [time(9_000), time(11_000, '+2')], theirs: null,
    myName: 'Ana', theirName: '', status: 'playing', ...o,
  };
};

describe('os desafios no repositório (spec do desafio, seção 7)', () => {
  it('saveDuel cria e substitui, com as datas do relógio do sync', async () => {
    const { db, repo } = await fresh();
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    // O relógio do sync está à frente do aparelho (uma data já vista): a data da escrita é clock + 1, nunca a hora de agora.
    await repo.saveSyncState({ clock: t + 5_000 });
    heard.length = 0;
    const input = duel({ linkId: 'abcdefgh12345678' });
    const created = await repo.saveDuel(input);
    expect(created).toEqual({ ...input, createdAt: t + 5_001, updatedAt: t + 5_001, deletedAt: null });
    expect(created.id).toBe('abcdefgh12345678-a');
    expect(await repo.getDuel(created.id)).toEqual(created);

    // Substituir: a criação fica a do registro gravado, e a data da escrita sobe.
    t += 60_000;
    const next = { ...input, mine: [...input.mine, time(8_000), time(0, 'DNF')], status: 'waiting' as const };
    const replaced = await repo.saveDuel(next);
    expect(replaced).toEqual({ ...next, createdAt: t - 60_000 + 5_001, updatedAt: t, deletedAt: null });
    expect(await repo.getDuel(created.id)).toEqual(replaced);
    // A edição não mexe na marca de exclusão (uma edição nunca desfaz uma exclusão do outro lado, no sync).
    expect((await db.get('duels', created.id))?.deletionStamp).toBe(created.createdAt);

    // O outro lado da mesma partida é outro registro: desafiar a si mesmo não colide.
    const other = await repo.saveDuel(duel({ linkId: 'abcdefgh12345678', side: 'b', myName: 'Bia', theirName: 'Ana' }));
    expect(other.id).toBe('abcdefgh12345678-b');
    expect((await repo.listDuels()).map((d) => d.id)).toEqual([other.id, created.id]);

    // Um id que não é `${linkId}-${side}` não grava nada; um desafio que não existe é null.
    await expect(repo.saveDuel({ ...duel(), id: 'outro-id' })).rejects.toThrow('outro-id');
    expect(await repo.getDuel('nada-a')).toBeNull();
    expect(heard).toEqual(['duels', 'duels', 'duels']);

    // O que a tela recebe é uma cópia: mexer nela não mexe no que ela mandou gravar.
    replaced.mine.push(time(1));
    expect(next.mine).toHaveLength(4);
  });

  // A revisão da Task 5: a tela grava o desafio inteiro a partir da cópia dela. Com expectUpdatedAt, a gravação só acontece sobre o registro
  // que a tela leu (conferido dentro da transação); outra aba, o sync, uma restauração ou um wipe que passaram na frente dão o conflito.
  it('saveDuel e deleteDuel com expectUpdatedAt só gravam sobre o registro esperado', async () => {
    const { repo } = await fresh();
    const conflict = async (p: Promise<unknown>): Promise<DuelConflictError> => {
      const err = await p.then(() => null, (e: unknown) => e);
      expect(err).toBeInstanceOf(DuelConflictError);
      return err as DuelConflictError;
    };
    const input = duel({ linkId: 'abcdefgh87654321' });
    const created = await repo.saveDuel(input, { expectUpdatedAt: null }); // null: só cria
    expect((await conflict(repo.saveDuel(input, { expectUpdatedAt: null }))).stored).toEqual(created);

    t += 1_000;
    const next = await repo.saveDuel({ ...input, mine: [...input.mine, time(8_000)] }, { expectUpdatedAt: created.updatedAt });
    expect(next.updatedAt).toBe(t);
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));

    // Uma cópia velha (a data de antes) não grava, nem avisa: o erro traz o que está gravado.
    t += 1_000;
    expect((await conflict(repo.saveDuel({ ...input, mine: [] }, { expectUpdatedAt: created.updatedAt }))).stored).toEqual(next);
    expect(await repo.getDuel(input.id)).toEqual(next);
    await conflict(repo.deleteDuel(input.id, { expectUpdatedAt: created.updatedAt }));
    expect((await repo.getDuel(input.id))!.deletedAt).toBeNull();
    expect(heard).toEqual([]);

    // A data certa apaga; depois disso, a cópia de antes da lixeira dá conflito com o registro apagado.
    await repo.deleteDuel(input.id, { expectUpdatedAt: next.updatedAt });
    const trashed = (await repo.getDuel(input.id))!;
    expect(trashed.deletedAt).not.toBeNull();
    expect((await conflict(repo.saveDuel(next, { expectUpdatedAt: next.updatedAt }))).stored).toEqual(trashed);

    // Sumiu (purgado, apagado com os dados): conflito com null, e nada volta a existir.
    expect((await conflict(repo.saveDuel(duel({ linkId: 'zzzzzzzz00000000' }), { expectUpdatedAt: 5 }))).stored).toBeNull();
    expect(await repo.getDuel('zzzzzzzz00000000-a')).toBeNull();
    expect((await conflict(repo.deleteDuel('zzzzzzzz00000000-a', { expectUpdatedAt: 5 }))).stored).toBeNull();
    expect(heard).toEqual(['duels']);
  });

  it('listDuels traz os mais novos primeiro e esconde a lixeira', async () => {
    const { repo } = await fresh();
    const old = await repo.saveDuel(duel());
    t += 1_000;
    const mid = await repo.saveDuel(duel({ event: 'pyram' }));
    t += 1_000;
    const recent = await repo.saveDuel(duel({ side: 'b', theirs: [time(12_000)], status: 'done' }));
    // Gravar de novo o mais antigo não o traz para o topo: a ordem é a da criação.
    t += 1_000;
    const oldAgain = await repo.saveDuel({ ...duel({ linkId: old.linkId }), status: 'waiting' });
    expect((await repo.listDuels()).map((d) => d.id)).toEqual([recent.id, mid.id, old.id]);
    await repo.deleteDuel(mid.id);
    expect(await repo.listDuels()).toEqual([recent, oldAgain]);
    const all = await repo.listDuels({ includeDeleted: true });
    expect(all.map((d) => d.id)).toEqual([recent.id, mid.id, old.id]);
    expect(all[1].deletedAt).not.toBeNull();
  });

  it('apagar manda para a lixeira; restaurar volta; purgeTrash tira depois de 30 dias', async () => {
    const { db, repo } = await fresh();
    const a = await repo.saveDuel(duel());
    const b = await repo.saveDuel(duel());
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));

    t += 1_000;
    await repo.deleteDuel(a.id);
    const trashed = { ...a, updatedAt: t, deletedAt: t };
    expect(await repo.listDuels()).toEqual([b]);
    expect(await repo.getDuel(a.id)).toEqual(trashed); // na lixeira, ainda se lê
    expect(await repo.listTrash()).toEqual({ sessions: [], solves: [], duels: [trashed] });
    expect((await db.get('duels', a.id))?.deletionStamp).toBe(t);
    await repo.deleteDuel(a.id); // já está na lixeira: nada muda, nem aviso
    expect(await repo.getDuel(a.id)).toEqual(trashed);

    t += 1_000;
    await repo.restoreDuel(a.id);
    expect(await repo.getDuel(a.id)).toEqual({ ...a, updatedAt: t, deletedAt: null });
    expect((await db.get('duels', a.id))?.deletionStamp).toBe(t);
    expect((await repo.listTrash()).duels).toEqual([]);
    await repo.restoreDuel(a.id); // já está ativo: nada muda, nem aviso
    await expect(repo.deleteDuel('nada-a')).rejects.toThrow('nada-a');
    await expect(repo.restoreDuel('nada-a')).rejects.toThrow('nada-a');

    // Gravar de novo um desafio da lixeira o traz de volta, com uma marca nova (vence a exclusão no sync).
    await repo.deleteDuel(b.id);
    t += 1_000;
    expect(await repo.saveDuel(duel({ linkId: b.linkId }))).toMatchObject({ id: b.id, createdAt: b.createdAt, updatedAt: t, deletedAt: null });
    expect((await db.get('duels', b.id))?.deletionStamp).toBe(t);

    // A lixeira, mais nova primeiro; a regra dos solves: some depois do prazo (no limite exato ainda fica).
    await repo.deleteDuel(a.id);
    const deletedAt = (await repo.getDuel(a.id))!.deletedAt!;
    expect((await repo.listTrash()).duels.map((d) => d.id)).toEqual([a.id]);
    t = deletedAt + 30 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    expect((await repo.listTrash()).duels.map((d) => d.id)).toEqual([a.id]);
    t += 1;
    expect(await repo.purgeTrash(30 * DAY)).toBe(1);
    expect(await repo.getDuel(a.id)).toBeNull();
    expect((await repo.listDuels({ includeDeleted: true })).map((d) => d.id)).toEqual([b.id]);
    expect(heard).toEqual(['duels', 'duels', 'duels', 'duels', 'duels', 'duels']);
  });

  it('os desafios não aparecem em listSolves nem mudam as estatísticas', async () => {
    const { db, repo } = await fresh();
    const session = await repo.createSession({ event: '333' });
    for (const ms of [30_000, 28_000, 31_000, 29_000, 27_000]) {
      t += 60_000;
      await repo.addSolve({ sessionId: session.id, event: '333', ms, penalty: null, at: t, scramble: "R U R'" });
    }
    const seen = async () => {
      const solves = await repo.listSolves();
      return {
        solves,
        byEvent: await repo.listSolves({ event: '333' }),
        bySession: await repo.listSolves({ sessionId: session.id }),
        everything: await repo.listSolves({ includeDeleted: true }),
        stats: [bestSingle(solves), averageOf(solves, 5), currentStreak(solves, t), solvesOnDay(solves, t).length],
        stored: await db.count('solves'),
      };
    };
    const before = await seen();
    // Desafios muito mais rápidos que tudo: se algum entrasse nos solves, o melhor single e a média mudariam.
    const fast = await repo.saveDuel(duel({ mine: [time(1_000), time(1_100), time(1_200), time(1_300), time(1_400), time(1_500), time(1_600)], status: 'waiting' }));
    await repo.saveDuel(duel({ side: 'b', mine: [time(900)], theirs: [time(1_000)] }));
    await repo.deleteDuel(fast.id);
    await repo.restoreDuel(fast.id);
    expect(await seen()).toEqual(before);
    expect(before.stats.slice(0, 2)).toEqual([27_000, 29_000]);
  });

  it('exportAll leva os desafios; importAll e replaceAll os trazem de volta', async () => {
    const { repo: source } = await fresh();
    const kept = await source.saveDuel(duel({ theirs: [time(12_000)], theirName: 'Bia', status: 'done' }));
    t += 1_000;
    const gone = await source.saveDuel(duel({ event: 'minx' }));
    await source.deleteDuel(gone.id);
    const goneNow = (await source.getDuel(gone.id))!;

    // O arquivo leva os dois (a lixeira inclusa, como os solves), em ordem de criação e sem as datas do sync; sem a lixeira, só o ativo.
    const file = parseKlickJson(toKlickJson(await source.exportAll()));
    expect(file.duels).toEqual([kept, goneNow]);
    expect((await source.exportAll({ includeDeleted: false })).duels).toEqual([kept]);

    // Importar num aparelho vazio traz igual; importar de novo não duplica nem avisa.
    const { repo: target } = await fresh();
    const heard: ChangeKind[] = [];
    target.onChange((k) => heard.push(k));
    expect(await target.importAll(file)).toEqual({ sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 });
    expect(await target.listDuels({ includeDeleted: true })).toEqual([goneNow, kept]);
    await target.importAll(file);
    expect(await target.listDuels({ includeDeleted: true })).toEqual([goneNow, kept]);
    expect(heard).toEqual(['all']);

    // Junta pelo id: fica o de updatedAt maior (o daqui mais novo não volta atrás; o do arquivo mais novo entra).
    t += 1_000;
    const mine = await target.saveDuel({ ...duel({ linkId: kept.linkId }), myName: 'Ana editado' });
    await target.importAll(file);
    expect(await target.getDuel(kept.id)).toEqual(mine);
    const newer: Duel = { ...mine, theirName: 'Bia de novo', updatedAt: mine.updatedAt + 1 };
    await target.importAll({ ...file, duels: [newer] });
    expect(await target.getDuel(kept.id)).toEqual(newer);

    // Restaurar troca os desafios pelos da cópia: os dela voltam como estavam (com a data da restauração), o que não está nela vai para a
    // lixeira, e uma cópia sem desafios (de antes deles) não mexe nos daqui.
    const extra = await target.saveDuel(duel());
    t += 1_000;
    await target.replaceAll(file);
    const strip = ({ updatedAt: _u, ...d }: Duel) => d;
    const back = await target.listDuels({ includeDeleted: true });
    expect(back.map((d) => d.id)).toEqual([extra.id, gone.id, kept.id]);
    expect(back.map(strip)).toEqual([{ ...strip(extra), deletedAt: t }, strip(goneNow), strip(kept)]);
    // Só o que muda ganha a data da restauração: o que sobrava (extra) e o que a cópia tem diferente (kept, editado depois); a lixeira
    // igual à da cópia (gone) fica com a data que tinha.
    expect(back.map((d) => [d.id, d.updatedAt === t])).toEqual([[extra.id, true], [gone.id, false], [kept.id, true]]);
    const { duels: _d, ...older } = file;
    const beforeOld = await target.listDuels({ includeDeleted: true });
    await target.replaceAll(older);
    expect(await target.listDuels({ includeDeleted: true })).toEqual(beforeOld);
    await target.replaceAll({ ...file, duels: 'quebrado' as unknown as Duel[] });
    expect(await target.listDuels({ includeDeleted: true })).toEqual(beforeOld);
    await target.replaceAll({ ...file, duels: [] });
    expect(await target.listDuels()).toEqual([]);
  });
});
