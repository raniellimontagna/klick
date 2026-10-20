import { describe, expect, it } from 'vitest';
import { STATES, createTimer } from '../../src/core/timer';
import { createTouchArm } from '../../src/core/touch';

function rig({ inspection = false, mode = 'two' }: { inspection?: boolean; mode?: 'two' | 'one' } = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection });
  const touch = createTouchArm({
    press: timer.press,
    release: timer.release,
    cancel: timer.cancel,
    getState: () => timer.state,
    getInspection: () => inspection,
    mode,
  });
  const at = (ms: number) => {
    t = ms;
    timer.tick();
  };
  return { timer, touch, at, setTime: (ms: number) => { t = ms; } };
}

// Casos portados de prototype/tests/touch.test.js.
describe('armar no toque', () => {
  it('dois polegares: um só não arma; os dois armam; o primeiro que sai larga', () => {
    const { timer, touch, at } = rig();
    touch.down(1, 'left');
    at(400);
    expect(timer.state).toBe(STATES.IDLE);
    touch.down(2, 'right');
    at(800);
    expect(timer.state).toBe(STATES.READY);
    touch.up(1);
    expect(timer.state).toBe(STATES.RUNNING);
    touch.up(2);
    expect(timer.state).toBe(STATES.RUNNING);
    at(5000);
    touch.down(3, 'left');
    expect(timer.state).toBe(STATES.DONE);
  });

  it('dois dedos na mesma zona não armam', () => {
    const { timer, touch, at } = rig();
    touch.down(1, 'left');
    touch.down(2, 'left');
    at(500);
    expect(timer.state).toBe(STATES.IDLE);
  });

  it('com inspeção: um toque inicia a inspeção e depois os dois polegares armam', () => {
    const { timer, touch, at } = rig({ inspection: true });
    touch.down(1, 'left');
    touch.up(1);
    expect(timer.state).toBe(STATES.INSPECT);
    at(3000);
    touch.down(2, 'left');
    expect(timer.state).toBe(STATES.INSPECT);
    touch.down(3, 'right');
    at(3300);
    expect(timer.state).toBe(STATES.READY);
    touch.up(3);
    expect(timer.state).toBe(STATES.RUNNING);
  });

  it('soltar antes do verde volta para a inspeção', () => {
    const { timer, touch, at } = rig({ inspection: true });
    touch.down(1, 'right');
    touch.up(1);
    at(2000);
    touch.down(2, 'left');
    touch.down(3, 'right');
    at(2100);
    touch.up(2);
    expect(timer.state).toBe(STATES.INSPECT);
  });

  it('modo um toque: qualquer dedo arma', () => {
    const { timer, touch, at } = rig({ mode: 'one' });
    touch.down(1, 'left');
    at(300);
    expect(timer.state).toBe(STATES.READY);
    touch.up(1);
    expect(timer.state).toBe(STATES.RUNNING);
  });

  it('cancelAll abandona sem largar: pronto volta ao parado e o toque de inspeção não vale', () => {
    const { timer, touch, at } = rig();
    touch.down(1, 'left');
    touch.down(2, 'right');
    at(400);
    expect(timer.state).toBe(STATES.READY);
    touch.cancelAll();
    expect(timer.state).toBe(STATES.IDLE);
    const withInspection = rig({ inspection: true });
    withInspection.touch.down(1, 'left');
    withInspection.touch.cancelAll();
    expect(withInspection.timer.state).toBe(STATES.IDLE);
    withInspection.touch.down(2, 'left');
    withInspection.touch.up(2);
    expect(withInspection.timer.state).toBe(STATES.INSPECT);
  });

  it('parar com dois dedos e inspeção ligada não inicia outra inspeção', () => {
    const { timer, touch, at } = rig({ inspection: true });
    touch.down(1, 'left');
    touch.up(1);
    at(1000);
    touch.down(2, 'left');
    touch.down(3, 'right');
    at(1300);
    touch.up(2);
    expect(timer.state).toBe(STATES.RUNNING);
    touch.up(3);
    at(5000);
    touch.down(4, 'left');
    touch.down(5, 'right');
    touch.up(4);
    touch.up(5);
    expect(timer.state).toBe(STATES.DONE);
    touch.down(6, 'right');
    touch.up(6);
    expect(timer.state).toBe(STATES.INSPECT);
  });

  it('cancelAll no fim do timer (dentro do toque que para) esquece o gesto de parar: dois polegares armam de novo sem o soltar dele', () => {
    const { timer, touch, at } = rig();
    timer.on('done', () => touch.cancelAll()); // como o treino faz: a zona some com o resultado, e o soltar pode não chegar
    touch.down(1, 'left');
    touch.down(2, 'right');
    at(400);
    touch.up(1);
    touch.up(2);
    expect(timer.state).toBe(STATES.RUNNING);
    at(1000);
    touch.down(3, 'left');
    expect(timer.state).toBe(STATES.DONE);
    touch.down(4, 'left');
    touch.down(5, 'right');
    at(1500);
    expect(timer.state).toBe(STATES.READY);
  });
});

// O toque leva o horário do evento (event.timeStamp) até o timer. Nestes testes o handler de cada toque roda depois do
// evento: o relógio do timer (setTime) mostra a hora do handler, e o número dado a down e up é a hora do evento.
describe('armar no toque, com o horário do evento', () => {
  it('soltar depois do tempo de armar, pelo horário do evento, larga; e parar mede até o evento da parada', () => {
    const { timer, touch, setTime } = rig();
    setTime(60); touch.down(1, 'left', 0);
    setTime(90); touch.down(2, 'right', 50);        // os dois polegares armam desde 50
    setTime(500); touch.up(1, 380);                 // saiu em 380: segurou 330 ms, ainda que o handler só rode aos 500
    expect(timer.state).toBe(STATES.RUNNING);
    setTime(10700); touch.down(3, 'left', 10380);   // parou em 10380
    expect(timer.state).toBe(STATES.DONE);
    expect(timer.result).toEqual({ ms: 10000, penalty: null });
  });

  it('soltar antes do tempo de armar, pelo horário do evento, não larga', () => {
    const { timer, touch, setTime } = rig();
    setTime(60); touch.down(1, 'left', 0);
    setTime(90); touch.down(2, 'right', 50);
    setTime(500); touch.up(1, 300);                 // saiu em 300: segurou só 250 ms, ainda que o handler só rode aos 500
    expect(timer.state).toBe(STATES.IDLE);
  });

  it('com inspeção: a inspeção começa quando o último dedo sai, pelo horário do evento', () => {
    const { timer, touch, setTime } = rig({ inspection: true });
    setTime(30); touch.down(1, 'left', 0);
    setTime(60); touch.down(2, 'right', 40);
    setTime(150); touch.up(1, 100);                 // ainda há um dedo na tela
    expect(timer.state).toBe(STATES.IDLE);
    setTime(400); touch.up(2, 180);                 // o último saiu em 180
    expect(timer.state).toBe(STATES.INSPECT);
    setTime(8180);
    expect(timer.inspectElapsed).toBe(8000);        // contada desde 180, e não desde os 400 do handler
  });
});

// Fases no toque (Review Focus 2): no celular, a mão que marcou a fase às vezes fica encostada na tela, e a próxima fase vem com outro dedo.
describe('fases no toque', () => {
  it('com fases, um toque de outro dedo com o primeiro ainda encostado marca a fase', () => {
    const { timer, touch, at } = rig();
    timer.setOptions({ phases: 3 });
    const marked: number[] = [];
    timer.on('phase', (_i, ms) => marked.push(ms));
    touch.down(1, 'left');
    touch.down(2, 'right');
    at(400);
    touch.up(1);
    touch.up(2);
    expect(timer.state).toBe(STATES.RUNNING);
    at(2400);
    touch.down(3, 'left'); // a primeira fase; o dedo fica na tela
    expect(marked).toEqual([2000]);
    at(4400);
    touch.down(4, 'right'); // outro dedo, com o primeiro ainda encostado: marca a segunda
    expect(marked).toEqual([2000, 4000]);
    expect(timer.state).toBe(STATES.RUNNING);
    at(6400);
    touch.down(5, 'left'); // o terceiro, com dois encostados, para
    expect(timer.state).toBe(STATES.DONE);
    expect(timer.result?.phases).toEqual([2000, 2000, 2000]);
    // Os dedos do gesto não armam de novo enquanto algum está na tela; depois que todos saem, os dois polegares armam como sempre.
    touch.down(6, 'right');
    at(7000);
    expect(timer.state).toBe(STATES.DONE);
    touch.up(3);
    touch.up(4);
    touch.up(5);
    touch.up(6);
    touch.down(7, 'left');
    touch.down(8, 'right');
    at(7400);
    expect(timer.state).toBe(STATES.READY);
  });
});
