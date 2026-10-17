import { describe, expect, it } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { canonicalJson, cascade, merge, mergeSeason } from '../../src/core/sync/merge';
import { compacted } from '../../src/core/sync/records';
import type { Change } from '../../src/core/sync/types';
import type { SeasonProgress, SeasonRecord } from '../../src/core/types';
import { seeded } from './sync-random';

const solve = (o: Partial<Change> & { data?: Record<string, unknown> } = {}): Change => ({
  store: 'solves',
  id: 'x',
  data: { sessionId: 's', event: '333', ms: 1000, penalty: null, at: 1, scramble: 'R', note: '', createdAt: 1 },
  updatedAt: 10,
  deletedAt: null,
  deletionStamp: 10,
  ...o,
});
const note = (c: Change): unknown => (c.data as { note: unknown }).note;

describe('regras de conflito (spec 6.3)', () => {
  it('regra 1: vence o conteúdo de updatedAt maior', () => {
    const a = solve({ data: { note: 'a' }, updatedAt: 20 });
    const b = solve({ data: { note: 'b' }, updatedAt: 30 });
    expect(note(merge(a, b))).toBe('b');
    expect(merge(a, b).updatedAt).toBe(30);
  });

  it('regra 1: no empate de updatedAt vence o JSON canônico maior, dos dois lados', () => {
    const a = solve({ data: { note: 'a' } });
    const b = solve({ data: { note: 'b' } });
    expect(note(merge(a, b))).toBe('b');
    expect(note(merge(b, a))).toBe('b');
  });

  it('regra 2 (D5): uma edição mais nova não desfaz a exclusão', () => {
    const deleted = solve({ deletedAt: 20, deletionStamp: 20, updatedAt: 20 });
    const edited = solve({ data: { note: 'nota offline' }, updatedAt: 30 });
    const out = merge(deleted, edited);
    expect(out.deletedAt).toBe(20);
    expect(note(out)).toBe('nota offline');
    expect(merge(edited, deleted)).toEqual(out);
  });

  it('regra 2: restaurar (deletionStamp novo) vence a exclusão anterior', () => {
    const deleted = solve({ deletedAt: 20, deletionStamp: 20, updatedAt: 20 });
    const restored = solve({ deletedAt: null, deletionStamp: 40, updatedAt: 40 });
    expect(merge(deleted, restored).deletedAt).toBeNull();
    expect(merge(restored, deleted).deletedAt).toBeNull();
  });

  it('regra 2: no empate de deletionStamp, o excluído vence', () => {
    const deleted = solve({ deletedAt: 20, deletionStamp: 20 });
    const active = solve({ deletedAt: null, deletionStamp: 20 });
    expect(merge(active, deleted).deletedAt).toBe(20);
    expect(merge(deleted, active).deletedAt).toBe(20);
  });

  it('regra 4: desmarcar uma etapa mais tarde vence a marca anterior', () => {
    const on: Change = { store: 'prefs', id: 'trail.2', data: true, updatedAt: 10, deletedAt: null, deletionStamp: 10 };
    const off: Change = { ...on, data: false, updatedAt: 11, deletionStamp: 11 };
    expect(merge(on, off).data).toBe(false);
    expect(merge(off, on).data).toBe(false);
  });

  // A marca compactada (records.ts): de um solve apagado há mais de 30 dias, o servidor guarda só as datas. Sem a regra, no empate de
  // updatedAt o '{}' venceria pelo texto canônico ('}' vem depois de '"') e apagaria o conteúdo do aparelho.
  it('a marca compactada nunca vence o conteúdo, nem no empate de datas', () => {
    const full = solve({ data: { note: 'cheio', ms: 1234 }, updatedAt: 20, deletedAt: 20, deletionStamp: 20 });
    const mark = compacted(full); // as mesmas datas: o empate exato
    for (const out of [merge(full, mark), merge(mark, full)]) {
      expect(out.data).toEqual(full.data);
      expect(out.deletedAt).toBe(mark.deletedAt);
    }
    // Um aparelho que ficou fora com o solve ativo, mais velho que a exclusão: o conteúdo é o dele, a exclusão é a da marca.
    const away = solve({ updatedAt: 5, deletionStamp: 5 });
    const later = compacted(solve({ updatedAt: 40, deletedAt: 40, deletionStamp: 40 }));
    for (const out of [merge(away, later), merge(later, away)]) expect(out).toEqual({ ...away, deletedAt: 40, deletionStamp: 40 });
    // Restaurar da lixeira (deletionStamp novo) vence a marca, com o conteúdo de quem restaurou.
    const restored = solve({ updatedAt: 50, deletionStamp: 50 });
    expect(merge(later, restored)).toEqual(restored);
    // Entre duas marcas, fica a de updatedAt maior: o conteúdo continua vazio.
    expect(merge(mark, later)).toEqual(later);
  });

  it('o JSON canônico ignora a ordem das chaves e as chaves undefined', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] })).toBe(canonicalJson({ a: [2, { d: 3 }], b: 1 }));
    expect(canonicalJson(undefined)).toBe('null');
  });
});

describe('a cascata da sessão apagada (spec 6.3, regra 3)', () => {
  const session = (o: Partial<Change> = {}): Change => ({
    store: 'sessions', id: 's', data: { name: 'S', event: '333', order: 0, createdAt: 1 }, updatedAt: 50, deletedAt: 50, deletionStamp: 50, ...o,
  });

  it('um solve ativo mais antigo que a exclusão recebe a marca da sessão; o já excluído fica como está', () => {
    const live = solve({ id: 'a', updatedAt: 70, deletionStamp: 10 }); // editado offline depois da exclusão: não a ressuscita
    const gone = solve({ id: 'b', deletedAt: 30, deletionStamp: 30 });
    const out = cascade(session(), [live, gone]);
    expect(out.solves).toEqual([{ ...live, deletedAt: 50, deletionStamp: 50 }]);
    expect(out.session.deletedAt).toBe(50);
  });

  it('um solve gravado depois da exclusão devolve a sessão, com o deletionStamp dele', () => {
    const newer = solve({ id: 'n', deletionStamp: 80, updatedAt: 80 });
    const older = solve({ id: 'o', deletionStamp: 10 });
    const out = cascade(session(), [newer, older]);
    expect(out.session).toMatchObject({ deletedAt: null, deletionStamp: 80 });
    expect(out.solves.map((s) => s.id)).toEqual(['o']);
  });

  it('sessão ativa: nada muda', () => {
    expect(cascade(session({ deletedAt: null }), [solve()])).toEqual({ session: session({ deletedAt: null }), solves: [] });
  });

  it('no empate de deletionStamp com a sessão, o solve termina excluído (o limite do >=)', () => {
    const tie = solve({ id: 't', deletionStamp: 50, updatedAt: 10 });
    const out = cascade(session(), [tie]);
    expect(out.solves).toEqual([{ ...tie, deletedAt: 50, deletionStamp: 50 }]);
    expect(out.session).toEqual(session());
  });
});

describe('temporadas (spec 6.4): o servidor decide', () => {
  const rec = (n: number, endedAt: number): SeasonRecord => ({ n, startedAt: 0, endedAt, solves: 1000, startAo12: null, endAo12: null });
  const season = (past: SeasonRecord[]): SeasonProgress => ({ ...defaultSeason(), past, current: { ...defaultSeason().current, n: past.length + 1 } });
  const pref = (data: SeasonProgress, updatedAt: number): Change => ({ store: 'prefs', id: 'season', data, updatedAt, deletedAt: null, deletionStamp: updatedAt });

  it('1: vence o lado com mais temporadas fechadas', () => {
    const out = mergeSeason(pref(season([rec(1, 100)]), 5), pref(season([rec(1, 100), rec(2, 200)]), 3));
    expect((out.data as SeasonProgress).past).toHaveLength(2);
    expect(out.updatedAt).toBe(5);
  });

  it('2: com o mesmo número, vence a virada mais antiga', () => {
    const out = mergeSeason(pref(season([rec(1, 300)]), 5), pref(season([rec(1, 200)]), 9));
    expect((out.data as SeasonProgress).past[0].endedAt).toBe(200);
  });

  it('3: sem fechadas ou no empate exato, fica a armazenada, com updatedAt do maior (o outro aparelho recebe de volta)', () => {
    const stored = pref(season([rec(1, 200)]), 5);
    const out = mergeSeason(stored, pref(season([{ ...rec(1, 200), solves: 1 }]), 9));
    expect((out.data as SeasonProgress).past[0].solves).toBe(1000);
    expect(out.updatedAt).toBe(9);
    expect((mergeSeason(pref(defaultSeason(), 1), pref(defaultSeason(), 2)).data as SeasonProgress).past).toEqual([]);
  });

  it('1 (o sentido contrário): a armazenada com mais fechadas vence, mesmo que a recebida seja mais nova; a temporada nunca regride', () => {
    const stored = pref(season([rec(1, 100), rec(2, 200)]), 5);
    const out = mergeSeason(stored, pref(season([rec(1, 100)]), 9));
    expect(out.data).toEqual(stored.data);
    expect((out.data as SeasonProgress).past).toHaveLength(2);
    expect(out.updatedAt).toBe(9); // o aparelho que mandou a menor recebe a maior de volta
  });

  it('3: sem fechadas dos dois lados, mas com a temporada atual diferente, fica a armazenada', () => {
    const base = season([]);
    const stored = pref({ ...base, current: { ...base.current, startedAt: 111 } }, 5);
    const received = pref({ ...base, current: { ...base.current, startedAt: 222 } }, 9);
    expect((mergeSeason(stored, received).data as SeasonProgress).current.startedAt).toBe(111);
    expect((mergeSeason(received, stored).data as SeasonProgress).current.startedAt).toBe(222); // quem guarda decide: não é simétrica
  });
});

describe('propriedades de merge (spec 11): comutativa, associativa e idempotente', () => {
  const rnd = seeded(20261015);
  const int = (n: number): number => Math.floor(rnd() * n);
  // Domínios pequenos, para empatar de propósito em updatedAt, deletionStamp e conteúdo.
  const gen = (): Change => {
    const c = solve({
      data: { note: ['a', 'b', 'c'][int(3)], ms: int(2) },
      updatedAt: 10 + int(3),
      deletedAt: rnd() < 0.5 ? 20 + int(2) : null,
      deletionStamp: 10 + int(3),
    });
    const kind = rnd();
    // A marca compactada: um solve apagado sem o conteúdo, com as datas do mesmo domínio (empata com os cheios).
    if (kind < 0.25) return compacted({ ...c, deletedAt: 20 + int(2) });
    // Um solve sem conteúdo e ativo (checkChange o recusa): a ordem do conteúdo não olha a exclusão, e as propriedades valem com ele também.
    if (kind < 0.3) return { ...c, data: {}, deletedAt: null };
    return c;
  };

  it('vale em 5.000 trincas sorteadas', () => {
    for (let i = 0; i < 5000; i++) {
      const [a, b, c] = [gen(), gen(), gen()];
      expect(canonicalJson(merge(a, b))).toBe(canonicalJson(merge(b, a)));
      expect(canonicalJson(merge(merge(a, b), c))).toBe(canonicalJson(merge(a, merge(b, c))));
      expect(canonicalJson(merge(a, a))).toBe(canonicalJson(a));
    }
  });
});
