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
  tabs: { timer: 'Timer', evolucao: 'Evolução', companion: 'Centro', ajustes: 'Ajustes' },
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
      ['1–4', 'Trocar de aba'],
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
    saveFailed: 'Não consegui salvar. Exporte seus dados agora.', // só para solve: é o alarme de solve perdido
    changeFailed: 'Não consegui guardar esta mudança. Tente de novo.',
    folderSaveFailed: 'Não consegui guardar a pasta escolhida. Tente de novo.',
    exportMarkFailed: 'O arquivo saiu, mas não consegui guardar a data da exportação.',
    exportNow: 'Exportar agora',
    readFailed: 'Não consegui ler seus dados. Recarregue a página.',
    saved: 'Tudo salvo.',
    restoreBlocked: 'Ainda há solves sem salvar. Exporte antes de restaurar.',
    restoreTimeout: 'A restauração está demorando. Seus solves novos estão guardados na memória; exporte antes de recarregar.',
    settingFailed: 'Não consegui guardar este ajuste. Tente de novo.',
    backupFailed: 'Não consegui fazer a cópia automática. Ela será tentada de novo.',
    countFailed: 'O solve está salvo, mas não consegui atualizar a contagem das cópias.',
    folderCopyFailed: 'Não consegui gravar a cópia nessa pasta. Ela será tentada de novo.',
    folderPermissionDenied: 'O navegador não liberou a pasta. Tente de novo ou escolha outra pasta.',
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
    offerNotMarked: 'Os solves entraram, mas não consegui guardar que a oferta foi feita. Importar de novo não duplica os solves.',
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
    }),
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
  // Primeira vez (ui/dialogs/OnboardingDialog.svelte): o tour do protótipo em três passos, e as opções do fim. Não há dados de exemplo.
  onboarding: Object.freeze({
    title: 'Apresentação do Klick',
    stepOf: (n: number): string => `${n} de 3`,
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
    ] as const),
    skip: 'Pular apresentação',
    next: 'Continuar',
    back: 'Voltar',
    holdIdle: 'Segure aqui',
    holdReady: 'Agora solte',
    holdDone: 'É assim que larga.',
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
  season: (done: number, finish: string) => `Temporada 1 · ${done} de 9 marcos · acabamento ${finish}`,
});
