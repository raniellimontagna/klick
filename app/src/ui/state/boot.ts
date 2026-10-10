// Monta o que o app precisa para começar: o banco, o repositório, a fila de embaralhamentos e o estado inicial.
// Quem chama é a casca (App.svelte), que mostra o fundo enquanto isto não termina, e a mensagem de erro se falhar.
import { openKlickDb } from '../../data/db';
import { createRepository } from '../../data/repository';
import { generateScramble } from '../../scramble/cubing-loader';
import { createScrambleQueue } from '../../scramble/queue';
import { AppState } from './app.svelte';

export async function boot(): Promise<AppState> {
  const repo = createRepository(await openKlickDb());
  const queue = createScrambleQueue({ generate: (event) => generateScramble(event) });
  const app = new AppState({ repo, queue });
  await app.init();
  return app;
}
