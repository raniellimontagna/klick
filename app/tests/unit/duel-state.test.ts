import { describe, expect, it, vi } from 'vitest';
import { decodeDuelLink, duelPayloadOf, encodeDuelLink } from '../../src/core/duel/link';
import type { DuelLink, DuelTime, EventId, Penalty } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import { appWithAccount, fakeApi, manualEnv } from './sync-account';
import { FakeServer } from './sync-fakes';

let n = 0;
const t = 1_791_500_000_000;
const now = () => t;
const ORIGIN = 'https://klick.test';
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const tm = (ms: number, penalty: Penalty = null): DuelTime => ({ ms, penalty });
const payloadOf = (url: string): string => duelPayloadOf(new URL(url).hash)!;

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
async function device(o: { repo?: Repository; generate?: (ev: EventId) => Promise<string> } = {}) {
  const repo = o.repo ?? createRepository(await openKlickDb(`duel-${++n}`), { now, channel: null });
  const app = new AppState({
    repo,
    queue: createScrambleQueue({ generate: async (ev) => `${ev}-timer` }),
    now,
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
  return app.duel.challengeUrl(ORIGIN, o.name);
}

// B joga estes solves, um por vez: o solve, "Ver o ponto" e "Próximo".
async function play(app: AppState, times: DuelTime[]): Promise<void> {
  for (const x of times) {
    await app.duel.record(x);
    await app.duel.reveal();
    app.duel.next();
  }
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
    expect(url.startsWith(`${ORIGIN}/#desafio=`)).toBe(true);
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

  // A revisão final 5.5: o desafio segura o sync de todas as abas, como o timer.
  it('duelRunning acompanha o solve', async () => {
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const { app } = await appWithAccount(net.api, { signedIn: true, env: env.env });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const told = vi.spyOn(app.account!, 'busyChanged');
    await app.duel.openLink(await encodeDuelLink(LINK));
    expect(app.duelRunning).toBe(false); // o convite ainda não é jogo
    await app.duel.accept();
    expect(app.duelRunning).toBe(true);
    expect(told).toHaveBeenCalledTimes(1);
    await app.duel.record(tm(9_000));
    expect(app.duel.phase).toBe('confirm');
    expect(app.duelRunning).toBe(true);
    const syncs = vi.spyOn(net.api, 'sync');
    const round = app.account!.syncNow();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled(); // o sync espera o desafio
    await app.duel.reveal();
    expect(app.duelRunning).toBe(true);
    const id = app.duel.current!.id;
    // A conta também se avisa sozinha (ao reler o próprio estado depois de um sync): conta-se só o que cada passo do desafio mudou.
    told.mockClear();
    app.duel.exit(); // sair solta o sync
    expect(app.duelRunning).toBe(false);
    expect(told).toHaveBeenCalledTimes(1);
    env.fireDelayed();
    await round;
    expect(syncs).toHaveBeenCalled();
    // Continuar segura de novo; o ponto que fecha a partida solta.
    await app.duel.resume(id);
    expect(app.duelRunning).toBe(true);
    await play(app, B_TIMES.slice(1, 4));
    await app.duel.record(B_TIMES[4]!);
    await app.duel.reveal();
    expect(app.duelRunning).toBe(true);
    told.mockClear();
    app.duel.next();
    expect(app.duel.phase).toBe('finished');
    expect(app.duelRunning).toBe(false);
    expect(told).toHaveBeenCalledTimes(1);

    // A: gerar não segura; jogar segura; os sete feitos soltam.
    const A = await device();
    const starting = A.app.duel.start('333');
    expect(A.app.duelRunning).toBe(false);
    await starting;
    expect(A.app.duelRunning).toBe(true);
    for (const x of A_TIMES) await A.app.duel.record(x);
    expect(A.app.duelRunning).toBe(false);
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
});
