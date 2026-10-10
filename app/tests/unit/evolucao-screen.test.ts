import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
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

  it('filtra por evento e mostra a nota sob o tempo', async () => {
    const a = await app();
    const s = (await a.addSolve({ ms: 61234, penalty: null, at: Date.now() }))!;
    await a.setNote(s.id, 'cruz no amarelo');
    await a.createSession('222');
    await a.addSolve({ ms: 8000, penalty: null, at: Date.now() });
    render(EvolucaoScreen, { app: a });
    const select = (await screen.findByLabelText('Evento')) as HTMLSelectElement;
    expect(select.value).toBe('222');
    expect(document.querySelectorAll('.hist tbody tr')).toHaveLength(1);
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
    expect(document.querySelectorAll('.hist tbody tr')).toHaveLength(1);
    evento.value = '333';
    evento.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(sessao.value).toBe('all');
    expect(document.querySelectorAll('.hist tbody tr')).toHaveLength(1);
    expect(document.querySelector('.hist tbody')?.textContent).toContain('0:09.00');
  });

  it('uma nota com HTML aparece como texto, sem virar elemento', async () => {
    const a = await app();
    const s = (await a.addSolve({ ms: 61234, penalty: null, at: Date.now() }))!;
    await a.setNote(s.id, '<b>x</b>');
    render(EvolucaoScreen, { app: a });
    expect(await screen.findByText('<b>x</b>')).toBeInTheDocument();
    expect(document.querySelector('.hist b')).toBeNull();
  });
});

describe('Evolução: hora atual e troca de evento', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('um solve "agora" vira "há 2 min" depois de 2 minutos com a tela aberta', async () => {
    const a = await app();
    const base = Date.now();
    await a.addSolve({ ms: 61234, penalty: null, at: base });
    vi.useFakeTimers({ now: base, toFake: ['Date', 'setInterval', 'clearInterval'] });
    render(EvolucaoScreen, { app: a });
    await tick();
    expect(document.querySelector('.hist tbody')?.textContent).toContain('agora');
    vi.advanceTimersByTime(2 * 60000);
    await tick();
    expect(document.querySelector('.hist tbody')?.textContent).toContain('há 2 min');
    expect(document.querySelector('.hist tbody')?.textContent).not.toContain('agora');
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
    expect(document.querySelector('.hist tbody')?.textContent).toContain('1:01.23');
    vi.advanceTimersByTime(8 * 24 * 60 * 60000);
    await tick();
    expect(screen.getByText(/Sem solves neste período/)).toBeInTheDocument();
  });

  it('desmontar para o relógio; montar de novo pega a hora atual', async () => {
    const a = await app();
    const base = Date.now();
    await a.addSolve({ ms: 61234, penalty: null, at: base });
    vi.useFakeTimers({ now: base, toFake: ['Date', 'setInterval', 'clearInterval'] });
    const primeira = render(EvolucaoScreen, { app: a });
    await tick();
    primeira.unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(base + 5 * 60000);
    render(EvolucaoScreen, { app: a });
    await tick();
    expect(document.querySelector('.hist tbody')?.textContent).toContain('há 5 min');
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
