import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import type { CubeSpec, CubeState } from '../../src/ui/trilha/cube-view';
import TrilhaScreen from '../../src/ui/trilha/TrilhaScreen.svelte';

// O cubo de mentira: a tela fala só com a interface CubeView. `moving` false faz o papel da figura 2D; `fail`, do cubing.js sem carregar.
const cube = vi.hoisted(() => ({
  log: [] as string[],
  specs: [] as unknown[],
  listener: null as null | ((s: CubeState) => void),
  moving: true,
  fail: false,
  gate: null as null | Promise<void>, // o mountCube só resolve quando o gate abre: o cubing.js que carrega devagar
}));
vi.mock('../../src/ui/trilha/cube-view', () => ({
  mountCube: async (_host: HTMLElement, spec: CubeSpec) => {
    if (cube.fail) return null;
    cube.specs.push(spec);
    cube.log.push('mount');
    if (cube.gate) await cube.gate;
    return {
      moving: cube.moving,
      show(s: CubeSpec, autoplay: boolean) {
        cube.specs.push(s);
        cube.log.push(autoplay ? 'show+play' : 'show');
      },
      play: () => cube.log.push('play'),
      pause: () => cube.log.push('pause'),
      step: (d: number) => cube.log.push(`step ${d}`),
      restart: () => cube.log.push('restart'),
      listen(fn: (s: CubeState) => void) {
        cube.listener = fn;
        fn({ move: 0, playing: false, atStart: true, atEnd: false });
      },
      destroy: () => cube.log.push('destroy'),
    };
  },
  drawFigure: async () => {},
}));

let n = 0;
async function lesson(step: number, prep?: (a: AppState) => Promise<unknown>) {
  const repo = createRepository(await openKlickDb(`lp-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  await prep?.(a);
  a.openTrail({ kind: 'lesson', step: step as 0 });
  const r = render(TrilhaScreen, { app: a });
  await waitFor(() => expect(cube.log).toContain('mount'));
  return { a, repo, r };
}
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
const key = (k: string, code = k, repeat = false) =>
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, repeat, bubbles: true, cancelable: true }));

beforeEach(() => {
  Object.assign(cube, { log: [], specs: [], listener: null, moving: true, fail: false, gate: null });
});

describe('aula: andar pelos passos (spec 6.1)', () => {
  it('abre no passo 1 da aula 1, com o nome da etapa, o progresso e o cubo do passo', async () => {
    await lesson(0);
    expect(screen.getByRole('heading', { name: 'Cruz branca' })).toBeInTheDocument();
    expect(screen.getByText('passo 1 de 8')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Segure assim' })).toBeInTheDocument();
    expect(cube.specs[0]).toEqual({ setup: '', alg: '', view: '3D', mask: undefined });
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Controles do cubo' })).toBeNull(); // passo sem algoritmo
  });

  it('Próximo troca o cubo, toca o algoritmo uma vez e guarda o passo para a retomada', async () => {
    const { repo } = await lesson(0);
    await next();
    expect(screen.getByRole('heading', { name: 'As faces têm letras' })).toBeInTheDocument();
    expect(cube.specs.at(-1)).toEqual({ setup: '', alg: 'R', view: '3D', mask: undefined });
    expect(cube.log.at(-1)).toBe('show+play');
    await waitFor(async () => expect((await repo.getProfile()).lessonAt).toEqual({ 0: 1 }));
    expect(screen.getByRole('group', { name: 'Controles do cubo' })).toBeInTheDocument();
  });

  it('com "reduzir movimento", nada toca sozinho', async () => {
    await lesson(0, (a) => a.updateSettings({ reducedMotion: 'always' }));
    await next();
    expect(cube.log.at(-1)).toBe('show');
    expect(cube.log).not.toContain('play');
  });

  it('com o Centro estático, também não toca sozinho', async () => {
    await lesson(0, (a) => a.updateSettings({ centro: 'estatico' }));
    await next();
    expect(cube.log.at(-1)).toBe('show');
  });

  it('← e → andam um movimento; o espaço toca ou pausa; o movimento atual fica destacado', async () => {
    await lesson(0);
    await next();
    key('ArrowRight');
    cube.listener?.({ move: 1, playing: false, atStart: false, atEnd: false }); // o cubo andou: ← volta
    key('ArrowLeft');
    key(' ', 'Space');
    expect(cube.log.slice(-3)).toEqual(['step 1', 'step -1', 'play']);
    cube.listener?.({ move: 0, playing: true, atStart: false, atEnd: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument());
    key(' ', 'Space');
    expect(cube.log.at(-1)).toBe('pause');
    await next();
    cube.listener?.({ move: 2, playing: false, atStart: false, atEnd: false });
    await waitFor(() => expect(document.querySelector('[data-alg] .now')?.textContent).toBe("R'"));
  });

  it('← no começo e → no fim não fazem nada; a tecla segurada (repetição) não anda', async () => {
    await lesson(0);
    await next();
    cube.log = [];
    cube.listener?.({ move: 0, playing: false, atStart: true, atEnd: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Movimento anterior' })).toBeDisabled());
    key('ArrowLeft');
    cube.listener?.({ move: 1, playing: false, atStart: false, atEnd: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Próximo movimento' })).toBeDisabled());
    key('ArrowRight');
    expect(cube.log).toEqual([]);
    cube.listener?.({ move: 0, playing: false, atStart: false, atEnd: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Próximo movimento' })).not.toBeDisabled());
    key('ArrowRight', 'ArrowRight', true);
    key('ArrowLeft', 'ArrowLeft', true);
    expect(cube.log).toEqual([]);
    key('ArrowRight');
    expect(cube.log).toEqual(['step 1']);
  });

  it('Voltar até o primeiro passo desliga o botão: o foco vai para Próximo, não cai no body', async () => {
    await lesson(0, (x) => x.setLessonAt(0, 1));
    const back = screen.getByRole('button', { name: 'Voltar' });
    back.focus();
    await fireEvent.click(back);
    await screen.findByRole('heading', { name: 'Segure assim' });
    expect(back).toBeDisabled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Próximo' })));
  });

  it('a troca de passo é anunciada ("passo N de M" e o título)', async () => {
    const { a } = await lesson(0);
    await next();
    await waitFor(() => expect(a.live).toBe('passo 2 de 8: As faces têm letras'));
    await fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(a.live).toBe('passo 1 de 8: Segure assim'));
  });

  it('o último Próximo não deixa o foco cair: ele fica no botão, que vira "Consegui no meu cubo"', async () => {
    await lesson(0, (x) => x.setLessonAt(0, 6));
    const button = screen.getByRole('button', { name: 'Próximo' });
    button.focus();
    await fireEvent.click(button);
    await screen.findByRole('heading', { name: 'Sua vez' });
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
  });

  it('volta de onde parou; um passo guardado além do fim cai no último', async () => {
    await lesson(0, (a) => a.setLessonAt(0, 5));
    expect(screen.getByRole('heading', { name: 'Desça as pétalas' })).toBeInTheDocument();
    expect(cube.specs[0]).toMatchObject({ setup: 'F2 R2 B2 L2', alg: 'F2 R2 B2 L2', mask: 'cross' });
    cube.log = [];
    await lesson(1, (a) => a.setLessonAt(1, 40));
    expect(screen.getByText('passo 6 de 6')).toBeInTheDocument();
  });

  it('sair da aula volta à trilha e desmonta o cubo', async () => {
    const { a } = await lesson(0);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Voltar à trilha' })[0]);
    expect(a.trailView).toEqual({ kind: 'home' });
    await waitFor(() => expect(cube.log).toContain('destroy'));
  });
});

describe('aula: o cubo que carrega devagar (spec 6.1)', () => {
  // O passo muda antes de o cubing.js terminar de montar: o cubo que chega mostra o passo de agora, não o da hora em que começou a carregar.
  function slowCube(): () => void {
    let open!: () => void;
    cube.gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    return open;
  }

  it('Próximo antes de o cubo chegar: ele chega no passo novo e toca o algoritmo dele', async () => {
    const open = slowCube();
    await lesson(0);
    await next();
    expect(screen.getByRole('heading', { name: 'As faces têm letras' })).toBeInTheDocument();
    expect(cube.log).not.toContain('show+play'); // o cubo ainda não chegou
    open();
    await waitFor(() => expect(cube.log.at(-1)).toBe('show+play'));
    expect(cube.specs.at(-1)).toEqual({ setup: '', alg: 'R', view: '3D', mask: undefined });
  });

  it('Voltar antes de o cubo chegar: ele chega no passo de agora, sem o algoritmo do passo antigo', async () => {
    const open = slowCube();
    await lesson(0, (a) => a.setLessonAt(0, 1));
    await fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'Segure assim' })).toBeInTheDocument();
    open();
    await waitFor(() => expect(cube.specs.at(-1)).toEqual({ setup: '', alg: '', view: '3D', mask: undefined }));
  });

  it('com "reduzir movimento", o cubo que chega no passo novo também não toca sozinho', async () => {
    const open = slowCube();
    await lesson(0, (a) => a.updateSettings({ reducedMotion: 'always' }));
    await next();
    open();
    await waitFor(() => expect(cube.log.at(-1)).toBe('show'));
    expect(cube.specs.at(-1)).toEqual({ setup: '', alg: 'R', view: '3D', mask: undefined });
    expect(cube.log).not.toContain('play');
  });
});

describe('aula: concluir (spec 6.2)', () => {
  it('"Consegui no meu cubo" marca a etapa, zera o passo, pisca a face lateral e oferece a próxima etapa', async () => {
    const { a, repo } = await lesson(0, (x) => x.setLessonAt(0, 7));
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(true));
    expect((await repo.getProfile()).lessonAt).toEqual({});
    expect(a.trailFlashes).toBe(1);
    // O foco vai para a ação principal nova (o botão de concluir sumiu).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Próxima etapa' })));
    await fireEvent.click(await screen.findByRole('button', { name: 'Próxima etapa' }));
    expect(a.trailView).toEqual({ kind: 'lesson', step: 1 });
    expect(await screen.findByRole('heading', { name: 'Cantos brancos' })).toBeInTheDocument();
  });

  it('etapa já marcada: o botão é "Concluir", nada é desmarcado e não pisca de novo', async () => {
    const { a, repo } = await lesson(4, async (x) => {
      await x.setTrail([4], true);
      await x.setLessonAt(4, 3);
    });
    const flashes = a.trailFlashes;
    await fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await screen.findByRole('button', { name: 'Próxima etapa' });
    expect((await repo.getProfile()).trail[4]).toBe(true);
    expect(a.trailFlashes).toBe(flashes);
  });

  it('nas etapas 7 a 9, o fim da aula leva a treinar os casos', async () => {
    const { a } = await lesson(6, (x) => x.setLessonAt(6, 4));
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Treinar os casos' }));
    expect(a.trailView).toEqual({ kind: 'set', set: 'oll2' });
  });

  it('se a etapa não grava, a aula fica no último passo e o aviso sai', async () => {
    const { a, repo } = await lesson(0, (x) => x.setLessonAt(0, 7));
    repo.saveProfile = async () => {
      throw new Error('quota');
    };
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await waitFor(() => expect(a.toast).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Próxima etapa' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Consegui no meu cubo' })).toBeInTheDocument();
  });
});

describe('aula: sem o cubo 3D (spec 6.4)', () => {
  it('figura 2D: o aviso, o algoritmo escrito e nenhum controle de movimento; as setas não fazem nada', async () => {
    cube.moving = false;
    await lesson(0, (x) => x.setLessonAt(0, 1));
    expect(screen.getByText(/O cubo 3D não abriu neste aparelho/)).toBeInTheDocument();
    expect(document.querySelector('[data-alg]')).toHaveTextContent('R');
    expect(screen.queryByRole('group', { name: 'Controles do cubo' })).toBeNull();
    key('ArrowRight');
    expect(cube.log).not.toContain('step 1');
  });

  it('o cubing.js que não carrega: a aula continua até o fim, só com o texto e o algoritmo', async () => {
    cube.fail = true;
    const repo = createRepository(await openKlickDb(`lp-${++n}`), { channel: null });
    const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
    await a.init();
    await a.setLessonAt(0, 6);
    a.openTrail({ kind: 'lesson', step: 0 });
    render(TrilhaScreen, { app: a });
    // Sem figura nenhuma: a caixa do cubo recolhe, e o aviso não fala de figura.
    expect(await screen.findByText(T.trilha.lesson.noCube)).toBeInTheDocument();
    expect(screen.queryByText(/A figura mostra/)).toBeNull();
    expect(document.querySelector('[data-cube]')).not.toBeVisible();
    await next();
    await fireEvent.click(screen.getByRole('button', { name: 'Consegui no meu cubo' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(true));
  });
});
