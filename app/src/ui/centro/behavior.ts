// Os comportamentos do Centro no tempo (spec do sub-projeto 3, seção 6.3): piscar, olhadinha, órbita, respiração, salto do recorde,
// piscada da face de cima e a piscada azul da face lateral (uma etapa da trilha marcada, spec do sub-projeto 4, seção 8.4). Puro: o relógio chega por parâmetro e o sorteio é injetado, então os testes repetem tudo igual. Quem
// desenha (animator.ts) pergunta o que aparece agora (overlay), se algo se move (busy) e quando é o próximo evento (nextAt).

export type Mood = 'idle' | 'inspect' | 'arming' | 'ready' | 'running' | 'reaction' | 'sleep';

export interface Overlay {
  blink: number; // 0 aberto … 1 fechado: puxa a abertura para o traço
  lookX: number; // olhadinha, em unidades do SVG
  lift: number; // salto: unidades para cima
  squash: number; // escala vertical do corpo (1 = normal)
  topDim: number; // 0 … 1: quanto a face de cima apaga na piscada do fim de temporada
  sideDim: number; // 0 … 1: quanto a face lateral apaga na piscada da trilha
}

export const REST: Readonly<Overlay> = Object.freeze({ blink: 0, lookX: 0, lift: 0, squash: 1, topDim: 0, sideDim: 0 });

export const TIMING = Object.freeze({
  blinkGap: [2000, 7000] as const, // entre uma piscada e a próxima
  blinkClose: 60,
  blinkOpen: 120,
  doubleRate: 0.1, // piscadas duplas
  doubleGap: 80, // entre as duas da dupla
  lookGap: [3000, 8000] as const,
  lookHold: [600, 1500] as const,
  lookReach: 1.6,
  jump: 400,
  jumpUp: 4,
  flash: 600,
  sideFlash: 400, // a piscada da face lateral: mais curta que a de cima
  orbit: 950, // um passo da órbita do adesivo ocioso
  breath: 2000, // meia respiração (o ciclo é de 4 s)
});

const BLINK_MS = TIMING.blinkClose + TIMING.blinkOpen;
const DOUBLE_MS = 2 * BLINK_MS + TIMING.doubleGap;

export interface Behavior {
  setMood(mood: Mood, now: number): void; // o estado do Centro; trocar de estado recomeça as agendas
  setAnimated(on: boolean, now: number): void; // estático: nada se move, nada é agendado
  trigger(kind: 'pb' | 'seasonEnd' | 'trailStep', now: number): void; // salto do recorde, piscada da face de cima, piscada da face lateral
  overlay(now: number): Overlay; // o que aparece agora por cima da expressão
  orbit(now: number): number | null; // passos da órbita desde que o parado começou; null fora do parado ou no estático
  breath(now: number): boolean | null; // dormindo e animado: true na metade apagada do ciclo
  busy(now: number): boolean; // algo se move agora (pede quadro)
  nextAt(now: number): number | null; // o próximo instante em que algo começa ou muda (para o setTimeout); null: nada agendado
}

const between = (rng: () => number, [lo, hi]: readonly [number, number]): number => lo + rng() * (hi - lo);

// Fechamento de uma piscada t ms depois do começo: fecha em 60 ms e abre em 120 ms.
function blinkCurve(t: number): number {
  if (t < 0 || t >= BLINK_MS) return 0;
  return t < TIMING.blinkClose ? t / TIMING.blinkClose : 1 - (t - TIMING.blinkClose) / TIMING.blinkOpen;
}

export function createBehavior(rng: () => number = Math.random): Behavior {
  let mood: Mood | null = null;
  let since = 0;
  let animated = true;
  let blink: { at: number; double: boolean } | null = null;
  let look: { at: number; until: number; x: number } | null = null;
  let jumpAt: number | null = null;
  let flashAt: number | null = null;
  let sideAt: number | null = null;

  const blinkLength = (b: { double: boolean }): number => (b.double ? DOUBLE_MS : BLINK_MS);

  function planBlink(from: number): void {
    blink = animated && (mood === 'idle' || mood === 'inspect') ? { at: from + between(rng, TIMING.blinkGap), double: rng() < TIMING.doubleRate } : null;
  }

  function planLook(from: number): void {
    if (!animated || mood !== 'idle') {
      look = null;
      return;
    }
    const at = from + between(rng, TIMING.lookGap);
    look = { at, until: at + between(rng, TIMING.lookHold), x: (rng() < 0.5 ? -1 : 1) * TIMING.lookReach };
  }

  function restart(now: number): void {
    since = now;
    planBlink(now);
    planLook(now);
  }

  // Passa o que já terminou e agenda o seguinte.
  function advance(now: number): void {
    while (blink && now >= blink.at + blinkLength(blink)) planBlink(blink.at + blinkLength(blink));
    while (look && now >= look.until) planLook(look.until);
    if (jumpAt !== null && now >= jumpAt + TIMING.jump) jumpAt = null;
    if (flashAt !== null && now >= flashAt + TIMING.flash) flashAt = null;
    if (sideAt !== null && now >= sideAt + TIMING.sideFlash) sideAt = null;
  }

  return {
    setMood(next, now) {
      if (next === mood) return;
      mood = next;
      restart(now);
      // O salto e a piscada da face de cima são da reação: qualquer outro estado (segurar de novo, o solve) os cancela.
      if (next !== 'reaction') {
        jumpAt = null;
        flashAt = null;
      }
      // A piscada da face lateral vem do parado (a Trilha) ou da reação: segurar de novo ou o solve a cancelam.
      if (next !== 'reaction' && next !== 'idle') sideAt = null;
    },
    setAnimated(on, now) {
      if (on === animated) return;
      animated = on;
      restart(now);
      if (!on) {
        jumpAt = null;
        flashAt = null;
        sideAt = null;
      }
    },
    trigger(kind, now) {
      if (!animated || mood === 'running') return;
      if (kind === 'pb') jumpAt = now;
      else if (kind === 'trailStep') sideAt = now;
      else flashAt = now;
    },
    overlay(now) {
      advance(now);
      let b = 0;
      if (blink) {
        const t = now - blink.at;
        b = Math.max(blinkCurve(t), blink.double ? blinkCurve(t - BLINK_MS - TIMING.doubleGap) : 0);
      }
      const lookX = look && now >= look.at && now < look.until ? look.x : 0;
      let lift = 0;
      let squash = 1;
      if (jumpAt !== null) {
        const t = (now - jumpAt) / TIMING.jump;
        lift = TIMING.jumpUp * Math.sin(Math.PI * t);
        if (t > 0.7) squash = 1 - 0.06 * Math.sin((Math.PI * (t - 0.7)) / 0.3);
      }
      const topDim = flashAt !== null ? 0.7 * Math.sin((Math.PI * (now - flashAt)) / TIMING.flash) : 0;
      const sideDim = sideAt !== null ? 0.7 * Math.sin((Math.PI * (now - sideAt)) / TIMING.sideFlash) : 0;
      return { blink: b, lookX, lift, squash, topDim, sideDim };
    },
    orbit(now) {
      return animated && mood === 'idle' ? Math.floor((now - since) / TIMING.orbit) : null;
    },
    breath(now) {
      return animated && mood === 'sleep' ? Math.floor((now - since) / TIMING.breath) % 2 === 1 : null;
    },
    busy(now) {
      advance(now);
      return (blink !== null && now >= blink.at) || jumpAt !== null || flashAt !== null || sideAt !== null;
    },
    nextAt(now) {
      advance(now);
      const times: number[] = [];
      if (blink) times.push(blink.at);
      if (look) times.push(now < look.at ? look.at : look.until);
      if (animated && mood === 'idle') times.push(since + (Math.floor((now - since) / TIMING.orbit) + 1) * TIMING.orbit);
      if (animated && mood === 'sleep') times.push(since + (Math.floor((now - since) / TIMING.breath) + 1) * TIMING.breath);
      const future = times.filter((t) => t > now);
      return future.length > 0 ? Math.min(...future) : null;
    },
  };
}
