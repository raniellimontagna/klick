// Todo texto que a pessoa lê passa por aqui (pt-BR). Facilita traduzir depois.
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
  brilho: { label: 'Brilho', unlock: 'temporada 1' },
  gelo: { label: 'Gelo', unlock: 'temporada 2' },
  carbono: { label: 'Carbono', unlock: 'temporada 3' },
});

export const T = Object.freeze({
  coach: {
    idle: 'Quando quiser. Segure espaço para armar.',
    idleInsp: 'Quando quiser. Aperte espaço para começar a inspeção.',
    idleInspTouch: 'Quando quiser. Toque para começar a inspeção.',
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
    count: (n: number, total: number) => `${n}/${total}`,
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
    progressLabel: (done: number, trailDone: number) => `Centro: ${done} de 9 marcos, ${trailDone} de 9 etapas`,
    finishes: 'Acabamentos',
    preview: (finish: string) => ` · prévia: ${finish}`,
    finishLocked: (label: string, unlock: string) => `${label} · ${unlock}`,
    topFace: 'Face de cima · marcos',
    sideFace: 'Face lateral · trilha',
    know: 'já sei',
    undo: 'desfazer',
    trailAria: (name: string, marked: boolean) => `${name}: ${marked ? 'desfazer' : 'já sei'}`,
    silentHint: 'Modo silencioso — o Centro continua reagindo, mas sem texto.',
  },
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
  },
  // Casca (ui/App.svelte): nomes das abas, rótulo das duas barras de navegação e o atalho para o conteúdo.
  tabs: { timer: 'Timer', evolucao: 'Evolução', companion: 'Centro', ajustes: 'Ajustes' },
  shell: { nav: 'Seções', skip: 'Pular para o conteúdo' },
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
      ['1–4', 'Trocar de aba'],
    ] as const),
  }),
  // Guia de instalação (ui/dialogs/InstallGuide.svelte).
  install: Object.freeze({
    title: 'Instalar o Klick',
    iosIntro: 'No iPhone, o Safari pode apagar os dados de um site que você não abre por alguns dias. Instalado na Tela de Início, o Klick protege os seus solves.',
    iosSteps: Object.freeze([
      'Toque em Compartilhar, o botão da barra de baixo do Safari.',
      'Role a lista e toque em Adicionar à Tela de Início.',
      'Confirme em Adicionar. O ícone do Klick aparece na Tela de Início.',
    ]),
    otherIntro: 'Instalado, o Klick abre numa janela própria, como um app.',
    installButton: 'Instalar o app',
    menuHint: 'Abra o menu do navegador e escolha instalar o app ou adicionar à tela inicial.',
  }),
  // Avisos de dados (ui/state/app.svelte.ts e a casca). saveFailed é o aviso fixo: enquanto houver solve pendente, fica na tela.
  data: {
    dbUnavailable: 'O navegador bloqueou o armazenamento do Klick. Sem ele, os solves não ficam salvos neste aparelho. Libere o armazenamento para este site e recarregue a página.',
    saveFailed: 'Não consegui salvar. Exporte seus dados agora.',
    exportNow: 'Exportar agora',
    readFailed: 'Não consegui ler seus dados. Recarregue a página.',
    saved: 'Tudo salvo.',
    restoreBlocked: 'Ainda há solves sem salvar. Exporte antes de restaurar.',
    restoreTimeout: 'A restauração está demorando. Seus solves novos estão guardados na memória; exporte antes de recarregar.',
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
  season: (done: number, finish: string) => `Temporada 1 · ${done} de 9 marcos · acabamento ${finish}`,
});
