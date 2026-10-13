import { render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { marksFor } from '../../src/core/season';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import CentroScreen from '../../src/ui/centro/CentroScreen.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ce-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('Centro', () => {
  it('o primeiro solve de 3×3 acende o primeiro marco; um de 2×2 não', async () => {
    const { a } = await app();
    await a.createSession('222');
    await a.addSolve({ ms: 5000, penalty: null, at: Date.now() });
    const r1 = render(CentroScreen, { app: a });
    expect(await screen.findByText(/0 de 9 marcos/)).toBeInTheDocument();
    r1.unmount();
    await a.createSession('333');
    await a.addSolve({ ms: 130000, penalty: null, at: Date.now() });
    render(CentroScreen, { app: a });
    expect(await screen.findByText(/1 de 9 marcos/)).toBeInTheDocument();
  });

  it('marcar uma etapa da trilha grava no perfil', async () => {
    const { a, repo } = await app();
    render(CentroScreen, { app: a });
    (await screen.findByRole('button', { name: /Cruz branca: já sei/ })).click();
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.getProfile()).trail[0]).toBe(true);
  });
});

describe('Centro: trilha, acabamento e modo silencioso', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"desfazer" tira a etapa marcada e grava o perfil', async () => {
    const { a, repo } = await app();
    render(CentroScreen, { app: a });
    (await screen.findByRole('button', { name: /Cruz branca: já sei/ })).click();
    await new Promise((r) => setTimeout(r, 50));
    (await screen.findByRole('button', { name: /Cruz branca: desfazer/ })).click();
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.getProfile()).trail[0]).toBe(false);
  });

  it('acabamento bloqueado mostra a prévia por 3 s, volta depois e não grava', async () => {
    const { a, repo } = await app();
    render(CentroScreen, { app: a });
    const brilho = await screen.findByRole('button', { name: /Brilho/ });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    brilho.click();
    await tick();
    expect(screen.getByText(/prévia: Brilho/)).toBeInTheDocument();
    vi.advanceTimersByTime(2999);
    await tick();
    expect(screen.getByText(/prévia: Brilho/)).toBeInTheDocument();
    vi.advanceTimersByTime(1);
    await tick();
    expect(screen.queryByText(/prévia: Brilho/)).toBeNull();
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
    expect((await repo.getProfile()).finish).toBe('fosco');
  });

  it('o modo silencioso grava settings.silent', async () => {
    const { a, repo } = await app();
    render(CentroScreen, { app: a });
    const modo = (await screen.findByRole('checkbox', { name: /Modo silencioso/ })) as HTMLInputElement;
    modo.click();
    await new Promise((r) => setTimeout(r, 50));
    expect((await repo.getProfile()).settings.silent).toBe(true);
    expect(modo.checked).toBe(true);
  });

  it('o controle do Centro grava o ajuste e marca a opção escolhida', async () => {
    const { a } = await app();
    render(CentroScreen, { app: a });
    const group = await screen.findByRole('group', { name: T.centro.mode });
    expect(group.querySelector('[data-val="animado"]')).toHaveAttribute('aria-pressed', 'true');
    (group.querySelector('[data-val="oculto"]') as HTMLButtonElement).click();
    await waitFor(() => expect(a.profile.settings.centro).toBe('oculto'));
    await waitFor(() => expect(group.querySelector('[data-val="oculto"]')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('o Centro grande dá a volta no animado e fica parado no estático', async () => {
    const { a } = await app();
    render(CentroScreen, { app: a });
    await waitFor(() => expect(document.querySelectorAll('.big .ring.lit')).toHaveLength(1));
    await a.updateSettings({ centro: 'estatico' });
    await waitFor(() => expect(document.querySelectorAll('.big .ring.lit')).toHaveLength(0));
  });
});

// O modo silencioso ligado no Centro cala a mensagem que o coach está mostrando na tela do Timer.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
function key(type: 'keydown' | 'keyup', code: string, k: string): void {
  document.body.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
}

describe('Centro: modo silencioso e o coach', () => {
  it('o modo silencioso cala a mensagem que o coach está mostrando', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    await a.addSolve({ ms: 10000, penalty: null, at: Date.now() - 1000 }); // o recorde a bater
    render(TimerScreen, { app: a });
    render(CentroScreen, { app: a });
    key('keydown', 'Space', ' ');
    await sleep(320);
    key('keyup', 'Space', ' ');
    key('keydown', 'KeyA', 'a');
    await waitFor(() => expect(document.querySelector('.coach')?.textContent).toMatch(/Novo recorde/), { timeout: 3000 });
    (await screen.findByRole('checkbox', { name: /Modo silencioso/ })).click();
    await waitFor(() => expect(document.querySelector('.coach')?.textContent).not.toMatch(/Novo recorde/), { timeout: 2000 });
    expect(a.profile.settings.silent).toBe(true);
  });
});

describe('Centro: relógio da tela', () => {
  it('a sequência de dias muda com o relógio andando, sem solve novo (o Centro não fica preso no dia em que abriu)', async () => {
    const { a } = await app();
    const day = 86_400_000;
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    // Solves em três dias seguidos, terminando ontem: a sequência é 3 hoje, e zera quando o dia vira sem solve novo.
    for (let i = 1; i <= 3; i++) await a.addSolve({ ms: 120_000, penalty: null, at: noon.getTime() - i * day });
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: noon.getTime() + 2 * 3_600_000 });
    try {
      render(CentroScreen, { app: a });
      expect(screen.getByText('3 de 7 dias')).toBeInTheDocument();
      vi.setSystemTime(noon.getTime() + day + 2 * 3_600_000);
      vi.advanceTimersByTime(60_000);
      await tick();
      expect(screen.getByText('0 de 7 dias')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Centro: temporadas', () => {
  it('na T2 os marcos vêm da escada; o histórico mostra a T1; o Brilho está liberado e o Gelo diz de onde sai', async () => {
    const repo = createRepository(await openKlickDb(`ce-${++n}`), { channel: null });
    const basis = { single: 15210, ao5: 18770, ao12: 19340 };
    await repo.saveProfile({
      season: {
        current: { n: 2, startedAt: new Date(2026, 9, 13, 12).getTime(), marks: marksFor(basis), basis },
        past: [{ n: 1, startedAt: new Date(2025, 9, 8, 12).getTime(), endedAt: new Date(2026, 9, 13, 11).getTime(), solves: 1204, startAo12: null, endAo12: 62310 }],
      },
    });
    const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
    await a.init();
    render(CentroScreen, { app: a });
    expect(await screen.findByText(/Temporada 2 · 0 de 9 marcos · Fosco/)).toBeInTheDocument();
    expect(screen.getByText('Face de cima · Temporada 2, desde 13/10')).toBeInTheDocument();
    expect(screen.getByText('Média de 5 abaixo de 18 s')).toBeInTheDocument();
    expect(screen.getByText('5 seguidos dentro de 1.9 s')).toBeInTheDocument();
    expect(screen.getByText('T1 · 08/10/2025 a 13/10/2026 · 1.204 solves · média de 12 em 1:02.31 · Brilho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Brilho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gelo · sai na T2' })).toBeInTheDocument();
  });

  it('sem temporada fechada, o histórico diz que a primeira está em andamento', async () => {
    const { a } = await app();
    render(CentroScreen, { app: a });
    expect(await screen.findByText(T.centro.historyEmpty)).toBeInTheDocument();
    expect(screen.getByText('Face de cima · Temporada 1')).toBeInTheDocument();
  });
});
