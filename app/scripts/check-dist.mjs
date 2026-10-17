// Confere que dist/ tem um build de verdade antes de qualquer deploy (wrangler.jsonc, build.command). O vitest.worker.config.ts cria um
// dist/ vazio (o plugin pede que ele exista): sem esta conferência, `wrangler deploy` num clone novo publicaria um site vazio para todo
// mundo. Um build de verdade tem o index.html com o script do app, os arquivos que ele cita e o service worker (sw.js).
//
//   node scripts/check-dist.mjs [pasta]   (padrão: dist, ao lado deste script)
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * O que falta em `dir` para ele ser um build do app. Vazio: pode publicar.
 * @param {string} dir
 * @returns {string[]}
 */
export function distProblems(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [`${dir} não existe: rode o build antes de publicar`];
  const index = join(dir, 'index.html');
  if (!existsSync(index)) return [`${index} não existe: rode o build antes de publicar`];
  const html = readFileSync(index, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const problems = [];
  if (scripts.length === 0) problems.push(`${index} não tem o script do app (assets/*.js): não é o build do Vite`);
  for (const file of scripts) if (!existsSync(join(dir, file))) problems.push(`${file}, que o index.html carrega, não está em ${dir}`);
  if (!existsSync(join(dir, 'sw.js'))) problems.push(`${join(dir, 'sw.js')} não existe: o build do PWA não rodou`);
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist'));
  const problems = distProblems(dir);
  if (problems.length > 0) {
    console.error(`Deploy recusado: ${dir} não é um build do app.`);
    for (const p of problems) console.error(`- ${p}`);
    console.error('Publique com `pnpm run deploy:beta` ou `pnpm run deploy:production`, que fazem o build antes.');
    process.exit(1);
  }
  console.log(`dist conferido: ${dir}`);
}
