import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';

vi.mock('../../src/ui/download', () => ({ downloadText: vi.fn(() => true) }));
import { downloadText } from '../../src/ui/download';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`er-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async (ev) => `${ev} R U` }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function key(type: 'keydown' | 'keyup', code: string, k: string): void {
  document.body.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
}

const lembrete = () => screen.queryByRole('button', { name: T.reminder.later });

beforeEach(() => {
  vi.mocked(downloadText).mockClear();
  vi.mocked(downloadText).mockReturnValue(true);
});

describe('lembrete de exportar acima dos tiles', () => {
  it('aparece em repouso quando o aviso está ligado', async () => {
    const { a } = await app();
    a.exportReminder = true;
    render(TimerScreen, { app: a });
    expect(await screen.findByRole('button', { name: T.reminder.later })).toBeInTheDocument();
    expect(document.querySelector('[data-export-reminder]')).not.toBeNull();
  });

  it('some enquanto o timer arma, roda, e volta quando o solve termina', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    a.exportReminder = true;
    render(TimerScreen, { app: a });
    await screen.findByRole('button', { name: T.reminder.later });

    key('keydown', 'Space', ' ');
    await waitFor(() => expect(document.body.dataset.tstate).toBe('arming'));
    expect(lembrete()).toBeNull();

    await waitFor(() => expect(document.body.dataset.tstate).toBe('ready'), { timeout: 1500 });
    expect(lembrete()).toBeNull();

    key('keyup', 'Space', ' ');
    expect(document.body.dataset.tstate).toBe('running');
    expect(lembrete()).toBeNull();

    key('keydown', 'KeyA', 'a');
    await waitFor(() => expect(document.body.dataset.tstate).toBe('done'), { timeout: 1500 });
    expect(await screen.findByRole('button', { name: T.reminder.later })).toBeInTheDocument();
  });

  it('agora não: tira o aviso e grava que ele foi dispensado por agora', async () => {
    const { a } = await app();
    a.exportReminder = true;
    render(TimerScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: T.reminder.later }));
    expect(a.exportReminder).toBe(false);
    expect(lembrete()).toBeNull();
  });

  it('exportar agora (lembrete) baixa o arquivo do Klick, zera o aviso e grava quando foi', async () => {
    const { a, repo } = await app();
    a.exportReminder = true;
    render(TimerScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: T.data.exportNow }));
    await vi.waitFor(() => expect(downloadText).toHaveBeenCalled());
    const [name] = vi.mocked(downloadText).mock.calls.at(-1)!;
    expect(name).toMatch(/^klick-.*\.json$/);
    expect(a.exportReminder).toBe(false);
    await vi.waitFor(async () => expect((await repo.getMeta()).lastExportAt).not.toBeNull());
  });

  it('sem download (iframe), exportar agora leva à tela Ajustes com o texto para copiar', async () => {
    vi.mocked(downloadText).mockReturnValue(false);
    const { a } = await app();
    a.exportReminder = true;
    render(TimerScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: T.data.exportNow }));
    await waitFor(() => expect(a.dialog).toBe('export'));
    expect(a.tab).toBe('ajustes');
    expect(a.pendingExport?.format).toBe('klick');
  });

  it('o aviso de salvar usa o mesmo caminho de exportar', async () => {
    const { a, repo } = await app();
    repo.addSolve = async () => {
      throw new Error('quota');
    };
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    render(TimerScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: T.data.exportNow }));
    await vi.waitFor(() => expect(downloadText).toHaveBeenCalled());
    expect(vi.mocked(downloadText).mock.calls.at(-1)?.[0]).toMatch(/^klick-.*\.json$/);
  });
});
