import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import type { InstallPromptEvent } from '../../src/ui/platform';
import InstallGuide from '../../src/ui/dialogs/InstallGuide.svelte';
import { T } from '../../src/strings';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ig-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as unknown as Record<string, unknown>).maxTouchPoints;
});

describe('Guia de instalação', () => {
  it('no iPhone, explica os passos do Safari e que isso protege os dados', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const { a } = await app();
    render(InstallGuide, { app: a, open: true });
    expect(await screen.findByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
    expect(screen.getByText(/Compartilhar/)).toBeInTheDocument();
    expect(screen.getByText(/protege os seus solves/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar o app' })).toBeNull();
  });

  it('no iPhone, avisa que os solves do Safari não passam para o app instalado, e ensina o caminho do iOS 26', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const { a } = await app();
    render(InstallGuide, { app: a, open: true });
    expect(await screen.findByText(T.install.iosDataNote)).toBeInTheDocument();
    expect(screen.getByText(/•••/)).toBeInTheDocument();
  });

  it('fora do iPhone, o botão Instalar usa o evento beforeinstallprompt que a casca guardou', async () => {
    const { a } = await app();
    const prompt = vi.fn(async () => {});
    const ev = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt }) as InstallPromptEvent;
    const onused = vi.fn();
    render(InstallGuide, { app: a, open: true, installEvent: ev, onused });
    await fireEvent.click(await screen.findByRole('button', { name: 'Instalar o app' }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(onused).toHaveBeenCalledTimes(1);
  });

  it('sem o evento (o navegador ainda não ofereceu), mostra o caminho pelo menu', async () => {
    const { a } = await app();
    render(InstallGuide, { app: a, open: true, installEvent: null });
    expect(await screen.findByText(/menu do navegador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar o app' })).toBeNull();
  });

  it('fechar grava installGuideDismissed e libera app.dialog', async () => {
    const { a, repo } = await app();
    a.dialog = 'install';
    render(InstallGuide, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    await vi.waitFor(async () => expect((await repo.getMeta()).installGuideDismissed).toBe(true));
    expect(a.dialog).toBeNull();
  });
});
