import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { evaluateSeason, seasonOne } from '../../src/core/season';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';
import { mockMedia } from './media';

// O coach de verdade; um teste o faz lançar (um erro de código na conta dele) para ver que a reação entra mesmo assim.
const coachFalha = vi.hoisted(() => ({ on: false }));
vi.mock('../../src/core/coach', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/core/coach')>();
  return {
    ...mod,
    pickCoachMessage: (...args: Parameters<typeof mod.pickCoachMessage>) => {
      if (coachFalha.on) throw new Error('coach');
      return mod.pickCoachMessage(...args);
    },
  };
});

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ts-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async (ev) => `${ev} R U` }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('tela do Timer', () => {
  it('mostra o embaralhamento, o tempo zerado e as médias da sessão vazias', async () => {
    const { a } = await app();
    render(TimerScreen, { app: a });
    expect(await screen.findByText('333 R U')).toBeInTheDocument();
    expect(document.querySelector('[data-tiles]')?.textContent).toContain('—');
  });

  it('no 6×6 o tile mostra a média de 3', async () => {
    const { a } = await app();
    await a.createSession('666');
    render(TimerScreen, { app: a });
    expect(await screen.findByText('Média de 3')).toBeInTheDocument();
  });

  it('no celular, com inspeção e dois polegares, pede o toque num polegar: só as áreas de polegar começam a inspeção', async () => {
    const restore = mockMedia(['(pointer: coarse)']);
    try {
      const { a } = await app();
      render(TimerScreen, { app: a });
      expect(await screen.findByText(T.coach.idleInspThumb)).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('no celular, com inspeção e um toque, a tela inteira começa a inspeção', async () => {
    const restore = mockMedia(['(pointer: coarse)']);
    try {
      const { a } = await app();
      await a.updateSettings({ mobileArm: 'one' });
      render(TimerScreen, { app: a });
      expect(await screen.findByText(T.coach.idleInspTouch)).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('com gravação pendente, mostra o aviso fixo', async () => {
    const { a, repo } = await app();
    repo.addSolve = async () => { throw new Error('quota'); };
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    render(TimerScreen, { app: a });
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
  });
});

// Extras da 10b: o que a tela faz de verdade com o timer, o aviso e a nota.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function key(type: 'keydown' | 'keyup', code: string, k: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
}

const litFaces = () => document.querySelectorAll('[data-centro-slot] svg.centro g[transform="matrix(1,0,0.3,-0.3,0,30)"] .lit').length;

// Uma temporada que só fecha com um +2 no último solve, já na tela de resultado. Constância: os 5 seguidos variam no máximo 9 s.
// Quatro solves de 10 s e um pelo teclado (para logo depois de soltar: ~0 s) variam ~10 s; com +2, ~8 s.
async function seasonByPenalty({ silent = false } = {}) {
  const { a, repo } = await app();
  await a.updateSettings({ inspection: false, silent });
  const startedAt = Date.now() - 60000;
  await repo.saveProfile({
    season: {
      current: { n: 2, startedAt, marks: Array.from({ length: 9 }, () => ({ kind: 'steady' as const, target: 9000 })), basis: { single: 10000, ao5: 10000, ao12: 10000 } },
      past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 1000, startAo12: null, endAo12: 50000 }],
    },
  });
  await a.reload();
  for (let i = 0; i < 4; i++) await a.addSolve({ ms: 10000, penalty: null, at: startedAt + 1000 * (i + 1) });
  render(TimerScreen, { app: a });
  await solveByKeys();
  await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
  await sleep(100);
  expect(a.profile.season.current.n).toBe(2);
  return { a };
}

// Um solve pelo teclado: segura espaço além do tempo de armar, solta (corre) e para com outra tecla.
async function solveByKeys(): Promise<void> {
  key('keydown', 'Space', ' ');
  await sleep(320);
  key('keyup', 'Space', ' ');
  key('keydown', 'KeyA', 'a');
}

describe('tela do Timer: solve, reação e nota', () => {
  it('o solve já está em app.solves quando a reação começa (gravação antes da reação)', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    // A gravação demora mais que a reação de 500 ms: se a reação viesse antes, a lista ainda estaria vazia.
    const gravar = repo.addSolve.bind(repo);
    repo.addSolve = async (s) => {
      await sleep(800);
      return gravar(s);
    };
    render(TimerScreen, { app: a });
    const vistos: number[] = [];
    const observador = new MutationObserver(() => {
      if (document.body.dataset.cview === 'reaction') vistos.push(a.solves.length);
    });
    observador.observe(document.body, { attributes: true, attributeFilter: ['data-cview'] });
    try {
      await solveByKeys();
      await waitFor(() => expect(vistos.length).toBeGreaterThan(0), { timeout: 4000 });
      expect(vistos[0]).toBe(1);
    } finally {
      observador.disconnect();
    }
  });

  it('segurar além do tempo de armar, sem soltar, põe o timer em pronto (o laço chama tick)', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    key('keydown', 'Space', ' ');
    await waitFor(() => expect(document.body.dataset.tstate).toBe('ready'), { timeout: 1500 });
    key('keyup', 'Space', ' ');
    expect(document.body.dataset.tstate).toBe('running');
    key('keydown', 'KeyA', 'a');
    await waitFor(() => expect(document.body.dataset.tstate).toBe('done'), { timeout: 1500 });
  });

  it('gravação falhou: o aviso fixo aparece e o tempo do timer segue na tela', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    repo.addSolve = async () => { throw new Error('quota'); };
    render(TimerScreen, { app: a });
    key('keydown', 'Space', ' ');
    await sleep(320);
    key('keyup', 'Space', ' ');
    await sleep(120);
    key('keydown', 'KeyA', 'a');
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
    // O tempo se pinta no quadro seguinte à falha: espera alguns quadros, senão lê o último valor que o laço pintou antes.
    await sleep(100);
    const tempo = document.querySelector('[data-time]')?.textContent ?? '';
    expect(tempo).toMatch(/^\d:\d\d\.\d\d$/);
    expect(tempo).not.toBe('0:00.00');
  });

  it('com app.saveStalled (gravação presa, sem fila), mostra o aviso fixo', async () => {
    const { a } = await app();
    a.saveStalled = true;
    render(TimerScreen, { app: a });
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
  });

  it('no 6×6 o chip "vs média" fala em média de 3, não de 5', async () => {
    const { a } = await app();
    await a.createSession('666');
    const agora = Date.now();
    for (let i = 0; i < 4; i++) {
      await a.addSolve({ ms: 60000 + i * 1000, penalty: null, at: agora - (4 - i) * 1000 });
    }
    render(TimerScreen, { app: a });
    expect(await screen.findByText(/vs média de 3$/)).toBeInTheDocument();
    expect(screen.queryByText(/vs média de 5/)).toBeNull();
  });

  it('enquanto o embaralhamento não chega (app.scramble vazio), mostra "gerando…"', async () => {
    const repo = createRepository(await openKlickDb(`ts-${++n}`), { channel: null });
    const a = new AppState({ repo, queue: createScrambleQueue({ generate: () => new Promise<string>(() => {}) }), storage: null, storageManager: null });
    render(TimerScreen, { app: a });
    expect(screen.getByText('gerando…')).toBeInTheDocument();
  });

  it('Esc no campo de nota fecha o formulário e tira o foco', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    await solveByKeys();
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    key('keydown', 'KeyM', 'm');
    const form = document.querySelector('[data-noteform]') as HTMLFormElement;
    const campo = screen.getByLabelText('Nota sobre este solve');
    await waitFor(() => expect(form).not.toHaveAttribute('hidden'));
    await waitFor(() => expect(campo).toHaveFocus());
    fireEvent.keyDown(campo, { key: 'Escape', code: 'Escape' });
    expect(form).toHaveAttribute('hidden');
    expect(campo).not.toHaveFocus();
  });

  it('um solve que fecha a temporada mostra o fim de temporada no coach, segura a face de cima cheia e depois esvazia', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    await repo.saveProfile({
      season: {
        current: { n: 2, startedAt: Date.now() - 1000, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })), basis: { single: 50000, ao5: 50000, ao12: 50000 } },
        past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 1000, startAo12: null, endAo12: 50000 }],
      },
    });
    await a.reload();
    render(TimerScreen, { app: a });
    await solveByKeys();
    expect(await screen.findByText('Temporada 2 completa: 1 solve. Gelo liberado.', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(litFaces()).toBe(9);
    await waitFor(() => expect(a.profile.season.current.n).toBe(3));
    await waitFor(() => expect(litFaces()).toBe(0), { timeout: 4000 });
  });

  // Spec 6.4: a virada só é anunciada no aparelho que a causou. Um solve de outro aparelho chega pelo sync enquanto o solve daqui grava.
  async function remoteDuringSave(target: number) {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    const startedAt = Date.now() - 60000;
    await repo.saveProfile({
      season: {
        current: { n: 2, startedAt, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target })), basis: { single: 50000, ao5: 50000, ao12: 50000 } },
        past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 1000, startAo12: null, endAo12: 50000 }],
      },
    });
    await a.reload();
    const sessionId = a.activeSession!.id;
    const at = startedAt + 1000;
    const gravar = repo.addSolve.bind(repo);
    repo.addSolve = async (s) => {
      // O lote do servidor, juntado como o motor junta: a tela relê o solve como mudança de fora.
      const data = { sessionId, event: '333', ms: 30000, penalty: null, at, scramble: 'R U', note: '', createdAt: at };
      await repo.applyRemote([{ store: 'solves', id: 'do-outro', data, updatedAt: at, deletedAt: null, deletionStamp: at }], at);
      await waitFor(() => expect(a.solves.some((x) => x.id === 'do-outro')).toBe(true));
      return gravar(s);
    };
    const announce = vi.spyOn(a, 'announce');
    render(TimerScreen, { app: a });
    await solveByKeys();
    await waitFor(() => expect(a.solves).toHaveLength(2));
    await waitFor(() => expect(announce.mock.calls.some(([text]) => text.startsWith('Tempo final'))).toBe(true), { timeout: 3000 });
    return { a, announce };
  }

  it('a virada que um solve de outro aparelho fechou, juntado durante a gravação, não é anunciada aqui (spec 6.4)', async () => {
    const { a, announce } = await remoteDuringSave(1);
    await sleep(100);
    expect(screen.queryByText(/Temporada 2 completa/)).toBeNull();
    expect(announce.mock.calls.filter(([text]) => text.includes('Temporada 2 completa'))).toEqual([]);
    await waitFor(() => expect(a.profile.season.current.n).toBe(3)); // a temporada vira assim mesmo, em silêncio
  });

  it('a virada que o solve daqui fechou, com um de outro aparelho que chegou no meio, é anunciada aqui (spec 6.4)', async () => {
    const { a } = await remoteDuringSave(2);
    expect(await screen.findByText('Temporada 2 completa: 2 solves. Gelo liberado.', {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(a.profile.season.current.n).toBe(3));
  });

  it('na troca de penalidade, a virada que um solve de outro aparelho fechou, juntado durante a gravação, não é anunciada aqui (spec 6.4)', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    const startedAt = Date.now() - 60000;
    await repo.saveProfile({
      season: {
        current: { n: 2, startedAt, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 2 })), basis: { single: 50000, ao5: 50000, ao12: 50000 } },
        past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 1000, startAo12: null, endAo12: 50000 }],
      },
    });
    await a.reload();
    const announce = vi.spyOn(a, 'announce');
    render(TimerScreen, { app: a });
    await solveByKeys();
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    await waitFor(() => expect(announce.mock.calls.filter(([text]) => text.startsWith('Tempo final'))).toHaveLength(1), { timeout: 3000 });
    const sessionId = a.activeSession!.id;
    const at = startedAt + 1000;
    const editar = repo.updateSolve.bind(repo);
    repo.updateSolve = async (id, patch) => {
      const data = { sessionId, event: '333', ms: 30000, penalty: null, at, scramble: 'R U', note: '', createdAt: at };
      await repo.applyRemote([{ store: 'solves', id: 'do-outro', data, updatedAt: at, deletedAt: null, deletionStamp: at }], at);
      await waitFor(() => expect(a.solves.some((x) => x.id === 'do-outro')).toBe(true));
      return editar(id, patch);
    };
    await fireEvent.click(document.querySelector('[data-act="plus2"]') as HTMLButtonElement);
    await waitFor(() => expect(announce.mock.calls.filter(([text]) => text.startsWith('Tempo final'))).toHaveLength(2), { timeout: 3000 });
    await sleep(100);
    expect(a.solves.find((x) => x.id !== 'do-outro')?.penalty).toBe('+2');
    expect(screen.queryByText(/Temporada 2 completa/)).toBeNull();
    expect(announce.mock.calls.filter(([text]) => text.includes('Temporada 2 completa'))).toEqual([]);
    await waitFor(() => expect(a.profile.season.current.n).toBe(3)); // a temporada vira assim mesmo, em silêncio
  });

  it('uma penalidade que fecha a temporada mostra o fim de temporada no coach e pisca a face de cima, como depois de um solve', async () => {
    const { a } = await seasonByPenalty();
    // A face de cima, vista a cada mudança: cheia na virada, vazia depois (a janela cheia é curta para conferir com um instante só).
    const seen: number[] = [];
    const watch = new MutationObserver(() => seen.push(litFaces()));
    watch.observe(document.querySelector('[data-centro-slot]')!, { attributes: true, subtree: true, childList: true });
    await fireEvent.click(document.querySelector('[data-act="plus2"]') as HTMLButtonElement);
    expect(await screen.findByText('Temporada 2 completa: 5 solves. Gelo liberado.', {}, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(() => expect(a.profile.season.current.n).toBe(3));
    await waitFor(() => expect(litFaces()).toBe(0), { timeout: 4000 });
    watch.disconnect();
    expect(seen).toContain(9);
  });

  it('no modo silencioso, a virada por penalidade pisca a face de cima sem texto', async () => {
    const { a } = await seasonByPenalty({ silent: true });
    const seen: number[] = [];
    const watch = new MutationObserver(() => seen.push(litFaces()));
    watch.observe(document.querySelector('[data-centro-slot]')!, { attributes: true, subtree: true, childList: true });
    await fireEvent.click(document.querySelector('[data-act="plus2"]') as HTMLButtonElement);
    await waitFor(() => expect(a.profile.season.current.n).toBe(3));
    // Sem texto no coach, só a própria face marca a piscada. Esperar a face vazia não prova nada: ela já está vazia antes da virada, e a
    // temporada nova (n = 3) pode chegar antes de a piscada começar (ela vem numa macrotarefa depois da troca). Espera as 9 acesas e só
    // então o esvaziar.
    await waitFor(() => expect(seen).toContain(9), { timeout: 3000 });
    await waitFor(() => expect(litFaces()).toBe(0), { timeout: 4000 });
    watch.disconnect();
    expect(seen).toContain(9);
    expect(screen.queryByText(/Temporada 2 completa/)).toBeNull();
  });

  it('dois toques seguidos na penalidade mostram a virada uma vez só: o segundo, com o primeiro ainda gravando, não conta', async () => {
    const { a } = await seasonByPenalty();
    const announce = vi.spyOn(a, 'announce');
    const plus2 = document.querySelector('[data-act="plus2"]') as HTMLButtonElement;
    plus2.click();
    plus2.click();
    await waitFor(() => expect(a.profile.season.current.n).toBe(3));
    await sleep(300);
    expect(announce.mock.calls.filter(([text]) => text.includes('Temporada 2 completa')).length).toBe(1);
    expect(a.solves.at(-1)?.penalty).toBe('+2');
  });

  it('durante o solve o Centro não muda: nenhum atributo dele é reescrito', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    const svg = () => document.querySelector('[data-centro-slot] svg.centro') as SVGElement;
    key('keydown', 'Space', ' ');
    await sleep(320);
    key('keyup', 'Space', ' ');
    expect(document.body.dataset.tstate).toBe('running');
    await sleep(50);
    const changes: string[] = [];
    const watch = new MutationObserver((list) => list.forEach((m) => changes.push(m.attributeName ?? m.type)));
    watch.observe(svg(), { attributes: true, subtree: true });
    await sleep(1500);
    watch.disconnect();
    key('keydown', 'KeyA', 'a');
    expect(changes).toEqual([]);
    expect(svg().dataset.eyes).toBe('focus');
  });

  it('no recorde, o corpo do Centro salta durante a reação', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() - 60000 });
    render(TimerScreen, { app: a });
    const lifts: string[] = [];
    const watch = new MutationObserver(() => {
      const t = document.querySelector('[data-centro-slot] g.cbody')?.getAttribute('transform');
      if (t) lifts.push(t);
    });
    watch.observe(document.querySelector('[data-centro-slot]')!, { attributes: true, subtree: true, childList: true });
    await solveByKeys();
    await waitFor(() => expect(lifts.length).toBeGreaterThan(0), { timeout: 3000 });
    watch.disconnect();
    expect(lifts[0]).toMatch(/^translate\(0 -/);
  });

  it('um DNF no meio da reação troca os olhos do Centro na hora, antes de a reação acabar', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    const svg = () => document.querySelector('[data-centro-slot] svg.centro') as SVGElement;
    await solveByKeys();
    await waitFor(() => expect(document.body.dataset.cview).toBe('reaction'), { timeout: 3000 });
    expect(svg().dataset.eyes).not.toBe('half');
    key('keydown', 'KeyD', 'd');
    await waitFor(() => expect(svg().dataset.eyes).toBe('half'), { timeout: 1500 });
    expect(document.body.dataset.cview).toBe('reaction');
  });

  it('se a conta do coach lança, a reação entra sem coach (o Centro não fica preso no foco) e nada rejeita sem dono', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    const rejeicoes: unknown[] = [];
    const anotar = (motivo: unknown): void => {
      rejeicoes.push(motivo);
    };
    process.on('unhandledRejection', anotar);
    coachFalha.on = true;
    try {
      let reagiu = false;
      const amostra = (): void => {
        if (document.body.dataset.cview === 'reaction') {
          reagiu = true;
          return;
        }
        requestAnimationFrame(amostra);
      };
      await solveByKeys();
      requestAnimationFrame(amostra);
      await waitFor(() => expect(reagiu).toBe(true), { timeout: 4000 });
      expect(a.solves).toHaveLength(1);
      await sleep(50);
      expect(rejeicoes).toEqual([]);
    } finally {
      coachFalha.on = false;
      process.off('unhandledRejection', anotar);
    }
  });

  it('enquanto a gravação demora, o Centro fica parado (foco) até a reação começar', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    const gravar = repo.addSolve.bind(repo);
    repo.addSolve = async (s) => {
      await sleep(600);
      return gravar(s);
    };
    render(TimerScreen, { app: a });
    const svg = () => document.querySelector('[data-centro-slot] svg.centro') as SVGElement;
    // Uma amostra por quadro (entre quadros o SVG pode ser refeito e repintado nas microtarefas) até a reação aparecer.
    const vistos = new Set<string>();
    let reagiu = false;
    const amostra = (): void => {
      if (document.body.dataset.cview === 'reaction') {
        reagiu = true;
        return;
      }
      vistos.add(`${document.body.dataset.cview}|${svg().dataset.eyes}`);
      requestAnimationFrame(amostra);
    };
    await solveByKeys();
    requestAnimationFrame(amostra);
    await waitFor(() => expect(reagiu).toBe(true), { timeout: 4000 });
    expect([...vistos]).toEqual(['running|focus']);
  });

  it('com o Centro oculto, o Timer não mostra o cubo, e o solve, a reação e o coach seguem', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false, centro: 'oculto' });
    render(TimerScreen, { app: a });
    expect(document.querySelector('[data-centro-slot]')).toBeNull();
    // A reação segue sem o Centro: uma amostra por quadro, como no teste vizinho, até o estado dela aparecer.
    let reagiu = false;
    const amostra = (): void => {
      if (document.body.dataset.cview === 'reaction') {
        reagiu = true;
        return;
      }
      requestAnimationFrame(amostra);
    };
    await solveByKeys();
    requestAnimationFrame(amostra);
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(reagiu).toBe(true), { timeout: 4000 });
    await waitFor(() => expect(document.querySelector('.coach')?.textContent).toMatch(/Marco \d de 9/), { timeout: 3000 });
    expect(document.querySelector('[data-centro-slot]')).toBeNull();
  });

  it('animado, o adesivo ocioso dá a volta; com movimento reduzido, o anel fica parado', async () => {
    const { a } = await app();
    render(TimerScreen, { app: a });
    await waitFor(() => expect(document.querySelectorAll('[data-centro-slot] .ring.lit')).toHaveLength(1));
    await a.updateSettings({ reducedMotion: 'always' });
    await waitFor(() => expect(document.querySelectorAll('[data-centro-slot] .ring.lit')).toHaveLength(0));
  });

  it('ao voltar de oculto, o observador de tela segue o novo espaço do Centro (senão o animador ficaria parado)', async () => {
    const observados: Element[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(el: Element): void {
          observados.push(el);
        }
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): [] {
          return [];
        }
      },
    );
    try {
      const { a } = await app();
      render(TimerScreen, { app: a });
      await waitFor(() => expect(observados).toHaveLength(1));
      await a.updateSettings({ centro: 'oculto' });
      await waitFor(() => expect(document.querySelector('[data-centro-slot]')).toBeNull());
      await a.updateSettings({ centro: 'estatico' });
      const slot = await waitFor(() => {
        const el = document.querySelector('[data-centro-slot]');
        expect(el).not.toBeNull();
        return el;
      });
      await waitFor(() => expect(observados.at(-1)).toBe(slot));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Tempo controlado: o timer lê performance.now(), então a duração de cada solve é a que o teste manda, sem esperas reais.
let relogio = 0;
function relogioControlado(): void {
  relogio = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => relogio);
}

// Um solve de `corrida` ms: arma, segura 400 ms (o timer passa a correr ao soltar) e para com outra tecla.
function solveComTempo(corrida: number): void {
  key('keydown', 'Space', ' ');
  relogio += 400;
  key('keyup', 'Space', ' ');
  relogio += corrida;
  key('keydown', 'KeyA', 'a');
}

// Dois quadros: o tempo do timer e o estado do body são pintados no laço de quadros, depois da mudança.
const doisQuadros = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

describe('tela do Timer: falhas, foco e ações', () => {
  beforeEach(relogioControlado);
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('se a gravação de um solve falha, o tempo na tela é o dele, não o do solve anterior', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    solveComTempo(1200);
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    repo.addSolve = async () => { throw new Error('quota'); };
    solveComTempo(2345);
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
    await doisQuadros();
    expect(document.querySelector('[data-time]')?.textContent).toBe('0:02.34');
  });

  it('se a pessoa arma de novo antes da gravação terminar, o tempo final ainda é anunciado', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    // A gravação só termina quando o teste manda: a pessoa já pode ter armado de novo.
    const gravar = repo.addSolve.bind(repo);
    const quando: { concluir?: () => void } = {};
    repo.addSolve = (s) =>
      new Promise((resolve, reject) => {
        quando.concluir = () => {
          gravar(s).then(resolve, reject);
        };
      });
    const anuncio = vi.spyOn(a, 'announce');
    render(TimerScreen, { app: a });
    solveComTempo(1000);
    await vi.waitFor(() => expect(quando.concluir).toBeTypeOf('function'));
    key('keydown', 'Space', ' ');
    expect(document.body.dataset.tstate).toBe('arming');
    quando.concluir?.();
    await vi.waitFor(() => expect(anuncio).toHaveBeenCalledWith(expect.stringContaining('Tempo final: 0:01.00')));
    expect(document.body.dataset.cview).not.toBe('reaction');
  });

  it('depois de salvar ou cancelar a nota, o foco volta ao botão Nota', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    solveComTempo(1000);
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    const nota = document.querySelector('[data-act="note"]') as HTMLElement;
    key('keydown', 'KeyM', 'm');
    const campo = screen.getByLabelText('Nota sobre este solve');
    await waitFor(() => expect(campo).toHaveFocus());
    fireEvent.keyDown(campo, { key: 'Escape', code: 'Escape' });
    expect(nota).toHaveFocus();
    key('keydown', 'KeyM', 'm');
    await waitFor(() => expect(campo).toHaveFocus());
    fireEvent.input(campo, { target: { value: 'nota nova' } });
    fireEvent.submit(campo.closest('form') as HTMLFormElement);
    expect(nota).toHaveFocus();
    await waitFor(() => expect(nota).toHaveAttribute('aria-label', 'Nota: nota nova'));
  });

  it('se o foco estava numa ação e a tela arma de novo, o foco vai para a tela do Timer', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    solveComTempo(1000);
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    (document.querySelector('[data-act="note"]') as HTMLElement).focus();
    key('keydown', 'Space', ' ');
    expect(document.querySelector('[data-screen="timer"]')).toHaveFocus();
    await waitFor(() => expect(document.querySelector('[data-actions]')).toHaveAttribute('hidden'));
  });

  it('depois de cada solve, o quadrado de hoje ganha a classe pop', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    expect(document.querySelector('[data-heat] .today')).not.toHaveClass('pop');
    solveComTempo(1000);
    await waitFor(() => expect(document.querySelector('[data-heat] .today')).toHaveClass('pop'));
  });

  it('com a tela parada (reação e coach já acabaram), o +2 aparece no tempo grande', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    // A penalidade entra nos dados depois do quadro que o clique pede: só um quadro pedido pela mudança dos dados mostra o +2.
    const atualizar = repo.updateSolve.bind(repo);
    repo.updateSolve = async (id, patch) => {
      await sleep(50);
      return atualizar(id, patch);
    };
    render(TimerScreen, { app: a });
    solveComTempo(1000);
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    // O timer do finishSolve entrou na fila antes de as ações aparecerem: precisa disparar primeiro, para o react() já ter marcado t0.
    // Sem isso, sob carga o cview 'running' do salvamento (live.hold) engana o waitFor e o relógio avança antes da reação começar.
    await new Promise((r) => setTimeout(r, 0));
    // A reação já foi marcada (o Centro espera imóvel); o relógio passa do fim dela e do coach, e o laço de quadros para.
    await waitFor(() => expect(document.body.dataset.cview).toBe('running'));
    relogio += 10000;
    await doisQuadros();
    await doisQuadros();
    expect(document.body.dataset.cview).toBe('idle');
    expect(document.querySelector('[data-time]')?.textContent).toBe('0:01.00');
    document.querySelector<HTMLButtonElement>('[data-act="plus2"]')!.click();
    await waitFor(() => expect(a.solves[0].penalty).toBe('+2'));
    await waitFor(() => expect(document.querySelector('[data-time]')?.textContent).toBe('0:03.00+'));
  });

  it('um solve que ficou na fila ganha as ações quando a fila grava', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    const gravar = repo.addSolve.bind(repo);
    let falhas = 1;
    repo.addSolve = async (s) => {
      if (falhas > 0) {
        falhas -= 1;
        throw new Error('quota');
      }
      return gravar(s);
    };
    render(TimerScreen, { app: a });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    solveComTempo(1000);
    await vi.waitFor(() => expect(a.savePending).toBe(1));
    await vi.waitFor(() => expect(document.querySelector('[data-actions]')).toHaveAttribute('hidden'));
    await vi.advanceTimersByTimeAsync(3100); // a fila tenta de novo (3 s depois da falha)
    await vi.waitFor(() => expect(a.savePending).toBe(0));
    await vi.waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    expect(a.solves).toHaveLength(1);
  });

  it('se excluir falha, as ações continuam na tela', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    solveComTempo(1000);
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    repo.deleteSolve = async () => { throw new Error('io'); };
    key('keydown', 'Backspace', 'Backspace');
    await waitFor(() => expect(a.toast?.text).toBe(T.data.changeFailed));
    expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden');
    expect(a.solves).toHaveLength(1);
  });
});

describe('tela do Timer: espaço segurado antes da inspeção', () => {
  it('segurar espaço antes da inspeção deixa app.pendingInspect true até soltar, e a inspeção deixa o timer ocupado', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: true });
    render(TimerScreen, { app: a });
    key('keydown', 'Space', ' ');
    await waitFor(() => expect(a.pendingInspect).toBe(true));
    key('keyup', 'Space', ' ');
    await waitFor(() => expect(a.pendingInspect).toBe(false));
    expect(a.timerBusy).toBe(true);
  });

  it('o primeiro solve de 3×3 acende o primeiro marco no Centro do Timer, depois que o resultado já está na tela', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    // A face de cima do Centro (os marcos): o anel também acende na reação, então só essa face conta.
    expect(litFaces()).toBe(0);
    await solveByKeys();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    // Um solve de menos de 1 s acende os marcos que ele cumpre (o primeiro, o sub-2, o sub-1:30 e o sub-1), contados pelo núcleo.
    const expected = evaluateSeason(seasonOne(), a.solves).filter((m) => m.achieved).length;
    expect(expected).toBeGreaterThan(0);
    await waitFor(() => expect(litFaces()).toBe(expected));
  });

  it('a sessão que outra aba excluiu recebe o solve, e a tela mostra o resultado (a troca de sessão não o esconde)', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    const current = a.currentSession!;
    await repo.deleteSession(current.id); // outra aba
    await a.reload();
    render(TimerScreen, { app: a });
    await solveByKeys();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    expect(a.solves[0].sessionId).toBe(current.id);
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
  });
});

describe('tela do Timer: enquanto um solve é excluído', () => {
  // Segura a exclusão até `release()`: a janela em que a tela ainda mostra o solve e as ações.
  function holdDeletes(repo: Repository): () => void {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deleteSolve = repo.deleteSolve.bind(repo);
    repo.deleteSolve = async (id: string) => {
      await held;
      return deleteSolve(id);
    };
    return release;
  }

  it('+2 e Nota não respondem enquanto a exclusão do solve não termina', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    await solveByKeys();
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    const release = holdDeletes(repo);
    const setPenalty = vi.spyOn(a, 'setPenalty');
    key('keydown', 'Backspace', 'Backspace');
    await sleep(20);
    document.querySelector<HTMLButtonElement>('[data-act="plus2"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-act="note"]')!.click();
    await sleep(20);
    expect(setPenalty).not.toHaveBeenCalled();
    expect(document.querySelector('[data-noteform]')).toHaveAttribute('hidden');
    release();
    await waitFor(() => expect(a.solves).toHaveLength(0));
  });

  it('a exclusão que termina depois não esconde as ações de um solve mais novo que já tomou a tela', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    await solveByKeys();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    const release = holdDeletes(repo);
    key('keydown', 'Backspace', 'Backspace');
    await sleep(20);
    await solveByKeys(); // um solve mais novo, enquanto a exclusão ainda espera
    await waitFor(() => expect(a.solves).toHaveLength(2));
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    release();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await sleep(30);
    expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden');
  });
});
