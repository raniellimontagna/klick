// O desafio por link na tela (spec do desafio, seções 3 a 6, e a maquete aprovada): um modo do Timer, não uma tela à parte. Guarda a fase
// que a tela mostra e o desafio aberto. Cada mudança que precisa sobreviver a recarregar é gravada antes de a fase mudar: o solve, a
// penalidade de B conferida, a revelação e o estado. Os tempos do desafio ficam só no registro dele, nunca em `solves`.
//
// As ações que gravam andam numa fila, na ordem em que foram pedidas: cada uma lê o desafio que a anterior deixou. `epoch` sobe a cada
// troca de desafio (sair, começar, continuar, abrir um link): o que termina depois disso grava, mas não mexe mais na tela.
import { decodeDuelLink, duelUrl, encodeDuelLink, isDuelScramble, newLinkId } from '../../core/duel/link';
import { DUEL_SCRAMBLES, type DuelScore, scoreDuel } from '../../core/duel/score';
import type { Duel, DuelLink, DuelSide, DuelTime, EventId, Penalty } from '../../core/types';
import type { Repository } from '../../data/repository';
import { generateScramble } from '../../scramble/cubing-loader';
import { T } from '../../strings';

// idle: o Timer de sempre. picking: a folha "Desafiar" (o evento). loading: gerando os sete. solving: o Timer no embaralhamento da vez.
// confirm (só B): o solve parou, B confere +2/DNF antes de "Ver o ponto". reveal (só B): o tempo de A, o ponto e o placar, até "Próximo".
// finished: A fez os sete (mandar o desafio) ou a partida de B acabou (o resultado e mandar a resposta). receive: um link de desafio
// aberto ("Aceitar" ou "Agora não"). reply: A abriu a resposta, a partida inteira. view: uma resposta sem o desafio de A neste aparelho,
// só para ver. invalid: o link não abre.
export type DuelPhase = 'idle' | 'picking' | 'loading' | 'solving' | 'confirm' | 'reveal' | 'finished' | 'receive' | 'reply' | 'view' | 'invalid';
// O que abrir um link deu. receive: um desafio novo. resume: o desafio que este aparelho aceitou, no ponto em que parou. own: o desafio
// que este aparelho mandou. reply: a resposta ao desafio daqui, gravada. view: uma resposta sem o desafio daqui. invalid: não abre.
export type DuelOpened = 'receive' | 'resume' | 'own' | 'reply' | 'view' | 'invalid';

// As fases em que o desafio corre: seguram o sync, como o timer (app.duelRunning).
const RUNNING: readonly DuelPhase[] = ['solving', 'confirm', 'reveal'];

// O que o desafio usa do app.
export interface DuelHost {
  repo(): Repository; // o repositório atual (o reaberto, depois de o iOS derrubar a conexão)
  event(): EventId; // o evento da sessão atual: o que a folha "Desafiar" traz marcado
  duelName(): string; // o nome que vai nos links (Ajustes)
  setDuelName(name: string): Promise<void>; // limpa, grava e avisa se falhar
  running(busy: boolean): void; // app.duelRunning
  showToast(text: string): void;
  now(): number;
}

export interface DuelDeps {
  generate?: (event: EventId) => Promise<string>; // um embaralhamento por chamada (padrão: o cubing.js, com o prazo de sempre)
}

type DuelDraft = Omit<Duel, 'createdAt' | 'updatedAt' | 'deletedAt'>;

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

function scoreOf(d: Duel): DuelScore | null {
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
    updatedAt: at,
    deletedAt: null,
  };
}

const sameTimes = (x: readonly DuelTime[] | null, y: readonly DuelTime[]): boolean =>
  x !== null && x.length === y.length && x.every((t, i) => t.ms === y[i]!.ms && t.penalty === y[i]!.penalty);

export class DuelState {
  pickEvent = $state<EventId>('333'); // o evento marcado na folha "Desafiar"
  private stage = $state<DuelPhase>('idle');
  private duel = $state.raw<Duel | null>(null); // o desafio aberto; trocado inteiro a cada mudança (nunca um proxy no saveDuel)
  private offer = $state.raw<DuelLink | null>(null); // o link de 'receive', até aceitar ou recusar
  private failedScrambles = $state(false);
  private opening = $state(0); // links sendo lidos: a apresentação espera também por eles
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

  // O desafio aberto. Para B, `theirs` já traz os sete tempos de A: a tela lê `opponent`, que só tem os revelados.
  get current(): Duel | null {
    return this.duel;
  }

  // O convite de 'receive': o evento e quem desafiou ('' sem nome). Os tempos de A ficam de fora.
  get invite(): { event: EventId; name: string } | null {
    const link = this.offer;
    return link ? { event: link.event, name: link.a.name } : null;
  }

  // Gerar os sete falhou (ou demorou demais): a folha "Desafiar" mostra o aviso.
  get scrambleError(): boolean {
    return this.failedScrambles;
  }

  // O embaralhamento em jogo (de 0 a 6): o da vez em 'solving', o que acabou de ser resolvido em 'confirm' e 'reveal'; -1 fora do jogo.
  get index(): number {
    const d = this.duel;
    if (!d) return -1;
    if (this.stage === 'solving') return d.mine.length;
    if (this.stage === 'confirm' || this.stage === 'reveal') return d.mine.length - 1;
    return -1;
  }

  get scramble(): string {
    const i = this.index;
    return i >= 0 ? (this.duel?.scrambles[i] ?? '') : '';
  }

  // Os tempos do outro lado que a tela pode mostrar: para B, só os revelados (o de um embaralhamento ainda não conferido não aparece em
  // lugar nenhum); para A, os da resposta.
  get opponent(): DuelTime[] {
    const d = this.duel;
    if (!d?.theirs) return [];
    return d.side === 'a' ? d.theirs : d.theirs.slice(0, revealedOf(d));
  }

  // O placar do que já foi revelado; null enquanto A não tem com quem comparar.
  get score(): DuelScore | null {
    return this.duel ? scoreOf(this.duel) : null;
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
    this.pick(this.duel?.event ?? this.pickEvent);
  }

  // "Sair" (e "Fechar", "Cancelar"): de volta ao Timer. O desafio fica como foi gravado; o jogando continua depois (resume).
  exit(): void {
    this.leave('idle');
  }

  // "Agora não": fecha o convite sem gravar nada; o mesmo link abre de novo depois.
  decline(): void {
    this.exit();
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
      const saved = await this.save({
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
      });
      if (epoch !== this.epoch) return;
      if (saved) this.enter(saved);
      else this.go('picking'); // o aviso de gravar já saiu; Começar tenta de novo
    });
  }

  // Um solve no embaralhamento da vez. A: grava e segue (os sete feitos, 'finished'). B: grava e para na confirmação, antes do tempo de A.
  // Se a gravação falha, o solve segue na memória e vai junto na próxima (o registro grava inteiro); a revelação de B só acontece gravada.
  record(t: DuelTime): Promise<void> {
    return this.serial(async () => {
      const d = this.duel;
      if (this.stage !== 'solving' || !d || d.mine.length >= DUEL_SCRAMBLES) return;
      const epoch = this.epoch;
      const mine = [...d.mine, { ms: t.ms, penalty: t.penalty }];
      const next: Duel = d.side === 'b' ? { ...d, mine, revealed: revealedOf(d) } : { ...d, mine };
      const saved = await this.save(next);
      if (epoch !== this.epoch) return;
      this.duel = saved ?? next;
      if (d.side === 'b') this.go('confirm');
      else if (mine.length >= DUEL_SCRAMBLES) this.go('finished');
    });
  }

  // +2/DNF no último solve. A: até o próximo começar e até o link sair (como no Timer; o sétimo vale na tela de mandar). B: só na
  // confirmação; depois de ver o tempo de A, nunca (Review Focus 5). A de B grava junto com a revelação.
  setPenalty(p: Penalty): Promise<void> {
    return this.serial(async () => {
      const d = this.duel;
      if (!d || d.mine.length === 0) return;
      const open =
        d.side === 'a' ? d.status === 'playing' && (this.stage === 'solving' || this.stage === 'finished') : this.stage === 'confirm';
      const last = d.mine.length - 1;
      if (!open || d.mine[last]!.penalty === p) return;
      const next: Duel = { ...d, mine: d.mine.map((t, i) => (i === last ? { ...t, penalty: p } : t)) };
      if (d.side === 'b') {
        this.duel = next;
        return;
      }
      const epoch = this.epoch;
      const saved = await this.save(next);
      if (epoch === this.epoch) this.duel = saved ?? next;
    });
  }

  // "Ver o ponto" (B): a penalidade conferida, a revelação e, se o ponto fechou a partida, o fim, numa gravação só. Sem ela gravada, o
  // tempo de A não aparece: recarregar não daria uma segunda chance a quem já o viu.
  reveal(): Promise<void> {
    return this.serial(async () => {
      const d = this.duel;
      if (this.stage !== 'confirm' || !d || d.side !== 'b') return;
      const epoch = this.epoch;
      const shown: Duel = { ...d, revealed: d.mine.length };
      const saved = await this.save(scoreOf(shown)?.over ? { ...shown, status: 'done' } : shown);
      if (epoch !== this.epoch || !saved) return;
      this.duel = saved;
      this.go('reveal');
    });
  }

  // "Próximo": o embaralhamento seguinte, ou o resultado quando alguém chegou a 3 (ou os sete acabaram). O fim já foi gravado na revelação.
  next(): void {
    const d = this.duel;
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
      if (!d || epoch !== this.epoch) return false;
      this.enter(d);
      return true;
    });
  }

  // "Descartar o desafio" (só A): para a lixeira, e de volta ao Timer. B não descarta um desafio aceito (spec §3).
  discard(): Promise<boolean> {
    return this.serial(async () => {
      const d = this.duel;
      if (!d || d.side !== 'a') return false;
      const epoch = this.epoch;
      try {
        const repo = this.host.repo();
        if (await repo.getDuel(d.id)) await repo.deleteDuel(d.id); // um desafio que nunca chegou a gravar não tem o que apagar
      } catch {
        this.host.showToast(T.data.changeFailed);
        return false;
      }
      if (epoch === this.epoch) this.leave('idle');
      return true;
    });
  }

  // "Mandar o desafio" (A, os sete feitos): o link com os sete tempos e o nome. `name` é o que a pessoa deixou no campo da tela: vai para os
  // Ajustes antes. O desafio passa a esperar a resposta (e a penalidade do último não muda mais), gravado antes de o link sair.
  challengeUrl(origin: string, name?: string): Promise<string> {
    return this.serial(async () => {
      const d = this.duel;
      if (!d || d.side !== 'a' || d.mine.length < DUEL_SCRAMBLES) throw new Error('O desafio ainda não tem os sete tempos');
      const epoch = this.epoch;
      if (name !== undefined) await this.host.setDuelName(name);
      const sent: Duel = { ...d, myName: this.host.duelName(), status: d.status === 'playing' ? 'waiting' : d.status };
      const changed = sent.myName !== d.myName || sent.status !== d.status;
      const saved = changed ? await this.save(sent) : d;
      if (epoch === this.epoch) this.duel = saved ?? sent;
      return duelUrl(origin, await encodeDuelLink(linkOf(sent)));
    });
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
      if (!d || d.side !== 'a' || d.status !== 'waiting') return null;
      return duelUrl(origin, await encodeDuelLink(linkOf(d)));
    });
  }

  // "Mandar a resposta" (B, a partida acabou): o link com os dois lados. `name`, como em challengeUrl.
  replyUrl(origin: string, name?: string): Promise<string> {
    return this.serial(async () => {
      const d = this.duel;
      if (!d || d.side !== 'b' || !scoreOf(d)?.over) throw new Error('A partida ainda não acabou');
      const epoch = this.epoch;
      if (name !== undefined) await this.host.setDuelName(name);
      const named: Duel = { ...d, myName: this.host.duelName() };
      const saved = named.myName !== d.myName ? await this.save(named) : d;
      if (epoch === this.epoch) this.duel = saved ?? named;
      return duelUrl(origin, await encodeDuelLink(linkOf(named)));
    });
  }

  // Abre um `#desafio=` e decide pelo conteúdo e pelo que existe neste aparelho (Review Focus 1, 3 e 4). Sem a resposta: o desafio que
  // este aparelho aceitou continua (resume); o que ele mandou aparece (own); senão, o convite (receive), sem gravar nada. Com a resposta:
  // o desafio daqui recebe os tempos de B e fecha (reply); sem ele, a partida só para ver (view). Torto: invalid, nada muda. Um desafio em
  // jogo fica como foi gravado. Nunca rejeita.
  async openLink(payload: string): Promise<DuelOpened> {
    this.leave('idle');
    const epoch = this.epoch;
    this.opening++;
    try {
      const link = await decodeDuelLink(payload);
      return await this.serial(() => this.opened(link, epoch));
    } finally {
      this.opening--;
    }
  }

  // "Aceitar": cria o registro de B e o Timer entra no primeiro embaralhamento. Se este aparelho já tem o lado B (outra aba aceitou),
  // continua dele: aceitar de novo não zera nada.
  accept(): Promise<void> {
    return this.serial(async () => {
      const link = this.offer;
      if (this.stage !== 'receive' || !link) return;
      const epoch = this.epoch;
      const repo = this.host.repo();
      let saved: Duel | null;
      try {
        saved = await repo.getDuel(`${link.id}-b`);
      } catch {
        this.host.showToast(T.data.readFailed);
        return;
      }
      saved ??= await this.save({
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
      });
      if (epoch !== this.epoch || !saved) return; // sem gravar, o convite fica: Aceitar tenta de novo
      this.enter(saved);
    });
  }

  private async opened(link: DuelLink | null, epoch: number): Promise<DuelOpened> {
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
      if (b) return this.show('resume', live, b);
      if (a) return this.show('own', live, a);
      if (live()) {
        this.offer = link;
        this.go('receive');
      }
      return 'receive';
    }
    if (a) {
      const done: Duel = { ...a, theirs: link.b.times, theirName: link.b.name, status: 'done' };
      // A mesma resposta aberta de novo não grava outra vez. Se a gravação falha, a partida aparece mesmo assim, com o aviso.
      const same = a.status === 'done' && a.theirName === done.theirName && sameTimes(a.theirs, link.b.times);
      const saved = same ? a : await this.save(done);
      return this.show('reply', live, saved ?? done, 'reply');
    }
    return this.show('view', live, viewOf(link, link.b, b ? 'b' : 'a', this.host.now()), 'view');
  }

  private show(outcome: DuelOpened, live: () => boolean, d: Duel, phase: DuelPhase = phaseOf(d)): DuelOpened {
    if (live()) this.enter(d, phase);
    return outcome;
  }

  private enter(d: Duel, phase: DuelPhase = phaseOf(d)): void {
    this.duel = d;
    this.offer = null;
    this.pickEvent = d.event;
    this.go(phase);
  }

  // Larga o desafio aberto (o que estiver em voo termina sem mexer na tela) e vai para `phase`.
  private leave(phase: DuelPhase): void {
    this.epoch++;
    this.duel = null;
    this.offer = null;
    this.go(phase);
  }

  private go(phase: DuelPhase): void {
    this.stage = phase;
    this.failedScrambles = false;
    this.host.running(RUNNING.includes(phase));
  }

  // Grava o desafio inteiro, como objeto simples (nunca o proxy da tela). null se falhou: o aviso já saiu.
  private async save(d: DuelDraft): Promise<Duel | null> {
    try {
      return await this.host.repo().saveDuel($state.snapshot(d));
    } catch {
      this.host.showToast(T.data.changeFailed);
      return null;
    }
  }

  private serial<R>(job: () => Promise<R>): Promise<R> {
    const run = this.chain.then(job);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
