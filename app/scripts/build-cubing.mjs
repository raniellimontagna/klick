// Empacota o cubing.js com esbuild em public/vendor/cubing. O Vite não consegue empacotar o worker
// de embaralhamento do cubing.js, então ele é servido à parte e importado em runtime.
import { build } from 'esbuild';

await build({
  entryPoints: {
    cubing: 'scripts/cubing-entry.js',
    'search-worker-entry': 'node_modules/cubing/dist/lib/cubing/chunks/search-worker-entry.js',
  },
  bundle: true,
  splitting: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  outdir: 'public/vendor/cubing',
  entryNames: '[name]',
  chunkNames: 'chunk-[hash]',
  logLevel: 'warning',
});
console.log('cubing empacotado em public/vendor/cubing');
