import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`aj-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('Ajustes', () => {
  it('marca os valores atuais', async () => {
    const { a } = await app();
    await a.updateSettings({ holdMs: 550 });
    render(AjustesScreen, { app: a });
    expect(await screen.findByText('Ajustes')).toBeInTheDocument();
    expect(document.querySelector('[data-set="holdMs"][data-val="550"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-set="theme"][data-val="system"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-toggle="inspection"]')).toBeChecked();
  });

  it('trocar o tema grava e aplica', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Noite' }));
    expect((await repo.getProfile()).settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('desligar a imagem do embaralhamento grava e mantém o foco no switch', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    const sw = (await screen.findByRole('checkbox', { name: /Imagem do embaralhamento/ })) as HTMLInputElement;
    sw.focus();
    await fireEvent.click(sw);
    await vi.waitFor(async () => {
      expect((await repo.getProfile()).settings.scrambleImage).toBe(false);
      expect((document.activeElement as HTMLElement | null)?.getAttribute('data-toggle')).toBe('scrambleImage');
    });
  });
});

describe('Ajustes: os ajustes novos do timer', () => {
  const pressed = (set: string, val: string) => document.querySelector(`[data-set="${set}"][data-val="${val}"]`);

  it('as três opções do timer gravam no aparelho', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    // os padrões já vêm marcados
    expect(pressed('entry', 'timer')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('phases', '0')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('liveTime', 'full')).toHaveAttribute('aria-pressed', 'true');

    await fireEvent.click(await screen.findByRole('button', { name: 'Digitar' }));
    await fireEvent.click(await screen.findByRole('button', { name: '4' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Escondido' }));
    await vi.waitFor(async () => {
      const st = (await repo.getProfile()).settings;
      expect(st.entry).toBe('typing');
      expect(st.phases).toBe(4);
      expect(st.liveTime).toBe('hidden');
    });
    expect(pressed('entry', 'typing')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('phases', '4')).toHaveAttribute('aria-pressed', 'true');
    expect(pressed('liveTime', 'hidden')).toHaveAttribute('aria-pressed', 'true');

    await fireEvent.click(await screen.findByRole('button', { name: 'Só os segundos' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Desligado' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Cronômetro' }));
    await vi.waitFor(async () => {
      const st = (await repo.getProfile()).settings;
      expect([st.entry, st.phases, st.liveTime]).toEqual(['timer', 0, 'seconds']);
    });
  });

  it('as dicas acompanham a escolha: Digitar, as fases e o exemplo no 4', async () => {
    const { a } = await app();
    render(AjustesScreen, { app: a });
    expect(await screen.findByText(T.ajustes.entryHint)).toBeInTheDocument();
    expect(screen.getByText(T.ajustes.phasesHintOff)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(await screen.findByText(T.ajustes.phasesHint)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(await screen.findByText(T.ajustes.phasesHint4)).toBeInTheDocument();
    expect(T.ajustes.phasesHint4).toContain('cruz, F2L, OLL e PLL');
    await fireEvent.click(screen.getByRole('button', { name: 'Digitar' }));
    expect(await screen.findByText(T.ajustes.entryHintTyping)).toBeInTheDocument();
  });

  it('o Som do aviso só aparece com o aviso ligado e grava a voz', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    const aviso = (await screen.findByRole('checkbox', { name: /Aviso da inspeção/ })) as HTMLInputElement;
    expect(aviso).toBeChecked();
    expect(screen.queryByText('Tique da inspeção')).toBeNull();
    const grupo = screen.getByRole('group', { name: 'Som do aviso' });
    expect(pressed('inspVoice', 'false')).toHaveAttribute('aria-pressed', 'true');

    await fireEvent.click(screen.getByRole('button', { name: 'Voz' }));
    await vi.waitFor(async () => expect((await repo.getProfile()).settings.inspVoice).toBe(true));
    expect(pressed('inspVoice', 'true')).toHaveAttribute('aria-pressed', 'true');
    expect(grupo).toBeInTheDocument();

    // Desligado, a linha some; religado, volta com a escolha que estava.
    await fireEvent.click(aviso);
    await vi.waitFor(() => expect(screen.queryByRole('group', { name: 'Som do aviso' })).toBeNull());
    await fireEvent.click(aviso);
    expect(await screen.findByRole('group', { name: 'Som do aviso' })).toBeInTheDocument();
    expect(pressed('inspVoice', 'true')).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(screen.getByRole('button', { name: 'Bipe' }));
    await vi.waitFor(async () => expect((await repo.getProfile()).settings.inspVoice).toBe(false));
  });

  // Escolher "Voz" fala uma amostra ("oito"): o clique é um gesto de ativação, que libera a fala no iOS para a página.
  it('escolher Voz fala "oito" de amostra; escolher Bipe, não', async () => {
    const said: string[] = [];
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{ lang: 'pt-BR', name: 'Brasil' }],
      cancel() {},
      speak: (u: { text: string }) => void said.push(u.text),
      addEventListener() {},
      removeEventListener() {},
    });
    vi.stubGlobal('SpeechSynthesisUtterance', class { voice = null; lang = ''; volume = 1; constructor(public text: string) {} });
    try {
      const { a } = await app();
      render(AjustesScreen, { app: a });
      await fireEvent.click(await screen.findByRole('button', { name: 'Voz' }));
      expect(said).toEqual([T.timer.voice8]);
      expect(T.timer.voice8).toBe('oito');
      await fireEvent.click(screen.getByRole('button', { name: 'Bipe' }));
      expect(said).toEqual(['oito']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sem voz em português no aparelho, a dica do Som do aviso diz que toca o bipe', async () => {
    const { a } = await app();
    render(AjustesScreen, { app: a }); // o jsdom não tem speechSynthesis
    expect(await screen.findByText(T.ajustes.inspSoundHintNoVoice)).toBeInTheDocument();
    expect(screen.queryByText(T.ajustes.inspSoundHint)).toBeNull();
  });
});
