import { describe, expect, it } from 'vitest';
import { createTimeLoop, paintTime, type Frames, type TimeLoop } from '../../src/ui/timer/TimeDisplay';

function timeEl(html = '0:00<span class="dec">.00</span>') {
  const el = document.createElement('div');
  el.className = 'time';
  el.innerHTML = html;
  document.body.replaceChildren(el);
  return el;
}

describe('pintura do tempo', () => {
  it('0:58.42 vira segundos em .int e centésimos em .dec, com o ponto', () => {
    const el = timeEl();
    paintTime(el, '0:58.42');
    expect(el.querySelector('.int')?.textContent).toBe('0:58');
    expect(el.querySelector('.dec')?.textContent).toBe('.42');
    expect(el.textContent).toBe('0:58.42');
  });

  it('texto sem ponto (contagem da inspeção, DNF) vai inteiro em .int', () => {
    const el = timeEl();
    paintTime(el, '8');
    expect(el.querySelector('.int')?.textContent).toBe('8');
    expect(el.querySelector('.dec')?.textContent).toBe('');
    paintTime(el, 'DNF');
    expect(el.querySelector('.int')?.textContent).toBe('DNF');
  });

  it('pintar de novo reaproveita os nós e não reescreve texto igual', () => {
    const el = timeEl();
    paintTime(el, '0:01.00');
    const int = el.querySelector('.int');
    const dec = el.querySelector('.dec');
    paintTime(el, '0:01.07');
    expect(el.querySelector('.int')).toBe(int);
    expect(el.querySelector('.dec')).toBe(dec);
    expect(el.querySelector('.dec')?.textContent).toBe('.07');
  });
});

function fakeFrames() {
  const queue = new Map<number, () => void>();
  let next = 1;
  let requested = 0;
  let ran = 0;
  const cancelled: number[] = [];
  const frames: Frames = {
    request: (cb) => {
      requested++;
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    cancel: (id) => {
      cancelled.push(id);
      queue.delete(id);
    },
  };
  // Roda o próximo quadro pendente; devolve false se não havia nenhum.
  const runFrame = () => {
    const entry = [...queue.entries()][0];
    if (!entry) return false;
    queue.delete(entry[0]);
    ran++;
    entry[1]();
    return true;
  };
  return { frames, pending: () => queue.size, requested: () => requested, ran: () => ran, runFrame, cancelled };
}

describe('laço do tempo', () => {
  it('kick liga, cada quadro pinta, e para sozinho quando paint devolve false', () => {
    const f = fakeFrames();
    let left = 3;
    let painted = 0;
    const loop = createTimeLoop(() => {
      painted++;
      left--;
      return left > 0;
    }, f.frames);
    expect(loop.running).toBe(false);
    loop.kick();
    expect(loop.running).toBe(true);
    expect(f.pending()).toBe(1);
    while (f.runFrame());
    expect(painted).toBe(3);
    expect(loop.running).toBe(false);
    expect(f.pending()).toBe(0);
  });

  it('kick repetido não agenda quadro duplicado', () => {
    const f = fakeFrames();
    const loop = createTimeLoop(() => true, f.frames);
    loop.kick();
    loop.kick();
    loop.kick();
    expect(f.pending()).toBe(1);
  });

  it('kick() dentro de paint() deixa um único quadro pendente, sem cadeia dupla', () => {
    const f = fakeFrames();
    let loop!: TimeLoop;
    let n = 0;
    loop = createTimeLoop(() => {
      if (n === 0) loop.kick(); // re-entrante no primeiro quadro: o timer dispara 'state' e a tela chama kick
      return ++n < 3;
    }, f.frames);
    loop.kick();
    // pendentes = pedidos - cancelados - quadros que já rodaram
    f.runFrame(); // quadro 1: paint chama kick() no meio
    expect(f.pending()).toBe(1);
    expect(f.requested() - f.cancelled.length - f.ran()).toBe(1);
    f.runFrame(); // quadro 2
    expect(f.pending()).toBe(1);
    expect(f.requested() - f.cancelled.length - f.ran()).toBe(1);
    f.runFrame(); // quadro 3: paint devolve false e o laço para
    expect(f.pending()).toBe(0);
    expect(loop.running).toBe(false);
  });

  it('stop() chamado dentro de paint() impede o reagendamento', () => {
    const f = fakeFrames();
    let loop!: TimeLoop;
    loop = createTimeLoop(() => {
      loop.stop();
      return true; // mesmo pedindo continuar, o laço já foi parado no meio do quadro
    }, f.frames);
    loop.kick();
    f.runFrame();
    expect(loop.running).toBe(false);
    expect(f.pending()).toBe(0);
    expect(f.runFrame()).toBe(false);
  });

  it('depois de parar sozinho, um novo kick volta a rodar', () => {
    const f = fakeFrames();
    let active = false;
    const loop = createTimeLoop(() => active, f.frames);
    loop.kick();
    f.runFrame();
    expect(loop.running).toBe(false);
    active = true;
    loop.kick();
    expect(loop.running).toBe(true);
  });

  it('stop cancela o quadro agendado e não deixa nada rodando', () => {
    const f = fakeFrames();
    const loop = createTimeLoop(() => true, f.frames);
    loop.kick();
    loop.stop();
    expect(loop.running).toBe(false);
    expect(f.cancelled).toHaveLength(1);
    expect(f.pending()).toBe(0);
    loop.stop();
    expect(f.cancelled).toHaveLength(1);
  });
});
