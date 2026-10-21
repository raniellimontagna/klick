// Todo texto que a pessoa lê passa por aqui (pt-BR). Facilita traduzir depois.
import { formatMs, trimCount } from './core/stats';
import type { CopiesPaused } from './core/sync/types';

// Diferenças em segundos, truncadas no centésimo como os tempos.
const sec = (ms: number): string => (Math.floor(ms / 10) / 100).toFixed(2);

// O nome genérico de uma fase ("Fase 2"); a barra das fases mostra só o número e deixa a palavra para o leitor de tela.
const FASE = 'Fase';
// A duração de uma fase: "6.12 s" abaixo de um minuto, "1:02.40" daí em diante.
const phaseDur = (ms: number): string => (ms < 60000 ? `${sec(ms)} s` : formatMs(ms));

export const MILESTONE_INFO = Object.freeze({
  first: { label: 'Primeiro solve', msg: 'Primeiro solve registrado' },
  sub2: { label: 'Sub-2:00', msg: 'Primeiro solve abaixo de 2 minutos' },
  n100: { label: '100 solves', msg: 'Cem solves registrados' },
  sub130: { label: 'Sub-1:30', msg: 'Primeiro solve abaixo de 1:30' },
  ao5sub130: { label: 'Média de 5 sub-1:30', msg: 'Média de 5 abaixo de 1:30' },
  sub1: { label: 'Sub-1:00', msg: 'Primeiro solve abaixo de 1 minuto' },
  streak7: { label: '7 dias seguidos', msg: 'Sete dias seguidos de treino' },
  ao12sub1: { label: 'Média de 12 sub-1:00', msg: 'Média de 12 abaixo de 1 minuto' },
  n1000: { label: '1.000 solves', msg: 'Mil solves registrados' },
});

export const TRAIL = Object.freeze([
  'Cruz branca',
  'Cantos brancos',
  'Segunda camada',
  'Cruz amarela',
  'Orientar e permutar',
  'F2L intuitivo',
  'OLL em 2 passos',
  'PLL em 2 passos',
  'F2L com algoritmos',
]);

export const FINISH_INFO = Object.freeze({
  fosco: { label: 'Fosco', unlock: 'padrão' },
  brilho: { label: 'Brilho', unlock: 'sai na T1' },
  gelo: { label: 'Gelo', unlock: 'sai na T2' },
  carbono: { label: 'Carbono', unlock: 'sai na T3' },
});

// "1 solve", "2.304 solves": a contagem com o ponto de milhar, no singular quando é um só.
const solvesLabel = (n: number): string => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'solve' : 'solves'}`;
// "1 dia", "6 dias", "1.231 dias": a contagem no singular quando é um só.
const daysLabel = (n: number): string => `${n.toLocaleString('pt-BR')} ${n === 1 ? 'dia' : 'dias'}`;
// O "Cancelar" das listas de sessões (as Sessões, a seleção do histórico e a folha de mover): o mesmo texto nos três.
const cancelLabel = 'Cancelar';

export const T = Object.freeze({
  coach: {
    idle: 'Quando quiser. Segure espaço para armar.',
    idleInsp: 'Quando quiser. Aperte espaço para começar a inspeção.',
    idleInspTouch: 'Quando quiser. Toque para começar a inspeção.', // modo um toque: a tela inteira começa
    idleInspThumb: 'Quando quiser. Toque num polegar para começar a inspeção.', // dois polegares: só as áreas de polegar
    idleTouch: 'Quando quiser. Segure com os dois polegares.',
    idleOne: 'Quando quiser. Toque e segure para armar.',
    idleTyped: 'Quando quiser. Resolva no seu timer e digite o tempo.', // o modo Digitar: não há o que armar
    inspect: 'Inspeção. Segure para armar quando estiver pronto.',
    arming: 'Armando…',
    ready: 'Solte para começar.',
    pbSingle: (diffMs: number) => `Novo recorde — ${sec(diffMs)} s mais rápido. Vale lembrar o que funcionou.`,
    pbAverage: (n: number, value: string) => `Sua média de ${n} caiu para ${value}. Isso é consistência, não sorte.`,
    milestone: (msg: string, k: number) => `${msg}. Marco ${k} de 9.`,
    dailyGoal: (n: number) => `Meta de ${n} ${n === 1 ? 'solve' : 'solves'} feita. O resto é bônus.`,
    stable: 'Cinco solves dentro de 3 segundos. Ritmo estável.',
    fatigue: 'Seus últimos estão subindo. Uma pausa de 5 minutos costuma ajudar.',
    firstDnf: 'DNF acontece. Respira e segue.',
    back: 'Que bom te ver. Começa leve — o primeiro não conta pra nada.',
    seasonEnd: (n: number, solves: number, from: string | null, to: string | null, finish: string | null) =>
      `Temporada ${n} completa: ${solves.toLocaleString('pt-BR')} ${solves === 1 ? 'solve' : 'solves'}${from && to ? `, melhor média de 12 de ${from} para ${to}` : ''}.${finish ? ` ${finish} liberado.` : ''}`,
    nearAverage: (n: number, gapMs: number, target: string) => `Faltam ${sec(gapMs)} s para a média de ${n} abaixo de ${target}.`,
    nearSingle: (gapMs: number, target: string) => `Esse ficou a ${sec(gapMs)} s do single abaixo de ${target}.`,
    nearCount: (left: number, target: number, inSeason: boolean) =>
      `Faltam ${left} ${left === 1 ? 'solve' : 'solves'} para os ${target.toLocaleString('pt-BR')}${inSeason ? ' da temporada' : ' solves'}.`,
    nearStreak: (days: number) => `${days - 1} dias seguidos. Mais um fecha o marco.`,
    week: (event: string, diffMs: number) => `Sua semana no ${event} foi ${sec(diffMs)} s mais rápida que a anterior.`,
    outlier: (ao12: string) => `Esse escapou. A média de 12 segue em ${ao12}.`,
    goalReached: (phrase: string) => `Meta alcançada: ${phrase}. Essa você escolheu e cumpriu.`,
  },
  // As metas da pessoa: o tipo ("Média de 12") e a frase que o junta ao alvo ("Média de 12 abaixo de 13 s").
  metas: {
    kind: { single: 'Single', ao5: 'Média de 5', ao12: 'Média de 12' },
    below: (kind: string, target: string) => `${kind} abaixo de ${target}`,
    // O quadro da Evolução (a maquete aprovada, 1b, 1c, 3c, 6b, 7b e 7e): uma linha por meta, com o quanto falta ("faltam 0.58 s" em negrito,
    // depois "· melhor 0:13.58"), a data em que chegou ou o que ainda não existe ("ainda sem média de 12"). O nome lido é a linha por extenso,
    // com o caminho da barra ("59% do caminho desde 0:14.41"), e termina no que o toque faz.
    title: 'Metas',
    scope: 'todos os eventos',
    left: (ms: number) => `faltam ${sec(ms)} s`,
    best: (time: string) => ` · melhor ${time}`,
    reached: (date: string) => `✓ alcançada em ${date}`,
    none: { single: 'ainda sem tempo', ao5: 'ainda sem média de 5', ao12: 'ainda sem média de 12' },
    rowGoing: (name: string, event: string, best: string, ms: number, pct: number, start: string) =>
      `${name}, ${event}: melhor ${best}, faltam ${sec(ms)} s, ${pct}% do caminho desde ${start}. Editar a meta`,
    rowReached: (name: string, event: string, date: string, best: string | null) =>
      `${name}, ${event}: alcançada em ${date}${best === null ? '' : `, melhor ${best}`}. Editar a meta`,
    rowNone: (name: string, event: string, none: string) => `${name}, ${event}: ${none}. Editar a meta`,
    new: 'Nova meta',
    // O motivo do "Nova meta" desligado: o limite é o GOAL_MAX de core/goals.ts (6), que o sync pode passar (sete metas de dois aparelhos).
    full: 'São 6 metas, o máximo. Exclua uma para criar outra.',
    empty: 'Escolha um tempo para buscar: um single, uma média de 5 ou de 12, em qualquer evento. O Klick mostra quanto falta e guarda o dia em que você chegar.',
    create: 'Criar uma meta',
    // A folha (3a, 3b, 3d, 3e): tipo, evento e o tempo. Embaixo do tempo, duas linhas: como a meta fica ("Fica " + a meta em negrito + ".";
    // vazio ou torto, a dica; o erro só ao salvar) e o seu melhor de agora ("Seu melhor agora: " + o tempo em negrito + "." e o quanto falta).
    newTitle: 'Nova meta',
    newIntro: 'Um tempo para buscar. O Klick mostra quanto falta.',
    editTitle: 'Editar meta',
    editIntro: 'Mudar o tipo, o evento ou o tempo refaz a meta pelo seu histórico.',
    kindLabel: 'Tipo',
    eventLabel: 'Evento',
    targetLabel: 'Abaixo de',
    placeholder: '15',
    hint: 'Em segundos: 15 é sub-15, e 90 é 1:30.',
    fica: 'Fica ',
    end: '.',
    bad: 'Esse tempo não parece certo. Tente 15, 14.5 ou 90.',
    range: 'Até 59:59.99.',
    bestNow: 'Seu melhor agora: ',
    leftNow: (ms: number) => ` Faltam ${sec(ms)} s.`,
    born: (date: string) => `Seu melhor já está abaixo: ela nasce alcançada, com a data de ${date}.`,
    noTime: (kind: 'single' | 'ao5' | 'ao12', event: string) =>
      `Você ainda não tem ${kind === 'single' ? 'tempo' : kind === 'ao5' ? 'média de 5' : 'média de 12'} no ${event}.`,
    save: 'Salvar',
    remove: 'Excluir',
    confirmAgain: 'Tem certeza? Clique de novo',
    cancel: 'Cancelar',
  },
  chips: {
    vsAvg: (diffMs: number, n: number) => `${diffMs <= 0 ? '▼' : '▲'} ${sec(Math.abs(diffMs))} s vs média de ${n}`,
    vsPb: (diffMs: number) => `▲ ${sec(diffMs)} s do recorde`,
    newPb: (diffMs: number) => `◆ ${sec(diffMs)} s abaixo do recorde`,
    solveN: (n: number) => `solve #${n}`,
  },
  aria: {
    final: (text: string) => `Tempo final: ${text}.`,
  },
  toast: {
    deleted: 'Solve excluído',
    undo: 'Desfazer (Z)',
    undoTouch: 'Desfazer',
    exportCopied: 'Solves copiados. Cole num arquivo .txt para guardar ou importar no csTimer.',
  },
  progress: {
    best: (text: string) => `melhor ${text}`,
    of: (n: number, total: number) => `${n} de ${total}`,
    days: (n: number, total: number) => `${n} de ${total} dias`,
    spread: (text: string) => `menor variação ${text}`,
  },
  // Rótulos dos marcos da T2 em diante (core/season.ts). Os da T1 ficam em MILESTONE_INFO.
  marks: {
    count: (target: number) => `${target} solves na temporada`,
    single: (time: string) => `Single abaixo de ${time}`,
    ao5: (time: string) => `Média de 5 abaixo de ${time}`,
    ao12: (time: string) => `Média de 12 abaixo de ${time}`,
    streak: (days: number) => `${days} dias seguidos`,
    steady: (sec: string) => `5 seguidos dentro de ${sec} s`,
  },
  // Nome de uma sessão criada sem nome (data/repository.ts). Ele vai gravado junto com a sessão.
  session: {
    defaultName: (n: number) => `Sessão ${n}`,
    // A pílula do topo: "3×3 · Sessão 1 ▾".
    pill: (event: string, name: string) => `${event} · ${name} ▾`,
    // As partes dela, para o nome encolher com reticências: "3×3 · " + o nome + " ▾" (o mesmo texto de pill).
    pillEvent: (event: string) => `${event} · `,
    pillCaret: ' ▾',
    // O N de um nome no formato acima; null para qualquer outro nome.
    defaultNameNumber: (name: string): number | null => {
      const m = /^Sessão (\d+)$/.exec(name);
      return m ? Number(m[1]) : null;
    },
  },
  // Datas e tempo relativo (ui/format.ts).
  date: {
    weekdaysShort: Object.freeze(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']),
    monthsShort: Object.freeze(['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']),
    months: Object.freeze(['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']),
    today: 'hoje',
    yesterday: 'ontem',
    daysAgo: (n: number) => `há ${n} dias`,
    now: 'agora',
    minutesAgo: (n: number) => `há ${n} min`,
    hoursAgo: (n: number) => `há ${n} h`,
  },
  // Nomes acessíveis dos gráficos (ui/charts.ts).
  chart: {
    empty: 'Sem solves no período',
    evolution: 'Evolução dos tempos',
  },
  // Nome acessível do Centro quando a tela não dá um mais específico (ui/centro.ts), e a tela do Centro (ui/centro/CentroScreen.svelte).
  centro: {
    label: 'Centro',
    card: 'Centro',
    mode: 'Animação do Centro',
    modeHint: 'Estático não se mexe. Oculto tira o Centro do Timer; os avisos seguem no número e no som.',
    modeOptions: Object.freeze([['animado', 'Animado'], ['estatico', 'Estático'], ['oculto', 'Oculto']] as const),
    progressLabel: (done: number, trailDone: number) => `Centro: ${done} de 9 marcos, ${trailDone} de 9 etapas`,
    finishes: 'Acabamentos',
    preview: (finish: string) => ` · prévia: ${finish}`,
    finishLocked: (label: string, unlock: string) => `${label} · ${unlock}`,
    topFace: (n: number, since: string | null) => (since ? `Face de cima · Temporada ${n}, desde ${since}` : `Face de cima · Temporada ${n}`),
    history: 'Temporadas',
    historyEmpty: 'A primeira temporada ainda está em andamento.',
    // "T1 · 08/10/2025 a 13/10/2026 · 1.204 solves · média de 12 em 1:02.31 · Brilho": sem média ou sem acabamento, a parte some.
    historyRow: (n: number, from: string, to: string, solves: number, ao12: string | null, finish: string | null) =>
      [`T${n}`, `${from} a ${to}`, `${solves.toLocaleString('pt-BR')} ${solves === 1 ? 'solve' : 'solves'}`, ao12 ? `média de 12 em ${ao12}` : null, finish]
        .filter((part) => part !== null)
        .join(' · '),
    // A linha que leva à aba Trilha: "Trilha: 3 de 9 · próxima: Segunda camada" (sem a próxima quando as 9 estão feitas).
    trailSummary: (done: number, next: string | null) => `Trilha: ${done} de 9${next ? ` · próxima: ${next}` : ''}`,
    silentHint: 'Modo silencioso — o Centro continua reagindo, mas sem texto.',
  },
  // Aba Trilha (ui/trilha/*, spec do sub-projeto 4): o começo da aba, as aulas e o treino de algoritmos.
  trilha: Object.freeze({
    progress: (done: number) => `${done} de 9 etapas`,
    prompt: 'Já resolve? Marque o que já sabe.',
    promptOpen: 'Marcar etapas',
    promptDismiss: 'Agora não',
    promptPick: 'O que você já sabe',
    promptSave: 'Marcar',
    promptCancel: 'Cancelar',
    next: 'Próxima etapa',
    start: 'Começar a aula',
    resume: (part: number) => `Continuar do passo ${part}`,
    steps: 'As 9 etapas',
    state: Object.freeze({ done: 'feita', current: 'atual', ahead: 'à frente' }),
    know: 'já sei',
    undo: 'desfazer',
    knowAria: (name: string, marked: boolean) => `${name}: ${marked ? 'desfazer' : 'já sei'}`,
    train: 'Treino',
    trainHint: 'Cada caso aparece montado por um embaralhamento curto. O tempo do treino não entra nas suas estatísticas.',
    sets: Object.freeze({ oll2: 'OLL em 2 passos', pll2: 'PLL em 2 passos', f2l: 'F2L com algoritmos' }),
    firm: (n: number, total: number) => `${n} de ${total} firmes`,
    // O pedaço da aba não carregou (sem rede antes do pré-cache, ou o arquivo falhou): a linha de erro e o botão que tenta de novo.
    loadFailed: 'A Trilha não carregou. Confira a conexão e tente de novo.',
    retry: 'Tentar de novo',
    // A nova tentativa também falhou: o navegador pode ter guardado a falha do import, e aí só recarregar a página resolve.
    loadFailedAgain: 'A Trilha não carregou de novo. Recarregue a página para tentar outra vez.',
    reload: 'Recarregar a página',
    // O leitor de aula (ui/trilha/LessonPlayer.svelte).
    lesson: Object.freeze({
      exit: 'Voltar à trilha',
      partOf: (i: number, n: number) => `passo ${i} de ${n}`,
      partNow: (i: number, n: number, title: string) => `passo ${i} de ${n}: ${title}`, // o anúncio da troca de passo
      alg: 'Algoritmo',
      tip: 'Dica',
      controls: 'Controles do cubo',
      play: 'Tocar',
      pause: 'Pausar',
      back: 'Movimento anterior',
      forward: 'Próximo movimento',
      restart: 'Recomeçar',
      prev: 'Voltar',
      next: 'Próximo',
      done: 'Consegui no meu cubo',
      finish: 'Concluir',
      nextStep: 'Próxima etapa',
      train: 'Treinar os casos',
      flat: 'O cubo 3D não abriu neste aparelho. A figura mostra o estado, e o algoritmo está escrito abaixo.',
      noCube: 'O cubo não abriu neste aparelho. A aula segue pelo texto e pelos movimentos escritos.', // nem a figura 2D carregou
      completed: (name: string) => `${name}: etapa feita.`,
    }),
    // Um conjunto do treino (ui/trilha/SetView.svelte): os casos do mais fraco ao mais firme, o sorteio e a escolha de algoritmo.
    set: Object.freeze({
      start: 'Começar',
      noneIncluded: 'Inclua ao menos um caso no sorteio para começar.',
      cases: 'Do mais fraco ao mais firme',
      level: Object.freeze({ novo: 'novo', aprendendo: 'aprendendo', firme: 'firme', dominado: 'dominado' }),
      // "4 tentativas · 75% de acerto · média 2.41": sem tentativa, só "nenhuma tentativa"; sem certa sem ajuda, sem a média.
      stats: (attempts: number, okRate: number | null, avg: string | null) =>
        attempts === 0
          ? 'nenhuma tentativa'
          : [`${attempts} ${attempts === 1 ? 'tentativa' : 'tentativas'}`, okRate === null ? null : `${Math.round(okRate * 100)}% de acerto`, avg ? `média ${avg}` : null]
              .filter((part) => part !== null)
              .join(' · '),
      include: (name: string) => `${name} no sorteio`,
      recog: 'Como reconhecer',
      algs: (name: string) => `Algoritmo de ${name}`,
    }),
    // A rodada do treino (ui/trilha/TrainRound.svelte, spec 7.2).
    round: Object.freeze({
      end: 'Encerrar',
      setup: 'Monte o caso',
      setupHint: 'Do cubo resolvido, com amarelo em cima e verde na frente, faça o embaralhamento e confira pela figura.',
      help: 'Ver o algoritmo',
      helped: 'com ajuda',
      hint: 'espaço armar · qualquer tecla para · Enter acertei',
      ok: 'Acertei',
      miss: 'Errei',
      last: 'Última tentativa',
      outcome: (ok: boolean, helped: boolean) => `${ok ? 'acerto' : 'erro'}${helped ? ' · com ajuda' : ''}`,
      stopped: (time: string) => `Parou em ${time}. Acertei ou errei?`, // o anúncio da parada do tempo
      caseAvg: (avg: string | null) => (avg ? `média do caso ${avg}` : 'sem média ainda'),
      fixToOk: 'Era acerto',
      fixToMiss: 'Era erro',
      remove: 'Apagar',
      removed: 'Tentativa apagada.',
      empty: 'Todos os casos deste conjunto estão fora do sorteio.',
    }),
  }),
  // Tela da Evolução (ui/evolucao/EvolucaoScreen.svelte). Os nomes dos períodos e as colunas da lista ficam aqui.
  evolucao: {
    eventLabel: 'Evento',
    sessionLabel: 'Sessão',
    allSessions: 'Todas as sessões',
    periodLabel: 'Período',
    periods: Object.freeze({ '7': '7 dias', '30': '30 dias', all: 'Tudo' }),
    stdDev: 'Desvio',
    stdDevPeriod: 'solves do período',
    stdDevValue: (ms: number) => `±${(ms / 1000).toFixed(1)} s`,
    noChange: 'sem mudança',
    // Variação contra o período anterior, em segundos (a mesma truncagem dos tempos).
    delta: (d: number) => `${d < 0 ? '▼' : '▲'} ${sec(Math.abs(d))} s no período`,
    chartLabel: (n: number) => `Solves do período · média de ${n} · recordes`,
    distribution: 'Distribuição',
    binOpen: (from: string): string => `${from} ou mais`, // a última barra, que junta os tempos fora da curva
    highlight: (n: number, time: string) => `em destaque, sua média de ${n} (${time})`,
    barsSummary: (count: number, from: string, to: string) =>
      `Distribuição dos tempos do período: ${count} ${count === 1 ? 'solve' : 'solves'}, mais comuns entre ${from} e ${to}`,
    barsEmpty: 'Distribuição dos tempos do período: sem solves',
    empty: 'Sem solves neste período.',
    columns: Object.freeze({ number: '#', time: 'Tempo', scramble: 'Embaralhamento', when: 'Quando' }),
  },
  // O histórico inteiro (a lista, o detalhe, mover e juntar). As contagens levam o ponto de milhar.
  historico: {
    // Os avisos do lote (o de mover e o de excluir oferecem o "Desfazer"). Um solve só, movido pelo detalhe: "Solve movido para Treino".
    deleted: (n: number) => (n === 1 ? '1 solve excluído' : `${n.toLocaleString('pt-BR')} solves excluídos`),
    moved: (n: number, session: string) =>
      n === 1 ? `Solve movido para ${session}` : `${n.toLocaleString('pt-BR')} solves movidos para ${session}`,
    // O "Desfazer" de mover quando a sessão de onde algum solve veio foi excluída no meio (outra aba): os outros voltam; nenhuma, nada volta.
    undoMoveRefused: 'Alguns solves não voltaram: a sessão de origem foi excluída.',
    undoNothing: 'Nada para desfazer: as sessões de origem não existem mais.',
    merged: (n: number, session: string) =>
      n === 0
        ? `Sessões juntadas em ${session}`
        : `Sessões juntadas: ${n === 1 ? '1 solve passou' : `${n.toLocaleString('pt-BR')} solves passaram`} para ${session}`,
    // Juntar sessões (ui/dialogs/SessionsDialog.svelte): o passo abre na própria linha, como o Renomear. O que o botão "Juntar" diz a quem usa
    // leitor de tela (mergeConfirm) repete o que a linha mostra: de onde, quantos, para onde e que a primeira vai para a lixeira.
    mergeLabel: (from: string, n: number) => `Juntar “${from}” (${solvesLabel(n)}) com`,
    mergeOption: (name: string, n: number) => `${name} · ${solvesLabel(n)}`,
    mergeEffect: (from: string, n: number, to: string) =>
      n === 0
        ? `“${from}” não tem solves e vai para a lixeira.`
        : `${n === 1 ? 'O solve passa' : `Os ${n.toLocaleString('pt-BR')} solves passam`} para “${to}”, e “${from}” vai para a lixeira.`,
    mergeConfirm: (from: string, n: number, to: string) => `Juntar “${from}” (${solvesLabel(n)}) com “${to}” — a primeira vai para a lixeira`,
    mergeSlow: 'São muitos: eles juntam agora neste aparelho, e o resto sobe pelo sync nos próximos dias.',
    mergeGo: 'Juntar',
    // A lista (ui/evolucao/SolveList.svelte): o título com a contagem, as colunas que a tabela de antes não tinha e o nome de cada linha.
    listTitle: (n: number) => `Solves do período · ${n.toLocaleString('pt-BR')}`,
    columns: Object.freeze({ note: 'Nota', pick: 'Seleção' }),
    row: (r: { number: string; time: string; ao5: string | null; ao12: string | null; when: string; pb: boolean; note: string }) =>
      [
        `Solve ${r.number}: ${r.time}`,
        r.ao5 === null ? null : `média de 5 ${r.ao5}`,
        r.ao12 === null ? null : `média de 12 ${r.ao12}`,
        r.when,
        r.pb ? 'recorde' : null,
        r.note === '' ? null : `nota: ${r.note}`,
      ]
        .filter((part) => part !== null)
        .join(', '),
    plus2Spoken: (time: string) => `${time} mais 2`,
    // A seleção: o botão do topo, a caixa de cada linha e a barra do lote (até MAX_SELECTION, em ui/evolucao/rows.ts).
    select: 'Selecionar',
    cancel: cancelLabel,
    pick: (number: string) => `Selecionar o solve ${number}`,
    selection: 'Seleção',
    selected: (n: number) => (n === 1 ? '1 selecionado' : `${n.toLocaleString('pt-BR')} selecionados`),
    atMax: 'o máximo de uma vez',
    selectionCap: 'Até 1.000 solves por vez',
    moveTo: 'Mover para…',
    remove: 'Excluir',
    confirmAgain: 'Tem certeza? Clique de novo',
    // A folha de mover (ui/dialogs/MoveDialog.svelte): só as sessões do mesmo evento, com a contagem de cada uma.
    moveTitle: (n: number, number?: number) =>
      n === 1 ? (number === undefined ? 'Mover o solve' : `Mover o solve #${number.toLocaleString('pt-BR')}`) : `Mover ${n.toLocaleString('pt-BR')} solves`,
    moveIntro: (event: string, n: number) =>
      n === 1
        ? `Só as sessões de ${event}. O solve muda de sessão e continua com a data dele.`
        : `Só as sessões de ${event}. Os solves mudam de sessão e continuam com a data deles.`,
    here: 'está aqui',
    count: solvesLabel,
    // O detalhe de um solve (ui/dialogs/SolveDialog.svelte): o título, o tempo cru, as médias que terminam nele e o selo de recorde.
    solveTitle: (n: number) => `Solve #${n.toLocaleString('pt-BR')}`,
    rawPlus2: (time: string) => `${time} mais 2 s de penalidade`,
    rawDnf: (time: string) => `${time} contado como DNF`,
    penalty: 'Penalidade',
    penaltyOk: 'OK',
    avgChip: (n: number, time: string) => `Média de ${n} · ${time}`,
    // O selo dourado: o solve é o melhor single da lista, ou está numa janela da melhor média (a ao5, ao12, ao50, ao100 ou ao1000).
    inRecord: (kind: 'single' | number) => (kind === 'single' ? '◆ É o recorde de single' : `◆ Faz parte do recorde de média de ${kind}`),
    moveButton: 'Mover para outra sessão',
    copy: 'Copiar',
    // O que o Copiar leva: o tempo com a penalidade, o embaralhamento e a data ("0:15.24+ · U' F2 … · 19/10/2026 21:30").
    copyText: (time: string, scramble: string, when: string) => `${time} · ${scramble} · ${when}`,
    copied: 'Copiado',
    copyFailed: 'Não consegui copiar. Tente de novo.',
    // O quadro de recordes (ui/evolucao/RecordsBoard.svelte): segue o evento e a sessão do filtro, não o período. Uma linha por recorde, com o
    // melhor e o atual ao lado (no single, "último": o último tempo).
    recordsTitle: 'Recordes da sessão',
    recordsScope: 'a sessão inteira',
    recordsTitleAll: 'Recordes do evento',
    recordsScopeAll: 'todas as sessões',
    recordSingle: 'Single',
    recordLast: (time: string) => `último ${time}`,
    recordNow: (time: string) => `atual ${time}`,
    // O nome lido de cada linha: "Média de 12: melhor 0:13.48, atual 0:14.09. Ver os solves do recorde".
    recordRow: (label: string, best: string, now: string) => `${label}: melhor ${best}, ${now}. Ver os solves do recorde`,
    // A folha do recorde (ui/dialogs/RecordDialog.svelte): o título com o valor, os solves (ou o intervalo) e a regra da média.
    recordTitle: (kind: 'single' | number, time: string) => (kind === 'single' ? `Recorde de single · ${time}` : `Melhor média de ${kind} · ${time}`),
    recordSolve: (number: number) => `Solve #${number.toLocaleString('pt-BR')}`,
    recordSolves: (from: number, to: number) => `Solves #${from.toLocaleString('pt-BR')} a #${to.toLocaleString('pt-BR')}`,
    recordRange: (from: string, to: string) => `${from} a ${to}`,
    recordRule: (n: number) =>
      n <= 12
        ? `O melhor e o pior ficam fora da conta, entre parênteses; a média é a dos ${n - 2} do meio.`
        : `A média tira os ${trimCount(n).toLocaleString('pt-BR')} melhores e os ${trimCount(n).toLocaleString('pt-BR')} piores tempos (cerca de 5% de cada lado).`,
    recordMark: 'recorde',
    viewInList: 'Ver na lista',
  },
  // Mensagens de um arquivo que não pode ser lido (data/transfer.ts).
  transfer: {
    klickInvalid: 'Arquivo do Klick inválido.',
    csTimerInvalid: 'Arquivo do csTimer inválido.',
    orphanSession: 'Sem sessão', // a sessão do csTimer que leva os solves vivos cuja sessão não existe mais (exportação do csTimer)
  },
  // Casca (ui/App.svelte): nomes das abas, rótulo das duas barras de navegação e o atalho para o conteúdo.
  tabs: { timer: 'Timer', evolucao: 'Evolução', trilha: 'Trilha', companion: 'Centro', ajustes: 'Ajustes' },
  shell: { nav: 'Seções', skip: 'Pular para o conteúdo' },
  // Aviso de nova versão (ui/dialogs/UpdatePrompt.svelte): o service worker já baixou a versão nova, e a página recarrega ao aceitar.
  update: { ready: 'Nova versão disponível.', reload: 'Recarregar' },
  // Tela Ajustes (ui/ajustes/AjustesScreen.svelte). Os valores de cada grupo ficam aqui; o código só guarda os identificadores.
  ajustes: Object.freeze({
    timer: 'Timer',
    look: 'Aparência e som',
    coach: 'Coach e acessibilidade',
    inspection: 'Inspeção de 15 s',
    inspectionHint: 'Avisos aos 8 e 12 s; +2 depois de 15 s; DNF depois de 17 s.',
    hold: 'Tempo para armar',
    holdHint: 'Quanto tempo segurar até ficar verde.',
    holdOptions: Object.freeze([[0, '0'], [300, '0,3 s'], [550, '0,55 s'], [1000, '1 s']] as const),
    mobileArm: 'Armar no celular',
    mobileArmHint: 'Dois polegares evita disparo sem querer.',
    mobileArmOptions: Object.freeze([['two', 'Dois polegares'], ['one', 'Um toque']] as const),
    entry: 'Como você marca o tempo',
    entryHint: 'Digitar: para quem cronometra num timer físico.',
    entryHintTyping: 'Inspeção, fases e o tempo durante o solve valem só no Cronômetro.',
    entryOptions: Object.freeze([['timer', 'Cronômetro'], ['typing', 'Digitar']] as const),
    phases: 'Fases',
    phasesHintOff: 'Marque o fim de cada fase com um toque durante o solve.',
    phasesHint: 'Um toque por fase; o último para o tempo.',
    phasesHint4: 'Um toque por fase; o último para o tempo. Por exemplo: cruz, F2L, OLL e PLL.',
    phasesOptions: Object.freeze([[0, 'Desligado'], [2, '2'], [3, '3'], [4, '4']] as const),
    liveTime: 'Tempo durante o solve',
    liveTimeHint: 'A inspeção e o tempo final aparecem sempre.',
    liveTimeOptions: Object.freeze([['full', 'Inteiro'], ['seconds', 'Só os segundos'], ['hidden', 'Escondido']] as const),
    dailyGoal: 'Meta do dia',
    dailyGoalHint: 'Solves por dia, somando todos os eventos. O coach avisa quando você chega.',
    dailyGoalOptions: Object.freeze([10, 20, 30, 50, 100] as const),
    theme: 'Tema',
    themeOptions: Object.freeze([['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Noite']] as const),
    scrambleImage: 'Imagem do embaralhamento',
    scrambleImageHint: 'Desenho do cubo para conferir o embaralhamento.',
    soundKlick: 'Som "klick"',
    soundKlickHint: 'Ao ficar pronto e ao parar.',
    inspWarning: 'Aviso da inspeção',
    inspWarningHint: 'Aos 8 e 12 s.',
    inspSound: 'Som do aviso',
    inspSoundHint: 'Voz: “oito” e “doze”, na voz do aparelho. Sem voz em português, toca o bipe.',
    inspSoundHintNoVoice: 'Este aparelho não tem voz em português: o aviso toca o bipe.',
    inspSoundOptions: Object.freeze([[false, 'Bipe'], [true, 'Voz']] as const),
    soundPb: 'Acorde do recorde',
    silent: 'Modo silencioso',
    silentHint: 'O Centro reage, mas o coach não escreve.',
    reducedMotion: 'Reduzir movimento',
    reducedMotionOptions: Object.freeze([['system', 'Seguir o sistema'], ['always', 'Sempre']] as const),
    language: 'Idioma',
    languageHint: 'Inglês fica para depois.',
    languageValue: 'Português (Brasil)',
  }),
  // Diálogos (ui/dialogs/*). O botão de fechar é o mesmo em todos.
  dialog: { close: 'Fechar' },
  // Atalhos do timer (ui/dialogs/ShortcutsDialog.svelte): a tabela do protótipo.
  shortcuts: Object.freeze({
    title: 'Atalhos',
    rows: Object.freeze([
      ['espaço', 'Armar (segure) e largar (solte)'],
      ['qualquer tecla', 'Parar'],
      ['P', '+2 no último solve'],
      ['D', 'DNF no último solve'],
      ['M', 'Nota'],
      ['⌫', 'Excluir o último'],
      ['Z', 'Desfazer a exclusão'],
      ['N', 'Novo embaralhamento'],
      ['?', 'Mostrar atalhos'],
      ['1–5', 'Trocar de aba'],
      ['← →', 'Na aula: um movimento para trás ou para a frente (espaço toca e pausa)'],
      ['Enter', 'No treino: marcar acerto'],
    ] as const),
  }),
  // Guia de instalação (ui/dialogs/InstallGuide.svelte).
  install: Object.freeze({
    title: 'Instalar o Klick',
    iosIntro: 'No iPhone, o Safari pode apagar os dados de um site que você não abre por alguns dias. Instalado na Tela de Início, o Klick protege os seus solves.',
    iosSteps: Object.freeze([
      'Toque em Compartilhar. No iOS 26, ele fica no menu ••• da barra do Safari.',
      'Toque em Adicionar à Tela de Início. Se não aparecer, toque em Ver Mais.',
      'Confirme em Adicionar. O ícone do Klick aparece na Tela de Início.',
    ]),
    iosDataNote:
      'O app instalado guarda os dados à parte do Safari: os solves feitos aqui não aparecem nele. Se já tem solves aqui, exporte em Ajustes e importe no app depois de instalar.',
    otherIntro: 'Instalado, o Klick abre numa janela própria, como um app.',
    installButton: 'Instalar o app',
    menuHint: 'Abra o menu do navegador e escolha instalar o app ou adicionar à tela inicial.',
  }),
  // Avisos de dados (ui/state/app.svelte.ts e a casca). saveFailed é o aviso fixo: enquanto houver solve pendente, fica na tela.
  data: {
    dbUnavailable: 'O navegador bloqueou o armazenamento do Klick. Sem ele, os solves não ficam salvos neste aparelho. Libere o armazenamento para este site e recarregue a página.',
    upgrading: 'Atualizando seus dados… não feche esta aba.',
    upgradeFailed: 'Não consegui atualizar seus dados para esta versão. Eles continuam guardados neste aparelho como estavam. Exporte uma cópia agora, libere espaço no aparelho e tente de novo.',
    upgradeExport: 'Exportar meus dados',
    upgradeRetry: 'Tentar de novo',
    upgradeExportFailed: 'Não consegui ler os dados antigos. Libere espaço no aparelho e tente de novo.',
    upgradeDownloadFailed: 'Não consegui baixar o arquivo. Tente de novo.',
    saveFailed: 'Não consegui salvar. Exporte seus dados agora.', // só para solve: é o alarme de solve perdido
    changeFailed: 'Não consegui guardar esta mudança. Tente de novo.',
    folderSaveFailed: 'Não consegui guardar a pasta escolhida. Tente de novo.',
    exportMarkFailed: 'O arquivo saiu, mas não consegui guardar a data da exportação.',
    exportNow: 'Exportar agora',
    readFailed: 'Não consegui ler seus dados. Recarregue a página.',
    saved: 'Tudo salvo.',
    restoreBlocked: 'Ainda há solves sem salvar. Exporte antes de restaurar.',
    restoreTimeout: 'A restauração está demorando. Seus solves novos estão guardados na memória; exporte antes de recarregar.',
    restoreImportBusy: 'Uma importação ainda está gravando. Tente restaurar daqui a pouco.',
    settingFailed: 'Não consegui guardar este ajuste. Tente de novo.',
    backupFailed: 'Não consegui fazer a cópia automática. Ela será tentada de novo.',
    countFailed: 'O solve está salvo, mas não consegui atualizar a contagem das cópias.',
    folderCopyFailed: 'Não consegui gravar a cópia nessa pasta. Ela será tentada de novo.',
    folderPermissionDenied: 'O navegador não liberou a pasta. Tente de novo ou escolha outra pasta.',
    dbUpdated: 'O Klick foi atualizado em outra aba. Recarregue esta para continuar.',
    dbUpdatedUnsaved: 'O Klick foi atualizado em outra aba. Há solves que só esta aba tem: exporte antes de recarregar.',
    dbCloseOthers: 'Feche as outras abas do Klick para terminar a atualização.',
  },
  // Tela do Timer (ui/timer/*): embaralhamento, ações do solve, nota, tiles, constância e zonas de toque.
  timer: {
    hints: 'espaço armar · qualquer tecla para · N novo embaralhamento · ? atalhos',
    side: 'Coach e constância',
    coachLabel: 'Coach',
    scramble: 'Embaralhamento',
    generating: 'gerando…',
    scrambleFailed: 'Não consegui gerar o embaralhamento.',
    scrambleRetry: 'Aperte N para tentar de novo.',
    scrambleReload: 'Se continuar assim, recarregue a página.',
    newRecord: 'Novo recorde',
    // Textos do tempo e das penalidades na tela (o zero, o traço sem média, DNF, +2 e o sufixo "+" de um tempo com +2).
    zero: '0:00.00',
    none: '—',
    dnf: 'DNF',
    plus2: '+2',
    plus2Suffix: '+',
    // O modo Digitar (o tempo vem de um timer de fora): o campo, a linha embaixo dele (a dica, como o tempo fica ou o erro) e o motivo do
    // DNF digitado ter OK e +2 desligados.
    hintsTyped: 'Enter salva · Esc solta o campo e volta aos atalhos (P, D, M, ⌫, N, Z) · ? atalhos',
    voice8: 'oito', // o que a voz do aviso da inspeção fala aos 8 s e aos 12 s (e de amostra, ao escolher Voz no Ajustes)
    voice12: 'doze',
    typedLabel: 'Seu tempo',
    typedSave: 'Salvar',
    typedHint: 'Só os números: 1234 vira 12.34.',
    typedHintLong: 'Só os números (1234 vira 12.34), ou 12.34 e 1:02.34. Um + no fim é +2; DNF é DNF.',
    typedFica: 'Fica',
    typedFicaPlus2: (raw: string) => `: ${raw} mais 2 s de penalidade.`,
    typedError: 'Esse tempo não parece certo. Tente 12.34, 1:02.34 ou só os números.',
    typedTooLong: 'Até 59:59.99: tempos de uma hora ou mais não entram.',
    typedDnfLocked: 'Digitado sem tempo: não vira OK nem +2.',
    // O tempo durante o solve no modo "Escondido": a palavra no lugar do tempo correndo.
    solving: 'Resolvendo',
  },
  // Fases do solve (marcadas por toque no cronômetro): os nomes do CFOP (4 fases no 3×3) e o genérico dos outros casos.
  fases: {
    cfop: ['Cruz', 'F2L', 'OLL', 'PLL'],
    word: FASE,
    n: (i: number) => `${FASE} ${i}`,
    // A barra das fases (PhaseBar): o nome da lista, a duração de cada fase ("6.12 s" abaixo de um minuto, "1:02.40" daí em diante) e o que
    // só o leitor ouve depois da parte ("46% do tempo, a que mais pesa").
    bar: 'Fases deste solve',
    dur: phaseDur,
    share: (pct: number) => `${pct}%`,
    ofTime: ' do tempo',
    ofTimeTop: ' do tempo, a que mais pesa',
    // A seção do detalhe do solve (o nome dela).
    title: 'Fases',
    // O quadro da Evolução (a maquete aprovada, 7a): o nome da lista, o cabeçalho com o que entrou na média ("as últimas 12 com 4 fases") e a
    // nota da fase que mais pesa ("A fase F2L é a que mais pesa: 45% do tempo, 6.24 s em média."; o nome é o número ou o do CFOP).
    boardTitle: 'Fases',
    boardBar: 'Média de cada fase',
    boardScope: (used: number, n: number) => `${used === 1 ? 'o último' : used >= 12 ? `as últimas ${used}` : `os ${used} últimos`} com ${n} fases`,
    boardTop: (name: string, pct: number, ms: number) => `A fase ${name} é a que mais pesa: ${pct}% do tempo, ${phaseDur(ms)} em média.`,
  },
  // O quadro "Semanas" da Evolução (a maquete aprovada, 1a–1c, 6a, 6c e 7a): as últimas 12 semanas de seg a dom, a média de cada uma e a mudança
  // sobre a anterior (▼ mais rápida, ▲ mais lenta; os símbolos não têm cor). No celular as partes "solves" e "melhor" perdem a coluna e voltam
  // por extenso (as `ph`); o cabeçalho das colunas fica só para o leitor de tela.
  semanas: {
    title: 'Semanas',
    scope: 'de seg a dom',
    now: 'Esta semana',
    // A linha dos últimos 28 dias: o número vai em negrito, entre a frase e o ponto.
    sumFell: 'Nos últimos 28 dias, sua média caiu ',
    sumRose: 'Nos últimos 28 dias, sua média subiu ',
    sumSame: 'Nos últimos 28 dias, sua média ficou igual.',
    sumEnd: '.',
    cols: { week: 'Semana', solves: 'Solves', mean: 'Média', best: 'Melhor', change: 'Mudança' },
    // "41 solves · 2 DNF": o número na coluna, a palavra e o "·" na parte do celular (`solvesWord`, `dot`), os DNF depois.
    none: 'sem solves',
    solvesWord: (n: number) => (n === 1 ? ' solve' : ' solves'),
    dot: ' ·',
    dnf: (n: number) => ` ${n} DNF`,
    bestWord: 'melhor ',
    dash: '—',
    record: 'recorde',
    diff: (ms: number) => `${sec(ms)} s`,
    faster: ' mais rápida',
    slower: ' mais lenta',
    same: 'igual',
    rule: 'A média da semana deixa os DNF de fora e tira 5% de cada lado; com menos de 5 solves, fica “—”.',
  },
  // O ano de treino da Evolução (a maquete aprovada, 1b, 1c, 2a, 6c e 7b): 53 colunas de seg a dom com a intensidade de cada dia, a sequência atual,
  // a maior e os dias treinados. A grade é só desenho (aria-hidden): o leitor ouve o texto do período e um item por mês (`period`, `month`).
  constancia: {
    title: 'Constância · todos os eventos',
    scope: '53 semanas',
    less: 'menos',
    more: 'mais',
    current: 'Sequência atual',
    best: 'Maior sequência',
    trained: 'Dias treinados',
    // Os números ("6 dias", "1 dia", "0 dias") e as linhas de baixo: "desde 16/10", "10/08 a 01/09", "de 367".
    days: daysLabel,
    since: (date: string) => `desde ${date}`,
    range: (from: string, to: string) => `${from} a ${to}`,
    of: (n: number) => `de ${n.toLocaleString('pt-BR')}`,
    // O texto do leitor: o período com os totais e as duas sequências ("23 dias, de 10/08 a 01/09"; sem sequência, "0 dias"), e um item por
    // mês ("novembro de 2025: 17 dias, 132 solves").
    streakSr: (days: number, range: string) => (days === 0 ? daysLabel(0) : `${daysLabel(days)}, de ${range}`),
    period: (from: string, to: string, days: number, solves: number, current: string, best: string) =>
      `Calendário de ${from} a ${to}, todos os eventos: ${daysLabel(days)} com solves, ${solvesLabel(solves)}. Sequência atual: ${current}. Maior sequência: ${best}.`,
    month: (name: string, year: number, days: number, solves: number) =>
      solves === 0 ? `${name} de ${year}: nenhum solve` : `${name} de ${year}: ${daysLabel(days)}, ${solvesLabel(solves)}`,
    // A dica do dia (toque ou mouse): "31 solves" em negrito (`tipCount`), depois "· qua, 14/10/2026" (`tipDay`).
    tipCount: (n: number) => (n === 0 ? 'nenhum solve' : solvesLabel(n)),
    tipDay: (weekday: string, date: string) => ` · ${weekday}, ${date}`,
  },
  actions: { plus2: '+2', dnf: 'DNF', note: 'Nota', delete: 'Excluir' },
  note: {
    label: 'Nota sobre este solve',
    save: 'Salvar',
    button: (text: string) => `Nota: ${text}`,
  },
  tiles: {
    avg: (n: number) => `Média de ${n}`,
    avg12: 'Média de 12',
    record: 'Recorde',
    today: 'Hoje',
    todaySub: (goal: number) => `solves · meta ${goal}`,
  },
  heat: {
    label: (month: string) => `Constância · ${month}`,
    streak: (n: number) => (n === 1 ? '1 dia seguido' : `${n} dias seguidos`),
    day: (day: number, count: number, pb: boolean, today: boolean) =>
      `Dia ${day}: ${count} ${count === 1 ? 'solve' : 'solves'}${pb ? ' · recorde' : ''}${today ? ' · hoje' : ''}`,
  },
  zones: { two: 'polegar', one: 'toque e segure' },
  // Seus dados (ui/ajustes/DataSection.svelte e os diálogos de dados). Os tamanhos são decimais (KB = 1 000 bytes), como o navegador mostra.
  dados: Object.freeze({
    title: 'Seus dados',
    storage: 'Armazenamento',
    checking: 'Verificando…',
    protectedLabel: 'Protegido',
    unprotectedLabel: 'Não protegido',
    unknownLabel: 'Não dá para verificar',
    protectedHint: 'O navegador não apaga estes dados sozinho.',
    unprotectedHint: 'Sem a proteção, o navegador pode apagar estes dados se faltar espaço.',
    unknownHint: 'Este navegador não informa.',
    protect: 'Proteger meus dados',
    bytes: (n: number): string => {
      const fmt = (v: number): string => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
      if (n >= 1e9) return `${fmt(n / 1e9)} GB`;
      if (n >= 1e6) return `${fmt(n / 1e6)} MB`;
      if (n >= 1e3) return `${fmt(n / 1e3)} KB`;
      return `${Math.round(n)} B`;
    },
    usage: (used: string, quota: string | null): string => (quota === null ? `${used} em uso` : `${used} em uso de ${quota}`),
    backups: 'Cópias automáticas',
    backupsHint: 'Uma a cada 50 solves e uma por dia, guardadas neste aparelho.',
    backupsView: (n: number | null): string => (n === null ? 'Ver cópias' : `Ver cópias (${n})`),
    trash: 'Lixeira',
    trashHint: 'Solves e sessões excluídos ficam aqui por 30 dias.',
    trashView: (n: number | null): string => (n === null ? 'Ver lixeira' : `Ver lixeira (${n})`),
    export: 'Exportar',
    lastExport: (when: string): string => `Última exportação: ${when}.`,
    neverExported: 'Ainda não exportou.',
    sinceExport: (n: number): string => `${n} ${n === 1 ? 'solve' : 'solves'} desde então.`,
    exportKlick: 'Exportar (Klick)',
    exportCsTimer: 'Exportar (csTimer)',
    import: 'Importar',
    importHint: 'Arquivo do Klick ou do csTimer, em .json ou .txt.',
    importFile: 'Importar arquivo',
    importV1: 'Importar da versão anterior',
    importV1Hint: 'Os solves da versão anterior guardados neste aparelho.',
    folder: 'Pasta de cópias automáticas',
    folderHint: 'Escolha uma pasta do aparelho para guardar uma cópia a cada 100 solves.',
    folderChosen: 'Guardando uma cópia a cada 100 solves nessa pasta.',
    folderChoose: 'Escolher pasta',
    folderChange: 'Trocar pasta',
    folderPermissionLost: 'Permissão da pasta expirou.',
    folderAllowAgain: 'Permitir de novo',
    install: 'Instalação',
    installHint: 'Instalado na Tela de Início, o Klick protege seus dados no iPhone.',
    installButton: 'Como instalar',
    installedLabel: 'Instalado',
    installedHint: 'O Klick está instalado neste aparelho.',
    persistFailed: 'Não consegui pedir a proteção dos dados. Tente de novo mais tarde.',
    persistDenied: 'O navegador não liberou a proteção agora. Você pode tentar de novo depois.',
    persistUnsupported: 'Este navegador não permite proteger os dados deste site.',
    fileUnreadable: 'Não consegui ler o arquivo.',
    folderFailed: 'Não consegui abrir essa pasta.',
    nothingV1: 'Não encontrei solves da versão anterior neste aparelho.',
    importFailed: 'Não consegui importar. Seus solves continuam como estavam.',
    importWhileRestoring: 'Há uma restauração em andamento. Importe de novo quando ela terminar.',
  }),
  // Diálogo de exportar: aparece quando o navegador não baixa o arquivo (iframe, ou o download falhou).
  exportDialog: Object.freeze({
    title: 'Exportar',
    klickIntro: 'Não foi possível baixar o arquivo daqui. Copie o texto e cole num arquivo .json para guardar ou importar depois.',
    csIntro: 'Não foi possível baixar o arquivo daqui. Copie o texto e cole num arquivo .txt para guardar ou importar no csTimer.',
    klickLabel: 'Solves no formato do Klick',
    csLabel: 'Solves no formato do csTimer',
    copy: 'Copiar',
    copiedKlick: 'Solves copiados. Cole num arquivo .json para guardar ou importar depois.',
    copyManual: 'Não consegui copiar daqui. O texto já está selecionado: copie com Ctrl+C ou Cmd+C.',
  }),
  // Diálogo de importar: a lista de sessões do csTimer (com o evento a escolher) e o resumo depois de importar.
  importDialog: Object.freeze({
    title: 'Importar solves',
    csTimerIntro: 'Estas sessões vieram de um arquivo do csTimer. As que não trazem o evento só entram depois que você escolher um.',
    count: (n: number): string => `${n} ${n === 1 ? 'solve' : 'solves'}`,
    eventLabel: (name: string): string => `Evento de ${name}`,
    eventPlaceholder: 'Escolha o evento',
    needEvent: 'Escolha o evento de pelo menos uma sessão para importar.',
    confirm: 'Importar solves',
    result: (added: number, existing: number): string =>
      `${added} ${added === 1 ? 'solve importado' : 'solves importados'}, ${existing} ${existing === 1 ? 'já existia' : 'já existiam'}.`,
    missed: (n: number): string =>
      n === 1
        ? '1 solve não entrou por um erro. Importe o mesmo arquivo de novo para tentar outra vez.'
        : `${n} solves não entraram por um erro. Importe o mesmo arquivo de novo para tentar outra vez.`,
    skippedSessions: (n: number): string => `${n} ${n === 1 ? 'sessão ficou' : 'sessões ficaram'} de fora por não ter um evento conhecido.`,
    unreadable: (n: number): string =>
      n === 1 ? '1 registro da versão anterior não pôde ser lido.' : `${n} registros da versão anterior não puderam ser lidos.`,
    refused: (n: number): string =>
      n === 1
        ? '1 registro do arquivo ficou de fora por não estar num formato que o Klick aceita.'
        : `${n} registros do arquivo ficaram de fora por não estarem num formato que o Klick aceita.`,
    offerNotMarked: 'Os solves entraram, mas não consegui guardar que a oferta foi feita. Importar de novo não duplica os solves.',
    repeated: (n: number): string =>
      n === 1 ? '1 solve aparecia repetido no arquivo: entrou só a versão mais recente.' : `${n} solves apareciam repetidos no arquivo: entrou só a versão mais recente de cada um.`,
    settingsApplied: 'Os ajustes e o progresso do arquivo vieram junto.',
  }),
  // Diálogo das cópias automáticas. Restaurar pede um segundo clique: a troca substitui tudo.
  backupsDialog: Object.freeze({
    title: 'Cópias automáticas',
    intro: 'Restaurar troca todos os seus dados pela cópia escolhida. Antes, o estado atual vai para uma cópia nova, então nada se perde.',
    empty: 'Ainda não há cópias neste aparelho.',
    reason: Object.freeze({
      auto50: 'Automática, a cada 50 solves',
      daily: 'Automática, do dia',
      manual: 'Manual',
      'pre-restore': 'Antes de uma restauração',
      'pre-sync': 'Antes de juntar com a conta',
    }),
    label: Object.freeze({ v3: 'Antes da atualização para a conta e o sync' }),
    solves: (n: number): string => `${n} ${n === 1 ? 'solve' : 'solves'}`,
    restore: 'Restaurar',
    restoreAria: (when: string): string => `Restaurar a cópia de ${when}`,
    confirm: 'Tem certeza? Clique de novo',
    restored: 'Cópia restaurada.',
    restoreFailed: 'Não consegui restaurar esta cópia. Seus dados continuam como estavam.',
    restoreBusy: 'Já há uma restauração em andamento.',
    loadFailed: 'Não consegui ler as cópias.',
  }),
  // Diálogo da lixeira: solves e sessões excluídos, cada um com o seu restaurar.
  trashDialog: Object.freeze({
    title: 'Lixeira',
    intro: 'Solves e sessões excluídos. Ficam aqui por 30 dias e depois somem de vez. Restaurar uma sessão traz de volta os solves dela que estão aqui.',
    empty: 'A lixeira está vazia.',
    sessionKind: 'Sessão',
    sessionSolves: (n: number): string => (n === 0 ? 'sem solves' : n === 1 ? '1 solve' : `${n} solves`),
    deletedOn: (when: string): string => `excluído em ${when}`,
    restore: 'Restaurar',
    restoreSession: (name: string): string => `Restaurar sessão ${name}`,
    restoreSolve: (time: string): string => `Restaurar solve ${time}`,
    restored: 'Restaurado.',
    loadFailed: 'Não consegui ler a lixeira.',
  }),
  // Sessões (ui/dialogs/SessionsDialog.svelte): as sessões por evento; criar, escolher, renomear e excluir (excluir vai para a lixeira).
  sessions: Object.freeze({
    title: 'Sessões',
    intro: 'Cada sessão guarda os solves de um evento. Excluir manda a sessão e os solves dela para a lixeira. Juntar leva os solves para outra sessão do mesmo evento.',
    newEvent: 'Evento da nova sessão',
    newName: 'Nome da nova sessão',
    newNamePlaceholder: 'Nome (opcional)',
    create: 'Criar',
    count: solvesLabel,
    merge: 'Juntar com…',
    mergeAria: (name: string): string => `Juntar ${name} com outra sessão`,
    rename: 'Renomear',
    renameAria: (name: string): string => `Renomear ${name}`,
    renameLabel: (name: string): string => `Novo nome para ${name}`,
    save: 'Salvar',
    cancel: cancelLabel,
    remove: 'Excluir',
    removeAria: (name: string): string => `Excluir ${name}`,
  }),
  // Primeira vez (ui/dialogs/OnboardingDialog.svelte): o tour do protótipo em três passos, a pergunta da trilha e as opções do fim. Não há
  // dados de exemplo.
  onboarding: Object.freeze({
    title: 'Apresentação do Klick',
    stepOf: (n: number): string => `${n} de 4`,
    steps: Object.freeze([
      {
        title: 'Esse é o Centro',
        text: 'Ele acompanha seus solves e guarda a sua jornada no próprio corpo: os marcos na face de cima, a trilha na face do lado.',
      },
      {
        title: 'Segure até ficar verde',
        text: 'Segure espaço (ou o botão abaixo). O anel enche de vermelho; quando ficar verde, solte.',
        touchText: 'Segure o botão abaixo. O anel enche de vermelho; quando ficar verde, solte.',
      },
      {
        title: 'Seu primeiro marco',
        text: 'Pare com qualquer tecla. O primeiro solve já acende um adesivo dourado em cima do Centro.',
        touchText: 'Pare com um toque na tela. O primeiro solve já acende um adesivo dourado em cima do Centro.',
      },
      {
        title: 'Já resolve o cubo?',
        text: 'Se ainda não, a trilha ensina do zero, com o cubo na mão: são 9 etapas, da cruz branca ao CFOP.',
      },
    ] as const),
    skip: 'Pular apresentação',
    next: 'Continuar',
    back: 'Voltar',
    holdIdle: 'Segure aqui',
    holdReady: 'Agora solte',
    holdDone: 'É assim que larga.',
    notYet: 'Ainda não',
    already: 'Já resolvo',
    end: 'Você pode trazer solves de outro lugar ou começar do zero.',
    importCsTimer: 'Importar do csTimer',
    importFileTour: 'Importar arquivo do csTimer', // o rótulo do seletor escondido do tour (o de Seus dados tem o seu)
    importV1: 'Importar da versão anterior',
    fresh: 'Começar do zero',
  }),
  // Lembrete de exportar (ui/timer/TimerScreen.svelte): aviso discreto acima dos tiles, fora da inspeção e do solve.
  reminder: Object.freeze({
    text: 'Faz um tempo que você não exporta seus solves. Guarde uma cópia fora do navegador.',
    later: 'Agora não',
  }),
  season: (n: number, done: number, finish: string) => `Temporada ${n} · ${done} de 9 marcos · ${finish}`,
  // O desafio por link (spec do desafio e a maquete aprovada, docs/design/2026-10-19-desafio-maquete.html): a pílula do Timer, as folhas,
  // o modo desafio do Timer e as telas de fim. O texto é o da maquete; o que ela não desenha (o erro de gerar, o empate, a resposta sem
  // nome) segue o tom dela.
  duel: Object.freeze({
    // A barra do topo (1, 3): "Desafiar" ao lado da pílula da sessão; no modo, uma pílula só.
    challenge: 'Desafiar',
    pill: (event: string): string => `Desafio · ${event} ▾`,
    // A folha "Desafiar" (2a, 2b)
    sheetTitle: 'Desafiar',
    sheetText: 'Você resolve sete embaralhamentos e manda o link. Quem receber joga contra os seus tempos, um por vez; primeiro a 3 pontos vence.',
    eventLabel: 'Evento',
    outsideStats: 'Os tempos do desafio não entram nas suas médias nem nos recordes.',
    start: 'Começar',
    cancel: 'Cancelar',
    generating: 'Gerando os sete embaralhamentos…',
    generateFailed: 'Não consegui gerar os sete embaralhamentos. Tente de novo.',
    // O modo desafio do Timer (3, 6a, 6b e o desktop)
    scramble: (n: number): string => `Embaralhamento ${n} de 7`,
    card: (event: string): string => `Desafio · ${event}`,
    now: 'agora',
    hints: 'espaço armar · qualquer tecla para · P +2 · D DNF · os tempos do desafio não entram nas médias',
    // B confere a penalidade e vê o ponto: o espaço não arma (só os atalhos que valem ali).
    hintsConfirm: 'P +2 · D DNF · os tempos do desafio não entram nas médias',
    hintsReveal: 'os tempos do desafio não entram nas médias',
    // A pílula do modo (3b)
    menuLabel: 'Desafio',
    menuTitle: (event: string): string => `Desafio · ${event}`,
    menuText: (n: number | null): string =>
      `${n === null ? '' : `Embaralhamento ${n} de 7. `}Sair não perde nada: o desafio fica em Evolução › Desafios e continua de onde parou.`,
    keepGoing: 'Continuar o desafio',
    pause: 'Pausar e voltar ao Timer',
    discard: 'Descartar o desafio',
    confirmAgain: 'Tem certeza? Clique de novo',
    // A terminou (4)
    readyLabel: 'Desafio pronto',
    readyCoach: 'Sete de sete. Agora é com quem receber.',
    myTimes: (event: string): string => `Seus tempos · ${event}`,
    nameLabel: 'Seu nome no desafio (opcional)',
    nameHint: 'Só quem receber este link vê. Fica guardado nos Ajustes.',
    nameHintReply: (them: string): string => `${them} vê na resposta. Fica guardado nos Ajustes.`,
    nameCount: (n: number, max: number): string => `${n}/${max}`,
    // A penalidade do sétimo, na tela de mandar, até o link sair (como o "+2 e DNF valem para o 2" do Timer).
    lastPenalty: (n: number): string => `+2 e DNF valem para o ${n}.`,
    send: 'Mandar o desafio',
    preparing: 'Preparando o link…', // o link é preparado antes do toque: a folha do sistema só abre dentro dele
    sendNote: 'Abre o compartilhar do aparelho. Sem ele, o link é copiado.',
    copyLink: 'Copiar o link',
    copied: 'Link copiado. Cole na conversa.',
    copyFailed: 'Não consegui copiar o link. Tente de novo.',
    sentNotSaved: 'O link saiu, mas não consegui guardar que o desafio foi mandado. Mande de novo.',
    // O texto que vai com o link: sem nome, o "Alguém te desafiou" do convite.
    shareText: (name: string, event: string): string => `${name || 'Alguém'} te desafiou no Klick: ${event}, sete embaralhamentos, primeiro a 3 pontos.`,
    replyText: (name: string, event: string): string => `${name || 'Alguém'} respondeu ao seu desafio no Klick: ${event}, a partida inteira, ponto a ponto.`,
    // B abre o link (5)
    inviteLabel: 'Desafio por link',
    invited: (name: string): string => (name ? `${name} te desafiou` : 'Alguém te desafiou'),
    chipScrambles: '7 embaralhamentos',
    chipTarget: 'primeiro a 3 pontos',
    inviteText: (name: string): string =>
      `Um por vez, sem refazer: depois de cada solve, aparece o tempo de ${name || 'quem desafiou'} naquele embaralhamento e quem levou o ponto.`,
    noAccount: 'Sem conta e sem instalar nada.',
    localOnly: 'Seus tempos ficam só neste aparelho.',
    localAndAccount: 'Seus tempos ficam neste aparelho e na sua conta.', // quem tem conta: o desafio sobe no sync
    accept: 'Aceitar',
    notNow: 'Agora não',
    // A penalidade antes do ponto (6a) e a revelação (6b)
    seePoint: 'Ver o ponto',
    checkPenalty: 'Confira a penalidade antes: depois do ponto, o tempo fica.',
    pointMine: 'Ponto seu',
    pointTheirs: (name: string): string => (name ? `Ponto de ${name}` : 'Ponto do oponente'),
    pointNone: (twoDnf: boolean): string => `Ninguém pontua · ${twoDnf ? 'dois DNF' : 'empate no centésimo'}`,
    withPlus2: (time: string): string => `${time} com +2`,
    youFaster: (diff: string): string => `você foi ${diff} s mais rápido`,
    theyFaster: (name: string, diff: string): string => `${name || 'o oponente'} foi ${diff} s mais rápido`,
    next: 'Próximo',
    // "Ranielli: 0:15.51 com +2. Ponto seu. Você 2, Ranielli 1."
    revealAria: (them: string, time: string, verdict: string, mine: number, theirs: number): string =>
      `${them}: ${time}. ${verdict}. Você ${mine}, ${them} ${theirs}.`,
    // O placar em peças: quem é quem pelo nome da linha; o leitor de tela ouve por extenso.
    me: 'Você',
    opponent: 'Oponente',
    yourOpponent: 'Seu oponente',
    board: (them: string, mine: number, theirs: number, cells: readonly string[]): string =>
      `Placar: Você ${mine}, ${them} ${theirs}. ${cells.map((c, i) => `${i + 1}: ${c}`).join('; ')}.`,
    cellMine: 'ponto seu',
    cellTheirs: (name: string): string => (name ? `ponto de ${name}` : 'ponto do oponente'),
    cellNone: 'ninguém pontua',
    cellOpen: 'ainda não jogado',
    cellSkip: 'não jogado',
    // O fim da partida (7, 8)
    youWon: (mine: number, theirs: number, bySingle: boolean): string => `Você venceu ${mine} × ${theirs}${bySingle ? ' no melhor single' : ''}`,
    theyWon: (name: string, theirs: number, mine: number, bySingle: boolean): string =>
      `${name || 'Seu oponente'} venceu ${theirs} × ${mine}${bySingle ? ' no melhor single' : ''}`,
    draw: (mine: number, theirs: number): string => `Empate em ${mine} × ${theirs}`,
    standing: (them: string, mine: number, theirs: number): string => `Você ${mine} × ${theirs} ${them}`, // uma partida que não acabou (só para ver)
    against: (name: string, event: string, n: number): string => `${name ? `Contra ${name}` : 'Contra o oponente'} · ${event} · fechou no embaralhamento ${n}`,
    closedBy: (who: string, n: number): string => `${who} fechou no embaralhamento ${n}.`,
    closedAt: (n: number): string => `A partida fechou no embaralhamento ${n}.`,
    myBest: (time: string): string => `Seu melhor da partida: ${time}.`,
    colNumber: '#',
    colPoint: 'Ponto',
    pointCellMine: 'seu',
    pointCellNone: 'ninguém',
    notPlayed: (n: number): string => (n === 1 ? 'não jogado' : 'não jogados'),
    yoursUnplayed: (times: readonly string[]): string =>
      times.length === 1 ? `seu ${times[0]}` : `seus ${times.slice(0, -1).join(', ')} e ${times.at(-1)}`,
    sendReply: 'Mandar a resposta',
    replyNote: (name: string): string => `${name || 'Quem desafiou'} vê a partida inteira, ponto a ponto.`,
    rematch: 'Desafiar de volta',
    // A abre a resposta (8)
    replyLabel: 'Resposta do desafio',
    replyArrived: (title: string, closed: string): string => `${title}. ${closed}`, // o anúncio da resposta que chegou com a tela aberta
    seeAll: 'Ver em Desafios',
    close: 'Fechar',
    // A resposta que abriu fora do app (no iPhone, o Klick da tela de início guarda à parte do Safari): colar o link, e a visualização sem o
    // desafio explica onde colar.
    paste: 'Colar a resposta',
    pasteLabel: 'Cole o link da resposta',
    pasteOpen: 'Abrir',
    pasteNotDuel: 'Isso não é um link de desafio do Klick. Copie o link da resposta e tente de novo.',
    strayText:
      'Este aparelho não tem o seu desafio. Se você o mandou de outro lugar (como o app instalado), copie este link e cole a resposta por lá.',
    // Link inválido (10)
    invalidTitle: 'Este desafio não abre nesta versão do Klick',
    invalidText: 'O link pode ter sido cortado no caminho ou vir de uma versão mais nova do Klick. Peça o link de novo a quem mandou.',
    invalidNothing: 'Nada mudou no seu Klick.',
    // Evolução › Desafios (9a, 9b, 9c): o cartão no topo, a lista e a partida aberta.
    entryLabel: 'Desafios',
    // "1 jogando · 1 esperando resposta · 3 terminados": só os estados que existem.
    summary: (playing: number, waiting: number, done: number): string =>
      [
        playing > 0 ? `${playing} jogando` : '',
        waiting > 0 ? `${waiting} esperando resposta` : '',
        done > 0 ? `${done} ${done === 1 ? 'terminado' : 'terminados'}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    listTitle: 'Desafios',
    backTo: (to: string): string => `Voltar para ${to}`, // "‹ Evolução" e "‹ Desafios": o nome acessível diz para onde volta
    tagPlaying: 'jogando',
    tagWaiting: 'esperando resposta',
    tagDone: 'terminado',
    sentTitle: 'Desafio mandado', // o desafio de A esperando a resposta, sem o nome de ninguém ainda
    ownTitle: 'Seu desafio', // o de A antes de mandar
    rowScore: (mine: number, theirs: number): string => `Você ${mine} × ${theirs}`,
    listNote: 'Os tempos dos desafios ficam fora das médias e dos recordes.',
    youChallenged: 'Você desafiou',
    matchLabel: (who: string, event: string, when: string): string => `${who} · ${event} · ${when}`,
    waitingTitle: 'Esperando resposta',
    resend: 'Mandar de novo',
    delete: 'Excluir',
    deleteNote: 'Vai para a lixeira, com os solves e as sessões, e some de vez em 30 dias.',
    deleted: 'Desafio excluído',
    // A lixeira em Ajustes: a linha "Desafio · Bia · 3×3", com o seu Restaurar; o título é o da lista ("Desafio mandado · 2×2" já diz que é um
    // desafio: `own`, o de A antes da resposta). Com um desafio nela, os textos da lixeira falam deles também.
    trashRow: (name: string, event: string, own = false): string => (own ? `${name} · ${event}` : `Desafio · ${name} · ${event}`),
    trashRestore: (name: string, event: string): string => `Restaurar desafio · ${name} · ${event}`,
    trashHint: 'Solves, sessões e desafios excluídos ficam aqui por 30 dias.',
    trashIntro:
      'Solves, sessões e desafios excluídos. Ficam aqui por 30 dias e depois somem de vez. Restaurar uma sessão traz de volta os solves dela que estão aqui.',
  }),
  // Conta e sync (sub-projeto 5a): Ajustes, o diálogo de entrar, o indicador e os avisos. Voz calma; nada de culpa.
  conta: Object.freeze({
    syncFailedLive: 'O sync parou. Seus solves continuam salvos neste aparelho.',
    syncBackLive: 'O sync voltou a funcionar.',
    // O pedido do código (spec 7.5): o Turnstile recusado tem mensagem própria, diferente do limite e da falta de rede.
    captchaFailed: 'Não deu para confirmar que você é uma pessoa. Tente de novo em instantes.',
    // Ajustes, "Conta e sync" (spec 9.1)
    title: 'Conta e sync',
    pitch: 'Guarde seus solves na nuvem e use em outros aparelhos.',
    signIn: 'Entrar ou criar conta',
    syncNow: 'Sincronizar agora',
    syncing: 'Sincronizando…',
    sending: (sent: number, total: number): string => `Enviando ${sent.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}…`,
    receiving: (n: number): string => `Recebendo da conta: ${n.toLocaleString('pt-BR')}…`,
    synced: (ago: string | null): string => (ago ? `Sincronizado ${ago}` : 'Sincronizado'),
    ago: (ms: number): string => {
      if (ms < 60_000) return 'agora';
      if (ms < 3_600_000) return `há ${Math.floor(ms / 60_000)} min`;
      if (ms < 86_400_000) return `há ${Math.floor(ms / 3_600_000)} h`;
      const days = Math.floor(ms / 86_400_000);
      return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
    },
    waiting: (n: number): string =>
      n === 0 ? 'Esperando rede' : `${n.toLocaleString('pt-BR')} ${n === 1 ? 'mudança esperando' : 'mudanças esperando'} rede`,
    failed: 'O sync parou. Tentando de novo.',
    expired: 'Sua sessão expirou. Entre de novo para sincronizar.',
    // A cota da conta e o orçamento do dia (endurecimento 4.1 e decisões 4 e 6): o que a conta recusou fica só aqui, e nada se perde. A
    // cota também é o teto de bytes da conta, então o texto não fala em solves.
    quotaFull: 'A conta chegou ao limite do plano gratuito. Os novos ficam só neste aparelho.',
    budgetDeferred: 'Muita coisa para subir hoje: o resto sobe amanhã.',
    // O orçamento de leituras do dia da conta (revisão final): nem o que chega nem o que sobe andam até a virada do dia.
    readsDeferred: 'Muita coisa para sincronizar hoje: o resto fica para amanhã.',
    heldCount: (n: number): string => (n === 1 ? '1 registro só neste aparelho' : `${n.toLocaleString('pt-BR')} registros só neste aparelho`),
    heldResend: 'Enviar de novo',
    heldResendAria: (n: number): string =>
      n === 1 ? 'Enviar de novo o registro só neste aparelho' : `Enviar de novo os ${n.toLocaleString('pt-BR')} registros só neste aparelho`,
    heldResent: 'De volta à fila. Se a conta continuar cheia, eles ficam só neste aparelho.',
    update: 'Atualize o Klick para sincronizar.',
    signInAgain: 'Entrar de novo',
    passkeys: 'Passkeys',
    passkeysHint: 'Entre com Face ID, Touch ID ou a senha do aparelho, sem esperar o código.',
    passkeyAdd: 'Criar passkey',
    passkeyAdded: 'Passkey criada.',
    passkeyFailed: 'Não consegui criar a passkey.',
    passkeyNone: 'Nenhuma passkey ainda.',
    passkeyName: (when: string): string => `Criada em ${when}`,
    passkeyRemove: 'Remover',
    passkeyRemoveAria: (when: string): string => `Remover a passkey criada em ${when}`,
    signOut: 'Sair',
    signOutHint: 'Os dados ficam neste aparelho.',
    signOutAll: 'Sair de todos os aparelhos',
    signOutAllHint: 'Encerra a sessão em todo aparelho. Os dados ficam em cada um.',
    confirmAgain: 'Tem certeza? Clique de novo',
    signOutAllDone: 'Você saiu de todos os aparelhos.',
    signOutAllFailed: 'Não consegui sair dos outros aparelhos agora. Tente de novo com rede.',
    // Diálogo de sair (spec 7.7)
    signOutTitle: 'Sair da conta',
    signOutText: 'Os dados ficam neste aparelho, que volta a funcionar só aqui. O que ainda não subiu sobe quando você entrar de novo nesta conta.',
    eraseHere: 'Apagar os dados deste aparelho',
    eraseHint: 'Solves, sessões, treino, desafios e cópias deste aparelho. Na conta, tudo continua.',
    pendingBlock: (n: number): string =>
      `${n.toLocaleString('pt-BR')} ${n === 1 ? 'mudança ainda não subiu' : 'mudanças ainda não subiram'}. Sincronize antes de apagar os dados deste aparelho.`,
    // O que o servidor recusaria (um registro antigo, com o id ou a data torta) nunca vai para a conta: só existe aqui.
    localOnlyBlock: (n: number): string =>
      n === 1
        ? '1 registro deste aparelho não vai para a conta e só existe aqui. Apagar os dados deste aparelho o perderia.'
        : `${n.toLocaleString('pt-BR')} registros deste aparelho não vão para a conta e só existem aqui. Apagar os dados deste aparelho os perderia.`,
    cancel: 'Cancelar',
    signedOut: 'Você saiu da conta. Os dados continuam neste aparelho.',
    signedOutErased: 'Você saiu da conta e os dados deste aparelho foram apagados.',
    signOutFailed: 'Não consegui sair agora. Tente de novo.',
    // Diálogo de entrar (spec 7.2 e 9.2)
    signInTitle: 'Entrar ou criar conta',
    stepOf: (n: number): string => `${n} de 4`,
    emailIntro: 'Sem senha: mandamos um código de 6 dígitos para o seu e-mail. Entrar e criar conta são o mesmo caminho.',
    emailLabel: 'E-mail',
    sendCode: 'Enviar código',
    sending2: 'Enviando…',
    privacy: 'Política de privacidade',
    passkeyFirst: 'Entrar com passkey',
    orCode: 'Ou receba um código por e-mail:',
    passkeyFirstFailed: 'Não deu para entrar com a passkey. Use o código por e-mail.',
    limited: 'Muitos pedidos de código. Espere um pouco e tente de novo.',
    // O teto de e-mails do dia ou do mês (spec 4.3): o servidor para antes de o Resend recusar sem explicação.
    mailCap: 'Muitos pedidos de código hoje. Tente de novo amanhã.',
    sendFailed: 'Não consegui enviar o código. Confira a conexão e tente de novo.',
    codeIntro: (email: string): string => `Mandamos um código para ${email}. Ele vale por 10 minutos. Se não chegar, olhe o spam.`,
    codeLabel: 'Código',
    enter: 'Entrar',
    checkingCode: 'Conferindo o código…', // ao lado do cubo, enquanto o código é conferido (o visual da conta, decisão 2)
    resend: 'Mandar outro código',
    badCode: 'Código errado. Confira e tente de novo.',
    expiredCode: 'O código expirou. Peça outro.',
    tooMany: 'Tentativas demais com este código. Peça outro.',
    verifyFailed: 'Não consegui entrar agora. Confira a conexão e tente de novo.',
    otherTitle: 'Este aparelho tem dados de outra conta',
    otherText: 'Os solves deste aparelho eram de outra conta. O que fazer com eles?',
    otherJoin: 'Juntar os dados deste aparelho à nova conta',
    otherErase: 'Apagar os dados deste aparelho antes de entrar',
    passkeyTitle: 'Da próxima vez, sem código',
    passkeyText: 'Crie uma passkey e entre com Face ID, Touch ID ou a senha do aparelho. Dá para criar depois, em Ajustes.',
    passkeyOffer: 'Entrar com Face ID da próxima vez',
    skip: 'Agora não',
    syncTitle: 'Primeiro sync',
    joining: (n: number): string =>
      n === 0 ? 'Este aparelho não tem solves para subir.' : `${n.toLocaleString('pt-BR')} ${n === 1 ? 'solve deste aparelho vai' : 'solves deste aparelho vão'} para a conta.`,
    joinNote: 'Antes, uma cópia deste aparelho foi guardada em Cópias automáticas. Nada se duplica.',
    resuming: 'Bem-vindo de volta. O que mudou nos dois lados se junta agora.',
    done: 'Pronto. Seus solves estão na conta.',
    doneTomorrow: 'Pronto por hoje. O resto sobe amanhã, sozinho.', // o primeiro sync que o orçamento do dia cortou (decisão 6)
    keepsGoing: 'Pode fechar: o sync continua sozinho.',
    // Uma parada (sair, noutra aba) antes do fim do primeiro sync: nada foi para a conta.
    syncCancelled: 'O primeiro sync parou antes de terminar, porque a conta saiu deste aparelho. Entre de novo para continuar.',
    // Indicador na barra de cima (spec 9.3) e o convite no lembrete de exportar (spec 9.4)
    indicator: (line: string): string => `Conta e sync: ${line}`,
    protect: 'Proteger na nuvem',
    // Cópias na nuvem e apagar a conta (spec 7.7, 8.3 e 9.1)
    cloud: 'Cópias na nuvem',
    cloudHint: 'Uma por dia (numa conta muito grande, uma por semana), por 30 dias. Restaurar troca a conta inteira pelo dia escolhido, em todos os aparelhos.',
    cloudView: 'Ver cópias na nuvem',
    cloudTitle: 'Cópias na nuvem',
    cloudIntro: 'Restaurar grava antes uma cópia de agora, então nada se perde. A restauração chega a todos os aparelhos pelo sync.',
    cloudEmpty: 'Ainda não há cópias na nuvem. A primeira sai no fim do dia.',
    cloudLoadFailed: 'Não consegui ler as cópias na nuvem. Confira a conexão.',
    cloudDay: (day: string, kind: 'daily' | 'pre-restore'): string => (kind === 'daily' ? day : `${day}, antes de uma restauração`),
    cloudRestore: 'Restaurar este dia',
    cloudRestoreAria: (day: string): string => `Restaurar a cópia de ${day}`,
    cloudRestored: 'Restaurado. Os aparelhos recebem pelo sync.',
    cloudRestoredHere: 'Restaurado neste aparelho. Os outros recebem nos próximos dias, pelo sync.',
    cloudBig: 'Esta conta é grande: se a restauração não couber no dia, ela chega a este aparelho na hora e aos outros nos próximos dias.',
    cloudRestoreFailed: 'Não consegui restaurar agora. Tudo continua como estava.',
    cloudSyncFirst: 'Não consegui sincronizar este aparelho antes de restaurar. Confira a conexão e tente de novo. Tudo continua como estava.',
    cloudRestoreBusy: 'Uma restauração já está em andamento. Espere ela terminar.',
    cloudDownloading: (k: number, n: number): string => `Baixando a cópia (${k} de ${n})…`,
    cloudGone: 'Esta cópia não existe mais. A lista foi atualizada.',
    // As cópias pausadas e as recusas da restauração (endurecimento 4.2 e decisões 1, 2, 3 e 6): cada uma diz por quê, e nada muda aqui.
    cloudPaused: (why: CopiesPaused): string =>
      ({
        space: 'Cópias na nuvem pausadas: o espaço gratuito encheu.',
        ops: 'Cópias na nuvem pausadas até o mês que vem: o limite gratuito do mês acabou.',
        size: 'Cópias na nuvem pausadas: a conta passou do tamanho que o plano gratuito copia.', // SNAPSHOT_MAX_RECORDS (Task 12)
      })[why],
    cloudNoRoom: 'Não há espaço para guardar o estado de agora antes de restaurar. Tudo continua como estava.',
    cloudRestoreLimit: 'Já foram restaurações demais hoje. Tente de novo amanhã.',
    cloudOpsLimit: 'As cópias na nuvem pararam até o mês que vem: o limite gratuito acabou. Tudo continua como estava.',
    cloudTooBig: 'Esta conta é grande demais para restaurar uma cópia na nuvem. As cópias deste aparelho continuam valendo.',
    cloudWriteBudget: 'A conta já gravou muita coisa hoje. Tente restaurar amanhã.',
    deleteAccount: 'Apagar minha conta',
    deleteAccountHint: 'Apaga a conta e tudo o que está na nuvem. Os dados deste aparelho ficam.',
    deleteTitle: 'Apagar minha conta',
    deleteText: 'Isto apaga na hora a conta, os dados na nuvem e as cópias diárias. Não tem volta. Os dados deste aparelho ficam, como ao sair.',
    deleteConfirmLabel: (email: string): string => `Para confirmar, digite ${email}`,
    deleteConfirm: 'Apagar para sempre',
    deleteMismatch: 'O e-mail não confere.',
    deleteFailed: 'Não consegui apagar agora. Confira a conexão e tente de novo.',
    deleteSignInAgain: 'Sua sessão expirou. Entre de novo para apagar a conta.',
    deleted: 'Conta apagada. Os dados continuam neste aparelho.',
  }),
});
