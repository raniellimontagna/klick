import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O Worker importa src/core/sync (spec 6.3): nada ali pode puxar o navegador, o banco ou a tela. Só imports dentro de src/core.
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/core/sync');

describe('src/core/sync é puro', () => {
  it('nenhum arquivo importa de fora de src/core', () => {
    const outside: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const text = readFileSync(resolve(dir, file), 'utf8');
      for (const m of text.matchAll(/from '([^']+)'/g)) {
        const target = m[1].startsWith('.') ? resolve(dir, m[1]) : m[1];
        if (!target.startsWith(resolve(dir, '..'))) outside.push(`${file}: ${m[1]}`);
      }
      if (/\b(window|document|indexedDB|localStorage|navigator)\b/.test(text)) outside.push(`${file}: usa API do navegador`);
    }
    expect(outside).toEqual([]);
  });
});
