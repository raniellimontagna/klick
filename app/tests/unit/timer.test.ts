import { describe, expect, it, vi } from 'vitest';
import { STATES, createTimer } from '../../src/core/timer';
import type { TimerResult, TimerState } from '../../src/core/timer';
import type { Penalty } from '../../src/core/types';

function rig(opts: { holdMs?: number; inspection?: boolean } = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection: false, ...opts });
  const log: { warns: number[]; done: TimerResult[] } = { warns: [], done: [] };
  timer.on('warn', (w) => log.warns.push(w));
  timer.on('done', (r) => log.done.push(r));
  const at = (ms: number) => {
    t = ms;
    timer.tick();
  };
  return { timer, log, at, setTime: (ms: number) => { t = ms; } };
}

// Casos portados de prototype/tests/timer.test.js.
describe('timer', () => {
  it('sem inspeção: segurar 0,3 s arma, soltar larga, apertar para', () => {
    const { timer, log, at } = rig();
    timer.press();
    expect(timer.state).toBe(STATES.ARMING);
    at(299);
    expect(timer.state).toBe(STATES.ARMING);
    expect(timer.armProgress).toBeGreaterThan(0.99);
    expect(timer.armProgress).toBeLessThan(1);
    at(300);
    expect(timer.state).toBe(STATES.READY);
    timer.release();
    expect(timer.state).toBe(STATES.RUNNING);
    at(300 + 58420);
    timer.press();
    expect(timer.state).toBe(STATES.DONE);
    expect(log.done).toEqual([{ ms: 58420, penalty: null }]);
    expect(timer.elapsed).toBe(58420);
  });

  it('soltar antes do verde volta ao parado sem resultado', () => {
    const { timer, log, at } = rig();
    timer.press();
    at(150);
    timer.release();
    expect(timer.state).toBe(STATES.IDLE);
    expect(log.done).toHaveLength(0);
  });

  it('tempo para armar 0 fica pronto na hora', () => {
    const { timer } = rig({ holdMs: 0 });
    timer.press();
    expect(timer.state).toBe(STATES.READY);
  });

  it('soltar a tecla depois de parar não faz nada', () => {
    const { timer, at } = rig({ holdMs: 0 });
    timer.press();
    timer.release();
    at(1000);
    timer.press();
    timer.release();
    expect(timer.state).toBe(STATES.DONE);
  });

  it('com inspeção: apertar e soltar inicia; segurar arma; soltar larga sem penalidade', () => {
    const { timer, log, at } = rig({ inspection: true });
    timer.press();
    expect(timer.state).toBe(STATES.IDLE);
    timer.release();
    expect(timer.state).toBe(STATES.INSPECT);
    at(5000);
    expect(timer.inspectElapsed).toBe(5000);
    timer.press();
    at(5300);
    expect(timer.state).toBe(STATES.READY);
    timer.release();
    expect(timer.state).toBe(STATES.RUNNING);
    at(65300);
    timer.press();
    expect(log.done).toEqual([{ ms: 60000, penalty: null }]);
  });

  it('soltar antes do verde durante a inspeção volta para a inspeção, que continua contando', () => {
    const { timer, at } = rig({ inspection: true });
    timer.press();
    timer.release();
    at(4000);
    timer.press();
    at(4100);
    timer.release();
    expect(timer.state).toBe(STATES.INSPECT);
    at(6000);
    expect(timer.inspectElapsed).toBe(6000);
  });

  it('avisos de 8 s e 12 s saem uma vez só', () => {
    const { timer, log, at } = rig({ inspection: true });
    timer.press();
    timer.release();
    at(7999);
    at(8000);
    at(9000);
    at(12500);
    at(13000);
    expect(log.warns).toEqual([8000, 12000]);
  });

  it('largar depois de 15 s dá +2; depois de 17 s, DNF', () => {
    const casos: [number, Penalty][] = [[15500, '+2'], [17500, 'DNF']];
    for (const [startAt, expected] of casos) {
      const { timer, log, at } = rig({ inspection: true });
      timer.press();
      timer.release();
      at(startAt - 300);
      timer.press();
      at(startAt);
      timer.release();
      at(startAt + 40000);
      timer.press();
      expect(log.done[0].penalty).toBe(expected);
    }
  });

  it('depois de um resultado, o próximo ciclo começa de novo', () => {
    const { timer, at } = rig({ inspection: true });
    timer.press();
    timer.release();
    at(1000);
    timer.press();
    at(1300);
    timer.release();
    at(2000);
    timer.press();
    expect(timer.state).toBe(STATES.DONE);
    timer.release();
    timer.press();
    timer.release();
    expect(timer.state).toBe(STATES.INSPECT);
    expect(timer.inspectElapsed).toBe(0);
  });

  it('setOptions vale no próximo ciclo e reset volta ao parado', () => {
    const { timer, at } = rig();
    timer.setOptions({ inspection: true });
    timer.press();
    timer.release();
    expect(timer.state).toBe(STATES.INSPECT);
    timer.reset();
    expect(timer.state).toBe(STATES.IDLE);
    at(100);
    expect(timer.inspectElapsed).toBe(0);
  });

  it('soltar depois do tempo de armar larga mesmo sem tick no meio', () => {
    const { timer, setTime } = rig();
    timer.press();
    setTime(310);
    timer.release();
    expect(timer.state).toBe(STATES.RUNNING);
  });

  it('reset limpa o resultado anterior', () => {
    const { timer, at } = rig({ holdMs: 0 });
    timer.press();
    timer.release();
    at(1000);
    timer.press();
    expect(timer.result).toEqual({ ms: 1000, penalty: null });
    timer.reset();
    expect(timer.result).toBeNull();
  });

  it('cancel abandona o segurar sem largar e volta à base', () => {
    const { timer, at } = rig({ inspection: true });
    timer.press();
    timer.release();
    at(2000);
    timer.press();
    at(2300);
    expect(timer.state).toBe(STATES.READY);
    timer.cancel();
    expect(timer.state).toBe(STATES.INSPECT);
    const plain = rig();
    plain.timer.press();
    plain.at(400);
    plain.timer.cancel();
    expect(plain.timer.state).toBe(STATES.IDLE);
  });
});

const clock = () => {
  let t = 0;
  return { now: () => t, set: (v: number) => { t = v; } };
};

describe('horário do evento', () => {
  it('usa o timeStamp do evento, não a hora em que o código roda', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    c.set(1000); timer.press(1000);
    c.set(1400); timer.tick();
    expect(timer.state).toBe('ready');
    c.set(1450); timer.release(1410);      // o evento aconteceu em 1410, o handler rodou em 1450
    c.set(11000); timer.press(10980);      // parou em 10980
    expect(timer.result).toEqual({ ms: 9570, penalty: null });
  });

  it('soltar depois do tempo de armar larga mesmo sem tick no meio, medindo pelo evento', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    timer.press(0);
    c.set(600); timer.release(350);
    expect(timer.state).toBe('running');
  });

  it('soltar antes do tempo de armar, pelo horário do evento, não larga', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    timer.press(0);
    c.set(400); timer.release(250);        // o handler atrasou, mas o dedo saiu aos 250 ms
    expect(timer.state).toBe('idle');
  });

  it('inspeção medida pelo evento: largar aos 15,5 s dá +2', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 0, inspection: true });
    timer.press(0); timer.release(10);     // começa a inspeção em 10
    c.set(15400); timer.press(15400);
    c.set(15600); timer.release(15510);
    c.set(25510); timer.press(25510);
    expect(timer.result).toEqual({ ms: 10000, penalty: '+2' });
  });

  // Os três testes abaixo cobrem o que os casos acima não distinguem de now(): o começo do segurar (e o tick que o
  // avalia), o começo da inspeção e o limite do +2. Em cada um, o handler roda depois do evento.
  it('apertar com o handler atrasado conta o segurar a partir do evento', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    c.set(400); timer.press(0);            // o dedo desceu em 0, o handler só rodou em 400 (0 também vale como horário)
    expect(timer.state).toBe('arming');    // pelo evento, segurou 0 ms: ainda não arma
    timer.tick(300);
    expect(timer.state).toBe('ready');     // 300 ms depois do evento
  });

  it('a inspeção começa no horário do evento, e os avisos saem pelo horário do tick', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: true });
    const warns: number[] = [];
    timer.on('warn', (w) => warns.push(w));
    timer.press(0);
    c.set(500); timer.release(100);        // o dedo saiu em 100, o handler só rodou em 500
    c.set(7000); timer.tick(8099);
    expect(warns).toEqual([]);             // 7999 ms de inspeção pelo evento
    timer.tick(8100);
    expect(warns).toEqual([8000]);
  });

  it('inspeção: largar aos 14,9 s pelo evento não dá +2, mesmo que o handler rode depois dos 15 s', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 0, inspection: true });
    timer.press(0); timer.release(0);
    c.set(14000); timer.press(14000);
    c.set(15100); timer.release(14900);    // o dedo saiu aos 14,9 s, o handler só rodou aos 15,1 s
    c.set(25000); timer.press(24900);
    expect(timer.result).toEqual({ ms: 10000, penalty: null });
  });

  // Um tick no horário do handler (o quadro que rodou antes do keyup) pode deixar o timer pronto antes do que o evento diz.
  it('pronto por um tick no horário do handler, soltar antes do tempo pelo horário do evento não larga', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    timer.press(0);
    c.set(400); timer.tick();              // 400 ms no relógio do handler: já fica pronto
    expect(timer.state).toBe('ready');
    c.set(450); timer.release(250);        // mas o dedo saiu aos 250 ms
    expect(timer.state).toBe('idle');      // o mesmo destino de soltar cedo no armar
  });

  it('o mesmo na inspeção: volta para a inspeção, que continua contando', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: true });
    timer.press(0); timer.release(0);      // a inspeção começa em 0
    c.set(1000); timer.press(1000);
    c.set(1400); timer.tick();             // pronto pelo relógio do handler
    expect(timer.state).toBe('ready');
    c.set(1450); timer.release(1250);      // segurou 250 ms pelo evento
    expect(timer.state).toBe('inspect');
    c.set(2000);
    expect(timer.inspectElapsed).toBe(2000);
  });

  // O tick de dentro do release também mede pelo evento: pelo relógio do handler o timer passaria por pronto, e a tela
  // acenderia o verde numa soltura que não armou.
  it('soltar antes do tempo de armar, com o handler atrasado, nem chega a passar por pronto', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 300, inspection: false });
    const states: TimerState[] = [];
    timer.on('state', (next) => states.push(next));
    timer.press(0);
    c.set(400); timer.release(250);        // o dedo saiu aos 250 ms; pelo relógio do handler já seriam 400
    expect(states).toEqual(['arming', 'idle']);
  });
});

// Os limites são os da WCA: +2 depois de 15 s de inspeção, DNF depois de 17 s, avisos aos 8 s e aos 12 s. "Depois de" é
// estritamente depois. Tudo pelo horário do evento: os testes dão o horário a cada chamada e o relógio nem é lido.
describe('limites da inspeção WCA', () => {
  const limites: [ie: number, penalty: Penalty][] = [
    [14999, null],
    [15000, null],
    [15001, '+2'],
    [16999, '+2'],
    [17000, '+2'],
    [17001, 'DNF'],
  ];

  it.each(limites)('largar com %i ms de inspeção dá %s', (ie, expected) => {
    const timer = createTimer({ now: () => 0, holdMs: 0, inspection: true });
    timer.press(0); timer.release(0);      // a inspeção começa em 0
    timer.press(ie - 100);                 // sem tempo de armar: pronto na hora
    timer.release(ie);
    timer.press(ie + 10000);
    expect(timer.result).toEqual({ ms: 10000, penalty: expected });
  });

  it('os avisos saem em 8 s e 12 s exatos, e não antes', () => {
    const timer = createTimer({ now: () => 0, holdMs: 300, inspection: true });
    const warns: number[] = [];
    timer.on('warn', (w) => warns.push(w));
    timer.press(0); timer.release(0);
    timer.tick(7999);
    expect(warns).toEqual([]);
    timer.tick(8000);
    expect(warns).toEqual([8000]);
    timer.tick(11999);
    expect(warns).toEqual([8000]);
    timer.tick(12000);
    expect(warns).toEqual([8000, 12000]);
  });
});

describe('cancel', () => {
  it('descarta o toque que iniciaria a inspeção', () => {
    const { timer } = rig({ inspection: true });
    timer.press();
    timer.cancel();
    timer.release();
    expect(timer.state).toBe(STATES.IDLE);
  });

  it('só mexe no armar e no pronto: o timer correndo ou parado fica como está', () => {
    const { timer, at } = rig({ holdMs: 0 });
    timer.press();
    timer.release();
    timer.cancel();
    expect(timer.state).toBe(STATES.RUNNING);
    at(1000);
    timer.press();
    timer.cancel();
    expect(timer.state).toBe(STATES.DONE);
  });
});

describe('eventos do timer', () => {
  it('state sai a cada mudança com o estado novo e o anterior; o retorno de on cancela a assinatura', () => {
    const c = clock();
    const timer = createTimer({ now: c.now, holdMs: 0, inspection: false });
    const changes: [TimerState, TimerState][] = [];
    const off = timer.on('state', (next, prev) => changes.push([next, prev]));
    timer.press(0); timer.release(0);
    c.set(500); timer.press(500);
    expect(changes).toEqual([['arming', 'idle'], ['ready', 'arming'], ['running', 'ready'], ['done', 'running']]);
    off();
    timer.reset();
    expect(changes).toHaveLength(4);
  });

  // Um ouvinte que lança não pode derrubar a máquina nem os outros ouvintes: é no 'done' que o solve é gravado.
  // Estes testes injetam onError. O padrão relança numa microtask, e o Vitest contaria isso como erro não tratado.
  it('um ouvinte de state que lança não impede o done: o resultado chega ao ouvinte do done', () => {
    const onError = vi.fn();
    const timer = createTimer({ now: () => 0, holdMs: 0, inspection: false, onError });
    const done: TimerResult[] = [];
    timer.on('state', (next) => {
      if (next === 'done') throw new Error('ouvinte de state quebrou');
    });
    timer.on('done', (r) => done.push(r));
    timer.press(0); timer.release(0);
    timer.press(1000);
    expect(timer.state).toBe('done');
    expect(done).toEqual([{ ms: 1000, penalty: null }]);
    expect(onError).toHaveBeenCalledTimes(1);     // o ouvinte lançou de verdade
  });

  it('um primeiro ouvinte de done que lança não pula o segundo', () => {
    const onError = vi.fn();
    const timer = createTimer({ now: () => 0, holdMs: 0, inspection: false, onError });
    const calls: string[] = [];
    timer.on('done', () => {
      calls.push('primeiro');
      throw new Error('primeiro quebrou');
    });
    timer.on('done', () => calls.push('segundo'));
    timer.press(0); timer.release(0);
    timer.press(1000);
    expect(calls).toEqual(['primeiro', 'segundo']);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('um ouvinte de warn que lança não trava o release: o timer larga como de costume', () => {
    const onError = vi.fn();
    const timer = createTimer({ now: () => 0, holdMs: 0, inspection: true, onError });
    timer.on('warn', () => {
      throw new Error('ouvinte de warn quebrou');
    });
    timer.press(0); timer.release(0);      // a inspeção começa em 0
    timer.press(7000);                     // pronto, ainda antes do primeiro aviso
    expect(timer.state).toBe('ready');
    timer.release(8100);                   // o primeiro aviso sai dentro deste release
    expect(timer.state).toBe('running');
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('o erro de um ouvinte chega ao onError com o valor lançado, e o timer não lança', () => {
    const onError = vi.fn();
    const timer = createTimer({ now: () => 0, holdMs: 300, inspection: false, onError });
    const boom = new Error('boom');
    timer.on('state', () => {
      throw boom;
    });
    expect(() => timer.press(0)).not.toThrow();
    expect(timer.state).toBe('arming');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('sem onError, o erro do ouvinte é relançado numa microtask, para seguir visível no navegador', () => {
    const agendadas: (() => void)[] = [];
    vi.stubGlobal('queueMicrotask', (cb: () => void) => {
      agendadas.push(cb);
    });
    try {
      const timer = createTimer({ now: () => 0, holdMs: 300, inspection: false });
      const boom = new Error('boom');
      timer.on('state', () => {
        throw boom;
      });
      expect(() => timer.press(0)).not.toThrow();
      expect(agendadas).toHaveLength(1);
      let relancado: unknown;
      try {
        agendadas[0]();
      } catch (err) {
        relancado = err;
      }
      expect(relancado).toBe(boom);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
