import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/svelte';
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
const CSTIMER = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures', 'cstimer-export.txt'), 'utf8');

let dbn = 0;
// Perfil marcado por padrão: o tour não abre sozinho nos testes que não tratam da primeira vez.
async function makeApp({ onboarded = true }: { onboarded?: boolean } = {}): Promise<{ a: AppState; repo: ReturnType<typeof createRepository> }> {
  const repo = createRepository(await openKlickDb(`ad-${++dbn}`), { channel: null });
  if (onboarded) await repo.saveProfile({ onboarded: true });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

const solve = (a: AppState, i: number) => a.addSolve({ ms: 60000 + i, penalty: null, at: Date.now() + i });

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

  it('com o perfil já marcado, o tour não abre (controle: o perfil foi lido como visto)', async () => {
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    await tick();
    expect(a.profile.onboarded).toBe(true);
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

  it('tocar em Importar do csTimer chama o seletor dentro do toque; o arquivo escolhido cai no mesmo diálogo de importar', async () => {
    const { a, repo } = await makeApp({ onboarded: false });
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('heading', { name: 'Esse é o Centro' });
    await fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    const clique = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const tocar = fireEvent.click(await screen.findByRole('button', { name: 'Importar do csTimer' }));
    // Sem await antes da asserção: o seletor é pedido dentro do próprio toque.
    expect(clique).toHaveBeenCalledTimes(1);
    await tocar;

    const seletor = document.querySelector('[data-import-input]') as HTMLInputElement;
    expect(seletor).not.toBeNull();
    await fireEvent.change(seletor, { target: { files: [new File([CSTIMER], 'cstimer.txt', { type: 'text/plain' })] } });
    await vi.waitFor(() => expect(a.tab).toBe('ajustes'), { timeout: 3000 });
    await fireEvent.change(await screen.findByLabelText(/Evento de ZBLL/), { target: { value: '333' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Importar solves' }));
    await vi.waitFor(async () => expect((await repo.listSolves()).length).toBe(5), { timeout: 3000 });
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
    for (let i = 0; i < 4; i++) await solve(a, i);
    await tick();
    expect(a.solves.length).toBe(4); // controle: abaixo do limiar, sem abrir
    expect(a.dialog).toBeNull();

    await solve(a, 4);
    expect(await screen.findByRole('heading', { name: T.install.title })).toBeInTheDocument();
    expect(a.dialog).toBe('install');

    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await vi.waitFor(async () => expect((await repo.getMeta()).installGuideDismissed).toBe(true), { timeout: 3000 });
    expect(a.dialog).toBeNull();

    await solve(a, 5);
    await tick();
    expect(a.solves.length).toBe(6);
    expect(a.dialog).toBeNull();

    // Uma casca nova (outra abertura do app) também não reabre: a marca de dispensado está gravada.
    unmount();
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    await solve(a, 6);
    await tick();
    expect(a.solves.length).toBe(7);
    expect(a.dialog).toBeNull();
  });

  it('no iPhone, com o timer armado ou rodando, o guia espera; abre quando o timer para', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    a.timerBusy = true;
    for (let i = 0; i < 5; i++) await solve(a, i);
    await tick();
    expect(a.solves.length).toBe(5); // controle: o limiar foi alcançado
    expect(a.dialog).toBeNull();

    a.timerBusy = false;
    expect(await screen.findByRole('heading', { name: T.install.title })).toBeInTheDocument();
  });

  it('fora do iPhone (Android), não abre sozinho mesmo com 5 solves', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
    const { a } = await makeApp();
    hooks.boot = async () => a;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    for (let i = 0; i < 5; i++) await solve(a, i);
    await tick();
    expect(a.solves.length).toBe(5); // controle: o limiar foi alcançado
    expect(a.dialog).toBeNull();
  });
});
