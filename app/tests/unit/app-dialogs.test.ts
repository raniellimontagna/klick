import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

// A casca monta com um estado pronto (o boot real abriria o IndexedDB e o cubing). Como em app-shell.test.ts.
const hooks = vi.hoisted(() => ({ boot: null as null | (() => Promise<unknown>) }));

vi.mock('../../src/ui/state/boot', () => ({
  boot: async () => (hooks.boot ? hooks.boot() : new Promise<never>(() => {})),
}));

import App from '../../src/ui/App.svelte';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36';

let dbn = 0;
// Perfil marcado por padrão: o tour não abre sozinho nos testes que não tratam da primeira vez.
async function makeApp({ onboarded = true }: { onboarded?: boolean } = {}): Promise<{ a: AppState; repo: ReturnType<typeof createRepository> }> {
  const repo = createRepository(await openKlickDb(`ad-${++dbn}`), { channel: null });
  if (onboarded) await repo.saveProfile({ onboarded: true });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

afterEach(() => {
  hooks.boot = null;
  vi.restoreAllMocks();
  delete (navigator as unknown as Record<string, unknown>).maxTouchPoints;
});

describe('ligação dos diálogos na casca', () => {
  it('a pílula da sessão abre o diálogo de sessões', async () => {
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    await fireEvent.click(document.querySelector('[data-session-pill]') as HTMLElement);
    expect(a.dialog).toBe('sessions');
    expect(await screen.findByRole('heading', { name: 'Sessões' })).toBeInTheDocument();
  });

  it('a tecla ? abre o diálogo de atalhos', async () => {
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', code: 'Slash', bubbles: true, cancelable: true }));
    expect(await screen.findByRole('heading', { name: T.shortcuts.title })).toBeInTheDocument();
    expect(a.dialog).toBe('shortcuts');
  });

  it('na primeira vez (perfil não marcado), o tour abre sozinho', async () => {
    const { a } = await makeApp({ onboarded: false });
    hooks.boot = async () => a;
    render(App);
    expect(await screen.findByRole('heading', { name: 'Esse é o Centro' })).toBeInTheDocument();
    expect(a.dialog).toBe('onboarding');
  });

  it('com o perfil já marcado, o tour não abre', async () => {
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    await sleep(20);
    expect(a.dialog).toBeNull();
  });

  it('o evento beforeinstallprompt chega com o app montado e o guia usa o evento', async () => {
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    await tick();
    const prompt = vi.fn(async () => {});
    window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }));
    a.dialog = 'install';
    await fireEvent.click(await screen.findByRole('button', { name: 'Instalar o app' }));
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});

describe('guia de instalação automático', () => {
  it('no iPhone, abre uma vez depois do 5º solve e não volta depois de dispensado', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const { a, repo } = await makeApp();
    hooks.boot = async () => a;
    const { unmount } = render(App);
    await screen.findByRole('button', { name: 'Timer' });
    for (let i = 0; i < 4; i++) await a.addSolve({ ms: 60000 + i, penalty: null, at: Date.now() + i });
    await sleep(30);
    expect(a.dialog).toBeNull();

    await a.addSolve({ ms: 60010, penalty: null, at: Date.now() + 10 });
    expect(await screen.findByRole('heading', { name: T.install.title })).toBeInTheDocument();
    expect(a.dialog).toBe('install');

    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await vi.waitFor(async () => expect((await repo.getMeta()).installGuideDismissed).toBe(true));
    expect(a.dialog).toBeNull();

    await a.addSolve({ ms: 60020, penalty: null, at: Date.now() + 20 });
    await sleep(30);
    expect(a.dialog).toBeNull();

    // Uma casca nova (outra abertura do app) também não reabre: a marca de dispensado está gravada.
    unmount();
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    await a.addSolve({ ms: 60030, penalty: null, at: Date.now() + 30 });
    await sleep(30);
    expect(a.dialog).toBeNull();
  });

  it('fora do iPhone (Android), não abre sozinho mesmo com 5 solves', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    for (let i = 0; i < 5; i++) await a.addSolve({ ms: 60000 + i, penalty: null, at: Date.now() + i });
    await sleep(30);
    expect(a.dialog).toBeNull();
  });
});
