import { describe, expect, it } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { defaultDeviceProfile, defaultPrefValue, isPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../../src/core/sync/prefs';
import { changeToPref, fromChange, prefToChange, stampOf, toChange } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import { MAX_STAMP, type Change } from '../../src/core/sync/types';
import { defaultSettings, type Profile } from '../../src/core/types';

const profile = (o: Partial<Profile> = {}): Profile => ({
  settings: defaultSettings(),
  trail: Array<boolean>(9).fill(false),
  finish: 'fosco',
  onboarded: false,
  currentSessionId: null,
  season: defaultSeason(),
  lessonAt: {},
  algChoice: {},
  trainOff: [],
  duelName: '',
  ...o,
});

describe('registro e mudança (spec 6.1)', () => {
  it('as datas vão para o envelope; o resto, inclusive um campo desconhecido, vai em data e volta igual', () => {
    const rec = { id: 'a', sessionId: 's', event: '333', ms: 1, penalty: null, at: 2, scramble: 'R', note: '', createdAt: 2, updatedAt: 3, deletedAt: null, deletionStamp: 2, extra: 'x' };
    const c = toChange('solves', rec);
    expect(c).toEqual({
      store: 'solves', id: 'a', updatedAt: 3, deletedAt: null, deletionStamp: 2,
      data: { sessionId: 's', event: '333', ms: 1, penalty: null, at: 2, scramble: 'R', note: '', createdAt: 2, extra: 'x' },
    });
    expect(fromChange(c)).toEqual(rec);
  });

  it('as fases do solve vão em data e voltam iguais, sem mudar o servidor nem o protocolo', () => {
    const rec = { id: 'a', sessionId: 's', event: '333', ms: 12_000, penalty: null, at: 2, scramble: 'R', note: '', createdAt: 2, updatedAt: 3, deletedAt: null, deletionStamp: 2, phases: [3_000, 4_000, 5_000] };
    const c = toChange('solves', rec);
    expect((c.data as Record<string, unknown>).phases).toEqual([3_000, 4_000, 5_000]);
    expect(checkChange(c).ok).toBe(true);
    expect(fromChange(c)).toEqual(rec);
  });

  it('um item da conta vira mudança com deletedAt null e deletionStamp igual a updatedAt', () => {
    const c = prefToChange({ key: 'trail.3', value: true, updatedAt: 9 });
    expect(c).toEqual({ store: 'prefs', id: 'trail.3', data: true, updatedAt: 9, deletedAt: null, deletionStamp: 9 });
    expect(changeToPref(c)).toEqual({ key: 'trail.3', value: true, updatedAt: 9 });
  });
});

describe('perfil da conta e do aparelho (spec 5.2)', () => {
  it('dividir e juntar devolve o mesmo perfil', () => {
    const p = profile({
      trail: [true, true, false, false, false, false, false, false, false], finish: 'gelo', onboarded: true, currentSessionId: 's1',
      lessonAt: { 2: 4 }, algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-t'],
      settings: { ...defaultSettings(), inspection: false, dailyGoal: 30, theme: 'dark', holdMs: 550 },
    });
    const { device, account } = splitProfile(p);
    expect(device).toEqual({ settings: { ...defaultDeviceProfile().settings, theme: 'dark', holdMs: 550 }, currentSessionId: 's1' });
    expect(Object.keys(device.settings)).not.toContain('inspection');
    expect(joinProfile(device, profileFromPrefs([...prefsFromProfile(account)].map(([key, value]) => ({ key, value, updatedAt: 1 }))))).toEqual(p);
  });

  it('os ajustes do timer são do aparelho, com padrão, e um perfil de antes (sem eles) lê os padrões', () => {
    expect(defaultSettings()).toMatchObject({ entry: 'timer', phases: 0, liveTime: 'full', inspVoice: false });
    const p = profile({ settings: { ...defaultSettings(), entry: 'typing', phases: 3, liveTime: 'seconds', inspVoice: true } });
    const { device, account } = splitProfile(p);
    expect(device.settings).toMatchObject({ entry: 'typing', phases: 3, liveTime: 'seconds', inspVoice: true });
    expect(Object.keys(account.settings).sort()).toEqual(['dailyGoal', 'inspection']);
    for (const key of ['entry', 'phases', 'liveTime', 'inspVoice']) expect(isPrefValue(`settings.${key}`, device.settings[key as 'entry'])).toBe(false);
    const old = { ...device, settings: { ...device.settings } } as { settings: Record<string, unknown> };
    for (const key of ['entry', 'phases', 'liveTime', 'inspVoice']) delete old.settings[key];
    expect(joinProfile(old as typeof device, account).settings).toMatchObject({ entry: 'timer', phases: 0, liveTime: 'full', inspVoice: false });
  });

  it('sem withDefaults, só as chaves fora do padrão; com ele, todas', () => {
    const { account } = splitProfile(profile({ trail: [false, true, false, false, false, false, false, false, false] }));
    expect([...prefsFromProfile(account).keys()]).toEqual(['trail.1']);
    expect(prefsFromProfile(account, { withDefaults: true }).size).toBe(9 + 6);
  });

  it('um item inválido ou de chave desconhecida fica de fora; null em lessonAt e 0 em algChoice são "sem valor"', () => {
    const p = profileFromPrefs([
      { key: 'trail.1', value: 'sim', updatedAt: 1 },
      { key: 'trail.9', value: true, updatedAt: 1 },
      { key: 'lessonAt.2', value: null, updatedAt: 1 },
      { key: 'algChoice.oll2-h', value: 0, updatedAt: 1 },
      { key: 'algChoice.nao-existe', value: 1, updatedAt: 1 },
      { key: 'futuro', value: 1, updatedAt: 1 },
      { key: 'settings.dailyGoal', value: 0, updatedAt: 1 },
    ]);
    expect(p).toEqual(profileFromPrefs([]));
  });

  it('os casos fora do sorteio saem na ordem em que foram tirados', () => {
    const p = profileFromPrefs([
      { key: 'trainOff.pll2-t', value: true, updatedAt: 5 },
      { key: 'trainOff.oll2-h', value: true, updatedAt: 9 },
      { key: 'trainOff.oll2-l', value: false, updatedAt: 7 },
    ]);
    expect(p.trainOff).toEqual(['pll2-t', 'oll2-h']);
  });

  it('duelName é uma preferência da conta: aceita até 20 caracteres, recusa o resto', () => {
    expect(defaultPrefValue('duelName')).toBe('');
    for (const ok of ['', 'Ana', 'x'.repeat(20), 'Ana 🧊', 'Ana Maria']) expect(isPrefValue('duelName', ok), ok).toBe(true);
    // Texto simples, de uma linha só, já aparado: o servidor recusa o resto (o app grava aparado, setDuelName).
    for (const bad of ['x'.repeat(21), ' Ana', 'Ana ', 'Ana\u0000', 'Ana\nBia', 'Ana\t', 'Ana\ud800', 42, null, undefined, ['Ana']]) {
      expect(isPrefValue('duelName', bad), String(bad)).toBe(false);
    }
    // Vale para o servidor: o item passa pela mesma checagem de forma que o sync usa.
    const item = (data: unknown): Change => ({ store: 'prefs', id: 'duelName', data, updatedAt: 3, deletedAt: null, deletionStamp: 3 });
    expect(checkChange(item('Ana')).ok).toBe(true);
    expect(checkChange(item('x'.repeat(21))).ok).toBe(false);
    expect(checkChange(item('Ana\nBia')).ok).toBe(false);
    // Ida e volta: fora do padrão vira item, no padrão não; um item inválido lê o padrão.
    const { account } = splitProfile(profile({ duelName: 'Ana' }));
    expect(prefsFromProfile(account).get('duelName')).toBe('Ana');
    expect(prefsFromProfile(splitProfile(profile()).account).has('duelName')).toBe(false);
    expect(prefsFromProfile(splitProfile(profile()).account, { withDefaults: true }).get('duelName')).toBe('');
    expect(profileFromPrefs([{ key: 'duelName', value: 'Ana', updatedAt: 1 }]).duelName).toBe('Ana');
    expect(profileFromPrefs([{ key: 'duelName', value: 'x'.repeat(21), updatedAt: 1 }]).duelName).toBe('');
    expect(profileFromPrefs([]).duelName).toBe('');
    // Um nome fora do formato no perfil (que não passaria no sync) vira o padrão, como as outras chaves.
    expect(prefsFromProfile(splitProfile(profile({ duelName: 'x'.repeat(21) })).account, { withDefaults: true }).get('duelName')).toBe('');
  });

  // A revisão final: os controles de direção (as marcas, os embutidos e os isolamentos, o U+202E inclusive) e o BOM reordenariam o texto em
  // volta do nome. O nome não os aceita: nem a preferência, nem o item no sync. O ZWJ dos emojis compostos fica.
  it('duelName recusa os controles de direção, como o U+202E, e mantém o emoji composto', () => {
    for (const ch of ['\u202e', '\u202a', '\u2066', '\u2068', '\u2069', '\u200f', '\u061c', '\ufeff']) {
      expect(isPrefValue('duelName', `Ana${ch}Bia`), JSON.stringify(ch)).toBe(false);
      expect(checkChange({ store: 'prefs', id: 'duelName', data: `Ana${ch}Bia`, updatedAt: 3, deletedAt: null, deletionStamp: 3 }).ok).toBe(false);
    }
    expect(profileFromPrefs([{ key: 'duelName', value: 'Ana\u202eBia', updatedAt: 1 }]).duelName).toBe('');
    const family = 'Ana 👨\u200d👩\u200d👧';
    expect(isPrefValue('duelName', family)).toBe(true);
    expect(checkChange({ store: 'prefs', id: 'duelName', data: family, updatedAt: 3, deletedAt: null, deletionStamp: 3 }).ok).toBe(true);
    expect(profileFromPrefs([{ key: 'duelName', value: family, updatedAt: 1 }]).duelName).toBe(family);
  });

  it('o valor padrão de cada família de chaves', () => {
    expect(['trail.0', 'lessonAt.1', 'algChoice.x', 'trainOff.x', 'finish', 'settings.inspection'].map(defaultPrefValue)).toEqual([false, null, 0, false, 'fosco', true]);
    expect(isPrefValue('season', defaultSeason())).toBe(true);
    expect(isPrefValue('season', { past: 'x' })).toBe(false);
  });
});

describe('forma da mudança (spec 6.1, passo 1)', () => {
  const ok: Change = {
    store: 'solves', id: 'a1', updatedAt: 3, deletedAt: null, deletionStamp: 2,
    data: { sessionId: 's', event: '333', ms: 1, penalty: '+2', at: 2, scramble: 'R', note: '', createdAt: 2, futuro: true },
  };

  it('aceita um solve, uma sessão, uma tentativa e um item da conta bem formados', () => {
    expect(checkChange(ok)).toEqual({ ok: true, change: ok });
    expect(checkChange({ store: 'sessions', id: 'default-333', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: 1 }, updatedAt: 1, deletedAt: 5, deletionStamp: 5 }).ok).toBe(true);
    expect(checkChange({ store: 'practice', id: 'p1', data: { caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: 1 }, updatedAt: 1, deletedAt: null, deletionStamp: 1 }).ok).toBe(true);
    expect(checkChange({ store: 'prefs', id: 'trail.0', data: true, updatedAt: 1, deletedAt: null, deletionStamp: 1 }).ok).toBe(true);
  });

  it.each([
    ['store desconhecida', { ...ok, store: 'profile' }, 'store desconhecida'],
    ['id com espaço', { ...ok, id: 'a b' }, 'id inválido'],
    ['data negativa', { ...ok, updatedAt: -1 }, 'datas inválidas'],
    ['evento desconhecido', { ...ok, data: { ...(ok.data as object), event: 'fto' } }, 'solve inválido'],
    ['nota grande demais', { ...ok, data: { ...(ok.data as object), note: 'x'.repeat(20_000) } }, 'grande demais'],
    ['prefs com exclusão', { store: 'prefs', id: 'trail.0', data: true, updatedAt: 1, deletedAt: 1, deletionStamp: 1 }, 'prefs sem exclusão'],
    ['chave da conta desconhecida', { store: 'prefs', id: 'theme', data: 'dark', updatedAt: 1, deletedAt: null, deletionStamp: 1 }, 'valor inválido para a chave'],
  ])('recusa %s, com o motivo', (_name, raw, reason) => {
    expect(checkChange(raw)).toEqual({ ok: false, reason });
  });

  it('o envelope sai só com os seis campos', () => {
    const r = checkChange({ ...ok, rev: 9 });
    expect(r.ok && Object.keys(r.change).sort()).toEqual(['data', 'deletedAt', 'deletionStamp', 'id', 'store', 'updatedAt']);
  });

  // Quantos objetos/listas encadeados, contando o próprio data. O corte é 32, igual no app e no servidor, e não depende da pilha.
  const comNiveis = (niveis: number): Change => {
    let fundo: unknown = [];
    for (let i = 1; i < niveis - 1; i++) fundo = [fundo];
    return { ...ok, data: { ...(ok.data as object), fundo } };
  };

  it('32 níveis de aninhamento passam; 33 são recusados como grande demais', () => {
    expect(checkChange(comNiveis(32)).ok).toBe(true);
    expect(checkChange(comNiveis(33))).toEqual({ ok: false, reason: 'grande demais' });
  });

  it('um data aninhado a milhares de níveis é recusado como grande demais, sem estourar a pilha', () => {
    expect(checkChange(comNiveis(20_000))).toEqual({ ok: false, reason: 'grande demais' });
  });

  it('o corte de profundidade vale também para uma lista dentro de um item da conta', () => {
    let fundo: unknown = [];
    for (let i = 0; i < 40; i++) fundo = [fundo];
    expect(checkChange({ store: 'prefs', id: 'trail.0', data: fundo, updatedAt: 1, deletedAt: null, deletionStamp: 1 })).toEqual({
      ok: false,
      reason: 'grande demais',
    });
  });

  // As datas viram o relógio do app (max(Date.now(), clock + 1)): acima de 2^53 o `+ 1` não muda nada, o relógio para e toda gravação
  // seguinte empata. O servidor guarda o maior, então uma data assim nunca mais sairia da conta.
  it.each([
    ['updatedAt em 2^53', { ...ok, updatedAt: 2 ** 53 }],
    ['updatedAt em 1e300', { ...ok, updatedAt: 1e300 }],
    ['updatedAt fracionário', { ...ok, updatedAt: 1.5 }],
    ['deletionStamp fracionário', { ...ok, deletionStamp: 1.5 }],
    ['deletionStamp em 2^53', { ...ok, deletionStamp: 2 ** 53 }],
    ['deletedAt fracionário', { ...ok, deletedAt: 1.5 }],
    ['deletedAt em 2^53', { ...ok, deletedAt: 2 ** 53 }],
    ['deletedAt em 1e300', { ...ok, deletedAt: 1e300 }],
    ['updatedAt NaN', { ...ok, updatedAt: Number.NaN }],
    ['updatedAt infinito', { ...ok, updatedAt: Number.POSITIVE_INFINITY }],
    ['updatedAt no maior inteiro seguro', { ...ok, updatedAt: Number.MAX_SAFE_INTEGER }],
    ['updatedAt logo acima do teto', { ...ok, updatedAt: MAX_STAMP + 1 }],
    ['deletionStamp logo acima do teto', { ...ok, deletionStamp: MAX_STAMP + 1 }],
    ['deletedAt logo acima do teto', { ...ok, deletedAt: MAX_STAMP + 1 }],
  ])('recusa %s como datas inválidas', (_name, raw) => {
    expect(checkChange(raw)).toEqual({ ok: false, reason: 'datas inválidas' });
  });

  // O teto (MAX_STAMP) fica 2^32 ms abaixo do maior inteiro seguro, o mesmo do relógio dos aparelhos: um registro com data acima dele
  // nunca mais poderia ser editado nem apagado, porque nenhum aparelho grava uma data maior.
  it('aceita datas no teto e no zero', () => {
    expect(MAX_STAMP).toBe(Number.MAX_SAFE_INTEGER - 2 ** 32);
    const topo = MAX_STAMP;
    expect(checkChange({ ...ok, updatedAt: topo, deletedAt: topo, deletionStamp: topo }).ok).toBe(true);
    expect(checkChange({ ...ok, updatedAt: 0, deletedAt: 0, deletionStamp: 0 }).ok).toBe(true);
  });
});

// O servidor passa a temporada guardada e a recebida para mergeSeason, que lê `past` e `current` sem conferir nada: a forma tem de barrar
// antes tudo o que não é uma SeasonProgress inteira.
describe('a temporada na mudança (spec 6.1, passo 1)', () => {
  const season = (data: unknown): Change => ({ store: 'prefs', id: 'season', data, updatedAt: 1, deletedAt: null, deletionStamp: 1 });
  const REJECTED = { ok: false, reason: 'valor inválido para a chave' };

  it('aceita a temporada inteira', () => {
    expect(checkChange(season(defaultSeason()))).toEqual({ ok: true, change: season(defaultSeason()) });
  });

  it.each([
    ['sem past', { current: defaultSeason().current }],
    ['past que não é lista', { current: defaultSeason().current, past: 'x' }],
    ['sem current', { past: [] }],
    ['current torto', { current: { n: 1 }, past: [] }],
    ['past com registro torto', { current: { ...defaultSeason().current, n: 2 }, past: [{ n: 1 }] }],
    ['numeração que não fecha', { current: { ...defaultSeason().current, n: 3 }, past: [] }],
    ['não é objeto', 'temporada'],
    ['null', null],
  ])('recusa uma temporada %s', (_name, data) => {
    expect(checkChange(season(data))).toEqual(REJECTED);
  });
});

// Fix round 1: trazer para o maior inteiro seguro uma data além dele daria ao sync uma data válida que trava o relógio (o seguinte, 2^53, não
// é inteiro seguro). stampOf não a ajusta: quem chama recusa o registro (o import) ou o deixa fora da fila (checkChange).
describe('stampOf', () => {
  it('a fração vira o inteiro de baixo, a negativa e o que não é número viram 0', () => {
    expect([stampOf(1_500.75), stampOf(-7), stampOf(Number.NaN), stampOf('1'), stampOf(Number.POSITIVE_INFINITY)]).toEqual([1_500, 0, 0, 0, 0]);
  });

  it('uma data além do maior inteiro seguro não é trazida para dentro: continua inválida para o sync', () => {
    expect(stampOf(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    for (const big of [2 ** 53, 1e300]) {
      expect(Number.isSafeInteger(stampOf(big))).toBe(false);
      expect(checkChange({ store: 'solves', id: 'x', data: {}, updatedAt: 1, deletedAt: stampOf(big), deletionStamp: 1 })).toMatchObject({ ok: false });
    }
  });
});
