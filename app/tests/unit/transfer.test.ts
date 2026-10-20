import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  csTimerSessionId, csTimerSolveId, csTimerToKlick, parseCsTimer, parseKlickJson, readV1, readV1Invalid, toCsTimerJson, toKlickJson, v1ToKlick,
  V1_KEY,
} from '../../src/data/transfer';
import type { CsTimerSession, CsTimerSolve } from '../../src/data/transfer';
import { EVENT_IDS, eventInfo } from '../../src/core/events';
import { defaultSettings } from '../../src/core/types';
import type { Duel, DuelTime, EventId, Session, Solve } from '../../src/core/types';
import { createRepository, type KlickExport } from '../../src/data/repository';
import { openKlickDb } from '../../src/data/db';

// Caminho relativo a este arquivo. Não usa `new URL(\`../fixtures/${name}\`, import.meta.url)`: no ambiente jsdom o Vite o
// reescreve para resolver contra self.location e o fs recusa a URL (mesmo motivo do contrast.test.ts).
const fixture = (name: string) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures', name), 'utf8');
const ctx = (existingSessions: Session[] = [], existingSolves: Solve[] = []) => ({ now: 1_791_500_000_000, existingSessions, existingSolves });

// --- Apoio dos testes acrescentados (os do plano ficam como vieram) ---

const NOW = ctx().now;
const KLICK_INVALID = 'Arquivo do Klick inválido.';
const CSTIMER_INVALID = 'Arquivo do csTimer inválido.';
const AT = 1_791_400_000_000; // um segundo inteiro, como o csTimer guarda

const mkSession = (over: Partial<Session> = {}): Session => ({
  id: 's1', name: 'Sessão 1', event: '333', order: 0, createdAt: 1_000, updatedAt: 1_000, deletedAt: null, ...over,
});
const mkSolve = (over: Partial<Solve> = {}): Solve => ({
  id: 'v1', sessionId: 's1', event: '333', ms: 10_000, penalty: null, at: AT, scramble: "R U R'", note: '',
  createdAt: 1_000, updatedAt: 1_000, deletedAt: null, ...over,
});

// Um arquivo do Klick com de tudo: sessão excluída, os três estados de penalidade, ms 0, solve excluído e perfil.
const fullExport = (): KlickExport => ({
  format: 'klick',
  version: 1,
  exportedAt: NOW,
  sessions: [mkSession(), mkSession({ id: 's2', name: 'Pyra', event: 'pyram', order: 1, deletedAt: 9_000 })],
  solves: [
    mkSolve({ id: 'a' }),
    mkSolve({ id: 'b', penalty: '+2', note: 'cruz', ms: 0 }),
    mkSolve({ id: 'c', sessionId: 's2', event: 'pyram', penalty: 'DNF', at: AT + 1_500, deletedAt: 9_000 }),
  ],
  profile: { settings: defaultSettings(), trail: Array<boolean>(9).fill(false), finish: 'gelo', onboarded: true, currentSessionId: 's1' },
});

type Loose = Record<string, unknown>;
// O arquivo completo, alterado por `change`, já em texto. Valor undefined some do JSON, como um campo que não veio.
const broken = (change: (d: Loose) => void): string => {
  const d: Loose = { ...fullExport() };
  change(d);
  return JSON.stringify(d);
};
// O último registro da lista: um defeito no fim não pode passar só porque o primeiro está certo.
const lastRecord = (d: Loose, key: 'sessions' | 'solves'): Loose => (d[key] as Loose[]).at(-1)!;

// Congela por inteiro: quem tentar alterar um dado recebido lança TypeError (módulos ESM rodam em modo estrito).
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

describe('formato Klick', () => {
  it('ida e volta sem perda', () => {
    const data: KlickExport = { format: 'klick', version: 1, exportedAt: 1, sessions: [], solves: [], profile: null };
    expect(parseKlickJson(toKlickJson(data))).toEqual(data);
  });
  it('arquivo errado dá erro claro', () => {
    expect(() => parseKlickJson('{"format":"outro"}')).toThrow('Arquivo do Klick inválido.');
    expect(() => parseKlickJson('não é json')).toThrow('Arquivo do Klick inválido.');
  });

  it('o JSON sai com 2 espaços', () => {
    const data = fullExport();
    expect(toKlickJson(data)).toBe(JSON.stringify(data, null, 2));
    expect(toKlickJson(data)).toContain('\n  "format": "klick"');
  });
  it('ida e volta com sessões, solves (inclusive os excluídos) e perfil', () => {
    const data = fullExport();
    expect(parseKlickJson(toKlickJson(data))).toEqual(data);
  });
  it('campos que o Klick ainda não conhece passam intactos', () => {
    const data = fullExport();
    const extra = { ...data, device: 'abc', solves: data.solves.map((s) => ({ ...s, tag: 'x' })) };
    expect(parseKlickJson(JSON.stringify(extra))).toEqual(extra);
  });
  it('o arquivo do Klick leva as fases e um Klick de antes o importa', async () => {
    const withPhases = { ...fullExport(), solves: [mkSolve({ id: 'f', ms: 12_000, phases: [3_000, 4_000, 5_000] }), mkSolve({ id: 'g', at: AT + 1_000 })] };
    // O texto traz o campo, e a leitura (o isSolve) aceita o solve com ele e o devolve intacto.
    const file = parseKlickJson(toKlickJson(withPhases));
    expect(file.solves[0].phases).toEqual([3_000, 4_000, 5_000]);
    expect('phases' in file.solves[1]).toBe(false);
    // Um Klick de antes não conhece `phases`: os campos que ele checa são os de sempre, e o resto passa. Aqui o arquivo sem o campo, e
    // o mesmo com ele, entram pela mesma importação e voltam como estavam.
    const repo = createRepository(await openKlickDb('transfer-fases'), { now: () => NOW, channel: null });
    await repo.importAll(file);
    const back = await repo.exportAll();
    expect(back.solves.find((s) => s.id === 'f')?.phases).toEqual([3_000, 4_000, 5_000]);
    expect('phases' in back.solves.find((s) => s.id === 'g')!).toBe(false);
  });
  it('o arquivo do csTimer não passa por arquivo do Klick (a tela tenta um e depois o outro)', () => {
    expect(() => parseKlickJson(fixture('cstimer-export.txt'))).toThrow(KLICK_INVALID);
  });

  it('o arquivo do Klick leva e traz o nome', async () => {
    // O nome sai no perfil do export, volta pelo arquivo e vai para a conta de quem importa.
    const from = createRepository(await openKlickDb('transfer-nome-a'), { now: () => NOW, channel: null });
    await from.saveProfile({ duelName: 'Ana' });
    const file = parseKlickJson(toKlickJson(await from.exportAll()));
    expect(file.profile?.duelName).toBe('Ana');
    const to = createRepository(await openKlickDb('transfer-nome-b'), { now: () => NOW, channel: null });
    expect((await to.getProfile()).duelName).toBe('');
    await to.importAll(file);
    expect((await to.getProfile()).duelName).toBe('Ana');
    // Um arquivo sem nome (de antes dos desafios) não apaga o daqui; o nome fora do formato fica de fora na leitura e na importação.
    await to.importAll({ ...file, profile: { ...file.profile, duelName: undefined } });
    expect((await to.getProfile()).duelName).toBe('Ana');
    const withName = (duelName: unknown): string => JSON.stringify({ ...fullExport(), profile: { duelName } });
    expect(parseKlickJson(withName('x'.repeat(21))).profile).toEqual({});
    expect(parseKlickJson(withName(' Ana ')).profile).toEqual({});
    expect(parseKlickJson(withName('Ana\nBia')).profile).toEqual({});
    expect(parseKlickJson(withName(7)).profile).toEqual({});
    expect(parseKlickJson(withName('')).profile).toEqual({ duelName: '' });
    await to.importAll({ ...file, profile: { duelName: 'x'.repeat(21) } });
    expect((await to.getProfile()).duelName).toBe('Ana');
  });

  it('arquivo com desafios entra; desafio inválido fica de fora; arquivo sem duels continua valendo', () => {
    const times = (n: number): DuelTime[] => Array.from({ length: n }, (_, i) => ({ ms: 10_000 + i, penalty: i === 1 ? '+2' : i === 2 ? 'DNF' : null }));
    const mkDuel = (over: Partial<Duel> = {}): Duel => ({
      id: 'abcd1234efgh5678-a', linkId: 'abcd1234efgh5678', side: 'a', event: '333', scrambles: Array.from({ length: 7 }, (_, i) => `R U F${i}`),
      mine: times(7), theirs: null, myName: 'Ana', theirName: '', status: 'waiting', createdAt: 2_000, updatedAt: 3_000, deletedAt: null, ...over,
    });
    const good = mkDuel();
    const answered = mkDuel({ id: 'abcd1234efgh5678-b', side: 'b', mine: times(4), theirs: times(7), myName: '', theirName: 'Bia', status: 'done', deletedAt: 4_000 });
    const extra = { ...mkDuel({ id: 'zzzz9999-a', linkId: 'zzzz9999', event: 'clock' }), tag: 'campo novo' }; // campo desconhecido passa intacto
    const bad: unknown[] = [
      null, 5, 'desafio', [],
      mkDuel({ id: 'abcd1234efgh5678-b' }), // o id não é `${linkId}-${side}`
      mkDuel({ id: 'abc-a', linkId: 'abc' }), // linkId curto demais
      mkDuel({ id: 'ABCD1234-a', linkId: 'ABCD1234' }), // linkId com maiúsculas
      mkDuel({ id: 'abcd1234efgh5678-c', side: 'c' as never }),
      mkDuel({ event: 'xyz' as never }),
      mkDuel({ scrambles: ['R'] }),
      mkDuel({ scrambles: [...good.scrambles.slice(1), ''] }),
      mkDuel({ scrambles: [...good.scrambles.slice(1), 5 as never] }),
      mkDuel({ mine: times(8) }),
      mkDuel({ mine: [{ ms: -1, penalty: null }] }),
      mkDuel({ mine: [{ ms: 1.5, penalty: null }] }),
      mkDuel({ mine: [{ ms: 1000, penalty: '+4' as never }] }),
      mkDuel({ mine: undefined as never }),
      mkDuel({ theirs: times(8) }),
      mkDuel({ theirs: 'nada' as never }),
      mkDuel({ myName: 'x'.repeat(21) }),
      mkDuel({ theirName: 5 as never }),
      mkDuel({ status: 'acabou' as never }),
      mkDuel({ createdAt: '1' as never }),
      mkDuel({ updatedAt: undefined as never }),
      mkDuel({ deletedAt: '1' as never }),
      { ...good, theirName: 'repetido' }, // mesmo id de um que já entrou: fica o primeiro
    ];
    const parsed = parseKlickJson(JSON.stringify({ ...fullExport(), duels: [good, ...bad.slice(0, 4), answered, ...bad.slice(4), extra] }));
    expect(parsed.duels).toEqual([good, answered, extra]);
    expect(parsed.solves).toEqual(fullExport().solves); // um desafio torto não recusa o arquivo

    // Sem a lista (um arquivo de antes dos desafios), ou com algo que não é lista, o arquivo entra como veio.
    const old = parseKlickJson(toKlickJson(fullExport()));
    expect(old).toEqual(fullExport());
    expect('duels' in old).toBe(false);
    const odd = parseKlickJson(JSON.stringify({ ...fullExport(), duels: { 0: good } }));
    expect(odd).toEqual(fullExport());
    expect('duels' in odd).toBe(false);
    expect(parseKlickJson(JSON.stringify({ ...fullExport(), duels: [] })).duels).toEqual([]);
  });

  // A importação aplica o perfil do arquivo por cima do daqui: um campo com tipo errado não pode chegar aos ajustes.
  describe('perfil do arquivo, campo por campo', () => {
    const withProfile = (profile: unknown): string => JSON.stringify({ ...fullExport(), profile });

    it('campo com tipo ou valor errado fica de fora; o resto passa', () => {
      const parsed = parseKlickJson(withProfile({
        settings: {
          inspection: 'sim', holdMs: 550, mobileArm: 'one', theme: 'roxo', sound: { klick: false, insp: 'x' },
          silent: true, reducedMotion: 'nunca', dailyGoal: -3, scrambleImage: false, extra: 1,
        },
        trail: [true, 'x'],
        finish: 'ouro',
        onboarded: 1,
        currentSessionId: 's1',
        extra: 1,
      }));
      expect(parsed.profile).toEqual({
        settings: { holdMs: 550, mobileArm: 'one', sound: { klick: false }, silent: true, scrambleImage: false },
        currentSessionId: 's1',
      });
    });

    it('ajustes ou sons que não são objeto ficam de fora', () => {
      expect(parseKlickJson(withProfile({ settings: 5, finish: 'brilho' })).profile).toEqual({ finish: 'brilho' });
      expect(parseKlickJson(withProfile({ settings: { sound: [], holdMs: 0 } })).profile).toEqual({ settings: { holdMs: 0 } });
    });

    it('holdMs negativo, meta que não é inteiro positivo e sessão que não é texto ficam de fora', () => {
      const parsed = parseKlickJson(withProfile({ settings: { holdMs: -1, dailyGoal: 2.5 }, currentSessionId: 7 }));
      expect(parsed.profile).toEqual({ settings: {} });
      expect(parseKlickJson(withProfile({ settings: { dailyGoal: 0 } })).profile).toEqual({ settings: {} });
      expect(parseKlickJson(withProfile({ currentSessionId: null })).profile).toEqual({ currentSessionId: null });
    });

    it('o ajuste do Centro passa só com um valor conhecido', () => {
      expect(parseKlickJson(withProfile({ settings: { centro: 'oculto' } })).profile).toEqual({ settings: { centro: 'oculto' } });
      expect(parseKlickJson(withProfile({ settings: { centro: 'girando' } })).profile).toEqual({ settings: {} });
    });

    it('os ajustes do timer (entrada, fases, tempo ao vivo e voz) passam só com um valor conhecido', () => {
      const ok = { entry: 'typing', phases: 4, liveTime: 'hidden', inspVoice: true };
      expect(parseKlickJson(withProfile({ settings: ok })).profile).toEqual({ settings: ok });
      const bad = { entry: 'voz', phases: 5, liveTime: 'meio', inspVoice: 'sim' };
      expect(parseKlickJson(withProfile({ settings: bad })).profile).toEqual({ settings: {} });
      for (const phases of [1, '3', 2.5, null, -2]) expect(parseKlickJson(withProfile({ settings: { phases } })).profile).toEqual({ settings: {} });
      expect(parseKlickJson(withProfile({ settings: { phases: 0 } })).profile).toEqual({ settings: { phases: 0 } });
    });

    it('trilha mais longa que a do Klick é cortada nas 9 etapas', () => {
      expect(parseKlickJson(withProfile({ trail: Array<boolean>(12).fill(true) })).profile).toEqual({ trail: Array<boolean>(9).fill(true) });
    });

    it('a temporada passa só inteira e bem formada', () => {
      const season = {
        current: { n: 2, startedAt: 10, marks: Array.from({ length: 9 }, () => ({ kind: 'count', target: 1 })), basis: { single: 1, ao5: null, ao12: null } },
        past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 3, startAo12: null, endAo12: null }],
      };
      expect(parseKlickJson(withProfile({ season })).profile).toEqual({ season });
      expect(parseKlickJson(withProfile({ season: { ...season, past: [...season.past, season.past[0]] } })).profile).toEqual({});
      expect(parseKlickJson(withProfile({ season: { ...season, current: { ...season.current, marks: season.current.marks.slice(1) } } })).profile).toEqual({});
    });
  });

  describe('rejeita o arquivo inteiro se alguma coisa não bate', () => {
    const ENVELOPE: Array<[string, (d: Loose) => void]> = [
      ['outro formato', (d) => { d.format = 'outro'; }],
      ['sem formato', (d) => { delete d.format; }],
      ['versão 2', (d) => { d.version = 2; }],
      ['versão como texto', (d) => { d.version = '1'; }],
      ['sem versão', (d) => { delete d.version; }],
      ['sem exportedAt', (d) => { delete d.exportedAt; }],
      ['exportedAt como texto', (d) => { d.exportedAt = 'ontem'; }],
      ['sem sessions', (d) => { delete d.sessions; }],
      ['sessions que não é lista', (d) => { d.sessions = {}; }],
      ['sem solves', (d) => { delete d.solves; }],
      ['solves que não é lista', (d) => { d.solves = 'nenhum'; }],
      ['sem profile', (d) => { delete d.profile; }],
      ['profile como texto', (d) => { d.profile = 'eu'; }],
      ['profile como lista', (d) => { d.profile = []; }],
      ['sessão que é null', (d) => { d.sessions = [null]; }],
      ['sessão que é número', (d) => { d.sessions = [5]; }],
      ['sessão que é lista', (d) => { d.sessions = [[]]; }],
      ['solve que é null', (d) => { d.solves = [null]; }],
      ['solve que é texto', (d) => { d.solves = ['x']; }],
      ['solve que é lista', (d) => { d.solves = [[]]; }],
    ];
    it.each(ENVELOPE)('%s', (_label, change) => {
      expect(() => parseKlickJson(broken(change))).toThrow(KLICK_INVALID);
    });

    it.each(['[]', 'null', '5', '"klick"', 'true', ''])('raiz %j', (text) => {
      expect(() => parseKlickJson(text)).toThrow(KLICK_INVALID);
    });

    // [campo, valor ruim]; undefined é o campo ausente. Mexe sempre no último registro da lista.
    const BAD_SESSION: Array<[string, unknown]> = [
      ['id', undefined], ['id', 5], ['name', undefined], ['name', 5],
      ['event', undefined], ['event', '3x3'], ['event', 'xyz'],
      ['order', undefined], ['order', '0'], ['order', null],
      ['createdAt', undefined], ['createdAt', null], ['updatedAt', undefined], ['updatedAt', '1'],
      ['deletedAt', undefined], ['deletedAt', '1'],
    ];
    it.each(BAD_SESSION)('sessão com %s = %j', (field, value) => {
      expect(() => parseKlickJson(broken((d) => { lastRecord(d, 'sessions')[field] = value; }))).toThrow(KLICK_INVALID);
    });

    const BAD_SOLVE: Array<[string, unknown]> = [
      ['id', undefined], ['id', 5], ['sessionId', undefined], ['sessionId', 5],
      ['event', undefined], ['event', 'xyz'], ['event', '3x3'],
      ['ms', undefined], ['ms', null], ['ms', '1000'], ['ms', -1],
      ['penalty', undefined], ['penalty', '+4'], ['penalty', 'NONE'], ['penalty', 2000],
      ['at', undefined], ['at', null], ['at', '1'],
      ['scramble', undefined], ['scramble', 5], ['note', undefined], ['note', 5],
      ['createdAt', undefined], ['createdAt', '1'], ['updatedAt', undefined], ['updatedAt', null],
      ['deletedAt', undefined], ['deletedAt', '1'],
    ];
    it.each(BAD_SOLVE)('solve com %s = %j', (field, value) => {
      expect(() => parseKlickJson(broken((d) => { lastRecord(d, 'solves')[field] = value; }))).toThrow(KLICK_INVALID);
    });

    it('número fora da faixa (1e999 vira Infinity no JSON.parse) não vale', () => {
      const text = toKlickJson(fullExport());
      const swap = (from: string, to: string): string => {
        expect(text).toContain(from); // sem isso, uma troca que não achou o alvo passaria por "não lançou"
        return text.replace(from, to);
      };
      expect(JSON.parse(swap('"ms": 0,', '"ms": 1e999,')).solves[1].ms).toBe(Infinity);
      expect(() => parseKlickJson(swap('"ms": 0,', '"ms": 1e999,'))).toThrow(KLICK_INVALID);
      expect(() => parseKlickJson(swap(`"at": ${AT + 1_500},`, '"at": 1e999,'))).toThrow(KLICK_INVALID);
      expect(() => parseKlickJson(swap(`"exportedAt": ${NOW},`, '"exportedAt": 1e999,'))).toThrow(KLICK_INVALID);
      expect(() => parseKlickJson(swap('"order": 1,', '"order": 1e999,'))).toThrow(KLICK_INVALID);
    });

    it('um defeito só, em qualquer posição da lista, derruba tudo', () => {
      const data = fullExport();
      for (let i = 0; i < data.solves.length; i++) {
        const solves = data.solves.map((s, j) => (j === i ? { ...s, event: 'xyz' } : s));
        expect(() => parseKlickJson(JSON.stringify({ ...data, solves }))).toThrow(KLICK_INVALID);
      }
      for (let i = 0; i < data.sessions.length; i++) {
        const sessions = data.sessions.map((s, j) => (j === i ? { ...s, event: 'xyz' } : s));
        expect(() => parseKlickJson(JSON.stringify({ ...data, sessions }))).toThrow(KLICK_INVALID);
      }
    });
  });
});

describe('csTimer', () => {
  it('lê sessões, eventos, penalidades, notas e datas', () => {
    const s = parseCsTimer(fixture('cstimer-export.txt'));
    expect(s.map((x) => [x.key, x.name, x.event])).toEqual([
      ['session1', 'Main', '333'], ['session2', '2x2', '222'], ['session3', 'ZBLL', null],
    ]);
    expect(s[0].solves).toEqual([
      { ms: 61234, penalty: null, scramble: "R U R' U'", note: '', at: 1791400000000 },
      { ms: 58000, penalty: '+2', scramble: 'F R U', note: 'cruz', at: 1791400100000 },
      { ms: 70000, penalty: 'DNF', scramble: 'L D', note: '', at: 1791400200000 },
    ]);
  });
  it('arquivo errado dá erro claro', () => {
    expect(() => parseCsTimer('{}')).toThrow('Arquivo do csTimer inválido.');
  });
  it('converte com o mapeamento; sessão sem evento e sem mapeamento fica de fora', () => {
    const parsed = parseCsTimer(fixture('cstimer-export.txt'));
    const r = csTimerToKlick(parsed, {}, ctx());
    expect(r.sessions.map((x) => [x.name, x.event])).toEqual([['Main', '333'], ['2x2', '222']]);
    expect(r.solves).toHaveLength(4);
    expect(r.skippedSessions).toBe(1);
    const mapped = csTimerToKlick(parsed, { session3: '333' }, ctx());
    expect(mapped.sessions).toHaveLength(3);
    expect(mapped.skippedSessions).toBe(0);
  });
  it('importar o mesmo arquivo duas vezes não duplica', () => {
    const parsed = parseCsTimer(fixture('cstimer-export.txt'));
    const first = csTimerToKlick(parsed, {}, ctx());
    const second = csTimerToKlick(parsed, {}, ctx(first.sessions, first.solves));
    expect(second.solves).toHaveLength(0);
    expect(second.duplicates).toBe(4);
  });
  it('exporta no formato do csTimer e lê de volta', () => {
    const parsed = parseCsTimer(fixture('cstimer-export.txt'));
    const r = csTimerToKlick(parsed, { session3: '333' }, ctx());
    const again = parseCsTimer(toCsTimerJson(r.sessions, r.solves));
    expect(again.map((x) => [x.name, x.event])).toEqual([['Main', '333'], ['2x2', '222'], ['ZBLL', '333']]);
    expect(again[0].solves).toEqual(parsed[0].solves);
  });

  it('exporta e importa as fases no multiphase do csTimer', () => {
    const solves = [
      mkSolve({ id: 'a', ms: 12_000, phases: [3_000, 4_000, 5_000] }),
      mkSolve({ id: 'b', ms: 10_000, at: AT + 1_000, penalty: '+2', phases: [4_000, 6_000] }),
      mkSolve({ id: 'c', ms: 9_000, at: AT + 2_000 }),
      mkSolve({ id: 'd', ms: 9_000, at: AT + 3_000, phases: [4_000, 4_000] }), // não soma o tempo: sai sem fases
    ];
    const file = JSON.parse(toCsTimerJson([mkSession()], solves)) as Record<string, unknown[][]>;
    expect(file.session1.map((row) => row[0])).toEqual([[0, 12_000, 7_000, 3_000], [2000, 10_000, 4_000], [0, 9_000], [0, 9_000]]);
    const back = parseCsTimer(toCsTimerJson([mkSession()], solves))[0].solves;
    expect(back.map((s) => s.phases)).toEqual([[3_000, 4_000, 5_000], [4_000, 6_000], undefined, undefined]);
    // E o caminho inteiro: do arquivo para o Klick, com as fases no solve novo.
    const imported = csTimerToKlick(parseCsTimer(toCsTimerJson([mkSession()], solves)), {}, ctx()).solves;
    expect(imported.map((s) => s.phases)).toEqual([[3_000, 4_000, 5_000], [4_000, 6_000], undefined, undefined]);
    expect(imported.every((s, i) => i < 2 || !('phases' in s))).toBe(true);
  });

  describe('leitura do arquivo', () => {
    const csText = (body: Loose): string => JSON.stringify(body);
    // Um solve como o csTimer grava: [[penalidade, ms], embaralhamento, comentário, segundos].
    const csRow = (ms = 10_000, seconds = AT / 1000, code = 0): unknown[] => [[code, ms], 'R U', '', seconds];

    it('sessionData pode vir como objeto; sem dados da sessão o nome é "Sessão N" e o evento é o 3×3', () => {
      const text = csText({
        session1: [csRow()], session2: [csRow()], session3: [csRow()],
        properties: { sessionData: { 1: { name: 'Um', opt: { scrType: '444wca' } }, 2: {} } },
      });
      expect(parseCsTimer(text).map((s) => [s.name, s.scrType, s.event])).toEqual([
        ['Um', '444wca', '444'], ['Sessão 2', undefined, '333'], ['Sessão 3', undefined, '333'],
      ]);
    });
    it('sem properties também lê (nome padrão, 3×3)', () => {
      const [s] = parseCsTimer(csText({ session4: [csRow(8_000)] }));
      expect(s).toEqual({
        key: 'session4', name: 'Sessão 4', scrType: undefined, event: '333',
        solves: [{ ms: 8_000, penalty: null, scramble: 'R U', note: '', at: AT }],
      });
    });
    it('nome em número (o padrão do csTimer) ou em branco vira "Sessão N"; espaços sobrando saem', () => {
      const sessionData = JSON.stringify({ 1: { name: 1 }, 2: { name: '   ' }, 3: { name: '  Treino  ' } });
      const text = csText({ session1: [], session2: [], session3: [], properties: { sessionData } });
      expect(parseCsTimer(text).map((s) => s.name)).toEqual(['Sessão 1', 'Sessão 2', 'Treino']);
    });
    it('as sessões saem em ordem numérica (session10 depois de session2), cada uma com os dados do próprio número', () => {
      const sessionData = JSON.stringify({ 1: { name: 'A' }, 2: { name: 'B', opt: { scrType: '222so' } }, 10: { name: 'J' } });
      const text = csText({ session10: [], session2: [], session1: [], properties: { sessionData } });
      expect(parseCsTimer(text).map((s) => [s.key, s.name, s.event])).toEqual([
        ['session1', 'A', '333'], ['session2', 'B', '222'], ['session10', 'J', '333'],
      ]);
    });
    it('só chaves sessionN contam', () => {
      const text = csText({
        sessions: [csRow()], session: [csRow()], sessionA: [csRow()], session1x: [csRow()], xsession1: [csRow()], Session1: [csRow()],
        session1: [csRow()], properties: {},
      });
      expect(parseCsTimer(text).map((s) => s.key)).toEqual(['session1']);
    });
    it('sessão sem solves lê vazia', () => {
      expect(parseCsTimer(csText({ session1: [] }))[0].solves).toEqual([]);
    });
    it('tempos de fases e campos a mais no item são ignorados', () => {
      const text = csText({ session1: [[[0, 5_000, 2_000, 3_000], 'R', 'ok', 1_791_400_000, 'extra', 9]] });
      expect(parseCsTimer(text)[0].solves).toEqual([{ ms: 5_000, penalty: null, scramble: 'R', note: 'ok', at: AT }]);
    });
    // Multifase do csTimer (src/js/stats/stats.js, prettyMPA e timeAtDim; src/js/timer.js, onkeydown): [penalidade, total, c(N-1), ..., c1],
    // com os tempos das fases ACUMULADOS (desde o início) e em ordem DECRESCENTE depois do total, que é o ms do solve.
    it('lê as fases do multiphase: acumuladas, em ordem decrescente depois do total', () => {
      const text = csText({ session1: [[[0, 12_000, 7_000, 3_000], 'R', '', 1_791_400_000]] });
      expect(parseCsTimer(text)[0].solves[0]).toEqual({ ms: 12_000, penalty: null, scramble: 'R', note: '', at: AT, phases: [3_000, 4_000, 5_000] });
    });
    it('duas fases: um só acumulado depois do total; o +2 não mexe nas fases', () => {
      const text = csText({ session1: [[[2000, 10_000, 4_000], 'R', '', 1_791_400_000]] });
      expect(parseCsTimer(text)[0].solves[0]).toMatchObject({ ms: 10_000, penalty: '+2', phases: [4_000, 6_000] });
    });
    it.each<[string, unknown[]]>([
      ['acumulados fora de ordem', [0, 12_000, 3_000, 7_000]],
      ['um acumulado maior que o total', [0, 5_000, 6_000]],
      ['um valor que não é número', [0, 12_000, '7000', 3_000]],
      ['um valor negativo', [0, 12_000, 7_000, -1]],
    ])('fases tortas (%s) ficam de fora e o solve entra sem elas', (_n, head) => {
      const text = csText({ session1: [[head, 'R', '', 1_791_400_000]] });
      const [solve] = parseCsTimer(text)[0].solves;
      expect(solve.ms).toBe(head[1]);
      expect('phases' in solve).toBe(false);
    });
    it('comentário que não é texto vira nota vazia', () => {
      const text = csText({ session1: [[[0, 5_000], 'R', null, 1_791_400_000], [[0, 6_000], 'R', 7, 1_791_400_001]] });
      expect(parseCsTimer(text)[0].solves.map((s) => s.note)).toEqual(['', '']);
    });
    it('os três códigos de penalidade do csTimer', () => {
      const text = csText({ session1: [csRow(1, 1, 0), csRow(2, 2, 2000), csRow(3, 3, -1)] });
      expect(parseCsTimer(text)[0].solves.map((s) => s.penalty)).toEqual([null, '+2', 'DNF']);
    });
    it('segundos fracionários viram milissegundos', () => {
      expect(parseCsTimer(csText({ session1: [csRow(1_000, 1_791_400_000.5)] }))[0].solves[0].at).toBe(AT + 500);
    });

    it.each<[string, EventId | null]>([
      ['333', '333'], ['222so', '222'], ['444wca', '444'], ['555wca', '555'], ['666wca', '666'], ['777wca', '777'],
      ['333oh', '333oh'], ['333ni', '333bf'], ['mgmp', 'minx'], ['pyrso', 'pyram'], ['skbso', 'skewb'], ['sqrs', 'sq1'], ['clkwca', 'clock'],
      ['', '333'], ['zbll', null], ['333fm', null], ['333mbf', null],
    ])('scrType %j é o evento %j', (scrType, event) => {
      const text = csText({ session1: [csRow()], properties: { sessionData: JSON.stringify({ 1: { opt: { scrType } } }) } });
      const [s] = parseCsTimer(text);
      expect(s.scrType).toBe(scrType);
      expect(s.event).toBe(event);
    });

    // Cada caso tem o defeito na 2ª posição: o 1º solve (ou a 1ª sessão) está certo e não pode mascará-lo.
    const bad = (row: unknown): string => csText({ session1: [csRow(), row] });
    const withProps = (properties: unknown): string => csText({ session1: [csRow()], properties });
    const INVALID: Array<[string, string]> = [
      ['texto que não é JSON', 'sessão 1'],
      ['vazio', ''],
      ['lista', '[]'],
      ['null', 'null'],
      ['número', '5'],
      ['sem nenhuma sessionN', csText({ properties: {} })],
      ['"sessions" no plural não é sessionN', csText({ sessions: [csRow()] })],
      ['arquivo do Klick', toKlickJson(fullExport())],
      ['sessão que não é lista', csText({ session1: {} })],
      ['sessão que é null', csText({ session1: null })],
      ['segunda sessão que não é lista', csText({ session1: [csRow()], session2: 'x' })],
      ['item que é null', bad(null)],
      ['item que é texto', bad('x')],
      ['item que é número', bad(5)],
      ['item que é objeto', bad({})],
      ['tempo que não é lista', bad([5, 'R', '', 1_791_400_000])],
      ['tempo vazio', bad([[], 'R', '', 1_791_400_000])],
      ['tempo sem ms', bad([[0], 'R', '', 1_791_400_000])],
      ['ms como texto', bad([[0, '1000'], 'R', '', 1_791_400_000])],
      ['ms null', bad([[0, null], 'R', '', 1_791_400_000])],
      ['ms negativo', bad([[0, -1], 'R', '', 1_791_400_000])],
      ['ms infinito', '{"session1":[[[0,1000],"R","",1791400000],[[0,1e999],"R","",1791400000]]}'],
      ['penalidade 1000', bad([[1000, 1000], 'R', '', 1_791_400_000])],
      ['penalidade 4000', bad([[4000, 1000], 'R', '', 1_791_400_000])],
      ['penalidade -2', bad([[-2, 1000], 'R', '', 1_791_400_000])],
      ['penalidade como texto', bad([['0', 1000], 'R', '', 1_791_400_000])],
      ['penalidade null', bad([[null, 1000], 'R', '', 1_791_400_000])],
      ['sem segundos', bad([[0, 1000], 'R', ''])],
      ['segundos como texto', bad([[0, 1000], 'R', '', '1791400000'])],
      ['segundos null', bad([[0, 1000], 'R', '', null])],
      ['segundos infinitos', '{"session1":[[[0,1000],"R","",1791400000],[[0,1000],"R","",1e999]]}'],
      ['segundos que estouram ao virar milissegundos', '{"session1":[[[0,1000],"R","",1791400000],[[0,1000],"R","",1e306]]}'],
      ['embaralhamento que não é texto', bad([[0, 1000], 5, '', 1_791_400_000])],
      ['sessionData que não abre', withProps({ sessionData: '{x' })],
      ['sessionData que é lista', withProps({ sessionData: '[]' })],
      ['sessionData que é "null"', withProps({ sessionData: 'null' })],
      ['sessionData que é número', withProps({ sessionData: 5 })],
      ['sessionData que é lista (já aberta)', withProps({ sessionData: [] })],
      ['properties que é número', withProps(5)],
      ['properties que é lista', withProps([])],
      ['properties null', withProps(null)],
      ['sessionData null', withProps({ sessionData: null })],
      ['dados da sessão que não são objeto', withProps({ sessionData: { 1: 5 } })],
      ['dados da sessão null', withProps({ sessionData: { 1: null } })],
      ['opt que não é objeto', withProps({ sessionData: { 1: { opt: 'x' } } })],
      ['opt null', withProps({ sessionData: { 1: { opt: null } } })],
      ['scrType que não é texto', withProps({ sessionData: { 1: { opt: { scrType: 5 } } } })],
      ['scrType null', withProps({ sessionData: { 1: { opt: { scrType: null } } } })],
    ];
    it.each(INVALID)('%s dá erro claro', (_label, text) => {
      expect(() => parseCsTimer(text)).toThrow(CSTIMER_INVALID);
    });
  });

  describe('importação', () => {
    const csSolve = (ms: number, at: number, over: Partial<CsTimerSolve> = {}): CsTimerSolve => ({ ms, penalty: null, scramble: 'R U', note: '', at, ...over });
    const csSession = (key: string, solves: CsTimerSolve[], over: Partial<CsTimerSession> = {}): CsTimerSession =>
      ({ key, name: `Sessão ${key.slice(7)}`, scrType: undefined, event: '333', solves, ...over });

    it('exportar para o csTimer e importar de volta não duplica nada, mesmo com o instante em milissegundos', () => {
      const sessions = [mkSession({ id: 's1', name: 'Main', order: 0 }), mkSession({ id: 's2', name: '2x2', event: '222', order: 1 })];
      const solves = [
        mkSolve({ id: 'a', ms: 11_340, at: AT + 123 }),
        mkSolve({ id: 'b', ms: 12_990, penalty: '+2', at: AT + 60_999, note: 'cruz' }),
        mkSolve({ id: 'c', sessionId: 's2', event: '222', ms: 4_560, penalty: 'DNF', at: AT + 120_001 }),
        mkSolve({ id: 'd', ms: 9_870, at: AT + 180_500 }),
      ];
      const parsed = parseCsTimer(toCsTimerJson(sessions, solves));
      const r = csTimerToKlick(parsed, {}, ctx(sessions, solves));
      expect(r.solves).toHaveLength(0);
      expect(r.sessions).toHaveLength(0);
      expect(r.duplicates).toBe(4);
      expect(r.skippedSessions).toBe(0);
    });

    it('mesmo tempo em outro segundo, ou mesmo segundo com outro tempo, é solve novo; o limite é o segundo', () => {
      const existing = [mkSolve({ ms: 9_000, at: AT + 999 })];
      const parsed = [csSession('session1', [
        csSolve(9_000, AT), // mesmo ms, mesmo segundo (AT e AT + 999): duplicado
        csSolve(9_000, AT + 1_000), // mesmo ms, no segundo seguinte: novo
        csSolve(9_010, AT), // mesmo segundo, outro ms: novo
        csSolve(9_000, AT - 1_000), // mesmo ms, no segundo anterior: novo
      ])];
      const r = csTimerToKlick(parsed, {}, ctx([mkSession()], existing));
      expect(r.duplicates).toBe(1);
      expect(r.solves.map((s) => [s.ms, s.at])).toEqual([[9_000, AT + 1_000], [9_010, AT], [9_000, AT - 1_000]]);
    });

    it('dois itens iguais no mesmo arquivo contam uma vez; o segundo é duplicado', () => {
      const parsed = [csSession('session1', [csSolve(7_000, AT), csSolve(7_000, AT), csSolve(7_000, AT + 400)])];
      const r = csTimerToKlick(parsed, {}, ctx());
      expect(r.solves).toHaveLength(1);
      expect(r.duplicates).toBe(2);
    });

    it('o repetido entre duas sessões do mesmo arquivo também conta uma vez, e a sessão sem nada novo não nasce', () => {
      const parsed = [
        csSession('session1', [csSolve(7_000, AT)]),
        csSession('session2', [csSolve(7_000, AT)]),
        csSession('session3', [csSolve(7_000, AT), csSolve(8_000, AT)]),
      ];
      const r = csTimerToKlick(parsed, {}, ctx());
      expect(r.sessions.map((s) => s.name)).toEqual(['Sessão 1', 'Sessão 3']);
      expect(r.solves.map((s) => s.ms)).toEqual([7_000, 8_000]);
      expect(r.duplicates).toBe(2);
    });

    it('solve que já existe e foi excluído também conta como duplicado', () => {
      const existing = [mkSolve({ ms: 6_500, at: AT, deletedAt: 5 })];
      const r = csTimerToKlick([csSession('session1', [csSolve(6_500, AT)])], {}, ctx([mkSession()], existing));
      expect(r.solves).toHaveLength(0);
      expect(r.duplicates).toBe(1);
    });

    it('o duplicado vale em qualquer sessão ou evento', () => {
      const existing = [mkSolve({ sessionId: 'outra', event: '444', ms: 6_500, at: AT })];
      const r = csTimerToKlick([csSession('session1', [csSolve(6_500, AT)])], {}, ctx([], existing));
      expect(r.solves).toHaveLength(0);
      expect(r.duplicates).toBe(1);
    });

    it('sessão de fora (sem evento) não avalia duplicados; com mapeamento, avalia', () => {
      const existing = [mkSolve({ ms: 7_000, at: AT })];
      const parsed = [csSession('session1', [csSolve(7_000, AT)], { event: null })];
      const out = csTimerToKlick(parsed, {}, ctx([], existing));
      expect(out).toEqual({ sessions: [], solves: [], duplicates: 0, skippedSessions: 1 });
      const mapped = csTimerToKlick(parsed, { session1: '333' }, ctx([], existing));
      expect(mapped).toEqual({ sessions: [], solves: [], duplicates: 1, skippedSessions: 0 });
    });

    it('sessão com solves novos e antigos entra só com os novos', () => {
      const existing = [mkSolve({ ms: 1_000, at: AT })];
      const parsed = [csSession('session1', [csSolve(1_000, AT), csSolve(2_000, AT + 1_000), csSolve(3_000, AT + 2_000)])];
      const r = csTimerToKlick(parsed, {}, ctx([], existing));
      expect(r.sessions).toHaveLength(1);
      expect(r.solves.map((s) => s.ms)).toEqual([2_000, 3_000]);
      expect(r.duplicates).toBe(1);
    });

    it('sessões e solves novos saem completos, com ids próprios e a ordem depois da maior que existe (excluída inclusive)', () => {
      const parsed = parseCsTimer(fixture('cstimer-export.txt'));
      const r = csTimerToKlick(parsed, {}, ctx([mkSession({ order: 3 }), mkSession({ id: 'velha', order: 7, deletedAt: 5 })]));
      // As datas vêm do dado (fix round 1): o solve no instante dele, a sessão no do primeiro solve dela no arquivo.
      expect(r.sessions).toEqual([
        { id: expect.any(String), name: 'Main', event: '333', order: 8, createdAt: 1791400000000, updatedAt: 1791400000000, deletedAt: null },
        { id: expect.any(String), name: '2x2', event: '222', order: 9, createdAt: 1791400300000, updatedAt: 1791400300000, deletedAt: null },
      ]);
      const [main, pocket] = r.sessions;
      expect(r.solves).toEqual([
        { id: expect.any(String), sessionId: main.id, event: '333', ms: 61234, penalty: null, at: 1791400000000, scramble: "R U R' U'", note: '', createdAt: 1791400000000, updatedAt: 1791400000000, deletedAt: null },
        { id: expect.any(String), sessionId: main.id, event: '333', ms: 58000, penalty: '+2', at: 1791400100000, scramble: 'F R U', note: 'cruz', createdAt: 1791400100000, updatedAt: 1791400100000, deletedAt: null },
        { id: expect.any(String), sessionId: main.id, event: '333', ms: 70000, penalty: 'DNF', at: 1791400200000, scramble: 'L D', note: '', createdAt: 1791400200000, updatedAt: 1791400200000, deletedAt: null },
        { id: expect.any(String), sessionId: pocket.id, event: '222', ms: 8123, penalty: null, at: 1791400300000, scramble: "R U2 R'", note: '', createdAt: 1791400300000, updatedAt: 1791400300000, deletedAt: null },
      ]);
      const ids = [...r.sessions.map((s) => s.id), ...r.solves.map((s) => s.id)];
      expect(new Set(ids).size).toBe(6);
      // Ids derivados do dado (spec 5.5): `cs-s-` nas sessões e `cs-` nos solves, mais 22 caracteres do hash.
      expect(r.sessions.every((s) => /^cs-s-[0-9a-z]{22}$/.test(s.id))).toBe(true);
      expect(r.solves.every((s) => /^cs-[0-9a-z]{22}$/.test(s.id))).toBe(true);
    });

    it('o mesmo arquivo importado em dois aparelhos dá os mesmos ids e as mesmas datas, mesmo em horas e com sessões diferentes (spec 5.5)', () => {
      const parsed = parseCsTimer(fixture('cstimer-export.txt'));
      const phone = csTimerToKlick(parsed, { session3: '333' }, ctx());
      const desktop = csTimerToKlick(parsed, { session3: '333' }, { ...ctx([mkSession({ order: 4 })]), now: NOW + 3_600_000 });
      expect(desktop.sessions.map((s) => s.id)).toEqual(phone.sessions.map((s) => s.id));
      expect(desktop.solves.map((s) => s.id)).toEqual(phone.solves.map((s) => s.id));
      // Fix round 1: as datas vêm do dado, não da hora da importação (com a hora, a importação mais nova desfaria a edição do outro).
      expect(desktop.sessions[0].createdAt).toBe(phone.sessions[0].createdAt);
      expect(desktop.solves).toEqual(phone.solves);
    });

    it('o mesmo arquivo importado em dois instantes dá registros idênticos (com as mesmas sessões que já existem)', () => {
      const parsed = parseCsTimer(fixture('cstimer-export.txt'));
      expect(csTimerToKlick(parsed, { session3: '333' }, { ...ctx(), now: NOW + 86_400_000 })).toEqual(csTimerToKlick(parsed, { session3: '333' }, ctx()));
    });

    it('um instante no futuro (relógio do csTimer adiantado) vira a hora da importação: nenhuma data passa de agora', () => {
      const r = csTimerToKlick([csSession('session1', [csSolve(1_000, NOW + 50_000), csSolve(2_000, AT)])], {}, ctx());
      expect(r.sessions[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW });
      expect(r.solves.map((s) => [s.createdAt, s.updatedAt])).toEqual([[NOW, NOW], [AT, AT]]);
    });

    // Fix round 2: as datas que o conversor tira do arquivo nunca fazem o import recusar nada (a recusa é para as datas que já vêm prontas
    // num arquivo do Klick). Um primeiro tempo quebrado não pode levar a sessão, e com ela os solves bons.
    it('um instante negativo ou com fração dá datas inteiras >= 0 (stampOf); a sessão e os solves continuam, e o instante fica como veio', () => {
      const r = csTimerToKlick([csSession('session1', [csSolve(1_000, -5_000), csSolve(2_000, AT + 0.5)])], {}, ctx());
      expect(r.sessions).toHaveLength(1);
      expect(r.sessions[0]).toMatchObject({ createdAt: 0, updatedAt: 0 });
      expect(r.solves.map((s) => [s.at, s.createdAt, s.updatedAt])).toEqual([[-5_000, 0, 0], [AT + 0.5, AT, AT]]);
    });

    // Acrescentado (além do brief): com o id da sessão derivado, importar de novo o mesmo arquivo (com solves novos) acha a sessão daqui, e
    // o plano não a traz de novo: o registro daqui (renomeado, reordenado) fica como está.
    it('a sessão que já existe (o mesmo arquivo importado antes, depois renomeada) recebe os solves novos e não é recriada', () => {
      const first = csTimerToKlick([csSession('session1', [csSolve(1_000, AT)])], {}, ctx());
      const mine = { ...first.sessions[0], name: 'Renomeada', updatedAt: NOW + 5 };
      const again = csTimerToKlick([csSession('session1', [csSolve(1_000, AT), csSolve(2_000, AT + 1_000)])], {}, ctx([mine], first.solves));
      expect(again.sessions).toEqual([]);
      expect(again.solves.map((s) => [s.sessionId, s.ms])).toEqual([[mine.id, 2_000]]);
      expect(again.duplicates).toBe(1);
    });

    // Valores fixos (fix round 1): o mesmo arquivo tem de dar os mesmos ids em toda versão do app, ou dois aparelhos com versões diferentes
    // duplicam em vez de juntar. Mudar o hash, o separador, as partes ou o que o leitor do arquivo devolve quebra estes testes, de propósito.
    it('os ids derivados de um arquivo fixo são sempre os mesmos', () => {
      expect(csTimerSolveId('333', { at: 1_791_400_000_000, ms: 61_234, scramble: "R U R' U'" })).toBe('cs-1ezpmb1j6671yz5y3g2nqv');
      expect(csTimerSessionId('222', csSession('session2', [csSolve(8_123, 1_791_400_300_000)], { name: '2x2', event: '222' }))).toBe('cs-s-230inmyrr3a0ez0eggnlgp');
      const r = csTimerToKlick(parseCsTimer(fixture('cstimer-export.txt')), { session3: '333' }, ctx());
      expect(r.sessions.map((s) => s.id)).toEqual(['cs-s-2auduauhwqw0pgt9n0gj4j', 'cs-s-230inmyrr3a0ez0eggnlgp', 'cs-s-1rug29hjhpm2evclivjk9t']);
      expect(r.solves.map((s) => s.id)).toEqual([
        'cs-1ezpmb1j6671yz5y3g2nqv',
        'cs-0mlsyg19b870dizd6dve4v',
        'cs-25xl5rb82ou0bnoxzw5fe1',
        'cs-13u4t384yhg0cg935lmpi3',
        'cs-0m5ojgbce3c0rzsqx3dyzc',
      ]);
    });

    it('sem sessões que existam, a ordem parte de 0', () => {
      const r = csTimerToKlick(parseCsTimer(fixture('cstimer-export.txt')), { session3: '333' }, ctx());
      expect(r.sessions.map((s) => s.order)).toEqual([0, 1, 2]);
    });

    it('o evento do arquivo vale mais que o mapeamento; mapeamento sem evento de verdade não vale', () => {
      const parsed = [
        csSession('session1', [csSolve(1_000, AT)], { event: '222' }),
        csSession('session2', [csSolve(2_000, AT)], { event: null }),
        csSession('session3', [csSolve(3_000, AT)], { event: null }),
        csSession('session4', [csSolve(4_000, AT)], { event: null }),
      ];
      const mapping = { session1: '444', session2: 'xyz' as unknown as EventId, session3: undefined, session4: '666' } as const;
      const r = csTimerToKlick(parsed, mapping, ctx());
      expect(r.sessions.map((s) => [s.name, s.event])).toEqual([['Sessão 1', '222'], ['Sessão 4', '666']]);
      expect(r.solves.map((s) => s.event)).toEqual(['222', '666']);
      expect(r.skippedSessions).toBe(2);
    });

    it('não altera o que recebe', () => {
      const parsed = deepFreeze(parseCsTimer(fixture('cstimer-export.txt')));
      const existing = deepFreeze({ sessions: [mkSession()], solves: [mkSolve({ ms: 61_234, at: 1_791_400_000_000 })] });
      const mapping = deepFreeze({ session3: '333' as const });
      const r = csTimerToKlick(parsed, mapping, ctx(existing.sessions, existing.solves));
      expect(r.solves).toHaveLength(4); // 5 no arquivo, menos o que já existia
      expect(r.duplicates).toBe(1);
    });

    it('sem nada para importar, nada acontece', () => {
      expect(csTimerToKlick([], {}, ctx())).toEqual({ sessions: [], solves: [], duplicates: 0, skippedSessions: 0 });
    });
  });

  describe('exportação', () => {
    type CsFile = Loose & { properties: { sessionData: string; sessionN: number } };
    const out = (sessions: Session[], solves: Solve[]): CsFile => JSON.parse(toCsTimerJson(sessions, solves)) as CsFile;

    it('escreve sessionN em ordem, os tempos em [[pen, ms], embaralhamento, nota, segundos] e as propriedades', () => {
      const sessions = [
        mkSession({ id: 's2', name: 'Pyra', event: 'pyram', order: 1 }), // fora de ordem de propósito
        mkSession({ id: 's1', name: 'Main', order: 0 }),
      ];
      const solves = [
        mkSolve({ id: 'b', ms: 58_000, penalty: '+2', note: 'cruz', at: AT + 100_999, scramble: 'F R U' }),
        mkSolve({ id: 'a', ms: 61_234, at: AT, scramble: "R U R' U'" }),
        mkSolve({ id: 'c', ms: 70_000, penalty: 'DNF', at: AT + 200_000, scramble: 'L D' }),
        mkSolve({ id: 'd', sessionId: 's2', event: 'pyram', ms: 8_123, at: AT + 300_000, scramble: "R U2 R'" }),
      ];
      const file = out(sessions, solves);
      expect(Object.keys(file)).toEqual(['session1', 'session2', 'properties']);
      expect(file.session1).toEqual([
        [[0, 61234], "R U R' U'", '', 1791400000],
        [[2000, 58000], 'F R U', 'cruz', 1791400100],
        [[-1, 70000], 'L D', '', 1791400200],
      ]);
      expect(file.session2).toEqual([[[0, 8123], "R U2 R'", '', 1791400300]]);
      expect(typeof file.properties.sessionData).toBe('string');
      expect(JSON.parse(file.properties.sessionData)).toEqual({
        1: { name: 'Main', opt: { scrType: '333' }, rank: 1 },
        2: { name: 'Pyra', opt: { scrType: 'pyrso' }, rank: 2 },
      });
      expect(file.properties.sessionN).toBe(2);
    });

    // Um solve vivo cuja sessão não está viva (excluída em outra aba, ou que nunca existiu) não pode sumir do arquivo do csTimer.
    it('solves vivos sem sessão viva saem numa sessão "Sem sessão", de 3×3, depois das outras; os excluídos continuam de fora', () => {
      const sessions = [mkSession({ id: 'a', name: 'A', order: 0 }), mkSession({ id: 'b', name: 'B', order: 1, deletedAt: 5 })];
      const solves = [
        mkSolve({ id: '1', sessionId: 'a', ms: 1_000 }),
        mkSolve({ id: '2', sessionId: 'nunca-existiu', event: 'sq1', ms: 2_000, at: AT + 1_000, scramble: 'R' }),
        mkSolve({ id: '3', sessionId: 'b', ms: 3_000, at: AT + 2_000, scramble: 'U' }), // sessão na lixeira, solve vivo
        mkSolve({ id: '4', sessionId: 'nunca-existiu', ms: 4_000, deletedAt: 5, at: AT + 3_000 }),
      ];
      const file = out(sessions, solves);
      expect(Object.keys(file)).toEqual(['session1', 'session2', 'properties']);
      expect(file.session1).toEqual([[[0, 1000], "R U R'", '', 1791400000]]);
      expect(file.session2).toEqual([
        [[0, 2000], 'R', '', 1791400001],
        [[0, 3000], 'U', '', 1791400002],
      ]);
      expect(JSON.parse(file.properties.sessionData)[2]).toEqual({ name: 'Sem sessão', opt: { scrType: '333' }, rank: 2 });
      expect(file.properties.sessionN).toBe(2);
    });

    it('o arquivo com solves órfãos volta ao csTimer com a sessão "Sem sessão" e os solves nela', () => {
      const sessions = [mkSession({ id: 'a', name: 'A', order: 0 })];
      const solves = [mkSolve({ id: '1', sessionId: 'a', ms: 1_000 }), mkSolve({ id: '2', sessionId: 'perdida', ms: 2_000, at: AT + 1_000 })];
      const parsed = parseCsTimer(toCsTimerJson(sessions, solves));
      expect(parsed.map((p) => [p.name, p.solves.length])).toEqual([['A', 1], ['Sem sessão', 1]]);
      expect(parsed[1].event).toBe('333');
    });

    it('só o que não foi excluído, com os números seguidos; sessão sem solves sai vazia', () => {
      const sessions = [
        mkSession({ id: 'a', name: 'A', order: 0 }),
        mkSession({ id: 'b', name: 'B', order: 1, deletedAt: 5 }),
        mkSession({ id: 'c', name: 'C', order: 2 }),
      ];
      const solves = [
        mkSolve({ id: '1', sessionId: 'a', ms: 1_000 }),
        mkSolve({ id: '2', sessionId: 'a', ms: 2_000, deletedAt: 5, at: AT + 1_000 }),
        mkSolve({ id: '3', sessionId: 'b', ms: 3_000, deletedAt: 5, at: AT + 2_000 }), // excluído junto com a sessão
      ];
      const file = out(sessions, solves);
      expect(Object.keys(file)).toEqual(['session1', 'session2', 'properties']);
      expect(file.session1).toEqual([[[0, 1000], "R U R'", '', 1791400000]]);
      expect(file.session2).toEqual([]);
      expect(file.properties.sessionN).toBe(2);
      expect(Object.values(JSON.parse(file.properties.sessionData) as Record<string, { name: string; rank: number }>).map((d) => [d.name, d.rank]))
        .toEqual([['A', 1], ['C', 2]]);
    });

    it('sai em uma linha só, sem espaços sobrando', () => {
      const text = toCsTimerJson([mkSession()], [mkSolve()]);
      expect(text).not.toContain('\n');
      expect(text).toBe(JSON.stringify(JSON.parse(text)));
    });

    it('os 13 eventos fazem a viagem de ida e volta, com o tipo de embaralhamento de cada um', () => {
      const sessions = EVENT_IDS.map((event, i) => mkSession({ id: `s${i}`, name: `S ${event}`, event, order: i }));
      const parsed = parseCsTimer(toCsTimerJson(sessions, []));
      expect(parsed.map((s) => s.event)).toEqual([...EVENT_IDS]);
      expect(parsed.map((s) => s.scrType)).toEqual(EVENT_IDS.map((id) => eventInfo(id).csTimer));
    });

    it('nomes com aspas, barra e acentos e notas com quebra de linha fazem a viagem', () => {
      const name = 'Treino "OLL" \\ ação';
      const note = 'linha 1\nlinha 2\t"aspas"';
      const parsed = parseCsTimer(toCsTimerJson([mkSession({ name })], [mkSolve({ note, scramble: "R U\nF'" })]));
      expect(parsed[0].name).toBe(name);
      expect(parsed[0].solves[0].note).toBe(note);
      expect(parsed[0].solves[0].scramble).toBe("R U\nF'");
    });

    it('não altera o que recebe', () => {
      const sessions = deepFreeze([mkSession({ id: 'b', order: 1 }), mkSession({ id: 'a', order: 0 })]);
      const solves = deepFreeze([mkSolve({ id: 'y', sessionId: 'a', at: AT + 5_000 }), mkSolve({ id: 'x', sessionId: 'a', at: AT })]);
      expect(out(sessions, solves).session1).toHaveLength(2);
    });
  });
});

describe('migração da v1', () => {
  const storage = (value: string | null) => ({ getItem: (k: string) => (k === V1_KEY ? value : null) });

  it('lê as sessões da v1', () => {
    const v1 = readV1(storage(fixture('v1-klick-sessions.json')));
    expect(v1?.map((s) => [s.name, s.puzzleType, s.solves.length])).toEqual([['Sessão 1', '3x3', 3], ['Pyra', 'pyraminx', 1]]);
  });
  it('ausente, inválido ou vazio devolve null', () => {
    expect(readV1(storage(null))).toBeNull();
    expect(readV1(storage('{oops'))).toBeNull();
    expect(readV1(storage('{"state":{"sessions":[]}}'))).toBeNull();
    expect(readV1(null)).toBeNull();
  });
  it('converte eventos, penalidades e datas, mantendo os ids', () => {
    const v1 = readV1(storage(fixture('v1-klick-sessions.json')))!;
    const r = v1ToKlick(v1, ctx());
    expect(r.sessions.map((s) => [s.id, s.name, s.event])).toEqual([
      ['3f2a1c4e-8b7d-4e6f-9a1b-2c3d4e5f6a7b', 'Sessão 1', '333'],
      ['4a5b6c7d-8e9f-4a0b-1c2d-3e4f5a6b7c8d', 'Pyra', 'pyram'],
    ]);
    expect(r.solves.map((s) => [s.ms, s.penalty, s.at])).toEqual([
      [45210, null, Date.parse('2026-03-10T14:00:00.000Z')],
      [50000, '+2', Date.parse('2026-03-10T14:05:00.000Z')],
      [61000, 'DNF', Date.parse('2026-03-11T09:00:00.000Z')],
      [9800, null, Date.parse('2026-03-12T20:00:00.000Z')],
    ]);
    expect(r.solves[1].updatedAt).toBe(Date.parse('2026-03-10T14:06:00.000Z'));
  });
  it('migrar duas vezes não duplica', () => {
    const v1 = readV1(storage(fixture('v1-klick-sessions.json')))!;
    const first = v1ToKlick(v1, ctx());
    const second = v1ToKlick(v1, ctx(first.sessions, first.solves));
    expect(second.solves).toHaveLength(0);
    expect(second.sessions).toHaveLength(0);
    expect(second.duplicates).toBe(4);
  });

  // --- Acrescentados ---

  const v1Json = (sessions: unknown[]): string => JSON.stringify({ state: { sessions, activeSessionId: 'x' }, version: 0 });
  const v1Solve = (over: Loose = {}): Loose => ({
    id: 'x1', timeMs: 10_000, penalty: 'NONE', effectiveMs: 10_000, scramble: 'R U', createdAt: '2026-03-10T14:00:00.000Z', ...over,
  });
  const v1Session = (over: Loose = {}): Loose => ({ id: 'p1', name: 'Sessão 1', puzzleType: '3x3', solves: [v1Solve()], ...over });
  const readSessions = (sessions: unknown[]) => readV1(storage(v1Json(sessions)))!;
  const T10 = Date.parse('2026-03-10T14:00:00.000Z');

  describe('leitura', () => {
    it('um getItem que lança (armazenamento bloqueado) devolve null', () => {
      expect(readV1({ getItem: () => { throw new Error('bloqueado'); } })).toBeNull();
    });
    it('um valor que não é texto devolve null', () => {
      expect(readV1({ getItem: () => 5 as unknown as string })).toBeNull();
    });
    it('consulta a chave klick-sessions', () => {
      expect(V1_KEY).toBe('klick-sessions');
      const asked: string[] = [];
      readV1({ getItem: (k) => { asked.push(k); return null; } });
      expect(asked).toEqual(['klick-sessions']);
    });
    it.each(['[]', 'null', '5', '"x"', '{}', '{"state":null}', '{"state":{}}', '{"state":{"sessions":{}}}', '{"state":{"sessions":null}}'])(
      'formato que não é o do zustand (%s) devolve null',
      (text) => {
        expect(readV1(storage(text))).toBeNull();
      },
    );
    it('só sessões vazias devolve null', () => {
      expect(readV1(storage(v1Json([v1Session({ solves: [] })])))).toBeNull();
    });
    it('sessão vazia ao lado de outra com solves é mantida', () => {
      const v1 = readSessions([v1Session({ id: 'vazia', solves: [] }), v1Session({ id: 'cheia' })]);
      expect(v1.map((s) => [s.id, s.solves.length])).toEqual([['vazia', 0], ['cheia', 1]]);
    });
    it('campos que a v1 antiga não tinha são opcionais: puzzleType (era 3×3), createdAt da sessão e updatedAt do solve', () => {
      const v1 = readSessions([
        v1Session({ puzzleType: undefined, createdAt: undefined, solves: [v1Solve({ updatedAt: undefined })] }),
        v1Session({ id: 'p2', puzzleType: null, createdAt: null, solves: [v1Solve({ updatedAt: null })] }),
      ]);
      expect(v1.map((s) => s.puzzleType)).toEqual(['3x3', '3x3']);
    });
    it('campos a mais (effectiveMs, activeSessionId) não atrapalham', () => {
      const v1 = readSessions([v1Session({ extra: true, solves: [v1Solve({ effectiveMs: null, extra: 1 })] })]);
      expect(v1).toHaveLength(1);
    });

    // Um registro torto não cancela a migração: o que é bom volta, e readV1Invalid conta o que ficou de fora.
    // Sessão de formato torto sai inteira, com os solves dela: conta 1.
    const BAD_SESSION: Array<[string, unknown]> = [
      ['sessão null', null],
      ['sessão número', 5],
      ['sessão lista', []],
      ['sem id', v1Session({ id: undefined })],
      ['id numérico', v1Session({ id: 5 })],
      ['sem nome', v1Session({ name: undefined })],
      ['nome numérico', v1Session({ name: 5 })],
      ['sem lista de solves', v1Session({ solves: undefined })],
      ['solves que não é lista', v1Session({ solves: {} })],
      ['puzzleType numérico', v1Session({ puzzleType: 3 })],
      ['createdAt da sessão que não é data', v1Session({ createdAt: 'ontem' })],
      ['createdAt da sessão numérico', v1Session({ createdAt: 5 })],
    ];
    it.each(BAD_SESSION)('sessão inválida (%s) fica de fora: a boa volta, e conta 1', (_label, bad) => {
      const text = v1Json([v1Session({ id: 'ok' }), bad]);
      expect(readV1(storage(text))?.map((s) => s.id)).toEqual(['ok']);
      expect(readV1Invalid(storage(text))).toBe(1);
    });

    // Solve de formato torto sai sozinho: conta 1. A sessão dele fica com os solves que batem.
    const BAD_SOLVE: Array<[string, unknown]> = [
      ['solve null', null],
      ['solve sem id', v1Solve({ id: undefined })],
      ['solve com id numérico', v1Solve({ id: 5 })],
      ['solve sem timeMs', v1Solve({ timeMs: undefined })],
      ['timeMs negativo', v1Solve({ timeMs: -1 })],
      ['timeMs como texto', v1Solve({ timeMs: '10' })],
      ['timeMs null', v1Solve({ timeMs: null })],
      ['sem penalidade', v1Solve({ penalty: undefined })],
      ['penalidade desconhecida', v1Solve({ penalty: 'X' })],
      ['penalidade null (é do formato novo)', v1Solve({ penalty: null })],
      ['sem embaralhamento', v1Solve({ scramble: undefined })],
      ['embaralhamento numérico', v1Solve({ scramble: 5 })],
      ['solve sem createdAt', v1Solve({ createdAt: undefined })],
      ['createdAt do solve que não é data', v1Solve({ createdAt: 'ontem' })],
      ['createdAt do solve numérico', v1Solve({ createdAt: 5 })],
      ['updatedAt do solve que não é data', v1Solve({ updatedAt: 'ontem' })],
      ['updatedAt do solve numérico', v1Solve({ updatedAt: 5 })],
    ];
    it.each(BAD_SOLVE)('solve inválido (%s) sai sozinho: os bons voltam, e conta 1', (_label, bad) => {
      const text = v1Json([v1Session({ id: 'ok' }), v1Session({ id: 'p1', solves: [v1Solve({ id: 'bom' }), bad] })]);
      expect(readV1(storage(text))?.map((s) => [s.id, s.solves.map((x) => x.id)])).toEqual([['ok', ['x1']], ['p1', ['bom']]]);
      expect(readV1Invalid(storage(text))).toBe(1);
    });
    it('um solve torto entre bons: os bons voltam, na ordem, e conta 1', () => {
      const text = v1Json([v1Session({ id: 'p1', solves: [v1Solve({ id: 'a' }), v1Solve({ id: 'b', timeMs: -1 }), v1Solve({ id: 'c' })] })]);
      expect(readV1(storage(text))?.[0].solves.map((s) => s.id)).toEqual(['a', 'c']);
      expect(readV1Invalid(storage(text))).toBe(1);
    });
    it('uma sessão torta entre boas: as outras voltam, inteiras, e conta 1', () => {
      const text = v1Json([
        v1Session({ id: 'ok1' }),
        v1Session({ id: 'torta', name: 5, solves: [v1Solve({ id: 'perdido' })] }),
        v1Session({ id: 'ok2', solves: [v1Solve({ id: 'z' })] }),
      ]);
      expect(readV1(storage(text))?.map((s) => [s.id, s.solves.map((x) => x.id)])).toEqual([['ok1', ['x1']], ['ok2', ['z']]]);
      expect(readV1Invalid(storage(text))).toBe(1);
    });
    it('todos tortos: readV1 devolve null, e readV1Invalid conta cada registro', () => {
      // null e 'x' são duas sessões tortas; em p1 o formato é bom, mas os dois solves não batem. Total: 4.
      const text = v1Json([null, v1Session({ id: 'p1', solves: [v1Solve({ timeMs: -1 }), v1Solve({ penalty: 'X' })] }), 'x']);
      expect(readV1(storage(text))).toBeNull();
      expect(readV1Invalid(storage(text))).toBe(4);
    });
    it('readV1Invalid é 0 quando não há nada a ler, e também para a v1 inteira', () => {
      expect(readV1Invalid(null)).toBe(0);
      expect(readV1Invalid(storage(null))).toBe(0);
      expect(readV1Invalid(storage('{oops'))).toBe(0);
      expect(readV1Invalid(storage('[]'))).toBe(0);
      expect(readV1Invalid(storage('{"state":{"sessions":[]}}'))).toBe(0);
      expect(readV1Invalid({ getItem: () => { throw new Error('bloqueado'); } })).toBe(0);
      expect(readV1Invalid(storage(v1Json([v1Session({ solves: [] })])))).toBe(0);
      expect(readV1Invalid(storage(fixture('v1-klick-sessions.json')))).toBe(0);
    });
  });

  describe('conversão', () => {
    it.each([
      ['3x3', '333'], ['2x2', '222'], ['4x4', '444'], ['5x5', '555'], ['pyraminx', 'pyram'], ['megaminx', 'minx'], ['skewb', 'skewb'], ['square1', 'sq1'],
    ] as Array<[string, EventId]>)('%s vira o evento %s', (puzzleType, event) => {
      const r = v1ToKlick(readSessions([v1Session({ puzzleType })]), ctx());
      expect(r.sessions.map((s) => s.event)).toEqual([event]);
      expect(r.solves.map((s) => s.event)).toEqual([event]);
    });

    it('sessão sem puzzleType (v1 antiga) vira 3×3, como a própria v1 a tratava', () => {
      const r = v1ToKlick(readSessions([v1Session({ puzzleType: undefined })]), ctx());
      expect(r.sessions.map((s) => s.event)).toEqual(['333']);
      expect(r.skippedSessions).toBe(0);
    });

    it.each(['clock', '6x6', '', 'constructor', '__proto__', 'toString'])('puzzleType %j fora do mapa fica de fora e conta', (puzzleType) => {
      const v1 = readSessions([v1Session({ id: 'p1', puzzleType }), v1Session({ id: 'p2', solves: [v1Solve({ id: 'x2' })] })]);
      const r = v1ToKlick(v1, ctx());
      expect(r.skippedSessions).toBe(1);
      expect(r.sessions.map((s) => s.id)).toEqual(['p2']);
      expect(r.solves.map((s) => s.id)).toEqual(['x2']);
      expect(r.duplicates).toBe(0);
    });

    it('sessão nova: nome, evento, ordem depois da maior que existe e datas (da v1, ou de agora se não tiver)', () => {
      const v1 = readSessions([
        v1Session({ id: 'p1', name: 'Com data', createdAt: '2026-03-10T13:00:00.000Z' }),
        v1Session({ id: 'p2', name: 'Sem data', puzzleType: 'skewb', solves: [v1Solve({ id: 'x2' })] }),
      ]);
      const r = v1ToKlick(v1, ctx([mkSession({ order: 3 }), mkSession({ id: 'velha', order: 4, deletedAt: 5 })]));
      const created = Date.parse('2026-03-10T13:00:00.000Z');
      expect(r.sessions).toEqual([
        { id: 'p1', name: 'Com data', event: '333', order: 5, createdAt: created, updatedAt: created, deletedAt: null },
        { id: 'p2', name: 'Sem data', event: 'skewb', order: 6, createdAt: NOW, updatedAt: NOW, deletedAt: null },
      ]);
    });

    // Fix round 2: o import recusa uma data no futuro ou antes de 1970 que venha pronta num arquivo do Klick. As da v1 são o conversor que
    // tira: um celular antigo com o relógio adiantado, ou uma data antes de 1970, não pode fazer os dados da v1 ficarem de fora.
    it('as datas que a conversão tira da v1 ficam entre 0 e agora; o instante do solve fica como veio', () => {
      const ahead = new Date(NOW + 30 * 86_400_000).toISOString();
      const before1970 = '1969-07-20T20:17:00.000Z';
      const v1 = readSessions([
        v1Session({ id: 'p1', createdAt: ahead, solves: [v1Solve({ id: 'futuro', createdAt: ahead }), v1Solve({ id: 'antigo', createdAt: before1970, updatedAt: ahead })] }),
      ]);
      const r = v1ToKlick(v1, ctx());
      expect(r.sessions[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW });
      expect(r.solves.map((s) => [s.id, s.at, s.createdAt, s.updatedAt])).toEqual([
        ['futuro', Date.parse(ahead), NOW, NOW],
        ['antigo', Date.parse(before1970), 0, NOW],
      ]);
    });

    it('sem sessões que existam, a ordem parte de 0', () => {
      const r = v1ToKlick(readV1(storage(fixture('v1-klick-sessions.json')))!, ctx());
      expect(r.sessions.map((s) => s.order)).toEqual([0, 1]);
    });

    it('nome em branco vira o padrão (posição da sessão); espaços sobrando saem', () => {
      const v1 = readSessions([v1Session({ id: 'p1', name: '   ' }), v1Session({ id: 'p2', name: '  Pyra  ', solves: [v1Solve({ id: 'x2' })] })]);
      expect(v1ToKlick(v1, ctx()).sessions.map((s) => s.name)).toEqual(['Sessão 1', 'Pyra']);
    });

    it('solve novo: todos os campos; sem updatedAt na v1, vale o createdAt', () => {
      const v1 = readSessions([v1Session({ solves: [
        v1Solve({ id: 'x1', timeMs: 4_321, penalty: '+2', scramble: "F' B" }),
        v1Solve({ id: 'x2', timeMs: 5_000, penalty: 'DNF', createdAt: '2026-03-10T14:05:00.000Z', updatedAt: '2026-03-12T08:00:00.000Z' }),
      ] })]);
      expect(v1ToKlick(v1, ctx()).solves).toEqual([
        { id: 'x1', sessionId: 'p1', event: '333', ms: 4_321, penalty: '+2', at: T10, scramble: "F' B", note: '', createdAt: T10, updatedAt: T10, deletedAt: null },
        {
          id: 'x2', sessionId: 'p1', event: '333', ms: 5_000, penalty: 'DNF', at: Date.parse('2026-03-10T14:05:00.000Z'), scramble: 'R U', note: '',
          createdAt: Date.parse('2026-03-10T14:05:00.000Z'), updatedAt: Date.parse('2026-03-12T08:00:00.000Z'), deletedAt: null,
        },
      ]);
    });

    it('a sessão vazia da v1 também é criada, para a pessoa reencontrá-la', () => {
      const v1 = readSessions([v1Session({ id: 'vazia', name: 'Vazia', solves: [] }), v1Session({ id: 'cheia' })]);
      const r = v1ToKlick(v1, ctx());
      expect(r.sessions.map((s) => s.id)).toEqual(['vazia', 'cheia']);
      expect(r.solves).toHaveLength(1);
    });

    it('sessão que já existe (pelo id, até excluída) não é recriada, mas os solves novos entram nela, no evento dela', () => {
      const v1 = readSessions([v1Session({ id: 'p1', solves: [v1Solve({ id: 'velho' }), v1Solve({ id: 'novo', createdAt: '2026-03-10T14:10:00.000Z' })] })]);
      const existing = mkSession({ id: 'p1', event: '444', deletedAt: 7 });
      const r = v1ToKlick(v1, ctx([existing], [mkSolve({ id: 'velho', sessionId: 'p1', event: '444' })]));
      expect(r.sessions).toHaveLength(0);
      expect(r.duplicates).toBe(1);
      expect(r.solves.map((s) => [s.id, s.sessionId, s.event])).toEqual([['novo', 'p1', '444']]);
    });

    it('solve que já existe, mesmo excluído, conta como duplicado pelo id (e em qualquer sessão)', () => {
      const v1 = readSessions([v1Session({ solves: [v1Solve({ id: 'a' }), v1Solve({ id: 'b' }), v1Solve({ id: 'c' })] })]);
      const existing = [mkSolve({ id: 'a', deletedAt: 5 }), mkSolve({ id: 'b', sessionId: 'outra', event: '222' })];
      const r = v1ToKlick(v1, ctx([], existing));
      expect(r.duplicates).toBe(2);
      expect(r.solves.map((s) => s.id)).toEqual(['c']);
    });

    it('o mesmo id de solve duas vezes na v1 conta uma só', () => {
      const v1 = readSessions([
        v1Session({ id: 'p1', solves: [v1Solve({ id: 'a' }), v1Solve({ id: 'a' })] }),
        v1Session({ id: 'p2', solves: [v1Solve({ id: 'a' })] }),
      ]);
      const r = v1ToKlick(v1, ctx());
      expect(r.solves.map((s) => [s.id, s.sessionId])).toEqual([['a', 'p1']]);
      expect(r.duplicates).toBe(2);
    });

    it('o mesmo id de sessão duas vezes na v1 cria uma só, com os solves das duas', () => {
      const v1 = readSessions([
        v1Session({ id: 'p1', solves: [v1Solve({ id: 'a' })] }),
        v1Session({ id: 'p1', solves: [v1Solve({ id: 'b' })] }),
      ]);
      const r = v1ToKlick(v1, ctx());
      expect(r.sessions.map((s) => s.id)).toEqual(['p1']);
      expect(r.solves.map((s) => [s.id, s.sessionId])).toEqual([['a', 'p1'], ['b', 'p1']]);
    });

    it('a ordem dos solves da v1 se mantém', () => {
      const v1 = readSessions([v1Session({ solves: ['d', 'a', 'c', 'b'].map((id) => v1Solve({ id })) })]);
      expect(v1ToKlick(v1, ctx()).solves.map((s) => s.id)).toEqual(['d', 'a', 'c', 'b']);
    });

    it('não altera o que recebe', () => {
      const v1 = deepFreeze(readV1(storage(fixture('v1-klick-sessions.json')))!);
      const existing = deepFreeze({ sessions: [mkSession()], solves: [mkSolve()] });
      const r = v1ToKlick(v1, ctx(existing.sessions, existing.solves));
      expect(r.solves).toHaveLength(4);
    });
  });
});
