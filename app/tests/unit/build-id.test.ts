import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BUILD_ID } from '../../src/build';

// A versão do app (a revisão final, I2): o sync anota a versão que recusou algo do servidor e, na primeira abertura de outra, baixa a conta
// de novo. Ela vem do build (vite.config.ts, define), uma por build; fora dele (os testes), 'dev'.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('a versão do app', () => {
  it('o vite.config.ts grava um id por build em __KLICK_BUILD__', () => {
    const config = readFileSync(resolve(app, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/define:\s*\{\s*__KLICK_BUILD__:\s*JSON\.stringify\(/);
  });

  it('fora do build, a versão é "dev"', () => {
    expect(BUILD_ID).toBe('dev');
  });
});
