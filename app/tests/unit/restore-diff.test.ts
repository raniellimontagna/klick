import { describe, expect, it } from 'vitest';
import { diffSlice, prefsRestoreChanges, stampSteps, type RestoreCopy, type RestoreStep } from '../../src/core/sync/restore';
import { prefToChange, toChange, type RecordStore } from '../../src/core/sync/records';
import type { Change } from '../../src/core/sync/types';

const T0 = 1_791_500_000_000;
const solveRec = (id: string, o: { ms?: number; deletedAt?: number | null; updatedAt?: number; deletionStamp?: number } = {}) => ({
  id, sessionId: 's', event: '333', ms: o.ms ?? 1000, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0,
  updatedAt: o.updatedAt ?? T0, deletedAt: o.deletedAt ?? null, deletionStamp: o.deletionStamp ?? T0,
});
const solve = (id: string, o: Parameters<typeof solveRec>[1] = {}): Change => toChange('solves', solveRec(id, o) as never);
const sessionRec = { id: 's', name: 'Sessão 1', event: '333', order: 0, createdAt: T0, updatedAt: T0, deletedAt: null, deletionStamp: T0 };
const session = toChange('sessions', sessionRec as never);
const practiceRec = (id: string) => ({ id, caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: T0, updatedAt: T0, deletedAt: null, deletionStamp: T0 });
const duelRec = (id: string) => ({ id, linkId: id, side: 'a', event: '333', scrambles: [], mine: [], theirs: null, myName: 'Ana', theirName: '', status: 'playing', createdAt: T0, updatedAt: T0, deletedAt: null, deletionStamp: T0 });

// Um registro da cópia: sem as datas do sync (a cópia não leva deletionStamp), como no arquivo do Klick.
const bare = <R extends object>(r: R): object => {
  const { deletionStamp: _d, ...rest } = r as R & { deletionStamp?: number };
  return rest;
};
const copyOf = (o: Partial<RestoreCopy> = {}): RestoreCopy => ({ sessions: [], solves: [], practice: [], duels: [], ...o });
const keyOf = (s: RestoreStep): string => (s.kind === 'copy' ? `copy ${s.store}/${(s.rec as { id: string }).id}` : `tombstone ${s.change.store}/${s.change.id}`);
const keys = (steps: RestoreStep[]): string[] => steps.map(keyOf).sort();

describe('diffSlice: só o que muda', () => {
  it('um registro igual nos dois lados não é regravado', () => {
    const { steps } = diffSlice([session, solve('a')], copyOf({ sessions: [bare(sessionRec)], solves: [bare(solveRec('a'))] }));
    expect(steps).toEqual([]);
  });

  it('um registro igual, só com datas de edição diferentes, também não é regravado', () => {
    const { steps } = diffSlice([solve('a', { updatedAt: T0 + 50, deletionStamp: T0 + 60 })], copyOf({ solves: [bare(solveRec('a'))] }));
    expect(steps).toEqual([]);
  });

  it('conteúdo diferente, exclusão diferente ou só na cópia: um passo copy', () => {
    const current = [solve('muda', { ms: 999 }), solve('apagado-aqui', { deletedAt: T0 + 1 }), solve('apagado-na-copia')];
    const copy = copyOf({
      solves: [bare(solveRec('muda')), bare(solveRec('apagado-aqui')), bare(solveRec('apagado-na-copia', { deletedAt: T0 + 2 })), bare(solveRec('so-na-copia'))],
    });
    const { steps } = diffSlice(current, copy);
    expect(keys(steps)).toEqual(['copy solves/apagado-aqui', 'copy solves/apagado-na-copia', 'copy solves/muda', 'copy solves/so-na-copia']);
    for (const s of steps) expect(s.kind).toBe('copy');
  });

  it('um solve apagado nos dois lados, com a mesma marca de conteúdo, não é regravado', () => {
    const { steps } = diffSlice([solve('a', { deletedAt: T0 + 1 })], copyOf({ solves: [bare(solveRec('a', { deletedAt: T0 + 9 }))] }));
    expect(steps).toEqual([]);
  });

  it('só agora e ativo: tombstone; só agora e já apagado: nada', () => {
    const { steps } = diffSlice([solve('ativo'), solve('apagado', { deletedAt: T0 + 1 })], copyOf());
    expect(steps).toEqual([{ kind: 'tombstone', change: solve('ativo') }]);
  });

  // Review Focus 3: a cópia de antes do treino ou dos desafios não leva as listas, e o que há agora fica como está.
  it('cópia sem practice ou sem duels: os de agora ficam como estão', () => {
    const current = [toChange('practice', practiceRec('p') as never), toChange('duels', duelRec('d') as never), solve('x')];
    const { steps } = diffSlice(current, copyOf({ practice: null, duels: null }));
    expect(keys(steps)).toEqual(['tombstone solves/x']);
    const withLists = diffSlice(current, copyOf());
    expect(keys(withLists.steps)).toEqual(['tombstone duels/d', 'tombstone practice/p', 'tombstone solves/x']);
  });

  it('as prefs de agora são ignoradas', () => {
    const { steps, floor } = diffSlice([prefToChange({ key: 'trail.0', value: true, updatedAt: T0 + 500 })], copyOf());
    expect(steps).toEqual([]);
    expect(floor).toBe(0);
  });

  it('limit: para no limit + 1', () => {
    const current = ['a', 'b', 'c', 'd', 'e'].map((id) => solve(id));
    const { steps } = diffSlice(current, copyOf(), 2);
    expect(steps).toHaveLength(3);
    // Sem passos acima do limite, devolve todos.
    expect(diffSlice(current, copyOf(), 5).steps).toHaveLength(5);
    // O que sobra da cópia também conta para o limite.
    expect(diffSlice([], copyOf({ solves: ['a', 'b', 'c', 'd'].map((id) => bare(solveRec(id))) }), 1).steps).toHaveLength(2);
  });

  it('floor é o maior updatedAt + 1 ou deletionStamp + 1 visitado', () => {
    expect(diffSlice([], copyOf()).floor).toBe(0);
    const current = [solve('a', { updatedAt: T0 + 10, deletionStamp: T0 + 3 }), solve('b', { updatedAt: T0 + 2, deletionStamp: T0 + 40 }), solve('c')];
    expect(diffSlice(current, copyOf({ solves: [bare(solveRec('a')), bare(solveRec('b')), bare(solveRec('c'))] })).floor).toBe(T0 + 41);
    expect(diffSlice([solve('a', { updatedAt: T0 + 10 })], copyOf()).floor).toBe(T0 + 11);
  });

  it('o current pode ser um iterável de uma passada só', () => {
    function* gen(): Generator<Change> {
      yield solve('a');
      yield solve('b');
    }
    expect(keys(diffSlice(gen(), copyOf({ solves: [bare(solveRec('a'))] })).steps)).toEqual(['tombstone solves/b']);
  });
});

describe('stampSteps', () => {
  it('copy por store na ordem de hoje, depois tombstones', () => {
    const steps: RestoreStep[] = [
      { kind: 'tombstone', change: solve('velho') },
      { kind: 'copy', store: 'duels' as RecordStore, rec: duelRec('d') },
      { kind: 'copy', store: 'practice', rec: practiceRec('p') },
      { kind: 'copy', store: 'solves', rec: solveRec('a') },
      { kind: 'copy', store: 'sessions', rec: sessionRec },
    ];
    const stamp = T0 + 1000;
    const out = stampSteps(steps, stamp);
    expect(out.map((c) => `${c.store}/${c.id}`)).toEqual(['sessions/s', 'solves/a', 'practice/p', 'duels/d', 'solves/velho']);
    expect(out[1]).toMatchObject({ updatedAt: stamp, deletedAt: null, deletionStamp: stamp });
    expect(out[4]).toMatchObject({ updatedAt: stamp, deletedAt: stamp, deletionStamp: stamp });
  });

  it('a marca de exclusão da cópia passa por stampOf e nunca fica depois do carimbo', () => {
    const stamp = T0 + 1000;
    const out = stampSteps(
      [
        { kind: 'copy', store: 'solves', rec: solveRec('fracao', { deletedAt: 1_500.5 }) },
        { kind: 'copy', store: 'solves', rec: solveRec('futuro', { deletedAt: T0 * 1000 }) },
      ],
      stamp,
    );
    expect(out.map((c) => c.deletedAt)).toEqual([1_500, stamp]);
  });
});

describe('prefsRestoreChanges', () => {
  const stamp = T0 + 1000;
  it('prefs: só as chaves que mudam; a que já está no padrão não volta a ele', () => {
    const current = [
      prefToChange({ key: 'trail.0', value: true, updatedAt: T0 }), // a conta restaurada diz true: igual
      prefToChange({ key: 'trail.1', value: true, updatedAt: T0 }), // a conta restaurada diz false: muda
      prefToChange({ key: 'lessonAt.3', value: 2, updatedAt: T0 }), // não está nela, e o padrão é null: volta
      prefToChange({ key: 'lessonAt.4', value: null, updatedAt: T0 }), // já no padrão: fica
      prefToChange({ key: 'trainOff.caso-que-saiu', value: true, updatedAt: T0 }), // desconhecida: fica
    ];
    const prefs = new Map<string, unknown>([['trail.0', true], ['trail.1', false], ['trail.2', false]]);
    const out = prefsRestoreChanges(current, prefs, stamp);
    expect(out.map((c) => `${c.id}=${JSON.stringify(c.data)}`).sort()).toEqual(['lessonAt.3=null', 'trail.1=false', 'trail.2=false']);
    for (const c of out) expect(c).toMatchObject({ store: 'prefs', updatedAt: stamp, deletedAt: null, deletionStamp: stamp });
  });

  it('um valor igual com as chaves em outra ordem não muda', () => {
    const current = [prefToChange({ key: 'season', value: { a: 1, b: { c: 2, d: 3 } }, updatedAt: T0 })];
    expect(prefsRestoreChanges(current, new Map([['season', { b: { d: 3, c: 2 }, a: 1 }]]), stamp)).toEqual([]);
  });

  it('prefs null não mexe em nada', () => {
    expect(prefsRestoreChanges([prefToChange({ key: 'trail.0', value: true, updatedAt: T0 })], null, stamp)).toEqual([]);
  });
});
