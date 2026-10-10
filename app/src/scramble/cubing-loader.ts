import type { EventId } from '../core/types';
import { eventInfo } from '../core/events';

export interface CubingModule {
  randomScrambleForEvent(eventId: string): Promise<{ toString(): string }>;
  TwistyPlayer: new (config: Record<string, unknown>) => HTMLElement;
}

let cached: Promise<CubingModule> | null = null;
// Quantas cargas já falharam. A próxima tentativa leva ?r=<tentativas> na URL, porque o mapa de módulos do navegador guarda o fetch que falhou para a mesma URL.
// Só a URL do ponto de entrada muda: os chunks do cubing.js são importados por caminho relativo fixo, então um chunk que falhou pode continuar falhando até recarregar a página.
let tentativas = 0;

// Carrega o cubing.js uma vez e guarda a promessa. Se a carga falha, o cache é zerado e a próxima chamada tenta de novo.
// O importador só entra na primeira carga e depois de uma falha: com módulo em cache, ele é ignorado.
export function loadCubing(
  importer: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url),
): Promise<CubingModule> {
  if (!cached) {
    const base = `${location.origin}${import.meta.env.BASE_URL}vendor/cubing/cubing.js`;
    const url = tentativas === 0 ? base : `${base}?r=${tentativas}`;
    // O new Promise transforma um throw síncrono do importador em rejeição.
    const carga = new Promise<unknown>((resolve) => resolve(importer(url))) as Promise<CubingModule>;
    cached = carga;
    carga.catch(() => {
      tentativas += 1;
      if (cached === carga) cached = null;
    });
  }
  return cached;
}

// O prazo cobre a carga e a geração: um worker que morre depois de subir deixaria a promessa pendente para sempre.
export async function generateScramble(
  event: EventId,
  o: { load?: () => Promise<CubingModule>; timeoutMs?: number } = {},
): Promise<string> {
  const load = o.load ?? (() => loadCubing());
  const timeoutMs = o.timeoutMs ?? 20000;
  let rejeita!: (motivo: Error) => void;
  const prazo = new Promise<never>((_, reject) => {
    rejeita = reject;
  });
  const relogio: ReturnType<typeof setTimeout> = setTimeout(() => rejeita(new Error('timeout')), timeoutMs);
  try {
    const sorteio = load()
      .then((cubing) => cubing.randomScrambleForEvent(eventInfo(event).scrambleId))
      .then((alg) => alg.toString());
    // `return await` mantém o relógio ligado até a corrida terminar; sem o await, o finally limparia cedo demais.
    return await Promise.race([sorteio, prazo]);
  } finally {
    clearTimeout(relogio);
  }
}
