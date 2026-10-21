import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { seasonOne } from '../../src/core/season';
import { defaultSettings, type KlickExport, type Meta, type Practice, type Profile, type Session, type Solve } from '../../src/core/types';
import { DB_VERSION, exportStuckDb, openKlickDb, type StoredSolve } from '../../src/data/db';
import { parseKlickJson } from '../../src/data/transfer';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
const T0 = 1_791_500_000_000;
const MIGRATED_AT = T0 + 9_000_000;
const DAY = 86_400_000;

// Um aparelho de verdade na versão 2 (spec 11, "Migração v3"): sessões e solves com lixeira (inclusive a cascata de uma sessão
// apagada), treino, trilha, temporadas fechadas, acabamento, escolhas de algoritmo, aulas pela metade e ajustes dos dois tipos.
function fixture() {
  const at = (i: number) => T0 - 5 * DAY + i * 60_000;
  const sessions: Session[] = [
    { id: 'main', name: 'Principal', event: '333', order: 0, createdAt: at(0), updatedAt: at(0), deletedAt: null },
    { id: 'gone', name: 'Velha', event: '222', order: 1, createdAt: at(1), updatedAt: at(50), deletedAt: at(50) },
  ];
  const solve = (id: string, sessionId: string, i: number, deletedAt: number | null = null): Solve => ({
    id, sessionId, event: sessionId === 'gone' ? '222' : '333', ms: 30_000 + i, penalty: i === 3 ? '+2' : null, at: at(i),
    scramble: `R U ${i}`, note: i === 2 ? 'boa' : '', createdAt: at(i), updatedAt: deletedAt ?? at(i), deletedAt,
  });
  const solves: Solve[] = [
    solve('a', 'main', 2),
    solve('b', 'main', 3),
    solve('c', 'main', 4, at(40)), // na lixeira sozinho
    solve('d', 'gone', 5, at(50)), // saiu junto com a sessão
  ];
  const practice: Practice[] = [{ id: 'p1', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: at(10) }];
  // Como a versão 2 o gravava, antes do nome dos desafios e das metas: ao ler, eles ganham o padrão ('' e {}).
  const profile: Omit<Profile, 'duelName' | 'goals'> = {
    settings: { ...defaultSettings(), inspection: false, dailyGoal: 30, theme: 'dark', holdMs: 550, sound: { klick: false, insp: true, pb: true } },
    trail: [true, true, true, false, false, false, false, false, false],
    finish: 'gelo',
    onboarded: true,
    currentSessionId: 'main',
    season: {
      current: { ...seasonOne(), n: 3, startedAt: at(30) },
      past: [
        { n: 1, startedAt: 0, endedAt: at(20), solves: 1000, startAo12: null, endAo12: 40_000 },
        { n: 2, startedAt: at(20), endedAt: at(30), solves: 50, startAo12: 40_000, endAo12: 35_000 },
      ],
    },
    lessonAt: { 3: 4 },
    algChoice: { 'oll2-h': 1 },
    trainOff: ['pll2-t'],
  };
  const meta = { schemaVersion: 1, deviceId: 'dev', solvesSinceBackup: 3, trailPromptDismissed: true } as Partial<Meta>;
  // O arquivo de um banco de antes da v3 sai sem as metas, que vieram depois: restaurá-lo não apaga as de agora.
  const copied: Omit<Profile, 'goals'> = { ...profile, duelName: '' };
  const migrated: Profile = { ...copied, goals: {} };
  return { sessions, solves, practice, profile, copied, migrated, meta };
}

// Grava a fixture direto na versão 2, como o app daquela versão gravava.
async function v2Device(): Promise<{ name: string; data: ReturnType<typeof fixture> }> {
  const name = `migracao-${++n}`;
  const data = fixture();
  const db = await openKlickDb(name, {}, 2);
  for (const s of data.sessions) await db.put('sessions', s as never);
  for (const s of data.solves) await db.put('solves', s as never);
  for (const p of data.practice) await db.put('practice', p as never);
  await db.put('profile', data.profile as never, 'current');
  await db.put('meta', data.meta as Meta, 'current');
  db.close();
  return { name, data };
}

describe('migração para a versão 3 (spec 5.6)', () => {
  it('nenhum dado sai: solves, sessões, lixeira, treino e o perfil inteiro leem igual', async () => {
    const { name, data } = await v2Device();
    const db = await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT);
    const repo = createRepository(db, { now: () => T0, channel: null });
    expect(await repo.listSessions({ includeDeleted: true })).toEqual(data.sessions);
    expect(await repo.listSolves({ includeDeleted: true })).toEqual(data.solves);
    expect(await repo.listTrash()).toEqual({ sessions: [data.sessions[1]], solves: [data.solves[3], data.solves[2]], duels: [] });
    expect(await repo.listPractice()).toEqual(data.practice);
    expect(await repo.getProfile()).toEqual(data.migrated);
    expect(await repo.getMeta()).toMatchObject(data.meta);
  });

  it('as datas novas: deletionStamp = deletedAt ou createdAt; no treino, updatedAt = at; o perfil dividido em aparelho e conta', async () => {
    const { name, data } = await v2Device();
    const db = await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT);
    const stored = (await db.getAll('solves')) as StoredSolve[];
    expect(stored.map((s) => [s.id, s.deletionStamp])).toEqual(data.solves.map((s) => [s.id, s.deletedAt ?? s.createdAt]));
    const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : 1);
    expect((await db.getAll('sessions')).sort(byId).map((s) => s.deletionStamp)).toEqual([...data.sessions].sort(byId).map((s) => s.deletedAt ?? s.createdAt));
    expect(await db.getAll('practice')).toEqual([{ ...data.practice[0], updatedAt: data.practice[0].at, deletedAt: null, deletionStamp: data.practice[0].at }]);
    const device = await db.get('profile', 'current');
    expect(Object.keys(device!.settings)).not.toContain('inspection');
    expect(device).toMatchObject({ currentSessionId: 'main', settings: { theme: 'dark', holdMs: 550 } });
    // Só as chaves da conta fora do padrão viram itens, com a hora da migração.
    const prefs = await db.getAll('prefs');
    expect(prefs.map((p) => p.key).sort()).toEqual(
      ['algChoice.oll2-h', 'finish', 'lessonAt.3', 'onboarded', 'season', 'settings.dailyGoal', 'settings.inspection', 'trail.0', 'trail.1', 'trail.2', 'trainOff.pll2-t'].sort(),
    );
    expect(new Set(prefs.map((p) => p.updatedAt))).toEqual(new Set([MIGRATED_AT]));
    expect(await db.getAll('outbox')).toEqual([]);
    expect(await db.get('meta', 'sync')).toBeUndefined();
  });

  it('antes de migrar, grava a cópia "antes da v3" com tudo, e não grava outra na próxima abertura', async () => {
    const { name, data } = await v2Device();
    (await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT)).close();
    const db = await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT + 1);
    const backups = await db.getAll('backups');
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ reason: 'pre-sync', label: 'v3', createdAt: MIGRATED_AT, solveCount: 2, encoding: 'json' });
    const copy = JSON.parse(backups[0].payload) as KlickExport;
    expect(copy).toMatchObject({ format: 'klick', version: 1, sessions: data.sessions, solves: data.solves, practice: data.practice, profile: data.profile });
  });

  it('um banco novo nasce na versão 3 sem cópia nenhuma', async () => {
    const db = await openKlickDb(`migracao-${++n}`);
    expect(await db.getAll('backups')).toEqual([]);
    expect([...db.objectStoreNames].sort()).toEqual(['backups', 'duels', 'meta', 'outbox', 'practice', 'prefs', 'profile', 'sessions', 'solves']);
  });

  it('não tem volta: a versão 2 do app não abre o banco migrado', async () => {
    const { name } = await v2Device();
    (await openKlickDb(name)).close();
    await expect(openKlickDb(name, {}, 2)).rejects.toMatchObject({ name: 'VersionError' });
  });

  it('a tela mostra o mesmo de antes: sessões, solves, perfil e treino no AppState', async () => {
    const { name, data } = await v2Device();
    const repo = createRepository(await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT), { now: () => T0, channel: null });
    const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), now: () => T0, storage: null, storageManager: null });
    await app.init();
    expect(app.sessions).toEqual([data.sessions[0]]);
    expect(app.solves).toEqual(data.solves.slice(0, 2));
    expect(app.profile).toEqual(data.migrated);
    expect(app.practice).toEqual(data.practice);
    expect(app.profile.season.past).toHaveLength(2);
  });

  it('exportStuckDb lê um banco da versão 2 sem mudar a versão nem os dados', async () => {
    const { name, data } = await v2Device();
    const file = await exportStuckDb(name, MIGRATED_AT);
    expect(file).toEqual({
      format: 'klick',
      version: 1,
      exportedAt: MIGRATED_AT,
      sessions: data.sessions,
      solves: [...data.solves].sort((a, b) => a.at - b.at),
      profile: data.copied,
      practice: data.practice,
    });
    // Reaberto na versão 2 (sem pedir a 3), o banco continua como estava: a versão, as stores e os registros.
    const db = await openKlickDb(name, {}, 2);
    try {
      expect(db.version).toBe(2);
      expect([...db.objectStoreNames].sort()).toEqual(['backups', 'meta', 'practice', 'profile', 'sessions', 'solves']);
      expect((await db.getAll('sessions')).sort((a, b) => a.order - b.order)).toEqual(data.sessions);
      expect(await db.getAll('solves')).toEqual(data.solves);
      expect(await db.getAll('practice')).toEqual(data.practice);
      expect(await db.get('profile', 'current')).toEqual(data.profile);
      expect(await db.getAll('backups')).toEqual([]);
    } finally {
      db.close();
    }
  });

  it('o arquivo do exportStuckDb tem o mesmo formato da cópia "antes da v3" (uma função monta os dois)', async () => {
    const { name } = await v2Device();
    const stuck = await exportStuckDb(name, MIGRATED_AT);
    (await openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT)).close();
    const db = await openKlickDb(name);
    const [backup] = await db.getAll('backups');
    expect(JSON.stringify(stuck)).toBe(backup.payload);
  });

  it('num banco da versão 1, o arquivo sai sem treino', async () => {
    const name = `migracao-${++n}`;
    const data = fixture();
    const v1 = await openKlickDb(name, {}, 1);
    for (const s of data.sessions) await v1.put('sessions', s as never);
    for (const s of data.solves) await v1.put('solves', s as never);
    await v1.put('profile', data.profile as never, 'current');
    v1.close();
    const file = await exportStuckDb(name, MIGRATED_AT);
    expect(file.sessions).toEqual(data.sessions);
    expect(file.solves).toHaveLength(4);
    expect(file.profile).toEqual(data.copied);
    expect(file.practice).toEqual([]);
    const db = await openKlickDb(name, {}, 1);
    try {
      expect(db.version).toBe(1);
      expect([...db.objectStoreNames]).not.toContain('practice');
    } finally {
      db.close();
    }
  });

  it('exportStuckDb solta a conexão: a migração abre em seguida sem ficar presa', async () => {
    const { name } = await v2Device();
    await exportStuckDb(name, MIGRATED_AT);
    const blocked = vi.fn();
    const db = await openKlickDb(name, { blocked }, DB_VERSION, () => MIGRATED_AT);
    expect(db.version).toBe(DB_VERSION);
    expect(blocked).not.toHaveBeenCalled();
    db.close();
  });

  it('exportStuckDb não trava quando outra aba segura a abertura: desiste no prazo e solta a conexão tardia', async () => {
    const { name } = await v2Device();
    // Uma aba antiga segura a versão 2 sem largar; a abertura da versão 3 fica na fila e a leitura, atrás dela.
    const holder = await openDB(name, 2);
    const pending = openKlickDb(name, {}, DB_VERSION, () => MIGRATED_AT);
    await expect(exportStuckDb(name, MIGRATED_AT, 50)).rejects.toThrow('não terminou');
    holder.close(); // a aba antiga larga: a migração termina, e a leitura tardia abre por último (e tem de largar a conexão na hora)
    const db = await pending;
    expect(db.version).toBe(DB_VERSION);
    db.close();
    await new Promise((resolve) => setTimeout(resolve, 50)); // dá tempo da abertura tardia da leitura terminar
    const blocked = vi.fn();
    const upgrade = openKlickDb(name, { blocked }, DB_VERSION + 1, () => MIGRATED_AT);
    await Promise.race([upgrade, new Promise((resolve) => setTimeout(resolve, 300))]);
    expect(blocked).not.toHaveBeenCalled(); // uma conexão tardia esquecida aberta seguraria esta abertura
    (await upgrade).close();
  });

  it('exportStuckDb num banco que não existe falha e não cria banco nenhum', async () => {
    const name = `nao-existe-${++n}`;
    await expect(exportStuckDb(name, MIGRATED_AT)).rejects.toMatchObject({ name: 'AbortError' });
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(name);
    // Abrir com versão confirma: continua sem banco (versão anterior 0), e o app cria as stores como num aparelho novo.
    let oldVersion = -1;
    const db = await openDB(name, 1, { upgrade: (_db, old) => void (oldVersion = old) });
    db.close();
    expect(oldVersion).toBe(0);
  });

  it('o arquivo do exportStuckDb entra pela importação normal do app, com as mesmas sessões, solves e treino', async () => {
    const { name, data } = await v2Device();
    const file = await exportStuckDb(name, MIGRATED_AT);
    const parsed = parseKlickJson(JSON.stringify(file));
    expect(parsed.sessions).toEqual([...data.sessions].sort((a, b) => a.order - b.order));
    expect(parsed.solves).toHaveLength(data.solves.length);
    expect([...parsed.solves].sort((a, b) => (a.id < b.id ? -1 : 1))).toEqual(data.solves);
    expect(parsed.practice).toHaveLength(data.practice.length);
    expect(parsed.practice).toEqual(data.practice);
    expect(parsed.profile).toMatchObject({ onboarded: true, finish: 'gelo', currentSessionId: 'main' });
  });
});
