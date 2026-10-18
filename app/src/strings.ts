// Todo texto que a pessoa lê passa por aqui (pt-BR). Facilita traduzir depois.
import type { CopiesPaused } from './core/sync/types';

// Diferenças em segundos, truncadas no centésimo como os tempos.
const sec = (ms: number): string => (Math.floor(ms / 10) / 100).toFixed(2);

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

export const T = Object.freeze({
  coach: {
    idle: 'Quando quiser. Segure espaço para armar.',
    idleInsp: 'Quando quiser. Aperte espaço para começar a inspeção.',
    idleInspTouch: 'Quando quiser. Toque para começar a inspeção.', // modo um toque: a tela inteira começa
    idleInspThumb: 'Quando quiser. Toque num polegar para começar a inspeção.', // dois polegares: só as áreas de polegar
    idleTouch: 'Quando quiser. Segure com os dois polegares.',
    idleOne: 'Quando quiser. Toque e segure para armar.',
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
  // Tela da Evolução (ui/evolucao/EvolucaoScreen.svelte). Os nomes dos períodos e as colunas da tabela ficam aqui.
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
    pbTag: 'recorde',
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
    theme: 'Tema',
    themeOptions: Object.freeze([['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Noite']] as const),
    scrambleImage: 'Imagem do embaralhamento',
    scrambleImageHint: 'Desenho do cubo para conferir o embaralhamento.',
    soundKlick: 'Som "klick"',
    soundKlickHint: 'Ao ficar pronto e ao parar.',
    soundInsp: 'Tique da inspeção',
    soundInspHint: 'Aos 8 e 12 s.',
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
    intro: 'Cada sessão guarda os solves de um evento. Excluir manda a sessão e os solves dela para a lixeira.',
    newEvent: 'Evento da nova sessão',
    newName: 'Nome da nova sessão',
    newNamePlaceholder: 'Nome (opcional)',
    create: 'Criar',
    count: (n: number): string => `${n} ${n === 1 ? 'solve' : 'solves'}`,
    rename: 'Renomear',
    renameAria: (name: string): string => `Renomear ${name}`,
    renameLabel: (name: string): string => `Novo nome para ${name}`,
    save: 'Salvar',
    cancel: 'Cancelar',
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
    eraseHint: 'Solves, sessões, treino e cópias deste aparelho. Na conta, tudo continua.',
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
    cloudHint: 'Uma por dia, por 30 dias. Restaurar troca a conta inteira pelo dia escolhido, em todos os aparelhos.',
    cloudView: 'Ver cópias na nuvem',
    cloudTitle: 'Cópias na nuvem',
    cloudIntro: 'Restaurar grava antes uma cópia de agora, então nada se perde. A restauração chega a todos os aparelhos pelo sync.',
    cloudEmpty: 'Ainda não há cópias na nuvem. A primeira sai no fim do dia.',
    cloudLoadFailed: 'Não consegui ler as cópias na nuvem. Confira a conexão.',
    cloudDay: (day: string, kind: 'daily' | 'pre-restore'): string => (kind === 'daily' ? day : `${day}, antes de uma restauração`),
    cloudRestore: 'Restaurar este dia',
    cloudRestoreAria: (day: string): string => `Restaurar a cópia de ${day}`,
    cloudRestored: 'Restaurado. Os aparelhos recebem pelo sync.',
    cloudRestoreFailed: 'Não consegui restaurar agora. Tudo continua como estava.',
    cloudGone: 'Esta cópia não existe mais. A lista foi atualizada.',
    // As cópias pausadas e as recusas da restauração (endurecimento 4.2 e decisões 1, 2, 3 e 6): cada uma diz por quê, e nada muda aqui.
    cloudPaused: (why: CopiesPaused): string =>
      why === 'space' ? 'Cópias na nuvem pausadas: o espaço gratuito encheu.' : 'Cópias na nuvem pausadas até o mês que vem: o limite gratuito do mês acabou.',
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
