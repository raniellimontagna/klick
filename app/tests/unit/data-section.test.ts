import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import DataSection from '../../src/ui/ajustes/DataSection.svelte';

vi.mock('../../src/ui/download', () => ({ downloadText: vi.fn(() => true) }));
import { downloadText } from '../../src/ui/download';

let n = 0;
async function app(storageManager: unknown = null) {
  const repo = createRepository(await openKlickDb(`ds-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: storageManager as never });
  await a.init();
  return { a, repo };
}

describe('Seus dados', () => {
  it('mostra se o armazenamento está protegido e permite pedir proteção', async () => {
    let persisted = false;
    const sm = { persisted: async () => persisted, persist: async () => (persisted = true), estimate: async () => ({ usage: 2048, quota: 1e9 }) };
    const { a } = await app(sm);
    render(DataSection, { app: a });
    expect(await screen.findByText(/Não protegido/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Proteger meus dados/ }));
    expect(await screen.findByText(/^Protegido/)).toBeInTheDocument();
  });

  it('exportar no formato Klick baixa um arquivo com os solves e zera o contador', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 61234, penalty: null, at: Date.now() });
    render(DataSection, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /Exportar \(Klick\)/ }));
    await vi.waitFor(() => expect(downloadText).toHaveBeenCalled());
    const [name, text] = (downloadText as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(name).toMatch(/^klick-.*\.json$/);
    expect(JSON.parse(text).solves[0].ms).toBe(61234);
    expect((await repo.getMeta()).solvesSinceExport).toBe(0);
  });

  it('importar um arquivo do csTimer pede o evento da sessão desconhecida e não duplica na segunda vez', async () => {
    const { a, repo } = await app();
    render(DataSection, { app: a });
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures', 'cstimer-export.txt'), 'utf8');
    const input = (await screen.findByLabelText(/Importar arquivo/)) as HTMLInputElement;
    const file = new File([text], 'cstimer.txt', { type: 'text/plain' });
    await fireEvent.change(input, { target: { files: [file] } });
    const pick = (await screen.findByLabelText(/Evento de ZBLL/)) as HTMLSelectElement;
    await fireEvent.change(pick, { target: { value: '333' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Importar solves' }));
    await vi.waitFor(async () => expect((await repo.listSolves()).length).toBe(5));
    await fireEvent.change(input, { target: { files: [file] } });
    await fireEvent.change(await screen.findByLabelText(/Evento de ZBLL/), { target: { value: '333' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Importar solves' }));
    expect(await screen.findByText(/já existiam/)).toBeInTheDocument();
    expect((await repo.listSolves()).length).toBe(5);
  });
});
