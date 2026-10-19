// O desafio por link na tela (spec do desafio, seções 3 a 6, e a maquete aprovada): um modo do Timer, não uma tela à parte. Guarda a fase
// que a tela mostra e o desafio aberto. Cada mudança que precisa sobreviver a recarregar é gravada antes de a fase mudar: o solve, a
// penalidade de B conferida, a revelação e o estado. Os tempos do desafio ficam só no registro dele, nunca em `solves`.
//
// As ações que gravam andam numa fila, na ordem em que foram pedidas: cada uma lê o desafio que a anterior deixou. `epoch` sobe a cada
// troca de desafio (sair, começar, continuar, abrir um link): o que termina depois disso grava, mas não mexe mais na tela.
//
// A tela grava o registro inteiro a partir da cópia dela, e só sobre o registro que leu (expectUpdatedAt, conferido na transação). Se ele
// mudou por fora (outra aba, o sync, uma restauração, um wipe), a ação é largada e a tela volta ao que está gravado: uma aba que ficou
// para trás não refaz um embaralhamento que a outra já revelou.
import { cleanDuelName, decodeDuelLink, duelUrl, encodeDuelLink, isDuelScramble, newLinkId } from '../../core/duel/link';
import { DUEL_SCRAMBLES, type DuelScore, scoreDuel } from '../../core/duel/score';
import type { Duel, DuelLink, DuelSide, DuelTime, EventId, Penalty } from '../../core/types';
import { type ChangeKind, DuelConflictError, type Repository } from '../../data/repository';
import { generateScramble } from '../../scramble/cubing-loader';
import { T } from '../../strings';

// idle: o Timer de sempre. picking: a folha "Desafiar" (o evento). loading: gerando os sete. solving: o Timer no embaralhamento da vez.
// confirm (só B): o solve parou, B confere +2/DNF antes de "Ver o ponto". reveal (só B): o tempo de A, o ponto e o placar, até "Próximo".
// finished: A fez os sete (mandar o desafio) ou a partida de B acabou (o resultado e mandar a resposta). receive: um link de desafio
// aberto ("Aceitar" ou "Agora não"). reply: A abriu a resposta, a partida inteira. view: uma resposta sem o desafio de A neste aparelho,
// só para ver. invalid: o link não abre.
export type DuelPhase = 'idle' | 'picking' | 'loading' | 'solving' | 'confirm' | 'reveal' | 'finished' | 'receive' | 'reply' | 'view' | 'invalid';
// O que abrir um link deu. receive: um desafio novo. resume: o desafio que este aparelho aceitou, no ponto em que parou. own: o desafio
// que este aparelho mandou. reply: a resposta ao desafio daqui, gravada. view: uma resposta que não fecha um desafio daqui (sem ele, outra
// partida, outro conteúdo), só para ver. invalid: não abre.
export type DuelOpened = 'receive' | 'resume' | 'own' | 'reply' | 'view' | 'invalid';

// As fases que seguram o sync (app.duelRunning): a confirmação e a revelação de B. O solve em si já segura pelo timer (timerBusy).
const RUNNING: readonly DuelPhase[] = ['confirm', 'reveal'];

// O que o desafio usa do app.
export interface DuelHost {
  repo(): Repository; // o repositório atual (o reaberto, depois de o iOS derrubar a conexão)
  event(): EventId; // o evento da sessão atual: o que a folha "Desafiar" traz marcado
  duelName(): string; // o nome que vai nos links (Ajustes)
  setDuelName(name: string): Promise<void>; // limpa, grava e avisa se falhar
  running(busy: boolean): void; // app.duelRunning
  settled(): Promise<void>; // o portão da restauração: uma gravação espera a troca acabar, como as dos solves e do treino
  showToast(text: string): void;
  now(): number;
}

export interface DuelDeps {
  generate?: (event: EventId) => Promise<string>; // um embaralhamento por chamada (padrão: o cubing.js, com o prazo de sempre)
}

type DuelDraft = Omit<Duel, 'createdAt' | 'updatedAt' | 'deletedAt'>;
// O que uma gravação deu: o registro gravado; 'failed' (o aviso já saiu, nada mudou no banco); 'conflict' (o gravado mudou por fora).
type Saved = Duel | 'failed' | 'conflict';

// B: quantos tempos de A já apareceram. Sem o campo (ou fora do formato), todos os gravados; no máximo o último espera a revelação.
function revealedOf(d: Duel): number {
  const n = d.mine.length;
  const r = d.revealed;
  if (d.side === 'a' || typeof r !== 'number' || !Number.isInteger(r)) return n;
  return Math.min(n, Math.max(n - 1, r));
}

// Os tempos de cada lado que a partida já conta. Para B, só os revelados: o tempo de A de um solve ainda não conferido não entra em nada.
function sidesOf(d: Duel): { a: DuelTime[]; b: DuelTime[] } | null {
  if (!d.theirs) return null;
  if (d.side === 'a') return { a: d.mine, b: d.theirs };
  const n = revealedOf(d);
  return { a: d.theirs.slice(0, n), b: d.mine.slice(0, n) };
}

// O placar de um desafio guardado, do lado deste aparelho, só com o revelado: a tela do desafio e a lista dos Desafios (Evolução) leem o mesmo.
export function scoreOf(d: Duel): DuelScore | null {
  const sides = sidesOf(d);
  return sides ? scoreDuel(sides.a, sides.b) : null;
}

// Onde um desafio guardado reabre (sair e continuar, o link de novo): no ponto em que parou, sem refazer nada.
function phaseOf(d: Duel): DuelPhase {
  if (d.side === 'a') {
    if (d.status === 'done') return 'reply';
    return d.status === 'playing' && d.mine.length < DUEL_SCRAMBLES ? 'solving' : 'finished';
  }
  if (revealedOf(d) < d.mine.length) return 'confirm';
  return d.status === 'done' || scoreOf(d)?.over ? 'finished' : 'solving';
}

// O link de um lado: o desafio (A) leva os sete tempos e o nome de A; a resposta (B) leva também os de B, até onde a partida foi.
function linkOf(d: Duel): DuelLink {
  const base = { v: 1 as const, id: d.linkId, event: d.event, scrambles: d.scrambles };
  if (d.side === 'a') return { ...base, a: { name: d.myName, times: d.mine } };
  return { ...base, a: { name: d.theirName, times: d.theirs ?? [] }, b: { name: d.myName, times: d.mine.slice(0, revealedOf(d)) } };
}

// A data de uma visualização: nenhum registro gravado tem data negativa, então nenhuma conferência (expectUpdatedAt) bate com ela.
const VIEW_STAMP = -1;

// Uma resposta vista sem guardar: a partida inteira, do lado de `side`. Nada disto vai para o banco.
function viewOf(link: DuelLink, b: NonNullable<DuelLink['b']>, side: DuelSide, at: number): Duel {
  const [me, them] = side === 'a' ? [link.a, b] : [b, link.a];
  return {
    id: `${link.id}-${side}`,
    linkId: link.id,
    side,
    event: link.event,
    scrambles: link.scrambles,
    mine: me.times,
    theirs: them.times,
    myName: me.name,
    theirName: them.name,
    status: 'done',
    ...(side === 'b' ? { revealed: b.times.length } : {}),
    createdAt: at,
    updatedAt: VIEW_STAMP,
    deletedAt: null,
  };
}

// Um registro da lixeira conta como ausente: continuar dele o traria de volta (saveDuel revive o que grava). Ele só aparece para ver.
const alive = (d: Duel | null): Duel | null => (d && d.deletedAt === null ? d : null);

const sameTimes = (x: readonly DuelTime[] | null, y: readonly DuelTime[]): boolean =>
  x !== null && x.length === y.length && x.every((t, i) => t.ms === y[i]!.ms && t.penalty === y[i]!.penalty);
const sameList = (x: readonly string[], y: readonly string[]): boolean => x.length === y.length && x.every((s, i) => s === y[i]);
// O desafio daqui é o do link: fora da lixeira, com o mesmo evento, os mesmos embaralhamentos e os mesmos tempos de A.
const sameChallenge = (a: Duel, link: DuelLink): boolean =>
  a.deletedAt === null && a.event === link.event && sameList(a.scrambles, link.scrambles) && sameTimes(a.mine, link.a.times);

export class DuelState {
  pickEvent = $state<EventId>('333'); // o evento marcado na folha "Desafiar"
  private stage = $state<DuelPhase>('idle');
  // O desafio aberto e o link do convite guardam os sete tempos de A: ficam em campos privados de verdade (#), fora do alcance de quem lê
  // app.duel. A tela lê `current`, `opponent`, `score` e `invite`, que só mostram o revelado. Trocados inteiros a cada mudança.
  #duel = $state.raw<Duel | null>(null);
  #offer = $state.raw<DuelLink | null>(null); // o link de 'receive', até aceitar ou recusar
  // O link de A que saiu nesta tela (o toque em Mandar): os tempos não mudam mais, mesmo que a marca de mandado não grave. `revert`: o toque
  // é que deu o desafio por mandado (ele jogava), então fechar a folha sem mandar o volta a jogar. Sai com o desafio (sair, abrir outro).
  #out = $state.raw<{ id: string; revert: boolean } | null>(null);
  // A resposta aberta só para ver porque este aparelho não tem nenhum lado dela (nem o desafio de A, nem o registro de B): o payload, que
  // "Copiar o link" leva ao lugar que tem o desafio (no iPhone, o Klick da tela de início guarda à parte do Safari). Sai com a visualização.
  #stray = $state.raw<string | null>(null);
  // O desafio que a tela vê: para B, `theirs` cortado nos revelados. Derivado, é a mesma referência enquanto o desafio não muda.
  #shown = $derived.by((): Duel | null => {
    const d = this.#duel;
    if (!d || d.side === 'a' || !d.theirs) return d;
    return { ...d, theirs: d.theirs.slice(0, revealedOf(d)) };
  });
  private failedScrambles = $state(false);
  private opening = $state(0); // links sendo lidos: a apresentação espera também por eles
  private pending = $state(0); // ações que podem gravar, na fila ou em voo: app.unsaved espera por elas
  private epoch = 0;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly host: DuelHost;
  private readonly generate: (event: EventId) => Promise<string>;

  constructor(host: DuelHost, deps: DuelDeps = {}) {
    this.host = host;
    this.generate = deps.generate ?? ((event) => generateScramble(event));
  }

  get phase(): DuelPhase {
    return this.stage;
  }

  // O desafio aberto. Para B, `theirs` vem cortado nos revelados: o tempo de A de um embaralhamento não conferido não aparece aqui.
  get current(): Duel | null {
    return this.#shown;
  }

  // O convite de 'receive': o evento e quem desafiou ('' sem nome). Os tempos de A ficam de fora.
  get invite(): { event: EventId; name: string } | null {
    const link = this.#offer;
    return link ? { event: link.event, name: link.a.name } : null;
  }

  // Gerar os sete falhou (ou demorou demais): a folha "Desafiar" mostra o aviso.
  get scrambleError(): boolean {
    return this.failedScrambles;
  }

  // O embaralhamento em jogo (de 0 a 6): o da vez em 'solving', o que acabou de ser resolvido em 'confirm' e 'reveal'; -1 fora do jogo.
  get index(): number {
    const d = this.#duel;
    if (!d) return -1;
    if (this.stage === 'solving') return d.mine.length;
    if (this.stage === 'confirm' || this.stage === 'reveal') return d.mine.length - 1;
    return -1;
  }

  get scramble(): string {
    const i = this.index;
    return i >= 0 ? (this.#duel?.scrambles[i] ?? '') : '';
  }

  // Os tempos do outro lado que a tela pode mostrar: para B, só os revelados; para A, os da resposta.
  get opponent(): DuelTime[] {
    return this.current?.theirs ?? [];
  }

  // O placar do que já foi revelado; null enquanto A não tem com quem comparar.
  get score(): DuelScore | null {
    return this.#duel ? scoreOf(this.#duel) : null;
  }

  // O que recarregar a página agora perderia (app.unsaved: o aviso de nova versão e a recarga sozinha esperam): uma ação do desafio na fila
  // ou em voo (o solve que parou e ainda não gravou, por exemplo), ou B na confirmação, com o solve gravado e a penalidade dele só na
  // memória até "Ver o ponto".
  get unsaved(): boolean {
    const d = this.#duel;
    return this.pending > 0 || (this.stage === 'confirm' && d !== null && d.side === 'b' && revealedOf(d) < d.mine.length);
  }

  // Um link aberto (ou um desafio em jogo) vem antes da apresentação: a primeira visita por um link vai direto ao desafio.
  get blocksOnboarding(): boolean {
    return this.stage !== 'idle' || this.opening > 0;
  }

  // "Desafiar": a folha com o evento da sessão (ou o dado) marcado.
  pick(event: EventId = this.host.event()): void {
    this.leave('picking');
    this.pickEvent = event;
  }

  // "Desafiar de volta": a folha de novo, no evento da partida que acabou.
  rematch(): void {
    this.pick(this.#duel?.event ?? this.pickEvent);
  }

  // "Sair" (e "Fechar", "Cancelar"): de volta ao Timer. O desafio fica como foi gravado; o jogando continua depois (resume).
  exit(): void {
    this.leave('idle');
  }

  // "Agora não": fecha o convite sem gravar nada; o mesmo link abre de novo depois.
  decline(): void {
    this.exit();
  }

  // Um link que nem chegou a ser lido (um erro do navegador ao tirá-lo da barra): o aviso de que não abre, sem gravar nada.
  invalid(): void {
    this.leave('invalid');
  }

  // Gera os sete, um por vez, e só então cria o registro de A. Uma falha (ou o prazo do gerador) volta à folha com o aviso: nenhum
  // desafio começa com menos de sete.
  async start(event: EventId): Promise<void> {
    if (this.stage === 'loading') return;
    this.leave('loading');
    const epoch = this.epoch;
    this.pickEvent = event;
    const scrambles: string[] = [];
    try {
      while (scrambles.length < DUEL_SCRAMBLES) {
        const scramble = await this.generate(event);
        if (epoch !== this.epoch) return; // saiu enquanto gerava
        if (!isDuelScramble(scramble)) throw new Error('embaralhamento fora do formato');
        scrambles.push(scramble);
      }
    } catch {
      if (epoch === this.epoch) {
        this.go('picking');
        this.failedScrambles = true;
      }
      return;
    }
    await this.serial(async () => {
      if (epoch !== this.epoch) return;
      const linkId = newLinkId();
      const draft: DuelDraft = {
        id: `${linkId}-a`,
        linkId,
        side: 'a',
        event,
        scrambles,
        mine: [],
        theirs: null,
        myName: this.host.duelName(),
        theirName: '',
        status: 'playing',
      };
      const saved = await this.save(draft, null, epoch); // null: só cria
      if (epoch !== this.epoch || saved === 'conflict') return;
      if (saved === 'failed') this.go('picking'); // o aviso de gravar já saiu; Começar tenta de novo
      else this.enter(saved);
    });
  }

  // Um solve no embaralhamento da vez. A: grava e segue (os sete feitos, 'finished'). B: grava e para na confirmação, antes do tempo de A.
  // Se a gravação falha, o solve segue na memória e vai junto na próxima (o registro grava inteiro); a revelação de B só acontece gravada.
  record(t: DuelTime): Promise<void> {
    return this.serial(async () => {
      const d = this.#duel;
      if (this.stage !== 'solving' || !d || d.mine.length >= DUEL_SCRAMBLES) return;
      const epoch = this.epoch;
      const mine = [...d.mine, { ms: t.ms, penalty: t.penalty }];
      const next: Duel = d.side === 'b' ? { ...d, mine, revealed: revealedOf(d) } : { ...d, mine };
      const saved = await this.save(next, d.updatedAt, epoch);
      if (epoch !== this.epoch || saved === 'conflict') return;
      this.#duel = saved === 'failed' ? next : saved;
      if (d.side === 'b') this.go('confirm');
      else if (mine.length >= DUEL_SCRAMBLES) this.go('finished');
    });
  }

  // +2/DNF no último solve. A: até o próximo começar e até o link sair (como no Timer; o sétimo vale na tela de mandar). B: só na
  // confirmação; depois de ver o tempo de A, nunca (Review Focus 5). A de B grava junto com a revelação.
  setPenalty(p: Penalty): Promise<void> {
    return this.serial(async () => {
      const d = this.#duel;
      if (!d || d.mine.length === 0 || this.#out?.id === d.id) return; // o link já saiu com estes tempos
      const open =
        d.side === 'a' ? d.status === 'playing' && (this.stage === 'solving' || this.stage === 'finished') : this.stage === 'confirm';
      const last = d.mine.length - 1;
      if (!open || d.mine[last]!.penalty === p) return;
      const next: Duel = { ...d, mine: d.mine.map((t, i) => (i === last ? { ...t, penalty: p } : t)) };
      if (d.side === 'b') {
        this.#duel = next;
        return;
      }
      const epoch = this.epoch;
      const saved = await this.save(next, d.updatedAt, epoch);
      if (epoch === this.epoch && saved !== 'conflict') this.#duel = saved === 'failed' ? next : saved;
    });
  }

  // "Ver o ponto" (B): a penalidade conferida, a revelação e, se o ponto fechou a partida, o fim, numa gravação só. Sem ela gravada, o
  // tempo de A não aparece: recarregar não daria uma segunda chance a quem já o viu.
  reveal(): Promise<void> {
    return this.serial(async () => {
      const d = this.#duel;
      if (this.stage !== 'confirm' || !d || d.side !== 'b') return;
      const epoch = this.epoch;
      const shown: Duel = { ...d, revealed: d.mine.length };
      const saved = await this.save(scoreOf(shown)?.over ? { ...shown, status: 'done' } : shown, d.updatedAt, epoch);
      if (epoch !== this.epoch || typeof saved === 'string') return;
      this.#duel = saved;
      this.go('reveal');
    });
  }

  // "Próximo": o embaralhamento seguinte, ou o resultado quando alguém chegou a 3 (ou os sete acabaram). O fim já foi gravado na revelação.
  next(): void {
    const d = this.#duel;
    if (this.stage !== 'reveal' || !d) return;
    this.go(scoreOf(d)?.over ? 'finished' : 'solving');
  }

  // Continua um desafio guardado (Evolução, a pílula) no ponto em que parou. false se ele não existe (ou não deu para ler).
  resume(id: string): Promise<boolean> {
    this.leave('idle');
    const epoch = this.epoch;
    return this.serial(async () => {
      let d: Duel | null;
      try {
        d = await this.host.repo().getDuel(id);
      } catch {
        if (epoch === this.epoch) this.host.showToast(T.data.readFailed);
        return false;
      }
      const found = alive(d);
      if (!found || epoch !== this.epoch) return false;
      this.enter(found);
      return true;
    }, false);
  }

  // "Descartar o desafio" (só A): para a lixeira, e de volta ao Timer. B não descarta um desafio aceito (spec §3). Só o registro que a
  // tela leu: um que mudou por fora (a resposta chegou noutra aba, por exemplo) não vai para a lixeira, e a tela volta a ele.
  discard(): Promise<boolean> {
    return this.serial(async () => {
      const d = this.#duel;
      if (!d || d.side !== 'a' || this.readOnly) return false;
      const epoch = this.epoch;
      await this.host.settled();
      try {
        await this.host.repo().deleteDuel(d.id, { expectUpdatedAt: d.updatedAt });
      } catch (err) {
        if (err instanceof DuelConflictError) this.conflict(err.stored, epoch);
        else this.host.showToast(T.data.changeFailed);
        return false;
      }
      if (epoch === this.epoch) this.leave('idle');
      return true;
    });
  }

  // "Mandar o desafio" (A, os sete feitos): o link com os sete tempos e o nome. `name` é o que a pessoa deixou no campo da tela: vai para os
  // Ajustes antes. O desafio passa a esperar a resposta (e a penalidade do último não muda mais); o link só sai com isso gravado. Sem
  // gravar, null: nada saiu, o desafio segue como estava e Mandar tenta de novo.
  challengeUrl(origin: string, name?: string): Promise<string | null> {
    return this.serial(async () => {
      if (this.readOnly) return null;
      const d = this.#duel;
      if (!d || d.side !== 'a' || d.mine.length < DUEL_SCRAMBLES) throw new Error('O desafio ainda não tem os sete tempos');
      const epoch = this.epoch;
      await this.rename(name);
      const sent: Duel = { ...d, myName: this.host.duelName(), status: d.status === 'playing' ? 'waiting' : d.status };
      const saved = sent.myName !== d.myName || sent.status !== d.status ? await this.save(sent, d.updatedAt, epoch) : d;
      if (typeof saved === 'string') return null;
      if (epoch === this.epoch) this.#duel = saved;
      return duelUrl(origin, await encodeDuelLink(linkOf(saved)));
    });
  }

  // O link do desafio de A como está agora (os sete tempos e o nome), sem dar o desafio por mandado: a tela o prepara antes do toque, e o
  // toque o compartilha na hora (a folha do sistema só abre dentro do gesto da pessoa). Depois de compartilhado, challengeUrl o dá por
  // mandado. `name`, como em challengeUrl, vai para os Ajustes antes. null de uma visualização, ou sem o desafio de A com os sete.
  challengeLink(origin: string, name?: string): Promise<string | null> {
    return this.serial(async () => {
      const d = this.#duel;
      if (this.readOnly || !d || d.side !== 'a' || d.mine.length < DUEL_SCRAMBLES) return null;
      const epoch = this.epoch;
      await this.rename(name);
      const now = this.#duel;
      if (epoch !== this.epoch || !now) return null;
      return duelUrl(origin, await encodeDuelLink(linkOf({ ...now, myName: this.host.duelName() })));
    });
  }

  // O link da resposta de B como está agora, sem gravar o nome no registro (só ao mandar, em replyUrl): o mesmo papel de challengeLink.
  replyLink(origin: string, name?: string): Promise<string | null> {
    return this.serial(async () => {
      const d = this.#duel;
      if (this.readOnly || !d || d.side !== 'b' || !scoreOf(d)?.over) return null;
      const epoch = this.epoch;
      await this.rename(name);
      const now = this.#duel;
      if (epoch !== this.epoch || !now) return null;
      return duelUrl(origin, await encodeDuelLink(linkOf({ ...now, myName: this.host.duelName() })));
    });
  }

  // O link saiu (o toque em Mandar, logo antes da folha do sistema ou da cópia): o de A trava os tempos já, e a marca (challengeUrl para A,
  // replyUrl para B) entra na fila sem o toque esperar por ela; se o sistema derrubar a página a caminho do app de mensagens, ela já
  // começou. null se a marca não gravou.
  send(origin: string): Promise<string | null> {
    const d = this.#duel;
    if (!d || this.readOnly) return Promise.resolve(null);
    if (d.side === 'b') return this.replyUrl(origin);
    this.#out = { id: d.id, revert: d.status === 'playing' };
    return this.challengeUrl(origin);
  }

  // A pessoa fechou a folha sem mandar (AbortError): os tempos destravam e, se o toque é que deu o desafio por mandado, ele volta a jogar.
  // Na fila, depois da marca: grava sobre o registro que ela gravou (a data dela). Sem a marca gravada, só destrava.
  unsend(): Promise<void> {
    return this.serial(async () => {
      const d = this.#duel;
      const out = this.#out;
      if (!d || !out || out.id !== d.id) return;
      this.#out = null;
      if (!out.revert || d.status !== 'waiting' || this.readOnly) return;
      const epoch = this.epoch;
      const saved = await this.save({ ...d, status: 'playing' }, d.updatedAt, epoch);
      if (epoch === this.epoch && typeof saved !== 'string') this.#duel = saved;
    });
  }

  // O payload da resposta vista sem nenhum lado dela neste aparelho (a tela explica e oferece copiar o link); null em qualquer outra fase.
  get strayReply(): string | null {
    return this.stage === 'view' ? this.#stray : null;
  }

  // O link de A saiu nesta tela: a penalidade não muda mais (a tela de mandar tira +2 e DNF).
  get linkOut(): boolean {
    const d = this.#duel;
    return d !== null && this.#out?.id === d.id;
  }

  // O nome dos links vai para os Ajustes só quando muda (limpo como os Ajustes o guardam): preparar o link a cada pausa não regrava o mesmo.
  private async rename(name: string | undefined): Promise<void> {
    if (name !== undefined && cleanDuelName(name) !== this.host.duelName()) await this.host.setDuelName(name);
  }

  // "Mandar de novo": o mesmo link de um desafio de A que espera resposta; null para qualquer outro.
  resend(id: string, origin: string): Promise<string | null> {
    return this.serial(async () => {
      let d: Duel | null;
      try {
        d = await this.host.repo().getDuel(id);
      } catch {
        this.host.showToast(T.data.readFailed);
        return null;
      }
      const found = alive(d);
      if (!found || found.side !== 'a' || found.status !== 'waiting') return null;
      return duelUrl(origin, await encodeDuelLink(linkOf(found)));
    }, false);
  }

  // "Mandar a resposta" (B, a partida acabou): o link com os dois lados. `name`, como em challengeUrl: o nome novo grava antes de o link
  // sair, e sem gravar, null.
  replyUrl(origin: string, name?: string): Promise<string | null> {
    return this.serial(async () => {
      if (this.readOnly) return null;
      const d = this.#duel;
      if (!d || d.side !== 'b' || !scoreOf(d)?.over) throw new Error('A partida ainda não acabou');
      const epoch = this.epoch;
      await this.rename(name);
      const named: Duel = { ...d, myName: this.host.duelName() };
      const saved = named.myName !== d.myName ? await this.save(named, d.updatedAt, epoch) : d;
      if (typeof saved === 'string') return null;
      if (epoch === this.epoch) this.#duel = saved;
      return duelUrl(origin, await encodeDuelLink(linkOf(saved)));
    });
  }

  // Abre um `#desafio=` e decide pelo conteúdo e pelo que existe neste aparelho (Review Focus 1, 3 e 4). Sem a resposta: o desafio que
  // este aparelho aceitou continua (resume); o que ele mandou aparece (own); senão, o convite (receive), sem gravar nada. Com a resposta:
  // ela fecha o desafio daqui que ainda não tem resposta (reply); qualquer outra só aparece (view). Torto: invalid, nada muda. Um desafio em
  // jogo fica como foi gravado. Nunca rejeita.
  async openLink(payload: string): Promise<DuelOpened> {
    this.leave('idle');
    const epoch = this.epoch;
    this.opening++;
    try {
      const link = await decodeDuelLink(payload);
      return await this.serial(() => this.opened(link, payload, epoch));
    } finally {
      this.opening--;
    }
  }

  // "Aceitar": cria o registro de B (só se ele não existe) e o Timer entra no primeiro embaralhamento. Se outra aba aceitou antes, a
  // criação dá conflito e a tela continua do que ela jogou: aceitar de novo não zera nada.
  accept(): Promise<void> {
    return this.serial(async () => {
      const link = this.#offer;
      if (this.stage !== 'receive' || !link) return;
      const epoch = this.epoch;
      const draft: DuelDraft = {
        id: `${link.id}-b`,
        linkId: link.id,
        side: 'b',
        event: link.event,
        scrambles: link.scrambles,
        mine: [],
        theirs: link.a.times,
        myName: this.host.duelName(),
        theirName: link.a.name,
        status: 'playing',
        revealed: 0,
      };
      const saved = await this.save(draft, null, epoch);
      if (epoch !== this.epoch || typeof saved === 'string') return; // sem gravar, o convite fica: Aceitar tenta de novo
      this.enter(saved);
    });
  }

  // Um aviso de mudança do repositório (o AppState repassa todos): 'duels' (o sync, outra aba, a lixeira) ou 'all' (os dados apagados, uma
  // restauração, uma importação, um aviso perdido). O desafio aberto é relido, na fila: o que esta tela gravou já está na memória quando a
  // conferência roda, e só o que mudou por fora conta. A resposta que chegou ao desafio de A que esperava por ela abre a partida; o registro
  // que sumiu ou foi para a lixeira fecha o desafio, e um 'all' que trocou o registro também (a restauração). Qualquer outra mudança fica para
  // a próxima gravação, que confere (expectUpdatedAt) e volta ao gravado.
  changed(kind: ChangeKind): void {
    if ((kind !== 'duels' && kind !== 'all') || !this.#duel || this.readOnly) return;
    const epoch = this.epoch;
    void this.serial(async () => {
      const d = this.#duel;
      if (epoch !== this.epoch || !d || this.readOnly) return;
      let stored: Duel | null;
      try {
        stored = await this.host.repo().getDuel(d.id);
      } catch {
        return; // sem ler, a tela fica como está: a próxima gravação confere
      }
      if (epoch !== this.epoch || this.#duel !== d || (stored !== null && stored.updatedAt === d.updatedAt)) return;
      const found = alive(stored);
      if (!found || kind === 'all') this.exit();
      else if (d.side === 'a' && d.status !== 'done' && found.status === 'done') this.enter(found);
    }, false);
  }

  // `again`: uma resposta cujo desafio mudou entre ler e gravar (outra aba abriu a mesma resposta) é decidida de novo, uma vez, pelo que
  // ficou gravado.
  private async opened(link: DuelLink | null, payload: string, epoch: number, again = true): Promise<DuelOpened> {
    const live = (): boolean => epoch === this.epoch; // outro link (ou sair) passou na frente: a tela fica com ele
    if (!link) {
      if (live()) this.go('invalid');
      return 'invalid';
    }
    const repo = this.host.repo();
    let b: Duel | null;
    let a: Duel | null;
    try {
      [b, a] = await Promise.all([repo.getDuel(`${link.id}-b`), repo.getDuel(`${link.id}-a`)]);
    } catch {
      // Sem ler o aparelho não dá para saber se este desafio já foi aceito, e aceitar de novo seria refazer: o link não abre agora.
      if (live()) {
        this.host.showToast(T.data.readFailed);
        this.go('invalid');
      }
      return 'invalid';
    }
    if (!link.b) {
      const accepted = alive(b);
      const sent = alive(a);
      if (accepted) return this.show('resume', live, accepted);
      if (sent) return this.show('own', live, sent);
      // Na lixeira: o desafio aparece só para ver (B só com o revelado, como sempre). Aceitar de novo seria refazer; mandar de novo, ou
      // continuar, o traria de volta.
      const trashed = b ?? a;
      if (trashed) return this.show('view', live, { ...trashed, updatedAt: VIEW_STAMP }, 'view');
      if (live()) {
        this.#offer = link;
        this.go('receive');
      }
      return 'receive';
    }
    const reply = link.b;
    // A resposta só fecha o desafio daqui que é o mesmo do link, ainda sem resposta, com os sete e a partida acabada. A marca de mandado é
    // melhor esforço (ela pode não ter gravado, ou um AbortError a desfez depois de o link sair): um desafio que ficou jogando também fecha,
    // porque a resposta traz os sete tempos exatos dele, a prova de que o link saiu. A mesma resposta de novo mostra a partida sem gravar.
    // Qualquer outra (a de outro amigo, a de um desafio descartado, uma montada à mão) só aparece: nunca apaga uma partida nem traz um
    // desafio da lixeira.
    if (a && sameChallenge(a, link)) {
      if (a.status === 'done' && a.theirName === reply.name && sameTimes(a.theirs, reply.times)) return this.show('reply', live, a, 'reply');
      if (a.status !== 'done' && a.deletedAt === null && a.mine.length === DUEL_SCRAMBLES && scoreDuel(a.mine, reply.times).over) {
        const done: Duel = { ...a, theirs: reply.times, theirName: reply.name, status: 'done' };
        const saved = await this.save(done, a.updatedAt, epoch, () => undefined);
        if (saved !== 'conflict') return this.show('reply', live, saved === 'failed' ? done : saved, 'reply'); // a falha mostra, com o aviso
        if (again) return this.opened(link, payload, epoch, false);
      }
    }
    const view = this.show('view', live, viewOf(link, reply, b ? 'b' : 'a', this.host.now()), 'view');
    if (a === null && b === null && live()) this.#stray = payload; // nenhum lado aqui: a tela explica onde colar
    return view;
  }

  // Uma visualização não é de ninguém: nada grava a partir dela.
  private get readOnly(): boolean {
    return this.stage === 'view';
  }

  private show(outcome: DuelOpened, live: () => boolean, d: Duel, phase: DuelPhase = phaseOf(d)): DuelOpened {
    if (live()) this.enter(d, phase);
    return outcome;
  }

  private enter(d: Duel, phase: DuelPhase = phaseOf(d)): void {
    this.#duel = d;
    this.#offer = null;
    this.#stray = null;
    this.pickEvent = d.event;
    this.go(phase);
  }

  // O registro mudou por fora: a ação foi largada, e a tela volta ao que está gravado. Sem registro (um wipe, um descarte noutra aba, a
  // lixeira), sai do desafio.
  private conflict(stored: Duel | null, epoch: number): void {
    if (epoch !== this.epoch) return;
    if (stored && stored.deletedAt === null) this.enter(stored);
    else this.exit();
  }

  // Larga o desafio aberto (o que estiver em voo termina sem mexer na tela) e vai para `phase`.
  private leave(phase: DuelPhase): void {
    this.epoch++;
    this.#duel = null;
    this.#offer = null;
    this.#out = null;
    this.#stray = null;
    this.go(phase);
  }

  private go(phase: DuelPhase): void {
    this.stage = phase;
    this.failedScrambles = false;
    this.host.running(RUNNING.includes(phase));
  }

  // Grava o desafio inteiro, como objeto simples (nunca o proxy da tela), só sobre o registro com a data `expect` (null: só cria), depois de
  // uma restauração em curso. Num conflito, `onConflict` (por padrão, a tela volta ao gravado).
  private async save(
    d: DuelDraft,
    expect: number | null,
    epoch: number,
    onConflict = (stored: Duel | null): void => this.conflict(stored, epoch),
  ): Promise<Saved> {
    if (this.readOnly) return 'failed'; // de uma visualização, nunca (cada ação já para antes; esta é a última trava)
    await this.host.settled();
    try {
      return await this.host.repo().saveDuel($state.snapshot(d), { expectUpdatedAt: expect });
    } catch (err) {
      if (err instanceof DuelConflictError) {
        onConflict(err.stored);
        return 'conflict';
      }
      this.host.showToast(T.data.changeFailed);
      return 'failed';
    }
  }

  // A fila das ações. As que podem gravar (`writes`, o padrão) contam em `pending` do pedido até terminar, e saem da conta antes de quem as
  // espera continuar, sem atrasar a volta dela (a tela que espera a ação, como a penalidade pelo teclado, segue no mesmo passo de antes);
  // as que só leem (continuar, mandar de novo, o aviso de mudança) não seguram a recarga.
  private serial<R>(job: () => Promise<R>, writes = true): Promise<R> {
    if (writes) this.pending++;
    const run = this.chain.then(() => {
      const done = job();
      if (writes) {
        const settle = (): void => {
          this.pending--;
        };
        done.then(settle, settle);
      }
      return done;
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
