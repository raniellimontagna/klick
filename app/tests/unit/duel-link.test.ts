import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MAX_DUEL_MS, MAX_DUEL_NAME, MAX_DUEL_PAYLOAD, decodeDuelLink, duelPayloadOf, duelUrl, encodeDuelLink, newLinkId } from '../../src/core/duel/link';
import type { DuelLink, DuelTime } from '../../src/core/types';

const times = (n = 7): DuelTime[] => Array.from({ length: n }, (_, i) => ({ ms: 9_000 + i * 837 + 13, penalty: i === 2 ? '+2' : i === 5 ? 'DNF' : null }));

// Sorteio determinístico (mulberry32) para os embaralhamentos de teste ficarem estáveis.
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// 3×3: 20 giros realistas (sem repetir a face do giro anterior).
function scramble333(rand: () => number): string {
  const faces = ['U', 'D', 'L', 'R', 'F', 'B'];
  const mods = ['', "'", '2'];
  const out: string[] = [];
  let last = '';
  while (out.length < 20) {
    const f = faces[Math.floor(rand() * 6)]!;
    if (f === last) continue;
    last = f;
    out.push(f + mods[Math.floor(rand() * 3)]!);
  }
  return out.join(' ');
}

// Megaminx (WCA/csTimer): 7 linhas de 10 giros R++/R--/D++/D-- seguidos de U ou U', ~77 giros.
function scrambleMinx(rand: () => number): string {
  const lines: string[] = [];
  for (let l = 0; l < 7; l++) {
    const moves: string[] = [];
    for (let i = 0; i < 5; i++) moves.push(`R${rand() < 0.5 ? '++' : '--'}`, `D${rand() < 0.5 ? '++' : '--'}`);
    moves.push(rand() < 0.5 ? 'U' : "U'");
    lines.push(moves.join(' '));
  }
  return lines.join('\n');
}

const link = (o: Partial<DuelLink> = {}): DuelLink => ({
  v: 1,
  id: 'abcd1234efgh5678',
  event: '333',
  scrambles: Array.from({ length: 7 }, (_, i) => `R U R' U' ${i}`),
  a: { name: 'Ana', times: times() },
  ...o,
});

// Embrulha um objeto qualquer como payload (com o zlib do Node, independente do código testado), para testar o que o decodificador recusa.
function payloadOf(value: unknown): string {
  return deflateRawSync(Buffer.from(JSON.stringify(value))).toString('base64url');
}

describe('o link do desafio (spec 4)', () => {
  it('o ambiente de teste tem CompressionStream', () => {
    expect(typeof CompressionStream).toBe('function');
  });

  it('ida e volta: o que sai de encodeDuelLink volta igual', async () => {
    const only = link({ a: { name: 'Zoé Conceição', times: times() } });
    const payload = await encodeDuelLink(only);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeDuelLink(payload)).toEqual(only);
    const answered = link({ a: { name: 'João Ávila', times: times() }, b: { name: 'Mônica Çelik', times: times(4) } });
    expect(await decodeDuelLink(await encodeDuelLink(answered))).toEqual(answered);
    const semNome = link({ a: { name: '', times: times() }, b: { name: '', times: times(1) } });
    expect(await decodeDuelLink(await encodeDuelLink(semNome))).toEqual(semNome);
  });

  it('um 3×3 cabe em menos de 2.000 caracteres e um megaminx em menos de MAX_DUEL_PAYLOAD', async () => {
    const rand = seeded(333);
    const l333 = link({ scrambles: Array.from({ length: 7 }, () => scramble333(rand)), b: { name: 'Bruno Silva', times: times() } });
    const p333 = await encodeDuelLink(l333);
    expect(p333.length).toBeLessThan(2_000);
    const lMinx = link({
      event: 'minx',
      scrambles: Array.from({ length: 7 }, () => scrambleMinx(rand)),
      b: { name: 'Bruno Silva', times: times() },
    });
    expect(lMinx.scrambles[0]!.split(/\s+/)).toHaveLength(77);
    const pMinx = await encodeDuelLink(lMinx);
    expect(pMinx.length).toBeLessThan(MAX_DUEL_PAYLOAD);
    expect(await decodeDuelLink(pMinx)).toEqual(lMinx);
  });

  it('link torto, cortado, de outra versão, com evento ou tempos inválidos dá null', async () => {
    const good = await encodeDuelLink(link());
    const bad = async (value: unknown) => expect(await decodeDuelLink(payloadOf(value))).toBeNull();
    const base = JSON.parse(JSON.stringify(link())) as Record<string, any>;
    const mut = (f: (o: Record<string, any>) => void) => {
      const o = structuredClone(base);
      f(o);
      return o;
    };
    expect(await decodeDuelLink('')).toBeNull();
    expect(await decodeDuelLink('isso não é base64!!')).toBeNull();
    expect(await decodeDuelLink(good.slice(0, good.length - 10))).toBeNull(); // cortado
    expect(await decodeDuelLink('AAAA')).toBeNull(); // base64 que não descomprime
    expect(await decodeDuelLink(payloadOf('texto'))).toBeNull();
    expect(await decodeDuelLink(payloadOf(null))).toBeNull();
    expect(await decodeDuelLink(payloadOf([1, 2]))).toBeNull();
    expect(await decodeDuelLink('x'.repeat(MAX_DUEL_PAYLOAD + 1))).toBeNull(); // grande demais
    await bad(mut((o) => (o.v = 2)));
    await bad(mut((o) => delete o.v));
    await bad(mut((o) => (o.id = 'curto')));
    await bad(mut((o) => (o.id = 'ABCD1234EFGH5678')));
    await bad(mut((o) => (o.id = 42)));
    await bad(mut((o) => (o.event = '999')));
    await bad(mut((o) => (o.scrambles = o.scrambles.slice(0, 6))));
    await bad(mut((o) => (o.scrambles = [...o.scrambles, 'R'])));
    await bad(mut((o) => (o.scrambles[3] = '')));
    await bad(mut((o) => (o.scrambles[3] = 7)));
    await bad(mut((o) => (o.scrambles[3] = 'R'.repeat(1_001))));
    await bad(mut((o) => delete o.a));
    await bad(mut((o) => (o.a.times = o.a.times.slice(0, 6))));
    await bad(mut((o) => (o.a.times[0].ms = -1)));
    await bad(mut((o) => (o.a.times[0].ms = 1.5)));
    await bad(mut((o) => (o.a.times[0].ms = '9000')));
    await bad(mut((o) => (o.a.times[0].penalty = '+4')));
    await bad(mut((o) => delete o.a.times[0].penalty));
    await bad(mut((o) => (o.b = { name: 'B', times: [] })));
    await bad(mut((o) => (o.b = { name: 'B', times: times(8) })));
    await bad(mut((o) => (o.b = { name: 'B', times: [{ ms: 1, penalty: 'x' }] })));
    await bad(mut((o) => (o.b = 'B')));
  });

  it('bomba de descompressão: um JSON válido com 100 KB de espaços não passa do teto de 64 KiB', async () => {
    const json = JSON.stringify(link()) + ' '.repeat(100_000); // JSON.parse aceita o espaço no fim: só o teto recusa
    const payload = deflateRawSync(Buffer.from(json)).toString('base64url');
    expect(payload.length).toBeLessThan(MAX_DUEL_PAYLOAD); // cabe no limite do payload, então o teto é o único freio
    expect(await decodeDuelLink(payload)).toBeNull();
    // o mesmo link sem o excesso abre
    expect(await decodeDuelLink(payloadOf(link()))).toEqual(link());
  });

  it('o tempo tem teto de 24 h: acima disso o link não abre', async () => {
    expect(MAX_DUEL_MS).toBe(86_400_000);
    const edit = (ms: number) => {
      const o = JSON.parse(JSON.stringify(link())) as Record<string, any>;
      o.a.times[0].ms = ms;
      return o;
    };
    expect((await decodeDuelLink(payloadOf(edit(MAX_DUEL_MS))))?.a.times[0]?.ms).toBe(MAX_DUEL_MS);
    expect(await decodeDuelLink(payloadOf(edit(MAX_DUEL_MS + 1)))).toBeNull();
    const o = JSON.parse(JSON.stringify(link({ b: { name: 'B', times: times(1) } }))) as Record<string, any>;
    o.b.times[0].ms = MAX_DUEL_MS + 1;
    expect(await decodeDuelLink(payloadOf(o))).toBeNull();
  });

  it('nome comprido ou não string vira vazio sem recusar o link', async () => {
    expect(MAX_DUEL_NAME).toBe(20);
    const long = 'x'.repeat(MAX_DUEL_NAME + 1);
    const decoded = await decodeDuelLink(await encodeDuelLink(link({ a: { name: long, times: times() }, b: { name: 'Bia', times: times(2) } })));
    expect(decoded?.a.name).toBe('');
    expect(decoded?.b?.name).toBe('Bia');
    const raw = JSON.parse(JSON.stringify(link({ b: { name: 'Bia', times: times(2) } }))) as Record<string, any>;
    raw.a.name = 42;
    raw.b.name = null;
    const odd = await decodeDuelLink(payloadOf(raw));
    expect(odd?.a.name).toBe('');
    expect(odd?.b?.name).toBe('');
    raw.a.name = '  Caio  ';
    delete raw.b.name;
    const trimmed = await decodeDuelLink(payloadOf(raw));
    expect(trimmed?.a.name).toBe('Caio');
    expect(trimmed?.b?.name).toBe('');
    raw.a.name = `  ${'y'.repeat(MAX_DUEL_NAME)}  `; // 20 depois do trim: cabe
    expect((await decodeDuelLink(payloadOf(raw)))?.a.name).toBe('y'.repeat(MAX_DUEL_NAME));
  });

  // O JSON escreve um caractere de controle (e a metade solta de um par UTF-16) como \uXXXX, seis caracteres: sete embaralhamentos assim
  // passariam do tamanho que o sync aceita, e o desafio salvo ficaria só neste aparelho. O link que os traz não abre (revisão da Task 3).
  it('caracteres de controle no embaralhamento recusam o link; no nome, o nome vira vazio', async () => {
    const crafted = link({ scrambles: Array.from({ length: 7 }, () => '\u0001'.repeat(1_000)) });
    const payload = await encodeDuelLink(crafted);
    expect(payload.length).toBeLessThan(MAX_DUEL_PAYLOAD); // comprime bem: só a regra dos caracteres o recusa
    expect(await decodeDuelLink(payload)).toBeNull();
    const last = (text: string) => link({ scrambles: [...link().scrambles.slice(0, 6), text] });
    for (const ch of ['\u0000', '\t', '\r', '\u001f', '\u007f', '\ud800', '\udc00']) {
      expect(await decodeDuelLink(payloadOf(last(`R U${ch} F`))), JSON.stringify(ch)).toBeNull();
    }
    // A quebra de linha do megaminx e um par UTF-16 inteiro continuam valendo.
    expect((await decodeDuelLink(payloadOf(last('R++ D--\nU'))))?.scrambles[6]).toBe('R++ D--\nU');
    expect((await decodeDuelLink(payloadOf(last('R U 🧊'))))?.scrambles[6]).toBe('R U 🧊');
    const named = await decodeDuelLink(payloadOf(link({ a: { name: 'Ana\u0000', times: times() }, b: { name: 'B\u0007ia', times: times(1) } })));
    expect([named?.a.name, named?.b?.name]).toEqual(['', '']);
    expect((await decodeDuelLink(payloadOf(link({ a: { name: 'Ana 🧊', times: times() } }))))?.a.name).toBe('Ana 🧊');
  });

  it('duelPayloadOf lê #desafio= e ignora outros fragmentos', () => {
    expect(duelPayloadOf('#desafio=abc_-123')).toBe('abc_-123');
    expect(duelPayloadOf('desafio=abc')).toBe('abc');
    expect(duelPayloadOf('#outra=abc')).toBeNull();
    expect(duelPayloadOf('#')).toBeNull();
    expect(duelPayloadOf('')).toBeNull();
    expect(duelPayloadOf('#desafio=')).toBeNull();
    expect(duelPayloadOf('#x=1&desafio=abc')).toBeNull();
    expect(duelUrl('https://klick.ranimontagna.com', 'abc')).toBe('https://klick.ranimontagna.com/#desafio=abc');
  });

  it('newLinkId: 16 caracteres [a-z0-9], com sorteio injetado ou criptográfico', () => {
    expect(newLinkId(() => 0)).toBe('aaaaaaaaaaaaaaaa');
    expect(newLinkId(() => 0.999999)).toBe('9999999999999999');
    expect(newLinkId(() => 1)).toBe('9999999999999999'); // um sorteio que devolve 1 não sai do alfabeto
    for (const id of [newLinkId(), newLinkId()]) expect(id).toMatch(/^[a-z0-9]{16}$/);
    expect(newLinkId()).not.toBe(newLinkId());
  });
});
