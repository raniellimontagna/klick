import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import { clearingCloseOthers, dbEvents, dbNotice, dbUpgrade, setDbNotice, setDbUpgrade, trackingUpgrade } from '../../src/ui/state/db-notice.svelte';
import DbNotice from '../../src/ui/dialogs/DbNotice.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`dbn-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

afterEach(() => {
  setDbNotice(null);
  setDbUpgrade('idle');
});

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

// A migração para a versão 3 (spec 5.6) pode demorar num aparelho antigo com muito histórico. Enquanto ela roda, a casca espera e diz que
// está atualizando; se ela falha (cota cheia na cópia "antes da v3", transação abortada), os dados ficam como estavam e o aviso diz isso.
describe('a atualização dos dados na abertura', () => {
  it('o evento upgrading marca a atualização; a abertura que termina tira a marca', async () => {
    const events = dbEvents(() => null);
    const opening = trackingUpgrade(
      (async () => {
        events.upgrading?.();
        expect(dbUpgrade()).toBe('running');
        return 1;
      })(),
    );
    expect(await opening).toBe(1);
    expect(dbUpgrade()).toBe('idle');
  });

  it('AbortError ou QuotaExceededError durante a atualização viram a falha da atualização; outro erro, ou fora dela, não', async () => {
    for (const name of ['AbortError', 'QuotaExceededError']) {
      setDbUpgrade('idle');
      const opening = trackingUpgrade(
        (async () => {
          dbEvents(() => null).upgrading?.();
          throw new DOMException('falhou', name);
        })(),
      );
      await expect(opening).rejects.toMatchObject({ name });
      expect(dbUpgrade()).toBe('failed');
    }
    setDbUpgrade('idle');
    await expect(trackingUpgrade(Promise.reject(new DOMException('fora', 'AbortError')))).rejects.toThrow('fora');
    expect(dbUpgrade()).toBe('idle'); // sem atualização em curso: é o banco indisponível de sempre
    setDbUpgrade('running');
    await expect(trackingUpgrade(Promise.reject(new Error('outro')))).rejects.toThrow('outro');
    expect(dbUpgrade()).toBe('idle');
  });

  it('com o banco de verdade: uma migração que aborta marca a falha, e o banco fica na versão 2', async () => {
    const name = `dbn-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    await v2.put('solves', { id: 'big', sessionId: 's', event: '333', ms: 10n, penalty: null, at: 1, scramble: '', note: '', createdAt: 1, updatedAt: 1, deletedAt: null } as never);
    v2.close();
    await expect(trackingUpgrade(clearingCloseOthers(openKlickDb(name, dbEvents(() => null))))).rejects.toMatchObject({ name: 'AbortError' });
    expect(dbUpgrade()).toBe('failed');
    const again = await openKlickDb(name, {}, 2);
    expect(again.version).toBe(2);
    again.close();
  });
});
