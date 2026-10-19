import { describe, expect, it, vi } from 'vitest';
import { decodeDuelLink, duelPayloadOf, encodeDuelLink } from '../../src/core/duel/link';
import type { DuelLink, DuelTime, EventId, Penalty } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { createBackup } from '../../src/data/safety';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import type { DuelState } from '../../src/ui/state/duel.svelte';
import { appWithAccount, fakeApi, manualEnv } from './sync-account';
import { FakeServer } from './sync-fakes';

let n = 0;
const t = 1_791_500_000_000;
const now = () => t;
const ORIGIN = 'https://klick.test';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const tm = (ms: number, penalty: Penalty = null): DuelTime => ({ ms, penalty });
const payloadOf = (url: string | null): string => duelPayloadOf(new URL(url!).hash)!;

// Os tempos de A e os de B numa partida que B fecha no quinto: B, A, ninguém (empate no centésimo), B, B (contra um DNF).
const A_TIMES = [tm(10_000), tm(12_000), tm(11_000), tm(15_000), tm(9_000, 'DNF'), tm(12_300), tm(13_080)];
const B_TIMES = [tm(9_000), tm(13_000), tm(11_005), tm(14_000), tm(13_000)];
const B_POINTS = ['b', 'a', null, 'b', 'b'];
const SCRAMBLES = Array.from({ length: 7 }, (_, i) => `R U R' U' F${i}`);
// Um desafio pronto, como o link de A chega a B.
const LINK: DuelLink = { v: 1, id: 'abcdefgh12345678', event: '333', scrambles: SCRAMBLES, a: { name: 'Ranielli', times: A_TIMES } };

// O gerador falso do desafio: `${evento}-${n}`, um por chamada, contando quantas gerações rodam juntas. `fail` diz que chamada falha.
function fakeGenerate(fail: (call: number) => boolean = () => false) {
  let calls = 0;
  let running = 0;
  const g = {
    most: 0,
    generate: async (ev: EventId): Promise<string> => {
      const call = ++calls;
      running++;
      g.most = Math.max(g.most, running);
      await sleep(0);
      running--;
      if (fail(call)) throw new Error('timeout');
      return `${ev}-${call}`;
    },
  };
  return g;
}

// Um aparelho com o app aberto. `repo` reaproveita o banco de outro: é a página recarregada.
async function device(o: { repo?: Repository; generate?: (ev: EventId) => Promise<string>; now?: () => number } = {}) {
  const clock = o.now ?? now;
  const repo = o.repo ?? createRepository(await openKlickDb(`duel-${++n}`), { now: clock, channel: null });
  const app = new AppState({
    repo,
    queue: createScrambleQueue({ generate: async (ev) => `${ev}-timer` }),
    now: clock,
    storage: null,
    storageManager: null,
    duel: { generate: o.generate ?? fakeGenerate().generate },
  });
  await app.init();
  return { app, repo };
}

// A desafia: os sete solves e o link.
async function challenge(app: AppState, o: { times?: DuelTime[]; name?: string; event?: EventId } = {}): Promise<string> {
  await app.duel.start(o.event ?? '333');
  for (const x of o.times ?? A_TIMES) await app.duel.record(x);
  return (await app.duel.challengeUrl(ORIGIN, o.name))!;
}

// B joga estes solves, um por vez: o solve, "Ver o ponto" e "Próximo".
async function play(app: AppState, times: DuelTime[]): Promise<void> {
  for (const x of times) {
    await app.duel.record(x);
    await app.duel.reveal();
    app.duel.next();
  }
}

// Tudo o que se alcança de app.duel: os campos dele e o valor de cada getter.
function reachable(duel: DuelState): Record<string, unknown> {
  const out: Record<string, unknown> = { ...duel };
  for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(duel)))) {
    if (d.get) out[key] = (duel as unknown as Record<string, unknown>)[key];
  }
  return out;
}

// B aceita o desafio deste link num aparelho novo.
async function accepted(url: string) {
  const b = await device();
  await b.app.duel.openLink(payloadOf(url));
  await b.app.duel.accept();
  return { ...b, id: b.app.duel.current!.id };
}

describe('o estado do desafio (spec do desafio, seções 3 a 6)', () => {
  it('A começa: sete embaralhamentos do evento, registro playing; ao fim, o link leva os sete tempos e o nome', async () => {
    const gen = fakeGenerate();
    const { app, repo } = await device({ generate: gen.generate });
    app.duel.pick();
    expect(app.duel.phase).toBe('picking');
    expect(app.duel.pickEvent).toBe('333'); // o evento da sessão atual
    const starting = app.duel.start('pyram');
    expect(app.duel.phase).toBe('loading');
    await starting;
    expect(gen.most).toBe(1); // um por vez
    expect(app.duel.phase).toBe('solving');
    const duel = app.duel.current!;
    const scrambles = Array.from({ length: 7 }, (_, i) => `pyram-${i + 1}`);
    expect(duel).toMatchObject({ side: 'a', event: 'pyram', scrambles, mine: [], theirs: null, status: 'playing', deletedAt: null });
    expect(duel.id).toBe(`${duel.linkId}-a`);
    expect(await repo.getDuel(duel.id)).toEqual(duel); // gravado antes de o Timer entrar no desafio
    expect(app.duel.score).toBeNull(); // A ainda não tem com quem comparar

    for (let i = 0; i < 7; i++) {
      expect(app.duel.index).toBe(i);
      expect(app.duel.scramble).toBe(scrambles[i]);
      await app.duel.record(A_TIMES[i]!);
      expect((await repo.getDuel(duel.id))!.mine).toEqual(A_TIMES.slice(0, i + 1)); // cada solve gravado
    }
    expect(app.duel.phase).toBe('finished');
    // Os tempos do desafio ficam só no registro dele: nada nos solves.
    expect(app.solves).toEqual([]);
    expect(await repo.listSolves({ includeDeleted: true })).toEqual([]);

    // O nome editado na tela de mandar vai para os Ajustes e para o link; o desafio passa a esperar a resposta.
    const url = await app.duel.challengeUrl(ORIGIN, '  Ranielli ');
    expect(url?.startsWith(`${ORIGIN}/#desafio=`)).toBe(true);
    expect(await decodeDuelLink(payloadOf(url))).toEqual({
      v: 1,
      id: duel.linkId,
      event: 'pyram',
      scrambles,
      a: { name: 'Ranielli', times: A_TIMES },
    });
    expect(app.profile.duelName).toBe('Ranielli');
    expect(await repo.getDuel(duel.id)).toMatchObject({ status: 'waiting', myName: 'Ranielli', mine: A_TIMES });
    expect(app.duel.current).toMatchObject({ status: 'waiting', myName: 'Ranielli' });
  });

  it('B aceita e joga: cada solve revela o tempo de A e o ponto; acaba quando alguém chega a 3', async () => {
    const A = await device();
    const url = await challenge(A.app, { name: 'Ranielli' });
    const scrambles = A.app.duel.current!.scrambles;
    const B = await device();
    expect(await B.app.duel.openLink(payloadOf(url))).toBe('receive');
    expect(B.app.duel.phase).toBe('receive');
    expect(B.app.duel.invite).toEqual({ event: '333', name: 'Ranielli' });
    expect(B.app.duel.current).toBeNull();
    expect(await B.repo.listDuels({ includeDeleted: true })).toEqual([]); // abrir não grava nada

    await B.app.duel.accept();
    expect(B.app.duel.phase).toBe('solving');
    expect(B.app.duel.invite).toBeNull();
    const id = B.app.duel.current!.id;
    expect(id).toBe(`${A.app.duel.current!.linkId}-b`);
    expect(await B.repo.getDuel(id)).toMatchObject({ side: 'b', status: 'playing', scrambles, mine: [], theirs: A_TIMES, theirName: 'Ranielli' });
    expect(B.app.duel.score).toMatchObject({ points: { a: 0, b: 0 }, perPoint: [], over: false });

    for (let i = 0; i < B_TIMES.length; i++) {
      expect(B.app.duel.index).toBe(i);
      expect(B.app.duel.scramble).toBe(scrambles[i]);
      await B.app.duel.record(B_TIMES[i]!);
      // Parou: o solve está gravado, e o tempo de A deste embaralhamento não aparece em nada, nem no placar.
      expect(B.app.duel.phase).toBe('confirm');
      expect(B.app.duel.index).toBe(i);
      expect((await B.repo.getDuel(id))!.mine).toEqual(B_TIMES.slice(0, i + 1));
      expect(B.app.duel.opponent).toEqual(A_TIMES.slice(0, i));
      expect(B.app.duel.score!.perPoint).toEqual(B_POINTS.slice(0, i));
      await B.app.duel.reveal();
      expect(B.app.duel.phase).toBe('reveal');
      expect(B.app.duel.opponent).toEqual(A_TIMES.slice(0, i + 1));
      expect(B.app.duel.score!.perPoint).toEqual(B_POINTS.slice(0, i + 1));
      B.app.duel.next();
    }
    // B chegou a 3 no quinto: a partida acaba ali, sem o sexto e o sétimo.
    expect(B.app.duel.phase).toBe('finished');
    expect(B.app.duel.score).toMatchObject({ points: { a: 1, b: 3 }, over: true, winner: 'b' });
    expect(await B.repo.getDuel(id)).toMatchObject({ status: 'done', mine: B_TIMES });
    await B.app.duel.record(tm(8_000));
    expect((await B.repo.getDuel(id))!.mine).toEqual(B_TIMES);
    expect(B.app.solves).toEqual([]);

    // A resposta leva os dois lados e o nome de B.
    const reply = await B.app.duel.replyUrl(ORIGIN, 'Bia');
    expect(await decodeDuelLink(payloadOf(reply))).toEqual({
      v: 1,
      id: A.app.duel.current!.linkId,
      event: '333',
      scrambles,
      a: { name: 'Ranielli', times: A_TIMES },
      b: { name: 'Bia', times: B_TIMES },
    });
    expect(await B.repo.getDuel(id)).toMatchObject({ myName: 'Bia' });
  });

  // Review Focus 1.
  it('reabrir o link no meio volta ao próximo embaralhamento, sem refazer', async () => {
    const A = await device();
    const url = await challenge(A.app);
    const B = await accepted(url);
    await play(B.app, B_TIMES.slice(0, 2));
    // B fecha a aba e abre o link de novo: a página recarregada, o mesmo banco.
    const again = await device({ repo: B.repo });
    expect(await again.app.duel.openLink(payloadOf(url))).toBe('resume');
    expect(again.app.duel.phase).toBe('solving');
    expect(again.app.duel.index).toBe(2);
    expect(again.app.duel.scramble).toBe(A.app.duel.current!.scrambles[2]);
    expect(again.app.duel.current!.mine).toEqual(B_TIMES.slice(0, 2));
    expect(again.app.duel.score!.points).toEqual({ a: 1, b: 1 });
    // Aceitar de novo não existe: nada zera.
    await again.app.duel.accept();
    expect(again.app.duel.current!.mine).toEqual(B_TIMES.slice(0, 2));
    await again.app.duel.record(B_TIMES[2]!);
    await again.app.duel.reveal();
    expect((await B.repo.getDuel(B.id))!.mine).toEqual(B_TIMES.slice(0, 3));
    expect(await B.repo.listDuels({ includeDeleted: true })).toHaveLength(1);

    // Duas abas com o mesmo convite aberto: a segunda a aceitar continua do que a primeira jogou.
    const one = await device();
    const two = await device({ repo: one.repo });
    await one.app.duel.openLink(payloadOf(url));
    await two.app.duel.openLink(payloadOf(url));
    await one.app.duel.accept();
    await play(one.app, B_TIMES.slice(0, 1));
    await two.app.duel.accept();
    expect(two.app.duel.phase).toBe('solving');
    expect(two.app.duel.index).toBe(1);
    expect((await one.repo.listDuels())[0]!.mine).toEqual(B_TIMES.slice(0, 1));
  });

  // Review Focus 5.
  it('setPenalty depois da revelação não muda nada', async () => {
    const A = await device();
    const B = await accepted(await challenge(A.app));
    await B.app.duel.record(tm(9_000));
    await B.app.duel.setPenalty('+2'); // na confirmação, vale
    expect(B.app.duel.current!.mine).toEqual([tm(9_000, '+2')]);
    await B.app.duel.reveal();
    expect((await B.repo.getDuel(B.id))!.mine).toEqual([tm(9_000, '+2')]); // a penalidade conferida, gravada com a revelação
    expect(B.app.duel.score!.perPoint).toEqual(['a']); // 0:11.00 contra 0:10.00
    await B.app.duel.setPenalty(null); // viu o tempo de A: não muda mais
    await B.app.duel.setPenalty('DNF');
    expect(B.app.duel.current!.mine).toEqual([tm(9_000, '+2')]);
    B.app.duel.next();
    await B.app.duel.setPenalty(null); // no embaralhamento seguinte, antes do solve, o revelado continua
    expect(B.app.duel.current!.mine).toEqual([tm(9_000, '+2')]);
    expect((await B.repo.getDuel(B.id))!.mine).toEqual([tm(9_000, '+2')]);
    expect(B.app.duel.score!.perPoint).toEqual(['a']);
  });

  it('a resposta no aparelho de A grava os tempos de B e fecha a partida', async () => {
    const A = await device();
    const url = await challenge(A.app, { name: 'Ranielli' });
    const aId = A.app.duel.current!.id;
    const B = await accepted(url);
    await play(B.app, B_TIMES);
    const reply = await B.app.duel.replyUrl(ORIGIN, 'Bia');
    A.app.duel.exit();

    expect(await A.app.duel.openLink(payloadOf(reply))).toBe('reply');
    expect(A.app.duel.phase).toBe('reply');
    const stored = (await A.repo.getDuel(aId))!;
    expect(stored).toMatchObject({ status: 'done', mine: A_TIMES, theirs: B_TIMES, myName: 'Ranielli', theirName: 'Bia' });
    expect(A.app.duel.current).toEqual(stored);
    expect(A.app.duel.opponent).toEqual(B_TIMES);
    expect(A.app.duel.score).toMatchObject({ points: { a: 1, b: 3 }, over: true, winner: 'b' });
    expect(await A.repo.listDuels({ includeDeleted: true })).toHaveLength(1);
    expect(A.app.solves).toEqual([]);
    // Abrir a mesma resposta de novo mostra a partida e não grava outra vez.
    A.app.duel.exit();
    expect(await A.app.duel.openLink(payloadOf(reply))).toBe('reply');
    expect(await A.repo.getDuel(aId)).toEqual(stored);
  });

  // Review Focus 3 e 4.
  it('o próprio link abre como own; a resposta sem o desafio de A abre como view e não grava', async () => {
    const A = await device();
    const url = await challenge(A.app, { name: 'Ranielli' });
    const mine = A.app.duel.current!;
    A.app.duel.exit();
    expect(await A.app.duel.openLink(payloadOf(url))).toBe('own');
    expect(A.app.duel.phase).toBe('finished'); // o desafio dele, esperando resposta: não joga contra si mesmo
    expect(A.app.duel.current).toEqual(mine);
    expect(await A.repo.listDuels({ includeDeleted: true })).toEqual([mine]);

    const B = await accepted(url);
    await play(B.app, B_TIMES);
    const reply = await B.app.duel.replyUrl(ORIGIN, 'Bia');
    // Um aparelho sem o desafio de A (o outro aparelho de A, sem sync, ou um terceiro): só para ver, do lado de A.
    const C = await device();
    expect(await C.app.duel.openLink(payloadOf(reply))).toBe('view');
    expect(C.app.duel.phase).toBe('view');
    expect(C.app.duel.current).toMatchObject({ side: 'a', mine: A_TIMES, theirs: B_TIMES, myName: 'Ranielli', theirName: 'Bia', status: 'done' });
    expect(C.app.duel.score).toMatchObject({ points: { a: 1, b: 3 }, over: true, winner: 'b' });
    expect(await C.repo.listDuels({ includeDeleted: true })).toEqual([]);
    // B abrindo a própria resposta: só para ver, do lado dele, sem mexer no que guardou.
    const kept = await B.repo.getDuel(B.id);
    expect(await B.app.duel.openLink(payloadOf(reply))).toBe('view');
    expect(B.app.duel.current).toMatchObject({ side: 'b', mine: B_TIMES, theirName: 'Ranielli' });
    expect(B.app.duel.opponent).toEqual(A_TIMES.slice(0, 5));
    expect(await B.repo.listDuels({ includeDeleted: true })).toEqual([kept]);
  });

  it('link torto abre como invalid e não grava', async () => {
    const { app, repo } = await device();
    const profile = await repo.getProfile();
    const good = await encodeDuelLink(LINK);
    const otherVersion = await encodeDuelLink({ ...LINK, v: 2 } as unknown as DuelLink);
    for (const bad of ['', 'lixo!', good.slice(0, 40), otherVersion]) {
      expect(await app.duel.openLink(bad), bad).toBe('invalid');
      expect(app.duel.phase).toBe('invalid');
      expect(app.duel.current).toBeNull();
      expect(app.duel.invite).toBeNull();
    }
    expect(await repo.listDuels({ includeDeleted: true })).toEqual([]);
    expect(await repo.getProfile()).toEqual(profile);
    app.duel.exit(); // "Fechar"
    expect(app.duel.phase).toBe('idle');
  });

  // A revisão final 5.5: o desafio segura o sync de todas as abas, como o timer. O solve em si já é do timerBusy (o Timer roda o desafio, na
  // Task 6); o desafio segura o que vem depois dele, a confirmação e a revelação de B (a revisão da Task 5).
  it('duelRunning acompanha o solve', async () => {
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const { app } = await appWithAccount(net.api, { signedIn: true, env: env.env });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const told = vi.spyOn(app.account!, 'busyChanged');
    await app.duel.openLink(await encodeDuelLink(LINK));
    expect(app.duelRunning).toBe(false); // o convite ainda não é jogo
    await app.duel.accept();
    expect(app.duel.phase).toBe('solving');
    expect(app.duelRunning).toBe(false); // esperando o solve: é do timer
    expect(told).not.toHaveBeenCalled();
    await app.duel.record(tm(9_000));
    expect(app.duel.phase).toBe('confirm');
    expect(app.duelRunning).toBe(true);
    expect(told).toHaveBeenCalledTimes(1);
    const syncs = vi.spyOn(net.api, 'sync');
    const round = app.account!.syncNow();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled(); // o sync espera B conferir e ver o ponto
    await app.duel.reveal();
    expect(app.duelRunning).toBe(true);
    // A conta também se avisa sozinha (ao reler o próprio estado depois de um sync): conta-se só o que cada passo do desafio mudou.
    told.mockClear();
    app.duel.next(); // o embaralhamento seguinte solta o sync
    expect(app.duel.phase).toBe('solving');
    expect(app.duelRunning).toBe(false);
    expect(told).toHaveBeenCalledTimes(1);
    env.fireDelayed();
    await round;
    expect(syncs).toHaveBeenCalled();
    // Sair no meio da confirmação também solta; continuar volta a segurar (a confirmação gravada).
    await app.duel.record(B_TIMES[1]!);
    expect(app.duelRunning).toBe(true);
    const id = app.duel.current!.id;
    told.mockClear();
    app.duel.exit();
    expect(app.duelRunning).toBe(false);
    expect(told).toHaveBeenCalledTimes(1);
    await app.duel.resume(id);
    expect(app.duel.phase).toBe('confirm');
    expect(app.duelRunning).toBe(true);
    await app.duel.reveal();
    app.duel.next();
    await play(app, B_TIMES.slice(2, 4));
    await app.duel.record(B_TIMES[4]!);
    await app.duel.reveal();
    expect(app.duelRunning).toBe(true);
    told.mockClear();
    app.duel.next(); // o ponto que fechou a partida: o resultado
    expect(app.duel.phase).toBe('finished');
    expect(app.duelRunning).toBe(false);
    expect(told).toHaveBeenCalledTimes(1);

    // A não tem confirmação nem revelação: o desafio dele nunca segura o sync além do timer.
    const A = await device();
    await A.app.duel.start('333');
    for (const x of A_TIMES) {
      await A.app.duel.record(x);
      expect(A.app.duelRunning).toBe(false);
    }
    expect(A.app.duel.phase).toBe('finished');
  });

  // Acrescentados ao verbatim: a maquete aprovada (o modo desafio do Timer).
  it('a pílula do modo: sair guarda o desafio jogando, continuar volta ao ponto, descartar (só A) manda para a lixeira', async () => {
    const { app, repo } = await device();
    await app.createSession('pyram');
    app.duel.pick();
    expect(app.duel.pickEvent).toBe('pyram');
    await app.duel.start(app.duel.pickEvent);
    const id = app.duel.current!.id;
    await app.duel.record(tm(5_000));
    await app.duel.record(tm(6_000));
    app.duel.exit();
    expect(app.duel.phase).toBe('idle');
    expect(app.duel.current).toBeNull();
    expect(await repo.getDuel(id)).toMatchObject({ status: 'playing', mine: [tm(5_000), tm(6_000)], deletedAt: null });
    expect(await app.duel.resume('naoexiste1234567-a')).toBe(false);
    expect(app.duel.phase).toBe('idle');
    expect(await app.duel.resume(id)).toBe(true);
    expect(app.duel.phase).toBe('solving');
    expect(app.duel.index).toBe(2);
    expect(await app.duel.discard()).toBe(true);
    expect(app.duel.phase).toBe('idle');
    expect(app.duel.current).toBeNull();
    expect((await repo.getDuel(id))!.deletedAt).not.toBeNull();
    expect(await repo.listDuels()).toEqual([]);

    // B não descarta um desafio aceito (spec §3): vai até o fim.
    const B = await device();
    await B.app.duel.openLink(await encodeDuelLink(LINK));
    await B.app.duel.accept();
    expect(await B.app.duel.discard()).toBe(false);
    expect(B.app.duel.phase).toBe('solving');
    expect((await B.repo.getDuel(`${LINK.id}-b`))!.deletedAt).toBeNull();
  });

  it('um embaralhamento que falha volta à escolha com o aviso, e nenhum desafio começa pela metade', async () => {
    const gen = fakeGenerate((call) => call === 4);
    const { app, repo } = await device({ generate: gen.generate });
    app.duel.pick();
    await app.duel.start('333');
    expect(app.duel.phase).toBe('picking');
    expect(app.duel.scrambleError).toBe(true);
    expect(app.duel.current).toBeNull();
    expect(app.duelRunning).toBe(false);
    expect(await repo.listDuels({ includeDeleted: true })).toEqual([]);
    // De novo, dá certo, e o aviso sai.
    await app.duel.start('333');
    expect(app.duel.phase).toBe('solving');
    expect(app.duel.scrambleError).toBe(false);
    expect(app.duel.current!.scrambles).toHaveLength(7);

    // Um embaralhamento vazio (o sync recusaria o desafio para sempre) também é falha.
    const empty = await device({ generate: async () => '' });
    await empty.app.duel.start('333');
    expect(empty.app.duel.phase).toBe('picking');
    expect(empty.app.duel.scrambleError).toBe(true);
    expect(await empty.repo.listDuels({ includeDeleted: true })).toEqual([]);

    // Sair enquanto gera: a geração para, e nada começa depois.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const slow = await device({ generate: async (ev) => (calls++, await gate, `${ev}-x`) });
    const starting = slow.app.duel.start('333');
    slow.app.duel.exit();
    release();
    await starting;
    expect(calls).toBe(1);
    expect(slow.app.duel.phase).toBe('idle');
    expect(slow.app.duel.current).toBeNull();
    expect(await slow.repo.listDuels({ includeDeleted: true })).toEqual([]);
  });

  it('B fecha antes de ver o ponto: volta à confirmação, e a penalidade ainda é dele', async () => {
    const A = await device();
    const url = await challenge(A.app);
    const B = await accepted(url);
    await play(B.app, B_TIMES.slice(0, 1));
    await B.app.duel.record(tm(13_000));
    const again = await device({ repo: B.repo });
    expect(await again.app.duel.openLink(payloadOf(url))).toBe('resume');
    expect(again.app.duel.phase).toBe('confirm');
    expect(again.app.duel.index).toBe(1);
    expect(again.app.duel.opponent).toEqual(A_TIMES.slice(0, 1)); // o tempo de A do segundo ainda não aparece
    expect(again.app.duel.score!.perPoint).toEqual(['b']);
    await again.app.duel.setPenalty('+2');
    await again.app.duel.reveal();
    expect((await B.repo.getDuel(B.id))!.mine).toEqual([tm(9_000), tm(13_000, '+2')]);
    expect(again.app.duel.score!.perPoint).toEqual(['b', 'a']);

    // Um lado B sem a contagem de revelados (de um arquivo, de outro aparelho): os gravados contam como vistos, e o solve seguinte ainda
    // espera a confirmação.
    const { revealed: _seen, ...loose } = (await B.repo.getDuel(B.id))!;
    await B.repo.saveDuel(loose);
    expect(await again.app.duel.resume(B.id)).toBe(true);
    expect(again.app.duel.phase).toBe('solving');
    expect(again.app.duel.opponent).toEqual(A_TIMES.slice(0, 2));
    await again.app.duel.record(B_TIMES[2]!);
    expect(again.app.duel.phase).toBe('confirm');
    expect(again.app.duel.opponent).toEqual(A_TIMES.slice(0, 2));
    expect(again.app.duel.score!.perPoint).toEqual(['b', 'a']);
  });

  it('a penalidade de A vale para o último solve até o próximo, e para quando o link sai', async () => {
    const { app, repo } = await device();
    await app.duel.start('333');
    const id = app.duel.current!.id;
    await app.duel.setPenalty('+2'); // nenhum solve ainda
    expect(app.duel.current!.mine).toEqual([]);
    await app.duel.record(tm(10_000));
    await app.duel.setPenalty('+2');
    expect((await repo.getDuel(id))!.mine).toEqual([tm(10_000, '+2')]);
    await app.duel.record(tm(11_000));
    await app.duel.setPenalty('DNF'); // vale para o segundo; o primeiro fica
    expect((await repo.getDuel(id))!.mine).toEqual([tm(10_000, '+2'), tm(11_000, 'DNF')]);
    for (const x of A_TIMES.slice(2)) await app.duel.record(x);
    expect(app.duel.phase).toBe('finished');
    await app.duel.setPenalty('+2'); // o sétimo, antes de mandar
    const times = [tm(10_000, '+2'), tm(11_000, 'DNF'), ...A_TIMES.slice(2, 6), tm(13_080, '+2')];
    expect((await repo.getDuel(id))!.mine).toEqual(times);
    const url = await app.duel.challengeUrl(ORIGIN); // sem nome editado: o dos Ajustes (vazio)
    await app.duel.setPenalty(null); // o link saiu: não muda mais
    expect((await repo.getDuel(id))!.mine).toEqual(times);
    expect(await decodeDuelLink(payloadOf(url))).toMatchObject({ a: { name: '', times } });
  });

  it('agora não não grava; mandar de novo devolve o mesmo link; desafiar de volta abre no mesmo evento', async () => {
    const A = await device();
    const url = await challenge(A.app, { event: 'pyram', name: 'Ranielli' });
    const aId = A.app.duel.current!.id;
    A.app.duel.exit();
    expect(await A.app.duel.resend(aId, ORIGIN)).toBe(url);

    const B = await device();
    expect(await B.app.duel.openLink(payloadOf(url))).toBe('receive');
    B.app.duel.decline();
    expect(B.app.duel.phase).toBe('idle');
    expect(await B.repo.listDuels({ includeDeleted: true })).toEqual([]);
    expect(await B.app.duel.openLink(payloadOf(url))).toBe('receive'); // o mesmo link abre de novo depois
    await B.app.duel.accept();
    const bId = B.app.duel.current!.id;
    await play(B.app, B_TIMES);
    expect(B.app.duel.phase).toBe('finished');
    expect(await B.app.duel.resend(bId, ORIGIN)).toBeNull(); // só o desafio de A esperando resposta
    B.app.duel.rematch();
    expect(B.app.duel.phase).toBe('picking');
    expect(B.app.duel.pickEvent).toBe('pyram'); // o evento da partida, não o da sessão
    expect(B.app.duel.current).toBeNull();
  });

  it('a primeira visita por um link não mostra a apresentação antes do desafio', async () => {
    const { app } = await device();
    expect(app.profile.onboarded).toBe(false);
    expect(app.duel.blocksOnboarding).toBe(false);
    const opening = app.duel.openLink(await encodeDuelLink(LINK));
    expect(app.duel.blocksOnboarding).toBe(true); // ainda lendo o link
    expect(await opening).toBe('receive');
    expect(app.duel.blocksOnboarding).toBe(true);
    await app.duel.accept();
    expect(app.duel.blocksOnboarding).toBe(true);
    app.duel.exit();
    expect(app.duel.blocksOnboarding).toBe(false); // a apresentação fica para depois
    await app.duel.openLink('lixo!');
    expect(app.duel.blocksOnboarding).toBe(true); // o aviso do link torto também vem antes
  });

  // A revisão da Task 5: a tela grava o desafio inteiro a partir da cópia dela. A gravação só vale sobre o registro que ela leu; quando ele
  // mudou por fora, a ação é largada e a tela volta ao que está gravado.
  it('duas abas: a que ficou para trás não grava por cima da revelação da outra e volta ao ponto certo', async () => {
    const one = await device();
    const payload = await encodeDuelLink(LINK);
    await one.app.duel.openLink(payload);
    await one.app.duel.accept();
    // O link tocado duas vezes: a segunda aba continua o mesmo lado B, joga o primeiro e vê o tempo de A.
    const two = await device({ repo: one.repo });
    expect(await two.app.duel.openLink(payload)).toBe('resume');
    await two.app.duel.record(tm(20_000));
    await two.app.duel.reveal();
    expect(two.app.duel.phase).toBe('reveal');
    // A primeira aba ainda acha que está no primeiro: o solve dela seria refazer o embaralhamento depois de ver o tempo de A.
    expect(one.app.duel.phase).toBe('solving');
    expect(one.app.duel.index).toBe(0);
    await one.app.duel.record(tm(9_000));
    const id = `${LINK.id}-b`;
    expect(await one.repo.getDuel(id)).toMatchObject({ mine: [tm(20_000)], revealed: 1 });
    expect(one.app.duel.phase).toBe('solving');
    expect(one.app.duel.index).toBe(1);
    expect(one.app.duel.current!.mine).toEqual([tm(20_000)]);
    expect(one.app.duel.score!.perPoint).toEqual(['a']);

    // A primeira aba joga o segundo e para na confirmação; a segunda, para trás, tenta uma penalidade e uma revelação: nada passa.
    await one.app.duel.record(tm(9_500));
    expect(two.app.duel.phase).toBe('reveal');
    two.app.duel.next();
    await two.app.duel.record(tm(30_000));
    expect(await one.repo.getDuel(id)).toMatchObject({ mine: [tm(20_000), tm(9_500)], revealed: 1 });
    expect(two.app.duel.phase).toBe('confirm'); // voltou ao gravado: o segundo da outra aba, esperando a confirmação
    expect(two.app.duel.current!.mine).toEqual([tm(20_000), tm(9_500)]);

    // A: uma aba descarta; a outra, no próximo solve, sai do desafio sem trazê-lo da lixeira.
    const a1 = await device();
    await a1.app.duel.start('333');
    const aId = a1.app.duel.current!.id;
    await a1.app.duel.record(tm(10_000));
    const a2 = await device({ repo: a1.repo });
    await a2.app.duel.resume(aId);
    expect(await a2.app.duel.discard()).toBe(true);
    await a1.app.duel.record(tm(11_000));
    expect(a1.app.duel.phase).toBe('idle');
    expect(a1.app.duel.current).toBeNull();
    expect(await a1.repo.getDuel(aId)).toMatchObject({ mine: [tm(10_000)] });
    expect((await a1.repo.getDuel(aId))!.deletedAt).not.toBeNull();
  });

  it('depois de apagar os dados do aparelho, o próximo solve não recria o desafio', async () => {
    const { app, repo } = await device();
    await app.duel.start('333');
    const id = app.duel.current!.id;
    await app.duel.record(tm(10_000));
    await repo.wipeData();
    await app.duel.record(tm(11_000));
    expect(await repo.getDuel(id)).toBeNull();
    expect(await repo.listDuels({ includeDeleted: true })).toEqual([]);
    expect(app.duel.phase).toBe('idle');
    expect(app.duel.current).toBeNull();
  });

  it('uma gravação do desafio que chega durante a restauração espera por ela e volta ao que a cópia trouxe', async () => {
    const { app, repo } = await device();
    await app.duel.start('333');
    const id = app.duel.current!.id;
    await app.duel.record(tm(10_000));
    const backup = await createBackup(repo, 'manual', t);
    await app.duel.record(tm(11_000));
    let inside = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const replaceAll = repo.replaceAll.bind(repo);
    repo.replaceAll = async (data) => {
      inside = true;
      await gate;
      return replaceAll(data);
    };
    const saves = vi.spyOn(repo, 'saveDuel');
    const restoring = app.restoreFromBackup(backup.id);
    await vi.waitFor(() => expect(inside).toBe(true));
    const recording = app.duel.record(tm(12_000)); // chega com a restauração no meio do replaceAll
    await sleep(20); // tempo de sobra para já estar no banco (sem o portão)
    expect(saves).not.toHaveBeenCalled();
    release();
    expect(await restoring).toBe(true);
    await recording;
    // A cópia tinha um solve: o registro é o dela, e a tela voltou a ele (o segundo embaralhamento), sem o solve que chegou no meio.
    expect((await repo.getDuel(id))!.mine).toEqual([tm(10_000)]);
    expect(app.duel.phase).toBe('solving');
    expect(app.duel.index).toBe(1);
  });

  // A resposta só vale para o desafio daqui que espera por ela, com o mesmo conteúdo e a partida acabada.
  it('a resposta de outro amigo não apaga a partida que já acabou: abre só para ver', async () => {
    const A = await device();
    const url = await challenge(A.app, { name: 'Ranielli' });
    const aId = A.app.duel.current!.id;
    const bia = await accepted(url);
    await play(bia.app, B_TIMES);
    const fromBia = await bia.app.duel.replyUrl(ORIGIN, 'Bia');
    const leo = await accepted(url); // o mesmo link mandado a outra pessoa
    await play(leo.app, [tm(20_000), tm(20_000), tm(20_000)]); // Léo perde 3 × 0
    const fromLeo = await leo.app.duel.replyUrl(ORIGIN, 'Léo');
    expect(await A.app.duel.openLink(payloadOf(fromBia))).toBe('reply');
    const done = (await A.repo.getDuel(aId))!;
    expect(await A.app.duel.openLink(payloadOf(fromLeo))).toBe('view');
    expect(A.app.duel.phase).toBe('view');
    expect(A.app.duel.current).toMatchObject({ theirName: 'Léo', theirs: [tm(20_000), tm(20_000), tm(20_000)] });
    expect(await A.repo.getDuel(aId)).toEqual(done); // a partida com Bia fica como estava
    expect(await A.app.duel.openLink(payloadOf(fromBia))).toBe('reply'); // e a de Bia segue abrindo como resposta, sem gravar
    expect(await A.repo.getDuel(aId)).toEqual(done);
  });

  it('a resposta a um desafio descartado não o traz da lixeira', async () => {
    const A = await device();
    const url = await challenge(A.app);
    const aId = A.app.duel.current!.id;
    expect(await A.app.duel.discard()).toBe(true);
    const trashed = (await A.repo.getDuel(aId))!;
    const B = await accepted(url);
    await play(B.app, B_TIMES);
    expect(await A.app.duel.openLink(payloadOf(await B.app.duel.replyUrl(ORIGIN)))).toBe('view');
    expect(await A.repo.getDuel(aId)).toEqual(trashed);
    expect(await A.repo.listDuels()).toEqual([]);
  });

  it('uma resposta montada com outros embaralhamentos, outros tempos de A ou a partida pela metade só abre para ver', async () => {
    const A = await device();
    await challenge(A.app, { name: 'Ranielli' });
    const waiting = A.app.duel.current!;
    const base: DuelLink = { v: 1, id: waiting.linkId, event: waiting.event, scrambles: waiting.scrambles, a: { name: 'Ranielli', times: waiting.mine } };
    const b = { name: 'Bia', times: B_TIMES };
    const crafted: DuelLink[] = [
      { ...base, scrambles: base.scrambles.map((x) => `${x} U`), b },
      { ...base, event: '222', b },
      { ...base, a: { name: 'Ranielli', times: A_TIMES.map((x) => ({ ...x, ms: x.ms - 1_000 })) }, b },
      { ...base, b: { name: 'Bia', times: B_TIMES.slice(0, 3) } }, // ninguém chegou a 3 e faltam embaralhamentos
    ];
    for (const link of crafted) {
      A.app.duel.exit();
      expect(await A.app.duel.openLink(await encodeDuelLink(link))).toBe('view');
      expect(A.app.duel.phase).toBe('view');
      expect(await A.repo.getDuel(waiting.id)).toEqual(waiting);
    }
    // A de verdade, depois, ainda fecha a partida.
    expect(await A.app.duel.openLink(await encodeDuelLink({ ...base, b }))).toBe('reply');
    expect(await A.repo.getDuel(waiting.id)).toMatchObject({ status: 'done', theirs: B_TIMES });
  });

  it('na confirmação, nada que se alcança de app.duel mostra o tempo de A daquele embaralhamento', async () => {
    const unique = [10_101, 20_202, 30_303, 40_404, 50_505, 60_606, 70_707].map((ms) => tm(ms));
    const { app } = await device();
    await app.duel.openLink(await encodeDuelLink({ ...LINK, a: { name: 'Ranielli', times: unique } }));
    expect(JSON.stringify(reachable(app.duel))).not.toMatch(/10101|20202|30303|40404|50505|60606|70707/); // o convite
    await app.duel.accept();
    await play(app, [tm(9_000)]);
    await app.duel.record(tm(9_000));
    expect(app.duel.phase).toBe('confirm');
    const seen = JSON.stringify(reachable(app.duel));
    expect(seen).toContain('10101'); // o revelado aparece
    expect(seen).not.toMatch(/20202|30303|40404|50505|60606|70707/);
    expect(app.duel.current!.theirs).toEqual(unique.slice(0, 1));
  });

  it('o link do desafio só sai com o desafio gravado como esperando resposta', async () => {
    const { app, repo } = await device();
    await app.duel.start('333');
    const id = app.duel.current!.id;
    for (const x of A_TIMES) await app.duel.record(x);
    const saveDuel = repo.saveDuel.bind(repo);
    repo.saveDuel = async () => {
      throw new Error('quota');
    };
    expect(await app.duel.challengeUrl(ORIGIN)).toBeNull();
    expect(app.toast?.text).toBe(T.data.changeFailed);
    expect(app.duel.current!.status).toBe('playing');
    await app.duel.setPenalty('+2'); // nada saiu: o sétimo ainda pode mudar (e a gravação falha de novo, com o aviso)
    repo.saveDuel = saveDuel;
    const url = await app.duel.challengeUrl(ORIGIN);
    expect(url).not.toBeNull();
    expect(await repo.getDuel(id)).toMatchObject({ status: 'waiting' });
  });

  // A revisão da Task 5, rodada 2: uma visualização não é de ninguém. A data dela nunca bate com a de um registro gravado, e nada grava a
  // partir dela.
  it('uma visualização nunca grava: nem descartar, nem mandar, nem trocar o nome', async () => {
    // O relógio do aparelho à frente do relógio do sync: a gravação leva exatamente a hora de agora, a mesma que a visualização teria.
    let at = t;
    const A = await device({ now: () => at });
    at += 60_000;
    const done = await A.repo.saveDuel({
      id: `${LINK.id}-a`,
      linkId: LINK.id,
      side: 'a',
      event: LINK.event,
      scrambles: LINK.scrambles,
      mine: A_TIMES,
      theirs: B_TIMES,
      myName: 'Ranielli',
      theirName: 'Bia',
      status: 'done',
    });
    expect(done.updatedAt).toBe(at);
    // A resposta de outro amigo, aberta no mesmo milissegundo: só para ver.
    const fromLeo: DuelLink = { ...LINK, b: { name: 'Léo', times: [tm(20_000), tm(20_000), tm(20_000)] } };
    expect(await A.app.duel.openLink(await encodeDuelLink(fromLeo))).toBe('view');
    expect(A.app.duel.current!.updatedAt).toBe(-1);
    expect(await A.app.duel.discard()).toBe(false);
    expect(await A.app.duel.challengeUrl(ORIGIN, 'Outro nome')).toBeNull();
    expect(A.app.duel.phase).toBe('view');
    expect(await A.repo.getDuel(done.id)).toEqual(done);
    expect(A.app.profile.duelName).toBe('');

    // B abrindo a própria resposta: mandar de novo dali não troca o nome nem grava.
    const Ad = await device();
    const B = await accepted(await challenge(Ad.app));
    await play(B.app, B_TIMES);
    const reply = await B.app.duel.replyUrl(ORIGIN, 'Bia');
    const kept = await B.repo.getDuel(B.id);
    expect(await B.app.duel.openLink(payloadOf(reply))).toBe('view');
    expect(await B.app.duel.replyUrl(ORIGIN, 'Outro nome')).toBeNull();
    expect(B.app.duel.phase).toBe('view');
    expect(await B.repo.getDuel(B.id)).toEqual(kept);
    expect(B.app.profile.duelName).toBe('Bia');
  });

  it('um desafio da lixeira conta como ausente: o link abre só para ver, e continuar não o traz de volta', async () => {
    const A = await device();
    const url = await challenge(A.app);
    const aId = A.app.duel.current!.id;
    expect(await A.app.duel.discard()).toBe(true);
    const trashed = (await A.repo.getDuel(aId))!;
    // O link do desafio descartado: só para ver, sem mandar de novo e sem sair da lixeira.
    expect(await A.app.duel.openLink(payloadOf(url))).toBe('view');
    expect(A.app.duel.phase).toBe('view');
    expect(A.app.duel.current).toMatchObject({ side: 'a', mine: A_TIMES });
    expect(await A.app.duel.challengeUrl(ORIGIN, 'Ranielli')).toBeNull();
    expect(await A.app.duel.resend(aId, ORIGIN)).toBeNull();
    expect(await A.app.duel.resume(aId)).toBe(false);
    expect(A.app.duel.phase).toBe('idle');
    expect(await A.repo.getDuel(aId)).toEqual(trashed);

    // B apagou a partida em andamento (Evolução): o link de novo não a continua nem deixa aceitar outra vez.
    const B = await accepted(url);
    await play(B.app, B_TIMES.slice(0, 1));
    await B.app.duel.record(B_TIMES[1]!); // o segundo, ainda sem ver o tempo de A
    B.app.duel.exit();
    await B.repo.deleteDuel(B.id);
    const gone = (await B.repo.getDuel(B.id))!;
    expect(await B.app.duel.openLink(payloadOf(url))).toBe('view');
    expect(B.app.duel.phase).toBe('view');
    expect(B.app.duel.current!.theirs).toEqual(A_TIMES.slice(0, 1)); // só o revelado, como sempre
    await B.app.duel.accept();
    await B.app.duel.record(tm(8_000));
    await B.app.duel.reveal();
    expect(await B.app.duel.resume(B.id)).toBe(false);
    expect(await B.repo.getDuel(B.id)).toEqual(gone);
  });

  // A Task 6 (o que veio da Task 5): o estado ouve o aviso de mudança do repositório. A resposta que chega por fora (o sync, outra aba)
  // atualiza o desafio aberto; o registro que some (um wipe, um descarte noutra aba) ou que uma restauração troca fecha o desafio.
  it('a resposta que chega pelo sync atualiza o desafio aberto; apagar os dados, descartar noutra aba ou restaurar uma cópia o fecha', async () => {
    const A = await device();
    const url = await challenge(A.app, { name: 'Ranielli' });
    expect(A.app.duel.phase).toBe('finished'); // esperando a resposta, na tela de mandar
    const B = await accepted(url);
    await play(B.app, B_TIMES);
    const reply = await B.app.duel.replyUrl(ORIGIN, 'Bia');
    // A resposta chega por fora: o outro aparelho de A (aqui, com o mesmo banco) a grava.
    const other = await device({ repo: A.repo });
    expect(await other.app.duel.openLink(payloadOf(reply))).toBe('reply');
    await vi.waitFor(() => expect(A.app.duel.phase).toBe('reply'));
    expect(A.app.duel.current).toMatchObject({ status: 'done', theirs: B_TIMES, theirName: 'Bia' });
    expect(A.app.duel.score).toMatchObject({ over: true, winner: 'b' });

    // Os dados do aparelho apagados com o desafio aberto: ele fecha na hora, sem esperar um solve.
    const W = await device();
    await W.app.duel.start('333');
    await W.app.duel.record(tm(10_000));
    await W.repo.wipeData();
    await vi.waitFor(() => expect(W.app.duel.phase).toBe('idle'));
    expect(W.app.duel.current).toBeNull();

    // Outra aba descartou: esta sai do desafio na hora.
    const one = await device();
    await one.app.duel.start('333');
    await one.app.duel.record(tm(10_000));
    const two = await device({ repo: one.repo });
    await two.app.duel.resume(one.app.duel.current!.id);
    expect(await two.app.duel.discard()).toBe(true);
    await vi.waitFor(() => expect(one.app.duel.phase).toBe('idle'));

    // Uma restauração que troca o registro aberto também fecha.
    const R = await device();
    await R.app.duel.start('333');
    await R.app.duel.record(tm(10_000));
    const backup = await createBackup(R.repo, 'manual', t);
    await R.app.duel.record(tm(11_000));
    expect(await R.app.restoreFromBackup(backup.id)).toBe(true);
    await vi.waitFor(() => expect(R.app.duel.phase).toBe('idle'));
    expect((await R.repo.listDuels())[0]!.mine).toEqual([tm(10_000)]); // o desafio fica como a cópia trouxe, para continuar depois

    // As gravações da própria tela (e uma mudança de B noutra aba, que a próxima gravação confere) não mexem nela.
    const S = await device();
    await S.app.duel.start('333');
    await S.app.duel.record(tm(10_000));
    await S.app.duel.setPenalty('+2');
    await sleep(20);
    expect(S.app.duel.phase).toBe('solving');
    expect(S.app.duel.index).toBe(1);
  });

  // A revisão da Task 6: o link fica pronto antes do toque (a folha do sistema só abre dentro do gesto), sem dar o desafio por mandado.
  it('challengeLink prepara o link com o nome, sem dar o desafio por mandado; a penalidade do sétimo ainda muda', async () => {
    const { app, repo } = await device();
    await app.duel.start('333');
    const id = app.duel.current!.id;
    for (const x of A_TIMES) await app.duel.record(x);
    const early = await app.duel.challengeLink(ORIGIN, ' Rani ');
    expect(app.profile.duelName).toBe('Rani');
    expect(await repo.getDuel(id)).toMatchObject({ status: 'playing' });
    expect(await decodeDuelLink(payloadOf(early))).toMatchObject({ a: { name: 'Rani', times: A_TIMES } });
    await app.duel.setPenalty('+2');
    const prepared = await app.duel.challengeLink(ORIGIN);
    expect((await decodeDuelLink(payloadOf(prepared)))!.a.times[6]).toEqual(tm(13_080, '+2'));
    // Dar por mandado devolve o mesmo link, e a penalidade para.
    expect(await app.duel.challengeUrl(ORIGIN)).toBe(prepared);
    expect(await repo.getDuel(id)).toMatchObject({ status: 'waiting' });
    // B não tem desafio para preparar.
    const B = await accepted(prepared!);
    expect(await B.app.duel.challengeLink(ORIGIN)).toBeNull();
  });

  // A revisão da Task 6, rodada 2: o link que saiu (o toque em Mandar) trava a penalidade, mesmo com a marca de mandado sem gravar. Fechar a
  // folha sem mandar destrava (e volta a jogar, sobre o registro que a marca gravou); sair do desafio também.
  it('o link que saiu trava a penalidade; fechar a folha sem mandar destrava e volta a jogar; sair também destrava', async () => {
    const { app, repo } = await device();
    await app.duel.start('333');
    const id = app.duel.current!.id;
    for (const x of A_TIMES) await app.duel.record(x);
    const saveDuel = repo.saveDuel.bind(repo);
    repo.saveDuel = async () => {
      throw new Error('quota');
    };
    expect(app.duel.linkOut).toBe(false);
    const marking = app.duel.send(ORIGIN);
    expect(app.duel.linkOut).toBe(true); // na hora do toque, antes de a marca gravar
    expect(await marking).toBeNull();
    expect(await repo.getDuel(id)).toMatchObject({ status: 'playing' });
    await app.duel.setPenalty('+2');
    expect(app.duel.current!.mine[6]).toEqual(A_TIMES[6]);
    expect((await repo.getDuel(id))!.mine[6]).toEqual(A_TIMES[6]);
    repo.saveDuel = saveDuel;

    // Mandado de novo: a marca grava; fechar a folha (AbortError) volta a jogar sobre o registro dela, e a penalidade vale.
    const url = await app.duel.send(ORIGIN);
    expect(url).not.toBeNull();
    expect(await repo.getDuel(id)).toMatchObject({ status: 'waiting' });
    await app.duel.unsend();
    expect(app.duel.linkOut).toBe(false);
    expect(await repo.getDuel(id)).toMatchObject({ status: 'playing' });
    await app.duel.setPenalty('DNF');
    expect((await repo.getDuel(id))!.mine[6]).toEqual(tm(13_080, 'DNF'));

    // Um desafio que já esperava a resposta (mandado antes) não volta a jogar ao cancelar uma nova folha.
    await app.duel.challengeUrl(ORIGIN);
    void app.duel.send(ORIGIN);
    await app.duel.unsend();
    expect(await repo.getDuel(id)).toMatchObject({ status: 'waiting' });

    // Sair do desafio (ou abrir outro) destrava.
    const fresh = await device();
    await fresh.app.duel.start('333');
    for (const x of A_TIMES) await fresh.app.duel.record(x);
    void fresh.app.duel.send(ORIGIN);
    expect(fresh.app.duel.linkOut).toBe(true);
    fresh.app.duel.exit();
    expect(fresh.app.duel.linkOut).toBe(false);
  });

  it('preparar o link não grava o nome que não mudou, e o myName de B só grava ao mandar', async () => {
    const A = await device();
    await A.app.duel.start('333');
    for (const x of A_TIMES) await A.app.duel.record(x);
    const names = vi.spyOn(A.app, 'setDuelName');
    await A.app.duel.challengeLink(ORIGIN, 'Rani');
    await A.app.duel.challengeLink(ORIGIN, ' Rani ');
    await A.app.duel.challengeLink(ORIGIN, 'Rani');
    expect(names).toHaveBeenCalledTimes(1);
    const url = await A.app.duel.challengeUrl(ORIGIN, 'Rani');
    expect(names).toHaveBeenCalledTimes(1);

    const B = await accepted(url!);
    await play(B.app, B_TIMES);
    const bNames = vi.spyOn(B.app, 'setDuelName');
    const prepared = await B.app.duel.replyLink(ORIGIN, 'Bia');
    expect(await decodeDuelLink(payloadOf(prepared))).toMatchObject({ b: { name: 'Bia', times: B_TIMES } });
    expect(B.app.profile.duelName).toBe('Bia'); // o nome vai para os Ajustes ao preparar
    expect(await B.repo.getDuel(B.id)).toMatchObject({ myName: '' }); // o registro, só ao mandar
    await B.app.duel.replyLink(ORIGIN, 'Bia');
    expect(bNames).toHaveBeenCalledTimes(1);
    expect(await B.app.duel.send(ORIGIN)).toBe(prepared);
    expect(await B.repo.getDuel(B.id)).toMatchObject({ myName: 'Bia' });
    expect(B.app.duel.linkOut).toBe(false); // B não tem penalidade a travar: a partida acabou
  });

  // A revisão final (emenda da I2): a marca de mandado é melhor esforço. Com ela sem gravar (ou desfeita por um AbortError depois de o link
  // sair), o desafio de A fica 'playing' com os sete; a resposta de verdade traz os sete tempos exatos dele, a prova de que o link saiu, e
  // fecha a partida. O resto da I2 continua: nada grava por cima de uma partida acabada nem traz um desafio da lixeira.
  it('a resposta fecha o desafio que ficou jogando com os sete (a marca de mandado não gravou); o resto das proteções fica', async () => {
    const A = await device();
    await A.app.duel.start('333');
    const aId = A.app.duel.current!.id;
    for (const x of A_TIMES) await A.app.duel.record(x);
    const url = await A.app.duel.challengeLink(ORIGIN, 'Ranielli'); // o link saiu pela folha; a marca de mandado não gravou
    expect(await A.repo.getDuel(aId)).toMatchObject({ status: 'playing', mine: A_TIMES });
    const B = await accepted(url!);
    await play(B.app, B_TIMES);
    const reply = await B.app.duel.replyUrl(ORIGIN, 'Bia');
    A.app.duel.exit();
    expect(await A.app.duel.openLink(payloadOf(reply))).toBe('reply');
    const done = (await A.repo.getDuel(aId))!;
    expect(done).toMatchObject({ status: 'done', theirs: B_TIMES, theirName: 'Bia' });
    expect(A.app.duel.phase).toBe('reply');
    // A mesma resposta de novo: a partida, sem gravar; a de outro amigo, só para ver.
    expect(await A.app.duel.openLink(payloadOf(reply))).toBe('reply');
    const leo = await accepted(url!);
    await play(leo.app, [tm(20_000), tm(20_000), tm(20_000)]);
    expect(await A.app.duel.openLink(payloadOf(await leo.app.duel.replyUrl(ORIGIN, 'Léo')))).toBe('view');
    expect(await A.repo.getDuel(aId)).toEqual(done);

    // Um desafio jogando cujos tempos mudaram depois do link (a penalidade do sétimo) não é o da resposta: só para ver.
    const C = await device();
    await C.app.duel.start('333');
    const cId = C.app.duel.current!.id;
    for (const x of A_TIMES) await C.app.duel.record(x);
    const cUrl = await C.app.duel.challengeLink(ORIGIN);
    await C.app.duel.setPenalty('+2');
    const changed = (await C.repo.getDuel(cId))!;
    const cB = await accepted(cUrl!);
    await play(cB.app, B_TIMES);
    const cReply = await cB.app.duel.replyUrl(ORIGIN);
    expect(await C.app.duel.openLink(payloadOf(cReply))).toBe('view');
    expect(await C.repo.getDuel(cId)).toEqual(changed);
    // E um jogando que foi para a lixeira continua lá.
    await C.app.duel.resume(cId);
    await C.app.duel.setPenalty(null);
    expect(await C.app.duel.discard()).toBe(true);
    const trashed = (await C.repo.getDuel(cId))!;
    expect(await C.app.duel.openLink(payloadOf(cReply))).toBe('view');
    expect(await C.repo.getDuel(cId)).toEqual(trashed);
  });

  it('o current de B é o mesmo objeto enquanto o desafio não muda', async () => {
    const A = await device();
    const B = await accepted(await challenge(A.app));
    await B.app.duel.record(tm(9_000));
    const first = B.app.duel.current;
    expect(B.app.duel.current).toBe(first);
    expect(B.app.duel.opponent).toBe(B.app.duel.opponent);
    await B.app.duel.reveal();
    const shown = B.app.duel.current;
    expect(shown).not.toBe(first);
    expect(shown!.theirs).toEqual(A_TIMES.slice(0, 1));
    expect(B.app.duel.current).toBe(shown);
  });
});
