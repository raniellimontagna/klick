// Monta o que o app precisa para começar: o banco, o repositório, a fila de embaralhamentos e o estado inicial.
// Quem chama é a casca (App.svelte), que mostra o fundo enquanto isto não termina, e a mensagem de erro se falhar.
import { DB_NAME, openKlickDb } from '../../data/db';
import { createRepository, createSender } from '../../data/repository';
import { generateScramble } from '../../scramble/cubing-loader';
import { createScrambleQueue } from '../../scramble/queue';
import { AppState } from './app.svelte';
import { clearingCloseOthers, dbEvents } from './db-notice.svelte';

export async function boot(): Promise<AppState> {
  let app: AppState | undefined;
  const events = dbEvents(() => app);
  // Uma abertura que esperou outra aba largar o banco tira o aviso quando termina (também se falhar).
  const open = () => clearingCloseOthers(openKlickDb(DB_NAME, events));
  const sender = createSender(); // o mesmo em todas as conexões desta página: a sequência dos avisos continua depois de reabrir
  const repo = createRepository(await open(), { sender });
  const queue = createScrambleQueue({ generate: (event) => generateScramble(event) });
  // A conexão nova para quando o iOS derruba a antiga (o AppState chama isto ao receber um erro de conexão).
  app = new AppState({ repo, queue, reopen: async () => createRepository(await open(), { sender }) });
  await app.init();
  return app;
}
