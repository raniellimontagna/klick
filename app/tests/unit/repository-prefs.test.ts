import { describe, expect, it } from 'vitest';
import type { Goal } from '../../src/core/goals';
import { seasonOne } from '../../src/core/season';
import type { SyncState } from '../../src/core/sync/types';
import type { SeasonRecord } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, defaultSyncState } from '../../src/data/repository';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;

async function fresh() {
  const db = await openKlickDb(`prefs-${++n}`);
  return { db, repo: createRepository(db, { now, channel: null }) };
}

describe('perfil dividido (spec 5.2): o aparelho na store profile, a conta em prefs', () => {
  it('um ajuste do aparelho não vira item da conta; um da conta vira, com a data do relógio', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ settings: { theme: 'dark', holdMs: 550 } });
    expect(await db.getAll('prefs')).toEqual([]);
    expect((await db.get('profile', 'current'))?.settings).toMatchObject({ theme: 'dark', holdMs: 550 });
    t += 1000;
    await repo.saveProfile({ settings: { inspection: false }, trail: [true, false, false, false, false, false, false, false, false] });
    expect(await db.getAll('prefs')).toEqual([
      { key: 'settings.inspection', value: false, updatedAt: t },
      { key: 'trail.0', value: true, updatedAt: t },
    ]);
    expect(await repo.getProfile()).toMatchObject({ settings: { theme: 'dark', inspection: false }, trail: [true, false, false, false, false, false, false, false, false] });
  });

  it('o que some vira o valor padrão gravado: a aula concluída (null), a escolha que volta ao padrão (0), o caso que volta ao sorteio (false)', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ lessonAt: { 2: 5 }, algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-t'] });
    t += 1000;
    await repo.saveProfile({ lessonAt: {}, algChoice: {}, trainOff: [] });
    const items = Object.fromEntries((await db.getAll('prefs')).map((p) => [p.key, p.value]));
    expect(items).toMatchObject({ 'lessonAt.2': null, 'algChoice.oll2-h': 0, 'trainOff.pll2-t': false });
    expect(await repo.getProfile()).toMatchObject({ lessonAt: {}, algChoice: {}, trainOff: [] });
  });

  // As metas (estatísticas, spec 5): uma chave por meta. Duas metas mexidas em aparelhos diferentes não se sobrescrevem porque cada gravação
  // só leva a chave da meta que mudou.
  const single: Goal = { kind: 'single', event: '333', targetMs: 11_000, startMs: 12_400, createdAt: 1_791_000_000_000, reachedAt: null };
  const ao12: Goal = { kind: 'ao12', event: '222', targetMs: 5_000, startMs: null, createdAt: 1_791_000_000_100, reachedAt: null };

  it('excluir uma meta grava null na chave dela e só nela', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ goals: { a1: single, b2: ao12 } });
    expect(await db.getAll('prefs')).toEqual([
      { key: 'goal.a1', value: single, updatedAt: t },
      { key: 'goal.b2', value: ao12, updatedAt: t },
    ]);
    const before = t;
    t += 1000;
    await repo.saveProfile({ goals: { b2: ao12 } });
    expect(await db.getAll('prefs')).toEqual([
      { key: 'goal.a1', value: null, updatedAt: t },
      { key: 'goal.b2', value: ao12, updatedAt: before },
    ]);
    expect((await repo.getProfile()).goals).toEqual({ b2: ao12 });
  });

  it('editar uma meta não regrava as outras', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ goals: { a1: single, b2: ao12 } });
    const before = t;
    t += 1000;
    const edited: Goal = { ...single, targetMs: 10_500 };
    await repo.saveProfile({ goals: { a1: edited, b2: ao12 } });
    expect(await db.getAll('prefs')).toEqual([
      { key: 'goal.a1', value: edited, updatedAt: t },
      { key: 'goal.b2', value: ao12, updatedAt: before },
    ]);
    expect((await repo.getProfile()).goals).toEqual({ a1: edited, b2: ao12 });
  });

  it('virar a temporada grava o item "season"', async () => {
    const { db, repo } = await fresh();
    const record: SeasonRecord = { n: 1, startedAt: 0, endedAt: t, solves: 1000, startAo12: null, endAo12: 40_000 };
    await repo.advanceSeason(1, record, { ...seasonOne(), n: 2, startedAt: t });
    const item = await db.get('prefs', 'season');
    expect(item?.value).toMatchObject({ past: [record], current: { n: 2 } });
    expect((await repo.getProfile()).season.past).toEqual([record]);
  });

  it('o relógio do app nunca volta (spec 5.4): duas gravações no mesmo milissegundo, e um aparelho atrasado depois de ver datas mais novas', async () => {
    const { db, repo } = await fresh();
    await repo.saveProfile({ onboarded: true });
    await repo.saveProfile({ onboarded: false }); // no mesmo milissegundo: a segunda data é maior
    expect(await db.get('prefs', 'onboarded')).toEqual({ key: 'onboarded', value: false, updatedAt: t + 1 });
    // O servidor mandou datas de uma hora à frente: o relógio do app subiu. O relógio do sistema continua atrasado.
    const ahead = t + 3_600_000;
    await db.put('meta', { ...defaultSyncState(), clock: ahead } satisfies SyncState, 'sync');
    await repo.saveProfile({ trail: [false, true, false, false, false, false, false, false, false] });
    expect((await db.get('prefs', 'trail.1'))?.updatedAt).toBe(ahead + 1);
    expect(((await db.get('meta', 'sync')) as SyncState).clock).toBe(ahead + 1);
  });

  it('o export leva o perfil montado das duas partes; sem nada gravado, nenhum', async () => {
    const { repo } = await fresh();
    expect((await repo.exportAll()).profile).toBeNull();
    await repo.saveProfile({ settings: { theme: 'light' }, finish: 'fosco' });
    expect((await repo.exportAll()).profile).toEqual(await repo.getProfile());
  });
});
