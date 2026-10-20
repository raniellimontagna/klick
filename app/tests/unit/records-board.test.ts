import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMs, records, windowOf } from '../../src/core/stats';
import type { Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import RecordDialog from '../../src/ui/dialogs/RecordDialog.svelte';
import SolveDialog from '../../src/ui/dialogs/SolveDialog.svelte';
import EvolucaoScreen from '../../src/ui/evolucao/EvolucaoScreen.svelte';
import RecordsBoard from '../../src/ui/evolucao/RecordsBoard.svelte';
import { dateLabel, shortDate, timeOfDay } from '../../src/ui/format';
import { AppState } from '../../src/ui/state/app.svelte';

// O cubing.js não carrega nos testes: a imagem do embaralhamento do detalhe fica vazia.
vi.mock('../../src/scramble/cubing-loader', () => ({ loadCubing: () => Promise.reject(new Error('sem cubing nos testes')) }));

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`rb-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

const MIN = 60_000;
const DAY = 86_400_000;

// Solves montados à mão (sem passar pelo banco): `times` em ms, o último há 5 min, um a cada `step`.
function make(sessionId: string, times: number[], step = 5 * MIN, last = Date.now() - 5 * MIN, prefix = 's'): Solve[] {
  return times.map((ms, i) => {
    const at = last - (times.length - 1 - i) * step;
    return { id: `${prefix}${i}`, sessionId, event: '333', ms, penalty: null, at, scramble: `R U F${i}`, note: '', createdAt: at, updatedAt: at, deletedAt: null };
  });
}

// 3 lentos e depois 12 cada vez mais rápidos: a melhor ao12 são os 12 últimos (índices 3 a 14), a melhor ao5 os 5 últimos e o melhor single o último.
const ramp = (): number[] => [...Array.from({ length: 3 }, () => 20_000), ...Array.from({ length: 12 }, (_, i) => 10_000 + (11 - i) * 50)];

const board = () => screen.getByRole('region', { name: /^Recordes d/ }); // "Recordes da sessão" ou, com todas as sessões, "Recordes do evento"
const rowBtn = (name: RegExp | string) => within(board()).getByRole('button', { name });
const sheet = () => screen.getByRole('dialog');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('o quadro de recordes', () => {
  it('o quadro mostra melhor e atual de single e das médias que têm solves', () => {
    const solves = make('x', ramp());
    solves[14] = { ...solves[14]!, ms: 9_000, penalty: 'DNF' }; // o último solve é DNF: o atual do single é DNF, e a melhor média continua valendo
    const rec = records(solves);
    render(RecordsBoard, { solves, onOpen: () => {} });
    const region = board();
    expect(within(region).getByText(T.historico.recordsScope)).toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: T.historico.recordsTitle })).toBeInTheDocument();
    // Single, ao5 e ao12; ao50, ao100 e ao1000 não têm solves para isso e nem aparecem.
    const labels = within(region)
      .getAllByRole('button')
      .map((b) => b.querySelector('.hx-rec-k')?.textContent);
    expect(labels).toEqual(['Single', 'Média de 5', 'Média de 12']);
    const single = rowBtn(/^Single:/);
    expect(single.querySelector('b')).toHaveTextContent(formatMs(rec.single.best));
    expect(single.querySelector('em')).toHaveTextContent(`último DNF`);
    const ao12 = rowBtn(/^Média de 12:/);
    expect(ao12.querySelector('b')).toHaveTextContent(formatMs(rec.averages[12].best));
    expect(ao12.querySelector('em')).toHaveTextContent(`atual ${formatMs(rec.averages[12].current)}`);
    // O nome lido: o melhor, o atual e a ação (a maquete 1a).
    expect(ao12).toHaveAccessibleName(`Média de 12: melhor ${formatMs(rec.averages[12].best)}, atual ${formatMs(rec.averages[12].current)}. Ver os solves do recorde`);
    expect(single).toHaveAccessibleName(`Single: melhor ${formatMs(rec.single.best)}, último DNF. Ver os solves do recorde`);
  });

  it('um atual que não existe aparece como traço e uma lista sem recordes não desenha o quadro', () => {
    // 6 solves, os dois últimos DNF: a primeira janela (sem DNF) é a melhor, e a atual (com dois DNF) é DNF.
    const six = make('x', [10_000, 11_000, 12_000, 13_000, 14_000, 15_000]);
    six[4] = { ...six[4]!, penalty: 'DNF' };
    six[5] = { ...six[5]!, penalty: 'DNF' };
    const { unmount } = render(RecordsBoard, { solves: six, onOpen: () => {} });
    expect(rowBtn(/^Média de 5:/).querySelector('em')).toHaveTextContent('atual DNF');
    unmount();
    render(RecordsBoard, { solves: [], onOpen: () => {} });
    expect(screen.queryByRole('region', { name: T.historico.recordsTitle })).toBeNull();
  });

  it('tocar numa linha avisa qual recorde', async () => {
    const onOpen = vi.fn();
    render(RecordsBoard, { solves: make('x', ramp()), onOpen });
    await fireEvent.click(rowBtn(/^Single:/));
    await fireEvent.click(rowBtn(/^Média de 12:/));
    await fireEvent.click(rowBtn(/^Média de 5:/));
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['single', 12, 5]);
  });

  it('o quadro ignora o período e segue a sessão', async () => {
    const a = await app();
    await a.createSession('333', 'Treino');
    const [main, treino] = a.sessions.filter((s) => s.event === '333');
    // Principal: 60 dias, um solve por dia, e os mais rápidos (o melhor ao5) são os de 55 a 51 dias atrás; Treino: 8 solves de agora.
    const old = Array.from({ length: 60 }, (_, i) => (i >= 5 && i <= 9 ? 9_000 : 14_000));
    a.solves = [...make(main!.id, old, DAY, Date.now() - 2 * 3600_000, 'p'), ...make(treino!.id, [20_000, 21_000, 22_000, 23_000, 24_000, 25_000, 26_000, 27_000], MIN, Date.now() - MIN, 't')];
    render(EvolucaoScreen, { app: a });
    const select = (label: string, value: string) => {
      const el = screen.getByLabelText(label) as HTMLSelectElement;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    select(T.evolucao.sessionLabel, main!.id);
    // O período é 30 dias, e o melhor ao5 (0:09.00) está fora dele: o quadro tem, os indicadores não.
    await waitFor(() => expect(rowBtn(/^Média de 5:/).querySelector('b')).toHaveTextContent('0:09.00'));
    expect(screen.getByText(T.evolucao.periods['30']).closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(rowBtn(/^Single:/).querySelector('b')).toHaveTextContent('0:09.00');
    // A sessão de Treino tem outros recordes.
    select(T.evolucao.sessionLabel, treino!.id);
    await waitFor(() => expect(rowBtn(/^Média de 5:/).querySelector('b')).toHaveTextContent('0:22.00'));
    expect(rowBtn(/^Single:/).querySelector('b')).toHaveTextContent('0:20.00');
    // "Todas as sessões" diz que o quadro é do evento.
    select(T.evolucao.sessionLabel, 'all');
    await waitFor(() => expect(within(board()).getByText(T.historico.recordsScopeAll)).toBeInTheDocument());
    expect(within(board()).getByRole('heading', { name: T.historico.recordsTitleAll })).toBeInTheDocument();
  });
});

describe('a folha do recorde', () => {
  it('a folha da ao12 lista os 12 tempos com o melhor e o pior entre parênteses', async () => {
    const a = await app();
    const noon = new Date();
    noon.setHours(12, 0, 0, 0); // meio-dia: os 12 solves (55 min) ficam no mesmo dia
    const solves = make(a.profile.currentSessionId!, ramp(), 5 * MIN, noon.getTime());
    a.solves = solves;
    render(RecordDialog, { app: a });
    expect(screen.queryByRole('dialog')).toBeNull();
    const best = records(solves).averages[12].best;

    a.openRecord(12, 'all');
    const d = await screen.findByRole('dialog', { name: T.historico.recordTitle(12, formatMs(best)) });
    expect(a.dialog).toBe('record');
    expect(within(d).getByRole('heading', { name: `Melhor média de 12 · ${formatMs(best)}` })).toBeInTheDocument();
    // Os 12 solves (#4 a #15), na ordem em que foram feitos.
    const items = [...d.querySelectorAll('ol.dz-times li')];
    expect(items).toHaveLength(12);
    const times = windowOf(solves, 12, 14).values.map(formatMs);
    expect(items.map((li) => li.textContent!.slice(li.querySelector('.n')!.textContent!.length))).toEqual(times.map((t, i) => (i === 0 || i === 11 ? `(${t})` : t)));
    expect(items[0]).toHaveClass('hx-out'); // o pior (0:10.55, o mais antigo) e o melhor (0:10.00, o mais novo) ficam fora da conta
    expect(items[11]).toHaveClass('hx-out');
    expect(d.querySelectorAll('li.hx-out')).toHaveLength(2);
    expect(d.querySelector('.hx-rule')).toHaveTextContent(T.historico.recordRule(12));
    expect(within(d).getByText(new RegExp(`^Solves #4 a #15 · ${dateLabel(solves[3]!.at)}, ${timeOfDay(solves[3]!.at)} a ${timeOfDay(solves[14]!.at)}$`))).toBeInTheDocument();
    // O melhor single da janela é o recorde da época: leva o losango.
    expect(items[11]!.querySelector('.hx-pb')).not.toBeNull();
    expect(within(d).getByRole('button', { name: T.historico.viewInList })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: T.dialog.close })).toBeInTheDocument();
  });

  it('um +2 e um DNF aparecem como na lista, e o DNF é o pior', async () => {
    const a = await app();
    const solves = make(a.profile.currentSessionId!, [12_000, 12_100, 12_200, 12_300, 12_400, 12_500]);
    solves[2] = { ...solves[2]!, penalty: '+2' };
    solves[5] = { ...solves[5]!, penalty: 'DNF' }; // a janela dos 5 primeiros é a melhor (0:12.00, 0:12.10, 0:14.20+, ...)
    a.solves = solves;
    render(RecordDialog, { app: a });
    a.openRecord(5, 'all');
    const d = await screen.findByRole('dialog');
    const items = [...d.querySelectorAll('ol.dz-times li')].map((li) => li.textContent);
    expect(items[2]).toContain('0:14.20+');
    expect(items).toHaveLength(5);
    // 5 tempos: corta 1 de cada lado (o menor, 0:12.00, e o maior, o +2 de 0:14.20).
    expect(d.querySelectorAll('li.hx-out')).toHaveLength(2);
    expect(items[0]).toContain('(0:12.00)');
    expect(items[2]).toContain('(0:14.20+)');
  });

  it('a folha da ao100 mostra o intervalo de datas', async () => {
    const a = await app();
    // 120 solves, um por hora; o melhor intervalo de 100 são os 100 últimos (os tempos descem).
    const times = Array.from({ length: 120 }, (_, i) => 15_000 - i * 10);
    const solves = make(a.profile.currentSessionId!, times, 3600_000, Date.now() - 3600_000);
    a.solves = solves;
    render(RecordDialog, { app: a });
    a.openRecord(100, 'all');
    const d = await screen.findByRole('dialog');
    const best = records(solves).averages[100];
    expect(best.bestEnd).toBe(119);
    expect(within(d).getByRole('heading', { name: `Melhor média de 100 · ${formatMs(best.best)}` })).toBeInTheDocument();
    // Solves #20 a #120 e as datas (o ano corrente fica de fora: "02/08 a 15/10").
    const first = solves[20]!;
    const last = solves[119]!;
    expect(within(d).getByText(`${T.historico.recordSolves(21, 120)} · ${shortDate(first.at)} a ${shortDate(last.at)}`)).toBeInTheDocument();
    expect(d.querySelector('ol.dz-times')).toBeNull();
    expect(d.querySelector('.hx-rule')).toHaveTextContent(T.historico.recordRule(100));
  });

  it('a folha do single mostra o tempo e a data, e o Ver na lista', async () => {
    const a = await app();
    const solves = make(a.profile.currentSessionId!, [12_000, 9_500, 13_000]);
    a.solves = solves;
    render(RecordDialog, { app: a });
    a.openRecord('single', 'all');
    const d = await screen.findByRole('dialog', { name: T.historico.recordTitle('single', '0:09.50') });
    expect(within(d).getByText(`${T.historico.recordSolve(2)} · ${dateLabel(solves[1]!.at)}, ${timeOfDay(solves[1]!.at)}`)).toBeInTheDocument();
    expect(d.querySelector('ol.dz-times')).toBeNull();
    expect(within(d).getByRole('button', { name: T.historico.viewInList })).toBeInTheDocument();
  });

  it('segue o filtro: a sessão e o evento do pedido, e fecha sem aviso se o recorde some', async () => {
    const a = await app();
    await a.createSession('333', 'Treino');
    const [main, treino] = a.sessions.filter((s) => s.event === '333');
    a.solves = [...make(main!.id, [8_000, 9_000], MIN, Date.now() - 30 * MIN, 'p'), ...make(treino!.id, [11_000, 12_000], MIN, Date.now() - 10 * MIN, 't')];
    render(RecordDialog, { app: a });
    a.openRecord('single', treino!.id, '333');
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('heading')).toHaveTextContent('0:11.00'); // o melhor da sessão de Treino, não o do evento
    // Os solves saem (outra aba): sem recorde, a folha fecha.
    a.solves = a.solves.filter((s) => s.sessionId !== treino!.id);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(a.dialog).toBeNull();
  });
});

describe('Ver na lista', () => {
  it('Ver na lista rola até o último solve da janela', async () => {
    const a = await app();
    const solves = make(a.profile.currentSessionId!, ramp());
    a.solves = solves;
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(EvolucaoScreen, { app: a });
    render(RecordDialog, { app: a });
    await fireEvent.click(rowBtn(/^Média de 5:/));
    const d = await screen.findByRole('dialog');
    await fireEvent.click(within(d).getByRole('button', { name: T.historico.viewInList }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // A janela da melhor ao5 termina no último solve (s14); a lista leva até ele, o foco vai para a linha e as 5 linhas ficam marcadas.
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    const row = document.querySelector<HTMLElement>('.hx-row[data-id="s14"]')!;
    expect(row).not.toBeNull();
    await waitFor(() => expect(row).toHaveFocus());
    const marked = [...document.querySelectorAll<HTMLElement>('.hx-row[data-flash]')].map((r) => r.dataset.id);
    expect(marked.sort()).toEqual(['s10', 's11', 's12', 's13', 's14']);
    expect(a.listJump).toBeNull(); // o pedido foi atendido
  });

  it('um recorde fora do período abre a lista em "Tudo" para alcançá-lo', async () => {
    const a = await app();
    // Os cinco mais rápidos (s5 a s9, cada um mais rápido que o anterior) são a melhor ao5, a mais de 30 dias.
    const old = Array.from({ length: 60 }, (_, i) => (i >= 5 && i <= 9 ? 9_000 - (i - 5) * 100 : 14_000));
    a.solves = make(a.profile.currentSessionId!, old, DAY, Date.now() - 2 * 3600_000);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(EvolucaoScreen, { app: a });
    render(RecordDialog, { app: a });
    const period = (p: '7' | '30' | 'all') => screen.getByText(T.evolucao.periods[p]).closest('button')!;
    expect(period('30')).toHaveAttribute('aria-pressed', 'true');
    await fireEvent.click(rowBtn(/^Média de 5:/));
    await fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: T.historico.viewInList }));
    await waitFor(() => expect(period('all')).toHaveAttribute('aria-pressed', 'true'));
    // A janela é de s5 a s9: o último é o s9, e a lista (agora inteira) o desenha e leva o foco até ele.
    await waitFor(() => expect(document.querySelector('.hx-row[data-id="s9"]')).toHaveFocus());
  });

  it('uma janela que atravessa o corte do período abre a lista em "Tudo", com a janela inteira ao alcance', async () => {
    const a = await app();
    // 120 solves, um por dia, cada um mais rápido que o anterior: a melhor ao100 são os 100 últimos (s20 a s119). O período de 30 dias começa
    // perto do s90: o último solve da janela está dentro dele, e o primeiro, bem antes.
    const times = Array.from({ length: 120 }, (_, i) => 15_000 - i * 10);
    a.solves = make(a.profile.currentSessionId!, times, DAY, Date.now() - 2 * 3600_000);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(EvolucaoScreen, { app: a });
    render(RecordDialog, { app: a });
    const period = (p: '7' | '30' | 'all') => screen.getByText(T.evolucao.periods[p]).closest('button')!;
    expect(period('30')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: T.historico.listTitle(30) })).toBeInTheDocument(); // só os 30 dias
    await fireEvent.click(rowBtn(/^Média de 100:/));
    await fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: T.historico.viewInList }));
    await waitFor(() => expect(period('all')).toHaveAttribute('aria-pressed', 'true'));
    // A lista agora tem os 120: o s20, o primeiro da janela, existe nela.
    await waitFor(() => expect(screen.getByRole('heading', { name: T.historico.listTitle(120) })).toBeInTheDocument());
    await waitFor(() => expect(document.querySelector('.hx-row[data-id="s119"]')).toHaveFocus());
  });

  it('o recorde de outra sessão muda o filtro da Evolução para a dele', async () => {
    const a = await app();
    await a.createSession('333', 'Treino');
    const [main, treino] = a.sessions.filter((s) => s.event === '333');
    a.solves = [...make(main!.id, [8_000, 9_000, 9_100, 9_200, 9_300, 9_400], MIN, Date.now() - 30 * MIN, 'p'), ...make(treino!.id, [11_000, 12_000, 12_100], MIN, Date.now() - 10 * MIN, 't')];
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(EvolucaoScreen, { app: a });
    render(RecordDialog, { app: a });
    // A Evolução está em "Todas as sessões" ou na atual; o pedido pede a Principal.
    a.openRecord('single', main!.id, '333');
    await fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: T.historico.viewInList }));
    await waitFor(() => expect((screen.getByLabelText(T.evolucao.sessionLabel) as HTMLSelectElement).value).toBe(main!.id));
    await waitFor(() => expect(document.querySelector('.hx-row[data-id="p0"]')).toHaveFocus());
  });
});

describe('o selo do detalhe', () => {
  it('"Faz parte do recorde" é um botão com › que abre a folha do recorde, com o filtro da lista', async () => {
    const a = await app();
    const solves = make(a.profile.currentSessionId!, ramp());
    a.solves = solves;
    render(SolveDialog, { app: a });
    render(RecordDialog, { app: a });
    a.openSolve(solves[14]!.id, 'all');
    const d = await screen.findByRole('dialog', { name: /Solve #15/ });
    const chip = within(d).getByRole('button', { name: new RegExp(`^${T.historico.inRecord(12)}`) });
    expect(chip).toHaveClass('chip', 'pb');
    expect(chip.textContent).toContain('›');
    expect(chip.querySelector('[aria-hidden="true"]')).toHaveTextContent('›');
    await fireEvent.click(chip);
    expect(a.dialog).toBe('record');
    expect(a.recordRequest).toMatchObject({ kind: 12, event: '333', sessionId: 'all' });
    const rec = await screen.findByRole('dialog', { name: /Melhor média de 12/ });
    expect(rec).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1)); // o detalhe fechou
    expect(sheet()).toBe(rec);
  });
});
