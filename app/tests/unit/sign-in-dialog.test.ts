import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { T } from '../../src/strings';
import type { Captcha } from '../../src/sync/captcha';
import SignInDialog from '../../src/ui/dialogs/SignInDialog.svelte';
import { appWithAccount, bus, fakeApi, fakeAuth, manualEnv } from './sync-account';
import { FakeServer } from './sync-fakes';

let dbs = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

async function openDialog(o: Parameters<typeof appWithAccount>[1] = {}, server = new FakeServer()) {
  const { app, repo } = await appWithAccount(fakeApi(server).api, o);
  await vi.waitFor(() => expect(app.account!.siteKey).not.toBeNull());
  app.dialog = 'signin';
  render(SignInDialog, { app, open: true });
  return { app, repo, server };
}

async function typeEmailAndCode(code = '123 456'): Promise<void> {
  await fireEvent.input(await screen.findByRole('textbox', { name: 'E-mail' }), { target: { value: 'ranielli@exemplo.com' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
  const field = await screen.findByRole('textbox', { name: 'Código' });
  await fireEvent.input(field, { target: { value: code } });
  await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

// O passo da passkey só aparece com WebAuthn (o jsdom não tem): pula se ele vier.
async function skipPasskey(): Promise<void> {
  const skip = await screen.findByRole('button', { name: 'Agora não' }).catch(() => null);
  if (skip) await fireEvent.click(skip);
}

describe('diálogo de entrar (spec 7.2 e 9.2)', () => {
  it('passo 1: e-mail com o Turnstile e o link da política; passo 2: o código aceita colar e sugere o do Mail', async () => {
    const { auth, calls } = fakeAuth();
    await openDialog({ auth });
    // Com a barra no fim: é a URL que o service worker guarda (privacidade/index.html), e abre também sem rede.
    expect(screen.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute('href', '/privacidade/');
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toHaveAttribute('autocomplete', 'email webauthn');
    await fireEvent.input(screen.getByRole('textbox', { name: 'E-mail' }), { target: { value: ' ranielli@exemplo.com ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    const field = await screen.findByRole('textbox', { name: 'Código' });
    expect(calls).toEqual(['send:ranielli@exemplo.com:token-de-1x00000000000000000000BB']);
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    await fireEvent.input(field, { target: { value: 'Seu código: 123 456' } });
    expect((field as HTMLInputElement).value).toBe('123456');
    expect(document.activeElement).toBe(field);
  });

  it('código errado: o aviso, e dá para tentar de novo', async () => {
    await openDialog();
    await typeEmailAndCode('999999');
    expect(await screen.findByRole('alert')).toHaveTextContent('Código errado');
  });

  it('o limite e o Turnstile recusado têm cada um o seu aviso, e cada envio pede um token novo (o token vale uma vez)', async () => {
    const { auth, calls, state } = fakeAuth();
    let n = 0;
    const captcha: Captcha = { token: async () => `token-${++n}` };
    await openDialog({ auth, captcha });
    await fireEvent.input(screen.getByRole('textbox', { name: 'E-mail' }), { target: { value: 'ranielli@exemplo.com' } });
    state.send = 'limited';
    await fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(T.conta.limited);
    state.send = 'captcha';
    await fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(T.conta.captchaFailed));
    expect(screen.getByRole('alert')).not.toHaveTextContent(T.conta.sendFailed);
    expect(calls).toEqual(['send:ranielli@exemplo.com:token-1', 'send:ranielli@exemplo.com:token-2']);
  });

  it('primeiro login: avisa quantos solves sobem, guarda a cópia e sincroniza sem duplicar (spec 6.5)', async () => {
    const server = new FakeServer();
    const { app, repo } = await openDialog({}, server);
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await typeEmailAndCode();
    await skipPasskey();
    expect(await screen.findByText('1 solve deste aparelho vai para a conta.')).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByText('Pronto. Seus solves estão na conta.')).toBeInTheDocument());
    expect((await repo.listBackups()).map((b) => b.reason)).toContain('pre-sync');
    expect([...server.active().values()].filter((c) => c.store === 'solves')).toHaveLength(1);
    expect(app.account!.signedIn).toBe(true);
  });

  it('a mesma conta de antes volta sem perguntar nada e sem novo primeiro login', async () => {
    const { app, repo } = await openDialog();
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: false });
    await typeEmailAndCode();
    await skipPasskey();
    expect(await screen.findByText(/Bem-vindo de volta/)).toBeInTheDocument();
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(true));
    expect((await repo.listBackups()).map((b) => b.reason)).not.toContain('pre-sync');
  });

  it('outra conta no aparelho (spec 7.6): três saídas; cancelar sai da sessão nova e não mexe em nada', async () => {
    const { auth, calls } = fakeAuth({ id: 'conta-2', email: 'outra@exemplo.com' });
    const { app, repo } = await openDialog({ auth });
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: false });
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await typeEmailAndCode();
    expect(await screen.findByRole('heading', { name: 'Este aparelho tem dados de outra conta' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar os dados deste aparelho antes de entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não'); // o solve da conta 1 ainda não subiu
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await vi.waitFor(() => expect(calls).toContain('sign-out'));
    expect((await repo.getSyncState()).accountId).toBe('conta-1');
    expect(await repo.listSolves()).toHaveLength(1);
  });

  // A revisão final (I4): com registros que só existem aqui (o servidor os recusaria), apagar antes de entrar recusa, com o porquê.
  it('outra conta: apagar com registros que só existem aqui mostra quantos, e nada muda (I4)', async () => {
    const db = await openKlickDb(`dialogo-so-aqui-${++dbs}`);
    const repo = createRepository(db, { channel: null });
    const { auth, calls } = fakeAuth({ id: 'conta-2', email: 'outra@exemplo.com' });
    const { app } = await openDialog({ auth, repo });
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: false });
    const solve = await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await db.put('solves', { ...(await db.get('solves', solve!.id))!, id: 'de antes da v3' });
    await db.clear('outbox'); // o resto já está na conta 1
    await typeEmailAndCode();
    expect(await screen.findByRole('heading', { name: 'Este aparelho tem dados de outra conta' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar os dados deste aparelho antes de entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(T.conta.localOnlyBlock(1));
    expect(await repo.listSolves()).toHaveLength(2);
    expect(calls).not.toContain('sign-out');
  });

  it('num aparelho com passkey, ela vem primeiro, com o código como alternativa', async () => {
    const { auth, calls } = fakeAuth();
    vi.stubGlobal('PublicKeyCredential', class {});
    try {
      const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { auth });
      await repo.saveSyncState({ passkey: true });
      await app.account!.refresh();
      render(SignInDialog, { app, open: true });
      expect(await screen.findByText('Ou receba um código por e-mail:')).toBeInTheDocument();
      await fireEvent.click(screen.getByRole('button', { name: 'Entrar com passkey' }));
      await vi.waitFor(() => expect(calls).toContain('passkey-sign-in'));
      expect(await screen.findByRole('heading', { name: 'Primeiro sync' })).toBeInTheDocument(); // já tem passkey: sem o passo 3
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('com WebAuthn e sem passkey neste aparelho, o passo 3 a oferece; criar segue para o primeiro sync', async () => {
    const { auth, calls } = fakeAuth();
    vi.stubGlobal('PublicKeyCredential', class {});
    try {
      const { app, repo } = await openDialog({ auth });
      await typeEmailAndCode();
      expect(await screen.findByRole('heading', { name: 'Da próxima vez, sem código' })).toBeInTheDocument();
      await fireEvent.click(screen.getByRole('button', { name: 'Entrar com Face ID da próxima vez' }));
      await vi.waitFor(() => expect(calls).toContain('add-passkey'));
      await vi.waitFor(() => expect(screen.getByText('Pronto. Seus solves estão na conta.')).toBeInTheDocument());
      expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-1', signedIn: true, passkey: true });
      expect(app.account!.signedIn).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fechar na oferta da passkey é pular: o aparelho entra na conta, sem ficar com a sessão aberta e os dados de fora', async () => {
    const { auth, calls } = fakeAuth();
    vi.stubGlobal('PublicKeyCredential', class {});
    try {
      const { app } = await openDialog({ auth });
      await typeEmailAndCode();
      expect(await screen.findByRole('heading', { name: 'Da próxima vez, sem código' })).toBeInTheDocument();
      (document.querySelector('dialog.signin') as HTMLDialogElement).close(); // Esc, ou o fundo
      expect(app.dialog).toBeNull();
      await vi.waitFor(() => expect(app.account!.signedIn).toBe(true));
      expect(calls).not.toContain('add-passkey');
      expect(calls).not.toContain('sign-out');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fechar na pergunta da outra conta é cancelar: sai da sessão nova, e nada muda aqui', async () => {
    const { auth, calls } = fakeAuth({ id: 'conta-2', email: 'outra@exemplo.com' });
    const { app, repo } = await openDialog({ auth });
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: false });
    await typeEmailAndCode();
    expect(await screen.findByRole('heading', { name: 'Este aparelho tem dados de outra conta' })).toBeInTheDocument();
    (document.querySelector('dialog.signin') as HTMLDialogElement).close();
    await vi.waitFor(() => expect(calls).toContain('sign-out'));
    expect(app.dialog).toBeNull();
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-1', signedIn: false });
  });
});

// C1: a entrada que não continua (mudanças esperando, o modo recusado, o banco que falhou) é desfeita (spec 9.2): sai da sessão nova, em vez
// de deixar o cookie dela valendo com o aparelho noutra conta. Também quando a pessoa fechou o passo 4 antes da resposta.
describe('a entrada que não continua no passo 4 (C1)', () => {
  async function atStep4(outcome: 'pending' | 'refused' | 'failed') {
    const { auth, calls } = fakeAuth({ id: 'conta-2', email: 'outra@exemplo.com' });
    const { app, repo } = await openDialog({ auth });
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: false });
    await typeEmailAndCode();
    expect(await screen.findByRole('heading', { name: 'Este aparelho tem dados de outra conta' })).toBeInTheDocument();
    let answer!: () => void;
    const answered = new Promise<'ok' | 'pending' | 'refused'>((resolve, reject) => {
      answer = () => (outcome === 'failed' ? reject(new Error('o banco falhou')) : resolve(outcome));
    });
    vi.spyOn(app.account!, 'continueSignIn').mockReturnValue(answered);
    await fireEvent.click(screen.getByRole('button', { name: 'Juntar os dados deste aparelho à nova conta' }));
    await skipPasskey();
    expect(await screen.findByRole('heading', { name: 'Primeiro sync' })).toBeInTheDocument();
    return { app, calls, answer };
  }

  it.each(['pending', 'refused', 'failed'] as const)('fechar o passo 4 antes da resposta, que vem %s, sai da sessão nova', async (outcome) => {
    const { app, calls, answer } = await atStep4(outcome);
    (document.querySelector('dialog.signin') as HTMLDialogElement).close();
    expect(app.dialog).toBeNull();
    answer();
    await vi.waitFor(() => expect(calls).toContain('sign-out'));
  });

  it.each(['refused', 'failed'] as const)('com o diálogo aberto, a resposta %s também desfaz a entrada e volta ao e-mail', async (outcome) => {
    const { calls, answer } = await atStep4(outcome);
    answer();
    expect(await screen.findByRole('alert')).toHaveTextContent(T.conta.verifyFailed);
    expect(screen.getByRole('textbox', { name: 'E-mail' })).toBeInTheDocument();
    await vi.waitFor(() => expect(calls).toContain('sign-out'));
  });
});

describe('o primeiro sync no diálogo segue o estado, não a promessa (Task 13)', () => {
  it('o primeiro login cancelado por uma parada (sair noutra aba) não diz "Pronto": mostra que parou e deixa entrar de novo', async () => {
    const make = bus();
    const env = manualEnv();
    const { app } = await openDialog({ channel: make(), env: env.env });
    const otherTab = make();
    app.trainerRunning = true; // a rodada do primeiro login espera o treino: ainda não começou
    await typeEmailAndCode();
    await skipPasskey();
    expect(await screen.findByRole('heading', { name: 'Primeiro sync' })).toBeInTheDocument();
    otherTab.postMessage({ type: 'stop', id: 'sair-na-outra-aba' }); // sair, noutra aba: a líder para o motor
    expect(await screen.findByRole('alert')).toHaveTextContent(T.conta.syncCancelled);
    app.trainerRunning = false;
    env.fireDelayed(); // a espera do motor confere de novo: parado, a rodada não começa o primeiro login
    await sleep(20);
    expect(screen.queryByText('Pronto. Seus solves estão na conta.')).toBeNull();
    expect(app.account!.signedIn).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: T.conta.signInAgain }));
    expect(await screen.findByRole('textbox', { name: 'E-mail' })).toBeInTheDocument();
  });

  it('numa aba que não lidera, "Pronto" só aparece quando a líder terminou o primeiro sync', async () => {
    const name = `dialogo-abas-${++dbs}`;
    const data = bus();
    const sync = bus();
    const server = new FakeServer();
    const net = fakeApi(server);
    const real = net.api.sync;
    const gate = deferred();
    let held = false;
    net.api.sync = async (req: SyncRequest): Promise<SyncResponse> => {
      if (!held) {
        held = true;
        await gate.promise; // o primeiro pedido da líder fica "na rede"
      }
      return real(req);
    };
    let taken = false;
    const locks = {
      request: (_name: string, cb: () => Promise<unknown>) => {
        if (taken) return new Promise(() => undefined);
        taken = true;
        return cb();
      },
    };
    const repoA = createRepository(await openKlickDb(name), { channel: data() });
    const repoB = createRepository(await openKlickDb(name), { channel: data() });
    const leader = await appWithAccount(net.api, { locks, channel: sync(), repo: repoA });
    const { app } = await appWithAccount(net.api, { locks, channel: sync(), repo: repoB });
    await vi.waitFor(() => expect(leader.app.account!.leader).toBe(true));
    expect(app.account!.leader).toBe(false);
    await vi.waitFor(() => expect(app.account!.siteKey).not.toBeNull());
    render(SignInDialog, { app, open: true });
    await typeEmailAndCode();
    await skipPasskey();
    expect(await screen.findByRole('heading', { name: 'Primeiro sync' })).toBeInTheDocument();
    await vi.waitFor(() => expect(held).toBe(true)); // a líder começou: a cópia, a fila e o primeiro pedido
    await sleep(20);
    expect(screen.queryByText('Pronto. Seus solves estão na conta.')).toBeNull();
    gate.resolve();
    await vi.waitFor(() => expect(screen.getByText('Pronto. Seus solves estão na conta.')).toBeInTheDocument());
    expect(app.account!.signedIn).toBe(true);
  });

  it.each(['join', 'erase'] as const)('trocar de conta (%s) não anuncia falha do sync na região aria-live (spec 7.6 e 9.6)', async (choice) => {
    const before = new FakeServer();
    const net = fakeApi(before);
    const { auth } = fakeAuth({ id: 'conta-2', email: 'outra@exemplo.com' });
    const { app } = await appWithAccount(net.api, { signedIn: true, auth });
    const account = app.account!;
    await vi.waitFor(() => expect(account.status.phase).toBe('idle'));
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await account.syncNow();
    expect(account.status.pending).toBe(0);
    expect(await account.signOut(false)).toBe('ok');
    net.api.sync = fakeApi(new FakeServer()).api.sync; // a outra conta, no servidor
    const announce = vi.spyOn(app, 'announce');
    app.dialog = 'signin';
    render(SignInDialog, { app, open: true });
    await typeEmailAndCode();
    expect(await screen.findByRole('heading', { name: 'Este aparelho tem dados de outra conta' })).toBeInTheDocument();
    const label = choice === 'join' ? 'Juntar os dados deste aparelho à nova conta' : 'Apagar os dados deste aparelho antes de entrar';
    await fireEvent.click(screen.getByRole('button', { name: label }));
    await skipPasskey();
    await vi.waitFor(() => expect(screen.getByText('Pronto. Seus solves estão na conta.')).toBeInTheDocument());
    expect(account.sync.accountId).toBe('conta-2');
    expect(announce).not.toHaveBeenCalledWith(T.conta.syncFailedLive);
  });
});
