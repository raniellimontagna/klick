import { render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
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
      expect(screen.getByText('3/7')).toBeInTheDocument();
      vi.setSystemTime(noon.getTime() + day + 2 * 3_600_000);
      vi.advanceTimersByTime(60_000);
      await tick();
      expect(screen.getByText('0/7')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

