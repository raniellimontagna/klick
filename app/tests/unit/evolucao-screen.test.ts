import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeDuelLink, duelPayloadOf, encodeDuelLink } from '../../src/core/duel/link';
import type { DuelTime, Penalty } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import EvolucaoScreen from '../../src/ui/evolucao/EvolucaoScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ev-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

describe('Evolução', () => {
  it('sem solves mostra o aviso do período', async () => {
    const a = await app();
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByText(/Sem solves neste período/)).toBeInTheDocument();
  });

  it('filtra por evento e mostra a nota na linha', async () => {
    const a = await app();
    const s = (await a.addSolve({ ms: 61234, penalty: null, at: Date.now() }))!;
    await a.setNote(s.id, 'cruz no amarelo');
    await a.createSession('222');
    await a.addSolve({ ms: 8000, penalty: null, at: Date.now() });
    render(EvolucaoScreen, { app: a });
    const select = (await screen.findByLabelText('Evento')) as HTMLSelectElement;
    expect(select.value).toBe('222');
    expect(document.querySelectorAll('.hx-row')).toHaveLength(1);
    select.value = '333';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await screen.findByText('cruz no amarelo')).toBeInTheDocument();
  });

  it('no 7×7 o indicador é a média de 3', async () => {
    const a = await app();
    await a.createSession('777');
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByText('Média de 3')).toBeInTheDocument();
  });
});

describe('Evolução: seletores e nota', () => {
  it('o seletor de sessão lista só as sessões do evento escolhido, mais "Todas as sessões"', async () => {
    const a = await app();
    await a.createSession('222', 'Treino 2x2');
    await a.createSession('333', 'Treino 3x3');
    render(EvolucaoScreen, { app: a });
    const evento = (await screen.findByLabelText('Evento')) as HTMLSelectElement;
    const sessao = screen.getByLabelText('Sessão') as HTMLSelectElement;
    expect([...sessao.options].map((o) => o.textContent)).toEqual(['Todas as sessões', 'Sessão 1', 'Treino 3x3']);
    evento.value = '222';
    evento.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect([...sessao.options].map((o) => o.textContent)).toEqual(['Todas as sessões', 'Treino 2x2']);
  });

  it('uma sessão de outro evento cai para "Todas as sessões" quando o evento muda', async () => {
    const a = await app();
    await a.createSession('222', 'Treino 2x2');
    await a.addSolve({ ms: 8000, penalty: null, at: Date.now() });
    await a.createSession('333', 'Treino 3x3');
    await a.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    render(EvolucaoScreen, { app: a });
    const evento = (await screen.findByLabelText('Evento')) as HTMLSelectElement;
    const sessao = screen.getByLabelText('Sessão') as HTMLSelectElement;
    evento.value = '222';
    evento.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    sessao.value = a.sessions.find((s) => s.name === 'Treino 2x2')!.id;
    sessao.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(document.querySelectorAll('.hx-row')).toHaveLength(1);
    evento.value = '333';
    evento.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(sessao.value).toBe('all');
    expect(document.querySelectorAll('.hx-row')).toHaveLength(1);
    expect(document.querySelector('.hx-rows')?.textContent).toContain('0:09.00');
  });

  it('uma nota com HTML aparece como texto, sem virar elemento', async () => {
    const a = await app();
    const s = (await a.addSolve({ ms: 61234, penalty: null, at: Date.now() }))!;
    await a.setNote(s.id, '<b>x</b>');
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByText('<b>x</b>')).toBeInTheDocument();
    expect(document.querySelector('.hx-rows b')).toBeNull();
  });
});

describe('Evolução: hora atual e troca de evento', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // A data da lista leva o ano só quando o solve é de outro ano: a virada do ano com a tela aberta muda a linha.
  it('a data de um solve ganha o ano quando o ano vira com a tela aberta', async () => {
    const a = await app();
    const base = new Date(2026, 11, 31, 23, 58).getTime();
    await a.addSolve({ ms: 61234, penalty: null, at: base });
    vi.useFakeTimers({ now: base, toFake: ['Date', 'setInterval', 'clearInterval'] });
    render(EvolucaoScreen, { app: a });
    await tick();
    expect(document.querySelector('.hx-when')?.textContent).toBe('31/12 23:58');
    vi.advanceTimersByTime(3 * 60000);
    await tick();
    expect(document.querySelector('.hx-when')?.textContent).toBe('31/12/2026');
  });

  it('a janela de 7 dias deixa de fora o solve quando o tempo passa', async () => {
    const a = await app();
    const base = Date.now();
    await a.addSolve({ ms: 61234, penalty: null, at: base });
    vi.useFakeTimers({ now: base, toFake: ['Date', 'setInterval', 'clearInterval'] });
    render(EvolucaoScreen, { app: a });
    await tick();
    (document.querySelector('[data-period="7"]') as HTMLButtonElement).click();
    await tick();
    expect(document.querySelector('.hx-rows')?.textContent).toContain('1:01.23');
    vi.advanceTimersByTime(8 * 24 * 60 * 60000);
    await tick();
    expect(screen.getByText(/Sem solves neste período/)).toBeInTheDocument();
  });

  it('desmontar para o relógio; montar de novo pega a hora atual', async () => {
    const a = await app();
    const base = new Date(2026, 11, 31, 23, 58).getTime();
    await a.addSolve({ ms: 61234, penalty: null, at: base });
    vi.useFakeTimers({ now: base, toFake: ['Date', 'setInterval', 'clearInterval'] });
    const primeira = render(EvolucaoScreen, { app: a });
    await tick();
    expect(document.querySelector('.hx-when')?.textContent).toBe('31/12 23:58');
    primeira.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(base + 5 * 60000);
    render(EvolucaoScreen, { app: a });
    await tick();
    expect(document.querySelector('.hx-when')?.textContent).toBe('31/12/2026');
  });

  it('trocar de evento volta a "Todas as sessões", mesmo ao voltar para o evento da sessão', async () => {
    const a = await app();
    await a.createSession('222', 'Treino 2x2');
    await a.addSolve({ ms: 8000, penalty: null, at: Date.now() });
    await a.createSession('333', 'Treino 3x3');
    await a.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    render(EvolucaoScreen, { app: a });
    const evento = (await screen.findByLabelText('Evento')) as HTMLSelectElement;
    const sessao = screen.getByLabelText('Sessão') as HTMLSelectElement;
    const trocar = (valor: string) => {
      evento.value = valor;
      evento.dispatchEvent(new Event('change', { bubbles: true }));
    };
    trocar('222');
    await tick();
    sessao.value = a.sessions.find((s) => s.name === 'Treino 2x2')!.id;
    sessao.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(sessao.selectedOptions[0].textContent).toBe('Treino 2x2');
    trocar('333');
    await tick();
    trocar('222');
    await tick();
    expect(sessao.selectedOptions[0].textContent).toBe('Todas as sessões');
  });
});

// Evolução › Desafios (a maquete aprovada, 9a a 9c): o cartão no topo, a lista e a partida aberta ponto a ponto.
describe('Evolução: Desafios', () => {
  const SCR = Array.from({ length: 7 }, (_, i) => `R U R' F${i}`);
  const tm = (ms: number, penalty: Penalty = null): DuelTime => ({ ms, penalty });
  type Draft = Parameters<Repository['saveDuel']>[0];
  // Os tempos da maquete (9c): Bia venceu 3 × 1, no quinto.
  const BIA: Draft = {
    id: 'bia0000000000001-a',
    linkId: 'bia0000000000001',
    side: 'a',
    event: '333',
    scrambles: SCR,
    mine: [tm(12_840), tm(14_020), tm(11_960), tm(13_510, '+2'), tm(13_000, 'DNF'), tm(12_300), tm(13_080)],
    theirs: [tm(13_200), tm(13_470), tm(11_960), tm(14_880), tm(13_900)],
    myName: 'Ranielli',
    theirName: 'Bia',
    status: 'done',
  };
  const SENT: Draft = { ...BIA, id: 'sent000000000001-a', linkId: 'sent000000000001', event: '222', theirs: null, theirName: '', status: 'waiting' };
  // B, jogando contra Marina: 1 × 1, o terceiro na vez.
  const MARINA: Draft = {
    id: 'mari000000000001-b',
    linkId: 'mari000000000001',
    side: 'b',
    event: '333',
    scrambles: SCR,
    mine: [tm(10_000), tm(15_000)],
    theirs: [tm(12_000), tm(12_000), tm(12_000), tm(12_000), tm(12_000), tm(12_000), tm(12_000)],
    myName: '',
    theirName: 'Marina',
    status: 'playing',
    revealed: 2,
  };

  async function withDuels(...drafts: Draft[]) {
    const repo = createRepository(await openKlickDb(`ev-dz-${++n}`), { channel: null });
    for (const d of drafts) await repo.saveDuel(d);
    const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
    await a.init();
    return { a, repo };
  }

  // O mini placar é a descrição do botão (aria-describedby): o nome dele (role img) é o placar por extenso.
  const describedBy = (el: Element): HTMLElement => document.getElementById(el.getAttribute('aria-describedby') ?? '')!;

  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).share;
    delete (navigator as unknown as Record<string, unknown>).clipboard;
  });

  it('sem desafios, a Evolução é a de sempre: sem o cartão', async () => {
    const a = await app();
    render(EvolucaoScreen, { app: a });
    await screen.findByText(/Sem solves neste período/);
    await tick();
    expect(screen.queryByRole('button', { name: /^Desafios/ })).toBeNull();
  });

  it('Desafios lista as partidas e abre uma ponto a ponto', async () => {
    const { a } = await withDuels(BIA, SENT, MARINA);
    render(EvolucaoScreen, { app: a });
    // 9a: o cartão no topo, com o resumo e o mini placar do último desafio (o de Marina).
    const entry = await screen.findByRole('button', { name: `${T.duel.entryLabel}, 1 jogando · 1 esperando resposta · 1 terminado` });
    expect(describedBy(entry)).toHaveAccessibleName(/^Placar: Você 1, Marina 1\. 1: ponto seu; 2: ponto de Marina; 3: ainda não jogado/);
    // Não segue os filtros: com outro evento escolhido, continua lá.
    const evento = screen.getByLabelText('Evento') as HTMLSelectElement;
    evento.value = '444';
    evento.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(screen.getByRole('button', { name: /^Desafios, / })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Desafios, / }));
    // 9b: a lista, o mais novo em cima. O botão tocado saiu da tela: o foco vai para o título da lista.
    const listHeading = await screen.findByRole('heading', { name: T.duel.listTitle });
    await waitFor(() => expect(document.activeElement).toBe(listHeading));
    const items = [...document.querySelectorAll<HTMLButtonElement>('.dz-list .dz-item')];
    expect(items.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Marina · 3×3, jogando, Você 1 × 1 · 3 de 7 · hoje',
      'Desafio mandado · 2×2, esperando resposta, hoje',
      'Bia · 3×3, terminado, Bia venceu 3 × 1 · hoje',
    ]);
    expect(describedBy(items[1]!)).toHaveAccessibleName(/^Placar: Você 0, Oponente 0\. 1: ainda não jogado/);
    expect(screen.getByText(T.duel.listNote)).toBeInTheDocument();
    // 9c: a partida aberta, ponto a ponto.
    await fireEvent.click(items[2]!);
    expect(await screen.findByRole('heading', { name: 'Bia venceu 3 × 1' })).toBeInTheDocument();
    expect(screen.getByText(/^Você desafiou · 3×3 · hoje, \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Placar: Você 1, Bia 3\. 1: ponto seu; 2: ponto de Bia; 3: ninguém pontua/ })).toBeInTheDocument();
    const rows = [...document.querySelectorAll('.dz-match tbody tr')].map((r) => r.textContent);
    expect(rows).toEqual([
      '10:12.840:13.20seu',
      '20:14.020:13.47Bia',
      '30:11.960:11.96ninguém',
      '40:15.51+0:14.88Bia',
      '5DNF0:13.90Bia',
      `6–7${T.duel.notPlayed(2)} · ${T.duel.yoursUnplayed(['0:12.30', '0:13.08'])}`,
    ]);
    expect(screen.getByRole('button', { name: T.duel.delete })).toBeInTheDocument();
    expect(screen.getByText(T.duel.deleteNote)).toBeInTheDocument();
    // "‹ Desafios" volta à lista, e "‹ Evolução" aos números de sempre.
    await fireEvent.click(screen.getByRole('button', { name: T.duel.backTo(T.duel.listTitle) }));
    expect(await screen.findByRole('heading', { name: T.duel.listTitle })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.backTo(T.tabs.evolucao) }));
    expect(await screen.findByRole('heading', { name: T.tabs.evolucao })).toBeInTheDocument();
    // De volta aos números, o foco vai para o cartão de onde a lista saiu.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Desafios, / })));
  });

  it('apagar um desafio manda para a lixeira', async () => {
    const { a, repo } = await withDuels(BIA, SENT);
    a.openDuels({ kind: 'duel', id: BIA.id });
    render(EvolucaoScreen, { app: a });
    const remove = await screen.findByRole('button', { name: T.duel.delete });
    // O segundo toque, como as outras ações sem volta do app (o toque duplo não passa).
    await fireEvent.click(remove);
    expect(remove).toHaveTextContent(T.duel.confirmAgain);
    await fireEvent.click(remove);
    expect((await repo.getDuel(BIA.id))!.deletedAt).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 450));
    await fireEvent.click(remove);
    // Volta à lista, sem ele, e o aviso de desfazer.
    expect(await screen.findByRole('heading', { name: T.duel.listTitle })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll('.dz-list .dz-item')).toHaveLength(1));
    expect((await repo.listTrash()).duels.map((d) => d.id)).toEqual([BIA.id]);
    expect(a.toast).toMatchObject({ text: T.duel.deleted, action: T.toast.undoTouch });
    // Desfazer o traz de volta.
    a.toast!.onAction!();
    await waitFor(() => expect(document.querySelectorAll('.dz-list .dz-item')).toHaveLength(2));
    expect((await repo.getDuel(BIA.id))!.deletedAt).toBeNull();
  });

  it('excluir o último desafio volta à Evolução de sempre, e desfazer traz o cartão de volta', async () => {
    const { a } = await withDuels(BIA);
    a.openDuels({ kind: 'duel', id: BIA.id });
    render(EvolucaoScreen, { app: a });
    const remove = await screen.findByRole('button', { name: T.duel.delete });
    await fireEvent.click(remove);
    await new Promise((resolve) => setTimeout(resolve, 450));
    await fireEvent.click(remove);
    const heading = await screen.findByRole('heading', { name: T.tabs.evolucao });
    await waitFor(() => expect(a.evolucaoView).toEqual({ kind: 'stats' }));
    expect(screen.queryByRole('button', { name: /^Desafios, / })).toBeNull();
    // Sem o cartão para onde voltar, o foco fica no título da Evolução (não cai no body).
    await waitFor(() => expect(document.activeElement).toBe(heading));
    a.toast!.onAction!();
    expect(await screen.findByRole('button', { name: `${T.duel.entryLabel}, 1 terminado` })).toBeInTheDocument();
  });

  it('a primeira leitura dos desafios falha com a lista aberta: a Evolução de sempre, com o aviso, nunca em branco', async () => {
    const { a } = await withDuels(BIA);
    a.openDuels();
    const list = a.listDuels.bind(a);
    let calls = 0;
    a.listDuels = () => (++calls === 1 ? Promise.reject(new Error('o banco caiu')) : list());
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByRole('heading', { name: T.tabs.evolucao })).toBeInTheDocument();
    expect(a.evolucaoView).toEqual({ kind: 'stats' });
    expect(a.toast?.text).toBe(T.data.readFailed);
  });

  it('a partida terminada de B oferece "Mandar a resposta", que volta à tela do fim (7)', async () => {
    const { a } = await withDuels({ ...MARINA, mine: [tm(10_000), tm(10_000), tm(10_000)], revealed: 3, status: 'done' });
    a.openDuels({ kind: 'duel', id: MARINA.id });
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByRole('heading', { name: 'Você venceu 3 × 0' })).toBeInTheDocument();
    // O texto inteiro, partido em pedaços (o nome num <bdi>).
    expect(screen.getByText((_, el) => /^Marina te desafiou · 3×3 · hoje, \d{2}:\d{2}$/.test(el?.textContent ?? ''))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.duel.delete })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.sendReply }));
    await waitFor(() => expect(a.duel.phase).toBe('finished'));
    expect(a.duel.current).toMatchObject({ id: MARINA.id, side: 'b' });
    expect(a.tab).toBe('timer');
  });

  // O resíduo da revisão final: o desafio de A com os sete que ficou jogando (a marca de mandado não gravou) também oferece colar; com
  // menos de sete, não.
  it('a partida aberta de A com os sete, ainda jogando, oferece "Colar a resposta"; com menos de sete, não', async () => {
    const playing = { ...SENT, status: 'playing' as const };
    const short = { ...SENT, id: 'half000000000001-a', linkId: 'half000000000001', status: 'playing' as const, mine: SENT.mine.slice(0, 3) };
    const { a } = await withDuels(playing, short);
    a.openDuels({ kind: 'duel', id: playing.id });
    const view = render(EvolucaoScreen, { app: a });
    expect(await screen.findByRole('button', { name: T.duel.keepGoing })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.duel.paste })).toBeInTheDocument();
    view.unmount();
    a.openDuels({ kind: 'duel', id: short.id });
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByRole('button', { name: T.duel.keepGoing })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: T.duel.paste })).toBeNull();
  });

  it('"Jogando" abre direto no desafio, no ponto em que parou', async () => {
    const { a } = await withDuels(MARINA);
    a.openDuels();
    render(EvolucaoScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /^Marina · 3×3, jogando/ }));
    await waitFor(() => expect(a.duel.phase).toBe('solving'));
    expect(a.duel.index).toBe(2);
    expect(a.tab).toBe('timer');
  });

  it('"Esperando resposta" oferece "Mandar de novo": o mesmo link, compartilhado no toque', async () => {
    const { a } = await withDuels(SENT);
    a.openDuels();
    render(EvolucaoScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: /^Desafio mandado · 2×2, esperando resposta/ }));
    expect(await screen.findByRole('heading', { name: T.duel.waitingTitle })).toBeInTheDocument();
    expect(screen.getByText(T.duel.myTimes('2×2'))).toBeInTheDocument();
    const share = vi.fn(async (_data: ShareData) => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    const again = await screen.findByRole('button', { name: T.duel.resend });
    await waitFor(() => expect(again).toBeEnabled());
    again.click();
    // Na hora do toque, sem esperar nada antes (a folha do sistema só abre dentro do gesto).
    expect(share).toHaveBeenCalledTimes(1);
    const link = await decodeDuelLink(duelPayloadOf(new URL(share.mock.calls[0]![0].url!).hash)!);
    expect(link).toMatchObject({ id: SENT.linkId, event: '222', a: { name: 'Ranielli', times: SENT.mine } });
    expect(link!.b).toBeUndefined();
    expect(a.duel.phase).toBe('idle'); // mandar de novo não abre o desafio
  });

  // A revisão final: a resposta que abriu fora do app (no iPhone, o Safari do WhatsApp) entra pela área de transferência.
  it('"Esperando resposta" oferece "Colar a resposta": o link copiado fecha a partida no Timer', async () => {
    const { a, repo } = await withDuels(SENT);
    a.openDuels({ kind: 'duel', id: SENT.id });
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByRole('heading', { name: T.duel.waitingTitle })).toBeInTheDocument();
    const reply = await encodeDuelLink({
      v: 1,
      id: SENT.linkId,
      event: '222',
      scrambles: SCR,
      a: { name: 'Ranielli', times: SENT.mine },
      b: { name: 'Bia', times: [tm(10_000), tm(10_000), tm(10_000)] },
    });
    const readText = vi.fn(async () => `https://klick.test/#desafio=${reply}`);
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true, writable: true });
    screen.getByRole('button', { name: T.duel.paste }).click();
    expect(readText).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(a.duel.phase).toBe('reply'));
    expect(a.tab).toBe('timer');
    expect(await repo.getDuel(SENT.id)).toMatchObject({ status: 'done', theirName: 'Bia' });
  });
});
