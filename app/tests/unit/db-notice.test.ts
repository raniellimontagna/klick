import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import { clearingCloseOthers, dbEvents, dbNotice, setDbNotice } from '../../src/ui/state/db-notice.svelte';
import DbNotice from '../../src/ui/dialogs/DbNotice.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`dbn-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

afterEach(() => setDbNotice(null));

describe('eventos do banco', () => {
  it('blocking e blocked viram avisos; terminated pede ao app que reabra o banco', async () => {
    const a = await app();
    const lost = vi.spyOn(a, 'connectionLost').mockImplementation(() => {});
    const events = dbEvents(() => a);
    events.blocked?.();
    expect(dbNotice()).toBe('closeOthers');
    events.blocking?.();
    expect(dbNotice()).toBe('updated');
    events.terminated?.();
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it('blocking também avisa o app, que para de reabrir o banco', async () => {
    const a = await app();
    const supersede = vi.spyOn(a, 'supersede');
    dbEvents(() => a).blocking?.();
    expect(supersede).toHaveBeenCalledTimes(1);
  });

  it('o "feche as outras abas" sai quando a abertura termina, com sucesso ou com erro', async () => {
    setDbNotice('closeOthers');
    await clearingCloseOthers(Promise.resolve(1));
    expect(dbNotice()).toBeNull();
    setDbNotice('closeOthers');
    await expect(clearingCloseOthers(Promise.reject(new Error('cota')))).rejects.toThrow('cota');
    expect(dbNotice()).toBeNull();
    setDbNotice('updated'); // outro aviso não é tirado
    await clearingCloseOthers(Promise.resolve(1));
    expect(dbNotice()).toBe('updated');
  });

  it('terminated antes do app existir não quebra', () => {
    expect(() => dbEvents(() => undefined).terminated?.()).not.toThrow();
  });
});

describe('aviso do banco', () => {
  it('sem aviso, nada aparece', async () => {
    render(DbNotice, { app: await app() });
    expect(screen.queryByRole('button', { name: T.update.reload })).toBeNull();
  });

  it('atualizado em outra aba: pede para recarregar', async () => {
    const reload = vi.fn();
    setDbNotice('updated');
    render(DbNotice, { app: await app(), reload });
    expect(await screen.findByText(T.data.dbUpdated)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: T.update.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('atualizado em outra aba com solve só nesta: pede para exportar antes', async () => {
    const a = await app();
    Object.defineProperty(a, 'unsaved', { get: () => true });
    const exportFile = vi.spyOn(a, 'exportFile').mockResolvedValue();
    setDbNotice('updated');
    render(DbNotice, { app: a });
    expect(await screen.findByText(T.data.dbUpdatedUnsaved)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: T.data.exportNow }));
    expect(exportFile).toHaveBeenCalledWith('klick');
  });

  it('esperando as outras abas: pede para fechá-las, sem botão', async () => {
    setDbNotice('closeOthers');
    render(DbNotice, { app: null });
    expect(await screen.findByText(T.data.dbCloseOthers)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
