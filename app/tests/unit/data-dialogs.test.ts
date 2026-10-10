import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createBackup } from '../../src/data/safety';
import { V1_KEY } from '../../src/data/transfer';
import { createScrambleQueue } from '../../src/scramble/queue';
import { formatSolve } from '../../src/core/stats';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import DataSection from '../../src/ui/ajustes/DataSection.svelte';

vi.mock('../../src/ui/download', () => ({ downloadText: vi.fn(() => true) }));
import { downloadText } from '../../src/ui/download';

const download = vi.mocked(downloadText);

let n = 0;
interface Setup {
  storage?: Pick<Storage, 'getItem'> | null;
  storageManager?: unknown;
}
async function app({ storage = null, storageManager = null }: Setup = {}) {
  const repo = createRepository(await openKlickDb(`dd-${++n}`), { channel: null });
  const a = new AppState({
    repo,
    queue: createScrambleQueue({ generate: async () => 'R U' }),
    storage,
    storageManager: storageManager as never,
  });
  await a.init();
  return { a, repo };
}

// O texto que o último download levou (nome, texto).
const lastDownload = (): [string, string] => {
  const call = download.mock.calls.at(-1);
  if (!call) throw new Error('nenhum download');
  return [call[0], call[1]];
};

afterEach(() => {
  download.mockClear();
  delete (navigator as unknown as Record<string, unknown>).clipboard;
});

describe('Seus dados: cópias, exportar, lixeira e importar', () => {
  it('restaurar uma cópia pede dois cliques e passa por app.restoreFromBackup', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    await createBackup(repo, 'manual', Date.now());
    await a.addSolve({ ms: 70000, penalty: null, at: Date.now() + 1 });
    const restore = vi.spyOn(a, 'restoreFromBackup');
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Ver cópias/ }));
    await fireEvent.click(await screen.findByRole('button', { name: /Restaurar/ }));
    expect(restore).not.toHaveBeenCalled();
    await fireEvent.click(await screen.findByRole('button', { name: /Tem certeza/ }));
    await vi.waitFor(() => expect(a.solves.map((x) => x.ms)).toEqual([60000]));
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('exportar (Klick) leva também o solve que ainda não foi gravado', async () => {
    const { a, repo } = await app();
    vi.spyOn(repo, 'addSolve').mockRejectedValueOnce(new Error('cota cheia'));
    const pending = await a.addSolve({ ms: 42000, penalty: null, at: Date.now() });
    expect(pending).toBeNull();
    expect(a.savePending).toBe(1);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(Klick\)/ }));
    await vi.waitFor(() => expect(download).toHaveBeenCalled());
    const [, text] = lastDownload();
    expect(JSON.parse(text).solves.map((s: { ms: number }) => s.ms)).toEqual([42000]);
  });

  it('exportar (csTimer) baixa um .txt sem os solves excluídos', async () => {
    const { a } = await app();
    await a.addSolve({ ms: 61234, penalty: null, at: Date.now() });
    const gone = (await a.addSolve({ ms: 70000, penalty: null, at: Date.now() + 1 }))!;
    await a.deleteSolve(gone.id);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(csTimer\)/ }));
    await vi.waitFor(() => expect(download).toHaveBeenCalled());
    const [name, text] = lastDownload();
    expect(name).toMatch(/\.txt$/);
    const parsed = JSON.parse(text);
    const session = parsed.session1 as unknown[][];
    expect(session.map((item) => (item[0] as number[])[1])).toEqual([61234]);
  });

  it('exportar zera solvesSinceExport e grava lastExportAt', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 50000, penalty: null, at: Date.now() });
    expect((await repo.getMeta()).solvesSinceExport).toBe(1);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(Klick\)/ }));
    await vi.waitFor(async () => expect((await repo.getMeta()).lastExportAt).not.toBeNull());
    const meta = await repo.getMeta();
    expect(meta.solvesSinceExport).toBe(0);
    expect(typeof meta.lastExportAt).toBe('number');
  });

  it('se o download falha, abre o diálogo de exportar com o texto e um botão Copiar', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 61234, penalty: null, at: Date.now() });
    download.mockReturnValueOnce(false);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(Klick\)/ }));
    const area = (await screen.findByRole('textbox', { name: T.exportDialog.klickLabel })) as HTMLTextAreaElement;
    expect(area.value).toContain('"ms": 61234');
    expect(screen.getByRole('button', { name: T.exportDialog.copy })).toBeInTheDocument();
    expect(a.dialog).toBe('export');
    // Antes de copiar, a exportação ainda não conta como guardada.
    expect((await repo.getMeta()).lastExportAt).toBeNull();
  });

  it('Copiar sem área de transferência pede a seleção manual e não marca a exportação', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 61234, penalty: null, at: Date.now() });
    download.mockReturnValueOnce(false);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(Klick\)/ }));
    await fireEvent.click(await screen.findByRole('button', { name: T.exportDialog.copy }));
    expect(await screen.findByText(T.exportDialog.copyManual)).toBeInTheDocument();
    expect(a.dialog).toBe('export');
    expect((await repo.getMeta()).lastExportAt).toBeNull();
  });

  it('Copiar com área de transferência marca a exportação feita e fecha o diálogo', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 61234, penalty: null, at: Date.now() });
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    download.mockReturnValueOnce(false);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(Klick\)/ }));
    await fireEvent.click(await screen.findByRole('button', { name: T.exportDialog.copy }));
    await vi.waitFor(() => expect(a.dialog).toBeNull());
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"ms": 61234'));
    await vi.waitFor(async () => expect((await repo.getMeta()).lastExportAt).not.toBeNull());
    expect((await repo.getMeta()).solvesSinceExport).toBe(0);
  });

  it('lixeira: restaura um solve excluído', async () => {
    const { a } = await app();
    const kept = (await a.addSolve({ ms: 60000, penalty: null, at: Date.now() }))!;
    const gone = (await a.addSolve({ ms: 70000, penalty: null, at: Date.now() + 1 }))!;
    await a.deleteSolve(gone.id);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Ver lixeira/ }));
    await fireEvent.click(await screen.findByRole('button', { name: `Restaurar solve ${formatSolve(gone)}` }));
    await vi.waitFor(() => expect(a.solves.map((x) => x.id).sort()).toEqual([kept.id, gone.id].sort()));
  });

  it('lixeira: restaura uma sessão excluída, com os solves dela', async () => {
    const { a } = await app();
    const solve = (await a.addSolve({ ms: 60000, penalty: null, at: Date.now() }))!;
    const session = a.currentSession!;
    await a.deleteSession(session.id);
    expect(a.sessions.some((s) => s.id === session.id)).toBe(false);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Ver lixeira/ }));
    await fireEvent.click(await screen.findByRole('button', { name: `Restaurar sessão ${session.name}` }));
    await vi.waitFor(() => expect(a.sessions.some((s) => s.id === session.id)).toBe(true));
    expect(a.solves.map((x) => x.id)).toContain(solve.id);
  });

  it('versão anterior: mostra quantos registros não puderam ser lidos e marca a oferta', async () => {
    const v1 = {
      state: {
        sessions: [
          {
            id: 'v1-s1',
            name: 'Sessão 1',
            puzzleType: '3x3',
            solves: [
              { id: 'v1-a', timeMs: 61000, penalty: 'NONE', scramble: 'R U', createdAt: '2026-01-02T10:00:00.000Z' },
              { id: 'v1-b', timeMs: 'ruim', penalty: 'NONE', scramble: 'R U', createdAt: '2026-01-02T10:01:00.000Z' },
            ],
          },
        ],
      },
      version: 0,
    };
    const storage = { getItem: (key: string) => (key === V1_KEY ? JSON.stringify(v1) : null) };
    const { a, repo } = await app({ storage });
    expect(a.v1Available).toBe(true);
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: T.dados.importV1 }));
    expect(await screen.findByText(/1 registro da versão anterior não pôde ser lidos/)).toBeInTheDocument();
    expect((await repo.getMeta()).v1ImportOffered).toBe(true);
    expect(a.v1Available).toBe(false);
    expect((await repo.listSolves()).map((s) => s.id)).toEqual(['v1-a']);
  });

  it('csTimer: sessão sem evento que não recebe escolha fica de fora, e o resumo diz quantas', async () => {
    const { a, repo } = await app();
    render(DataSection, { app: a });
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures', 'cstimer-export.txt'), 'utf8');
    await fireEvent.change(await screen.findByLabelText(/Importar arquivo/), {
      target: { files: [new File([text], 'cstimer.txt', { type: 'text/plain' })] },
    });
    await fireEvent.click(await screen.findByRole('button', { name: 'Importar solves' }));
    expect(await screen.findByText(/4 solves importados, 0 já existiam/)).toBeInTheDocument();
    expect(await screen.findByText(/1 sessão ficou de fora/)).toBeInTheDocument();
    expect((await repo.listSolves()).length).toBe(4);
  });

  it('se o navegador recusa a proteção, mostra Não protegido e um aviso', async () => {
    const sm = {
      persisted: async () => false,
      persist: async () => {
        throw new Error('bloqueado');
      },
      estimate: async () => ({ usage: 1024, quota: 1e9 }),
    };
    const { a } = await app({ storageManager: sm });
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Proteger meus dados/ }));
    expect(await screen.findByText(/Não protegido/)).toBeInTheDocument();
    await vi.waitFor(() => expect(a.toast?.text).toBe(T.dados.persistFailed));
  });

  it('um arquivo que não é do Klick nem do csTimer mostra a mensagem do leitor certo', async () => {
    const { a } = await app();
    render(DataSection, { app: a });
    const input = (await screen.findByLabelText(/Importar arquivo/)) as HTMLInputElement;
    await fireEvent.change(input, { target: { files: [new File(['isto não é um arquivo'], 'notas.json')] } });
    await vi.waitFor(() => expect(a.toast?.text).toBe(T.transfer.klickInvalid));
    await fireEvent.change(input, { target: { files: [new File(['isto não é um arquivo'], 'notas.txt')] } });
    await vi.waitFor(() => expect(a.toast?.text).toBe(T.transfer.csTimerInvalid));
  });

  it('desmontar a seção com um diálogo aberto libera o estado, e o diálogo não volta sozinho', async () => {
    const { a } = await app();
    const { unmount } = render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Ver lixeira/ }));
    expect(a.dialog).toBe('trash');
    unmount();
    expect(a.dialog).toBeNull();
  });

  it('o botão Como instalar abre o guia pelo estado do app', async () => {
    const { a } = await app();
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: T.dados.installButton }));
    expect(a.dialog).toBe('install');
  });
});
