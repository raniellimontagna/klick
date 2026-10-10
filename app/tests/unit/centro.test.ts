import { describe, expect, it } from 'vitest';
import { PALETTES, RING_ORDER, eyesFor, paletteFor, renderCentro, ringFor, updateCentro } from '../../src/ui/centro';

const N = null;

// Casos portados de prototype/tests/centro.test.js.
describe('Centro', () => {
  it('a ordem do anel é horária a partir do canto superior esquerdo', () => {
    expect([...RING_ORDER]).toEqual([0, 1, 2, 5, 8, 7, 6, 3]);
  });

  it('anel no parado: só o adesivo da órbita', () => {
    expect(ringFor({ state: 'idle', orbit: 10 })).toEqual([N, N, 'idle', N, N, N, N, N]);
    expect(ringFor({ state: 'idle' })).toEqual(Array(8).fill(N));
  });

  it('anel na inspeção esvazia e muda de cor aos 8 e 12 s', () => {
    expect(ringFor({ state: 'inspect', inspectElapsed: 0 })).toEqual(Array(8).fill('U'));
    expect(ringFor({ state: 'inspect', inspectElapsed: 7000 })).toEqual(['U', 'U', 'U', 'U', 'U', N, N, N]);
    expect(ringFor({ state: 'inspect', inspectElapsed: 9000 })).toEqual(['amber', 'amber', 'amber', 'amber', N, N, N, N]);
    expect(ringFor({ state: 'inspect', inspectElapsed: 13000 })).toEqual(['orange', 'orange', N, N, N, N, N, N]);
    expect(ringFor({ state: 'inspect', inspectElapsed: 16000 })).toEqual(['amber', 'amber', N, N, N, N, N, N]);
    expect(ringFor({ state: 'inspect', inspectElapsed: 18000 })).toEqual(['red', N, 'red', N, 'red', N, 'red', N]);
  });

  it('anel armando enche de vermelho; pronto fica todo verde; resolvendo apaga', () => {
    expect(ringFor({ state: 'arming', armProgress: 0.5 })).toEqual(['red', 'red', 'red', 'red', N, N, N, N]);
    expect(ringFor({ state: 'ready' })).toEqual(Array(8).fill('green'));
    expect(ringFor({ state: 'running' })).toEqual(Array(8).fill(N));
  });

  it('anel e olhos da reação ao resultado', () => {
    expect(ringFor({ state: 'reaction', result: 'pb' })).toEqual(['U', 'R', 'F', 'D', 'L', 'B', 'R', 'F']);
    expect(ringFor({ state: 'reaction', result: 'good' })).toEqual(['green', 'green', 'green', 'green', 'green', 'green', N, N]);
    expect(ringFor({ state: 'reaction', result: 'slow' })).toEqual(['amber', 'amber', 'amber', N, N, N, N, N]);
    expect(ringFor({ state: 'reaction', result: 'plus2' })).toEqual(['amber', 'amber', N, N, N, N, N, N]);
    expect(ringFor({ state: 'reaction', result: 'dnf' })).toEqual(['red', N, 'red', N, 'red', N, 'red', N]);
    expect(eyesFor({ state: 'reaction', result: 'pb' })).toBe('happy');
    expect(eyesFor({ state: 'reaction', result: 'dnf' })).toBe('half');
    expect(eyesFor({ state: 'reaction', result: 'good' })).toBe('open');
  });

  it('olhos por estado', () => {
    expect(eyesFor({ state: 'idle' })).toBe('open');
    expect(eyesFor({ state: 'arming' })).toBe('half');
    expect(eyesFor({ state: 'ready' })).toBe('focus');
    expect(eyesFor({ state: 'running' })).toBe('focus');
    expect(eyesFor({ state: 'sleep' })).toBe('sleep');
    expect(ringFor({ state: 'sleep' })).toEqual(['sleep', N, 'sleep', N, 'sleep', N, 'sleep', N]);
  });

  it('renderCentro pinta o anel, mostra só os olhos pedidos e acende a evolução', () => {
    const svg = renderCentro({ theme: 'light', ring: ['red', N, N, N, N, N, N, N], eyes: 'half', topLit: 6, sideLit: 4 });
    expect((svg.match(/class="ring/g) || []).length).toBe(8);
    expect(svg).toMatch(/class="ring lit" data-k="0"/);
    expect(svg).toMatch(/data-e="half" opacity="1"/);
    expect(svg).toMatch(/data-e="open" opacity="0"/);
    const gold = PALETTES.light.gold;
    const trail = PALETTES.light.trail;
    expect(svg.split(`fill="${gold}"`).length - 1).toBe(6);
    expect(svg.split(`fill="${trail}"`).length - 1).toBe(4);
  });

  it('acabamentos mudam o corpo; o tema escuro tem brilho nos adesivos acesos', () => {
    expect(paletteFor('light', 'gelo').body).toBe('#9FC3D6');
    expect(renderCentro({ finish: 'carbono' })).toMatch(/fill="url\(#ct\d+c\)"/);
    expect(renderCentro({ finish: 'brilho' })).toMatch(/fill="url\(#ct\d+g\)"/);
    expect(renderCentro({ theme: 'dark', ring: Array(8).fill('green') })).toMatch(/drop-shadow\(0 0 2.2px/);
    expect(renderCentro({ theme: 'light', ring: Array(8).fill('green') })).not.toMatch(/drop-shadow/);
  });

  // Um SVG de mentira com só o que updateCentro toca: dataset, querySelectorAll, setAttribute, classList e style.
  interface StubEl {
    dataset: Record<string, string>;
    attrs: Record<string, string>;
    style: { filter?: string };
    cls: Set<string>;
    setAttribute(name: string, value: string): void;
    classList: { toggle(name: string, on?: boolean): void };
  }
  function stubSvg(theme: string) {
    const mk = (data: Record<string, string>): StubEl => {
      const el: StubEl = {
        dataset: data,
        attrs: {},
        style: {},
        cls: new Set(),
        setAttribute: (name, value) => {
          el.attrs[name] = value;
        },
        classList: {
          toggle: (name, on) => {
            if (on) el.cls.add(name);
            else el.cls.delete(name);
          },
        },
      };
      return el;
    };
    const rings = Array.from({ length: 8 }, (_, k) => mk({ k: String(k) }));
    const eyes = ['open', 'half', 'focus', 'happy', 'sleep'].map((e) => mk({ e }));
    const svg = {
      dataset: { theme, finish: 'fosco' } as Record<string, string>,
      rings,
      eyes,
      querySelectorAll: (sel: string) => (sel === '.ring' ? rings : sel === '.eyes' ? eyes : []),
    };
    return svg;
  }

  it('updateCentro usa o tema do próprio SVG e pinta anel e olhos', () => {
    const svg = stubSvg('dark');
    updateCentro(svg as unknown as SVGElement, { ring: ['green', N, N, N, N, N, N, N], eyes: 'focus' });
    expect(svg.rings[0].attrs.fill).toBe(PALETTES.dark.green);
    expect(svg.rings[0].style.filter).toMatch(/drop-shadow\(0 0 2.2px/);
    expect(svg.rings[0].cls.has('lit')).toBe(true);
    expect(svg.rings[1].attrs.fill).toBe(PALETTES.dark.off);
    expect(svg.dataset.eyes).toBe('focus');
    expect(svg.eyes.find((g) => g.dataset.e === 'focus')?.attrs.opacity).toBe('1');
    expect(svg.eyes.find((g) => g.dataset.e === 'open')?.attrs.opacity).toBe('0');
    expect(renderCentro({ theme: 'dark' })).toMatch(/data-theme="dark"/);
  });

  it('na inspeção, depois de 15 s os olhos ficam semicerrados', () => {
    expect(eyesFor({ state: 'inspect', inspectElapsed: 9000 })).toBe('open');
    expect(eyesFor({ state: 'inspect', inspectElapsed: 16000 })).toBe('half');
    expect(eyesFor({ state: 'inspect', inspectElapsed: 18000 })).toBe('half');
  });
});

// O stub acima só prova o que updateCentro faz com o que ele espera. Aqui o SVG é o que renderCentro gera, interpretado
// pelo jsdom: se os dois discordarem do contrato (classes, data-k, data-e, data-theme), este teste cai.
describe('Centro no DOM', () => {
  const mount = (html: string): SVGElement => {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.querySelector('svg') as SVGElement;
  };

  it('updateCentro atualiza o SVG gerado por renderCentro, com o tema e o acabamento dele', () => {
    const svg = mount(renderCentro({ theme: 'dark', finish: 'gelo', ring: ['red', N, N, N, N, N, N, N], eyes: 'open' }));
    const rings = svg.querySelectorAll<SVGElement>('.ring');
    expect(rings).toHaveLength(8);
    expect(rings[0].getAttribute('fill')).toBe(PALETTES.dark.red);

    updateCentro(svg, { ring: [N, 'green', N, N, N, N, N, N], eyes: 'happy' });
    const dark = paletteFor('dark', 'gelo');
    expect(rings[0].getAttribute('fill')).toBe(dark.off);
    expect(rings[0].classList.contains('lit')).toBe(false);
    expect(rings[0].style.filter).toBe('');
    expect(rings[1].getAttribute('fill')).toBe(dark.green);
    expect(rings[1].classList.contains('lit')).toBe(true);
    expect(rings[1].style.filter).toMatch(/drop-shadow\(0 0 2.2px/);
    expect(svg.dataset.eyes).toBe('happy');
    expect(svg.querySelector('[data-e="happy"]')?.getAttribute('opacity')).toBe('1');
    expect(svg.querySelector('[data-e="open"]')?.getAttribute('opacity')).toBe('0');
  });

  it('updateCentro aceita trocar o tema na chamada e ignora um SVG ausente', () => {
    const svg = mount(renderCentro({ theme: 'light' }));
    updateCentro(svg, { ring: ['green', N, N, N, N, N, N, N], theme: 'dark' });
    expect(svg.querySelector('.ring')?.getAttribute('fill')).toBe(PALETTES.dark.green);
    expect(() => updateCentro(null, { eyes: 'open' })).not.toThrow();
    expect(() => updateCentro(undefined)).not.toThrow();
  });

  it('o rótulo e o acabamento chegam ao SVG sem abrir o atributo', () => {
    const svg = mount(renderCentro({ label: 'Centro: "3" de 9 <marcos>', finish: 'fosco' }));
    expect(svg.getAttribute('aria-label')).toBe('Centro: "3" de 9 <marcos>');
    expect(svg.dataset.finish).toBe('fosco');
    expect(mount(renderCentro({ finish: '"><i>' as never })).dataset.finish).toBe('fosco');
  });

  it('sem rótulo, o nome acessível do SVG é "Centro"', () => {
    expect(mount(renderCentro()).getAttribute('aria-label')).toBe('Centro');
  });
});
