import { describe, expect, it } from 'vitest';
import { codeEmail } from '../../worker/mail';

const INK = '#17171a';
const RED = '#d93d42';

describe('o e-mail do código (spec 4 do visual da conta)', () => {
  const { subject, text, html } = codeEmail('482913');

  it('o assunto e o texto puro não mudam', () => {
    expect(subject).toBe('Seu código do Klick: 482913');
    expect(text).toBe('Seu código para entrar no Klick: 482913\n\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.\n');
  });

  it('seis peças, em ordem, a quinta vermelha', () => {
    const pieces = [...html.matchAll(/data-digit="(\d)"[^>]*style="([^"]*)"[^>]*>\s*(\d)\s*</g)];
    expect(pieces).toHaveLength(6);
    expect(pieces.map((p) => p[3])).toEqual(['4', '8', '2', '9', '1', '3']);
    for (const p of pieces) expect(p[1]).toBe(p[3]);
    pieces.forEach((p, i) => {
      expect(p[2]).toContain(i === 4 ? RED : INK);
      if (i !== 4) expect(p[2]).not.toContain(RED);
    });
  });

  it('os textos da direção B e a linha para copiar', () => {
    const plain = html.replace(/<[^>]+>/g, ' ');
    for (const s of ['Seu código do Klick', 'Vale por 10 minutos.', 'Código: 482913', 'Se não foi você, ignore este e-mail.', 'Klick · timer de cubo mágico']) {
      expect(plain).toContain(s);
    }
  });

  it('e-mail de verdade: só claro, sem imagem, script, fonte ou recurso externo', () => {
    expect(html).toContain('<meta name="color-scheme" content="light"');
    expect(html).toMatch(/display:none[^"]*"[^>]*>\s*Vale por 10 minutos\./); // o pré-cabeçalho escondido
    expect(html).toContain('max-width:480px');
    expect(html).not.toMatch(/<img|<script|<link|@import|url\(|https?:\/\//i);
  });

  it('o cubo do topo: 9 peças, o centro vermelho', () => {
    const cube = [...html.matchAll(/data-cube-piece="(\d)"[^>]*style="([^"]*)"/g)];
    expect(cube).toHaveLength(9);
    cube.forEach((p, i) => {
      expect(p[1]).toBe(String(i));
      expect(p[2]).toContain(i === 4 ? RED : INK);
    });
  });
});
