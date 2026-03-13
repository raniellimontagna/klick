export const ptBR = {
  app: {
    title: 'Klick',
    tagline: 'gire, clique, evolua.',
  },
  navigation: {
    home: 'Início',
    history: 'Histórico',
    stats: 'Estatísticas',
    training: 'Treino',
    tutorial: 'Tutorial',
    settings: 'Configurações',
    cube3d: 'Cubo 3D',
  },
  pages: {
    home: {
      description: 'Treine solves com inspeção guiada e estatísticas em tempo real.',
    },
    history: {
      description: 'Veja todos os seus solves e acompanhe sua evolução.',
    },
    stats: {
      description: 'Análise detalhada de performance e evolução.',
    },
    training: {
      description: 'Pratique algoritmos por caso com metas e notas rápidas.',
    },
    tutorial: {
      description: 'Aprenda o método CFOP passo a passo.',
    },
    settings: {
      description: 'Personalize o Klick do seu jeito.',
    },
  },
  language: {
    title: 'Idioma',
    'pt-BR': 'Português (BR)',
    'en-US': 'English (US)',
    'es-ES': 'Español (ES)',
  },
  scramble: {
    title: 'Embaralhamento',
    copy: 'Copiar',
    new: 'Novo',
    generating: 'Gerando embaralhamento...',
    copySuccess: 'Copiado!',
    guide: 'Como ler o embaralhamento',
    guideModal: {
      title: 'Guia de Embaralhamento',
      toggleVisualizer: 'Alternar Visualização 3D',
      description:
        'Aprenda a interpretar a notação do cubo mágico 3×3 e execute o embaralhamento corretamente.',
      faces: {
        title: 'Faces do Cubo',
        description: 'Cada letra representa uma face do cubo:',
        R: 'R - Direita (Right)',
        L: 'L - Esquerda (Left)',
        U: 'U - Superior (Up)',
        D: 'D - Inferior (Down)',
        F: 'F - Frontal (Front)',
        B: 'B - Traseira (Back)',
      },
      modifiers: {
        title: 'Modificadores',
        description: 'Símbolos que alteram o movimento:',
        none: 'Sem símbolo - 90° no sentido horário',
        prime: "' (apóstrofo) - 90° no sentido anti-horário",
        double: '2 - 180° (giro duplo)',
      },
      examples: {
        title: 'Exemplos Práticos',
        R: 'R = Gire a face direita 90° no sentido horário',
        RPrime: "R' = Gire a face direita 90° no sentido anti-horário",
        R2: 'R2 = Gire a face direita 180°',
        sequence:
          "Sequência: R U R' U' = Direita, Superior, Direita anti-horário, Superior anti-horário",
      },
      tips: {
        title: 'Dicas Importantes',
        tip1: '• Execute os movimentos na ordem exata mostrada',
        tip2: '• Sempre olhe para a mesma face (frontal) durante todo o embaralhamento',
        tip3: '• Pratique os movimentos básicos antes de embaralhamentos completos',
        tip4: '• Um embaralhamento oficial WCA tem 25 movimentos',
      },
    },
  },
  timer: {
    inspection: 'Inspeção',
    ready: 'Pronto',
    running: 'Correndo',
    stopped: 'Parado',
    pressSpace: 'Pressione ESPAÇO',
    holdSpace: 'Segure ESPAÇO para começar a inspeção',
  },
  shortcuts: {
    title: 'Atalhos',
    space: 'Iniciar/Parar',
    newScramble: 'Novo embaralhamento',
    togglePlus2: 'Alternar +2',
    toggleDNF: 'Alternar DNF',
    undo: 'Desfazer',
  },
  penalties: {
    none: 'Sem penalidade',
    plus2: '+2 segundos',
    dnf: 'DNF (Did Not Finish)',
    warning: 'Atenção',
    critical: 'Crítico',
  },
  stats: {
    single: 'Melhor Tempo',
    ao5: 'Média de 5',
    ao12: 'Média de 12',
    bestAo5: 'Melhor ao5',
    bestAo12: 'Melhor ao12',
    current: 'Atual',
    best: 'Melhor',
    worst: 'Pior',
    average: 'Média',
    deviation: 'Desvio Padrão',
    clear: 'Limpar Estatísticas',
    clearConfirmTitle: 'Limpar todos os solves?',
    clearConfirmMessage:
      'Esta ação irá deletar permanentemente todos os solves da sessão atual. Esta ação não pode ser desfeita.',
    clearSuccess: 'Estatísticas limpas com sucesso!',
    help: 'Ajuda',
    learnMore: 'Saiba mais',
    advanced: 'Estatísticas Avançadas',
    info: {
      title: 'Entendendo as Estatísticas',
      single: {
        title: 'Single (Melhor Tempo)',
        description:
          'É o seu tempo mais rápido em um único solve. Mostra o melhor que você já conseguiu fazer.',
        example: 'Se você fez solves de 15s, 12s e 18s, seu single é 12s.',
      },
      ao5: {
        title: 'ao5 (Average of 5)',
        description:
          'Média dos seus últimos 5 solves, descartando o melhor e o pior tempo. Isso dá uma visão mais precisa do seu desempenho consistente.',
        example:
          'Tempos: 15s, 12s, 18s, 14s, 16s\nDescarta: 12s (melhor) e 18s (pior)\nMédia: (15 + 14 + 16) ÷ 3 = 15s',
        rule: 'Se houver 2 ou mais DNFs nos últimos 5 solves, a média é DNF.',
      },
      ao12: {
        title: 'ao12 (Average of 12)',
        description:
          'Funciona igual ao ao5, mas com os últimos 12 solves. É ainda mais precisa para medir consistência.',
        example:
          'Pega os últimos 12 tempos, remove o melhor e o pior, e calcula a média dos 10 restantes.',
        rule: 'Se houver 2 ou mais DNFs nos últimos 12 solves, a média é DNF.',
      },
      bestAo5: {
        title: 'Best ao5 (Melhor ao5)',
        description:
          'A melhor média de 5 consecutivos que você já fez. É o seu recorde pessoal de ao5.',
        example:
          'Entre todas as sequências de 5 solves consecutivos, esta é a que teve a melhor média.',
      },
      bestAo12: {
        title: 'Best ao12 (Melhor ao12)',
        description:
          'A melhor média de 12 consecutivos que você já fez. É o seu recorde pessoal de ao12.',
        example:
          'Entre todas as sequências de 12 solves consecutivos, esta é a que teve a melhor média.',
      },
      penalties: {
        title: 'Penalidades',
        plus2: '+2: Adiciona 2 segundos ao tempo (ajuste incorreto do cubo ao final)',
        dnf: 'DNF (Did Not Finish): Solve inválido (não resolveu, violou regras de inspeção, etc.)',
      },
    },
  },
  actions: {
    save: 'Salvar',
    cancel: 'Cancelar',
    delete: 'Deletar',
    export: 'Exportar',
    import: 'Importar',
    edit: 'Editar',
    create: 'Criar',
    confirm: 'Confirmar',
    close: 'Fechar',
    viewDetails: 'Ver Detalhes',
    back: 'Voltar',
  },
  sessions: {
    title: 'Sessões',
    current: 'Sessão Atual',
    create: 'Nova Sessão',
    rename: 'Renomear Sessão',
    delete: 'Deletar Sessão',
    switch: 'Trocar Sessão',
    manage: 'Gerenciar Sessões',
    name: 'Nome da Sessão',
    namePlaceholder: 'Digite o nome da sessão',
    createSuccess: 'Sessão criada com sucesso!',
    renameSuccess: 'Sessão renomeada com sucesso!',
    deleteSuccess: 'Sessão deletada com sucesso!',
    deleteConfirm: {
      title: 'Deletar sessão?',
      message:
        'Todos os solves desta sessão serão perdidos permanentemente. Esta ação não pode ser desfeita.',
    },
    cannotDeleteLast: 'Não é possível deletar a última sessão',
    solveCount: 'solves',
    solveCountSingular: 'solve',
    active: 'Ativa',
  },
  solveTable: {
    title: 'Histórico de Solves',
    empty: 'Nenhum solve registrado ainda',
    columns: {
      number: '#',
      time: 'Tempo',
      scramble: 'Scramble',
      date: 'Data',
      penalty: 'Penalidade',
      actions: 'Ações',
    },
    filter: {
      label: 'Mostrar',
      all: 'Todos',
      last5: 'Últimos 5',
      last12: 'Últimos 12',
      last50: 'Últimos 50',
      last100: 'Últimos 100',
    },
    deleteConfirm: {
      title: 'Deletar solve?',
      message: 'Esta ação não pode ser desfeita.',
    },
    details: {
      title: 'Detalhes do Solve',
      solveNumber: 'Solve',
      time: 'Tempo',
      penalty: 'Penalidade',
      scramble: 'Scramble',
      date: 'Data',
      finalTime: 'Tempo Final',
      baseTime: 'Tempo Base',
      visualizationUnavailable: 'Visualização não disponível',
    },
  },
  history: {
    description: 'Veja todos os seus solves e acompanhe sua evolução.',
    sessionProgress: 'Progresso da Sessão',
    charts: {
      noData: {
        title: 'Nenhum dado disponível',
        description: 'Complete solves para visualizar o progresso',
      },
      insufficientData: {
        title: 'Dados Insuficientes',
        description: 'Complete mais solves para gerar o gráfico',
      },
      tooltip: {
        solve: 'Solve #',
        penaltyApplied: 'Penalidade aplicada',
      },
    },
  },
  inspection: {
    warningTime: 'Tempo de atenção!',
    penaltyPlus2: '+2 será aplicado',
    penaltyDNF: 'DNF será aplicado',
  },
  settings: {
    title: 'Configurações',
    inspectionDuration: {
      label: 'Duração da Inspeção',
      description: 'Tempo disponível para inspecionar o cubo antes de começar',
      seconds: 'segundos',
    },
    soundsEnabled: {
      label: 'Sons Habilitados',
      description: 'Ativar sons de feedback durante o timer',
    },
    autoInspectionPenalty: {
      label: 'Penalidade Automática de Inspeção',
      description: '+2 entre 15-17s, DNF após 17s (seguindo regras oficiais da WCA)',
    },
    theme: {
      label: 'Tema',
      description: 'Aparência visual do aplicativo',
      dark: 'Escuro',
      light: 'Claro',
    },
    exportImport: {
      title: 'Exportar/Importar Dados',
      exportCurrent: 'Exportar Sessão Atual',
      exportAll: 'Exportar Todas as Sessões',
      import: 'Importar Sessões',
      importMode: 'Modo de Importação',
      merge: 'Mesclar com sessões existentes',
      replace: 'Substituir todas as sessões',
      exportSuccess: 'Dados exportados com sucesso!',
      importSuccess: 'Dados importados com sucesso!',
      importError: 'Erro ao importar dados. Verifique o formato do arquivo.',
    },
  },
  advancedStats: {
    title: 'Estatísticas Avançadas',
    tabs: {
      evolution: 'Evolução',
      consistency: 'Consistência',
      performance: 'Performance',
    },
    evolution: {
      title: 'Evolução Temporal',
      description: 'Acompanhe a progressão dos seus tempos ao longo das sessões',
      chartTitle: 'Histórico de Tempos',
      single: 'Single',
      ao5: 'ao5',
      ao12: 'ao12',
      solveNumber: 'Solve #',
      time: 'Tempo (ms)',
      noData: 'Sem dados suficientes para gráficos',
      tip: 'Execute ao menos 12 solves para visualizar a evolução completa',
    },
    consistency: {
      title: 'Análise de Consistência',
      description:
        'Entenda o quanto seus tempos oscilam e como isso impacta sua confiabilidade em solves reais.',
      standardDeviation: {
        title: 'Desvio Padrão',
        description:
          'Mede quanto, em média, cada solve se afasta do seu tempo médio. Valores altos revelam tempos "picos"; busque reduzi-lo após treinos focados em execução.',
        value: 'ms',
      },
      coefficientOfVariation: {
        title: 'Coeficiente de Variação',
        description:
          'Percentual do desvio padrão em relação à média. Abaixo de 10% indica consistência de competição; acima de 20% sugere instabilidade que merece atenção.',
        value: '%',
        excellent: 'Excelente (< 10%)',
        good: 'Bom (10-15%)',
        average: 'Médio (15-20%)',
        needsWork: 'Precisa melhorar (> 20%)',
      },
      interpretation: {
        title: 'Interpretação',
        description:
          'Consistência é tão importante quanto velocidade. Acompanhe se suas variações estão caindo ao longo das sessões para validar treinos de controle e inspeção.',
      },
    },
    performance: {
      title: 'Análise de Performance',
      description:
        'Acompanhe seu ritmo médio de execução e onde seus tempos se concentram para ajustar treinamentos.',
      averageTPS: {
        title: 'TPS Médio',
        description:
          'Turns Per Second - quantos movimentos você executa por segundo em média. Ótimo para ver se drills de algoritmos ou finger tricks estão surtindo efeito.',
        value: 'movimentos/s',
        note: 'Calculado considerando 25 movimentos por solve (notação padrão de 3x3).',
      },
      distribution: {
        title: 'Distribuição de Tempos',
        description:
          'Visualize em quais faixas seus solves aparecem com mais frequência. Observe caudas longas para detectar tempos atípicos ou quedas de foco.',
        chartTitle: 'Histograma de Tempos',
        xAxis: 'Faixa de Tempo',
        yAxis: 'Quantidade de Solves',
      },
    },
    close: 'Fechar',
  },
  onboarding: {
    skip: 'Pular tour',
    previous: 'Anterior',
    next: 'Próximo',
    finish: 'Concluir',
    progress: 'Passo {current} de {total}',
    startTour: 'Iniciar tour',
    welcome: {
      title: 'Bem-vindo ao Klick! 🎉',
      description:
        'Vamos fazer um tour rápido para você conhecer os principais recursos do aplicativo. Leva apenas 1 minuto!',
    },
    scramble: {
      title: 'Embaralhamento do Cubo',
      description:
        'Aqui aparece o scramble (embaralhamento) do cubo mágico. Clique em "Novo" para gerar outro ou no "?" para aprender a ler a notação.',
    },
    timer: {
      title: 'Cronômetro',
      description:
        'Segure a barra de ESPAÇO para armar o timer. Solte para iniciar a inspeção (15s). Pressione ESPAÇO novamente para iniciar/parar o cronômetro.',
    },
    stats: {
      title: 'Estatísticas',
      description:
        'Acompanhe seu desempenho com métricas como Single (melhor tempo), ao5 e ao12 (médias). Clique em "📈" para ver estatísticas avançadas!',
    },
    shortcuts: {
      title: 'Atalhos de Teclado',
      description:
        'Use atalhos para ser mais rápido: ESPAÇO (timer), N (novo scramble), P (+2), D (DNF). Trabalhe sem tirar as mãos do cubo!',
    },
    sessions: {
      title: 'Sessões',
      description:
        'Organize seus solves em diferentes sessões. Útil para separar treinos, competições ou métodos diferentes.',
    },
    complete: {
      title: 'Tudo pronto! 🎊',
      description:
        'Agora você conhece o Klick! Comece a resolver e acompanhe sua evolução. Você pode revisitar este tour a qualquer momento clicando no botão "?" no header.',
    },
  },
  training: {
    title: 'Modo de Treino',
    description: 'Foque em casos específicos e acompanhe seu progresso com metas e checkpoints.',
    categories: {
      pll: {
        label: 'PLL',
        description: 'Permutar cantos e arestas da última camada.',
      },
      oll: {
        label: 'OLL',
        description: 'Orientar todas as peças da última camada.',
      },
      f2l: {
        label: 'F2L',
        description: 'Formar e inserir pares das duas primeiras camadas.',
      },
    },
    statuses: {
      learning: 'Aprendendo',
      refining: 'Ajustando',
      mastered: 'Automático',
    },
    actions: {
      repetitionLabel: 'Repetições',
      add1: '+1',
      add5: '+5',
      add10: '+10',
      reset: 'Zerar',
      goalLabel: 'Meta',
      goalPlaceholder: 'ex: 50',
      statusLabel: 'Checkpoint',
      algorithmLabel: 'Algoritmo',
      noteLabel: 'Notas rápidas',
      notePlaceholder: 'Anote dicas, gatilhos ou ajustes pessoais.',
      copyAlgorithm: 'Copiar algoritmo',
      copiedAlgorithm: 'Algoritmo copiado!',
    },
    progress: {
      target: '{current} de {goal} repetições',
      noGoal: '{current} repetições registradas',
      goalReached: 'Meta alcançada! Continue reforçando.',
    },
    cases: {
      pll: {
        tPerm: {
          title: 'T-Perm',
          description: 'Permuta duas arestas adjacentes mantendo o restante resolvido.',
          tip: 'Use movimentos amplos com R e mantenha o punho firme para evitar pausas.',
        },
        jPerm: {
          title: 'J-Perm (direita)',
          description: 'Permuta dois cantos adjacentes e duas arestas opostas.',
          tip: "O início em F' prepara o bloco; mantenha o ritmo e planeje o U final.",
        },
        zPerm: {
          title: 'Z-Perm',
          description: 'Permuta dois pares de arestas opostas sem mover os cantos.',
          tip: 'Priorize camadas M suaves e ritmo constante para não travar a execução.',
        },
      },
      oll: {
        sune: {
          title: 'Sune',
          description: 'Caso clássico com um canto orientado; orienta todas as peças amarelas.',
          tip: "Treine o gatilho R U R' e mantenha o cotovelo parado para ganhar velocidade.",
        },
        antisune: {
          title: 'Anti-Sune',
          description: 'Versão espelhada do Sune, começando com movimentos anti-horários.',
          tip: 'Use o polegar esquerdo para estabilizar e visualize o padrão antes de executar.',
        },
        hPattern: {
          title: 'H-Pattern',
          description: 'Todos os cantos orientados e arestas invertidas em pares opostos.',
          tip: "Execute o bloco F...f' sem pausar; pense em duas metades fluidas.",
        },
      },
      f2l: {
        basicPair: {
          title: 'Par Básico Frontal',
          description: 'Canto e aresta formam par e entram no slot frontal direito.',
          tip: 'Use U antes de inserir para alinhar o par e evitar giros desnecessários.',
        },
        backSlot: {
          title: 'Inserção Slot Traseiro',
          description: 'Canto e aresta prontos para o slot traseiro direito.',
          tip: "Visualize o slot enquanto executa R U' R'; mantenha o punho solto.",
        },
        edgeOver: {
          title: 'Aresta sobre o Slot',
          description: 'Aresta posicionada acima do slot formando par com giro frontal.',
          tip: "Use U' F' para criar o par e devolva a face frontal com controle.",
        },
      },
    },
  },
  tutorial: {
    title: 'Tutorial para Iniciantes',
    subtitle: 'Aprenda a resolver o cubo mágico 3×3 passo a passo',
    open: 'Como resolver?',
    steps: {
      title: 'Passo {step} de {total}',
      progress: 'Passo {current} de {total}',
      navigation: {
        previous: 'Anterior',
        next: 'Próximo',
        finish: 'Concluir',
      },
      labels: {
        goal: 'Objetivo',
        algorithm: 'Algoritmo',
        steps: 'Passos',
        tip: 'Dica',
        important: 'Importante',
      },
    },
    completion: {
      title: 'Parabéns!',
      description:
        'Você completou o tutorial para iniciantes. Agora é hora de praticar e melhorar seu tempo de resolução!',
      goToTimer: 'Começar a Resolver',
      restart: 'Refazer Tutorial',
    },
    intro: {
      title: 'Bem-vindo ao Método para Iniciantes! 🎓',
      description:
        'Vamos aprender o método de camadas (Layer by Layer) para resolver o cubo mágico 3×3. É o método mais simples e intuitivo para começar!',
      whatYouWillLearn: 'O que você vai aprender:',
      topics: [
        'Cruz branca (first layer)',
        'Cantos brancos (complete first layer)',
        'Segunda camada (middle layer)',
        'Cruz amarela (last layer cross)',
        'Orientar cantos (OLL)',
        'Permutar cantos e arestas (PLL)',
      ],
      timeEstimate: 'Tempo estimado: 10-15 minutos',
      difficulty: 'Dificuldade: Iniciante',
    },
    whiteCross: {
      title: '1. Cruz Branca',
      description: 'Resolva as 4 arestas brancas formando uma cruz na face branca',
      goal: 'Objetivo: Cruz branca alinhada com os centros laterais',
      tips: [
        'Escolha uma face para ser a base (recomendamos branco)',
        'Encontre as 4 arestas com branco (peças com 2 cores)',
        'Posicione cada aresta alinhando a cor lateral com o centro correspondente',
        'A cruz deve estar correta tanto na face branca quanto nas laterais',
      ],
      intuitive: 'Esta etapa é intuitiva! Pratique movendo as arestas sem algoritmos.',
    },
    whiteCorners: {
      title: '2. Cantos Brancos',
      description: 'Complete a primeira camada inserindo os 4 cantos brancos',
      goal: 'Objetivo: Primeira camada totalmente resolvida',
      algorithm: "Algoritmo R U R': Repita até o canto se encaixar",
      steps: [
        'Posicione o canto branco na camada de baixo',
        'Alinhe o canto embaixo de onde ele deve ficar',
        "Execute R U R' de 1 a 5 vezes até encaixar",
        'Repita para os 4 cantos',
      ],
      tip: "O algoritmo R U R' tira o canto, gira e recoloca. É como um 'elevador' para o canto!",
    },
    secondLayer: {
      title: '3. Segunda Camada',
      description: 'Resolva as 4 arestas da camada do meio',
      goal: 'Objetivo: Duas camadas completas (branco e meio)',
      algorithms: {
        title: 'Algoritmos da Segunda Camada:',
        left: "Para a esquerda: U' L' U L U F U' F'",
        right: "Para a direita: U R U' R' U' F' U F",
      },
      steps: [
        'Encontre uma aresta sem amarelo na camada de cima',
        'Posicione a aresta acima de onde ela deve ir',
        'Use o algoritmo correto (esquerda ou direita)',
        'Repita para as 4 arestas',
      ],
      tip: 'Se uma aresta está na posição errada da 2ª camada, use o algoritmo para tirá-la para cima primeiro.',
    },
    yellowCross: {
      title: '4. Cruz Amarela',
      description: 'Forme uma cruz na face amarela (não precisa estar alinhada)',
      goal: 'Objetivo: Cruz amarela na face de cima',
      algorithm: "F R U R' U' F'",
      patterns: {
        title: 'Padrões possíveis:',
        dot: 'Ponto (nenhuma aresta) → Execute o algoritmo 3×',
        line: 'Linha → Alinhe horizontal e execute 2×',
        L: "Formato 'L' → Posicione o L no canto superior esquerdo e execute 1×",
        cross: 'Cruz → Já está pronto!',
      },
      tip: 'Não se preocupe com os centros laterais ainda, foque apenas na cruz amarela!',
    },
    yellowEdges: {
      title: '5. Alinhar Arestas Amarelas',
      description: 'Alinhe as arestas amarelas com os centros laterais',
      goal: 'Objetivo: Cruz amarela alinhada com todas as cores laterais',
      algorithm: "R U R' U R U2 R'",
      steps: [
        'Procure um lado onde a cor da aresta já combina com o centro',
        'Posicione esse lado na parte de trás (longe de você)',
        'Execute o algoritmo',
        'Repita se necessário',
      ],
      tip: 'Se nenhum lado está correto, execute o algoritmo em qualquer posição e depois procure novamente.',
    },
    yellowCorners: {
      title: '6. Posicionar Cantos Amarelos',
      description: 'Coloque os cantos amarelos nas posições corretas (não orientados ainda)',
      goal: 'Objetivo: Cantos nas posições certas, independente da orientação',
      algorithm: "U R U' L' U R' U' L",
      steps: [
        'Encontre um canto já na posição correta (cores combinam)',
        'Posicione esse canto no canto superior direito',
        'Execute o algoritmo',
        'Repita até todos os cantos estarem nas posições corretas',
      ],
      tip: 'Os cantos podem estar virados, mas suas cores devem combinar com as faces ao redor.',
    },
    solveCorners: {
      title: '7. Orientar Cantos (Finalizar)',
      description: 'Oriente os últimos cantos para resolver o cubo',
      goal: 'Objetivo: Cubo completamente resolvido! 🎉',
      algorithm: "R' D' R D",
      steps: [
        'Segure o cubo com a face amarela para cima',
        'Posicione um canto não resolvido no canto superior direito',
        "Execute R' D' R D de 2 a 4 vezes até o canto ficar amarelo em cima",
        'Gire APENAS a face de cima (U) para trazer o próximo canto não resolvido',
        'Repita até todos os cantos estarem orientados',
      ],
      important: 'IMPORTANTE: Não gire o cubo! Apenas gire a face U entre os cantos.',
      congratulations: 'Parabéns! Você resolveu o cubo mágico! 🎊',
    },
    tips: {
      title: 'Dicas Importantes',
      practice: 'Pratique cada etapa separadamente antes de tentar o cubo completo',
      algorithms: 'Decore os algoritmos aos poucos, começando pelos mais usados',
      patience: 'Seja paciente! No início pode levar 5-10 minutos por etapa',
      muscle: 'Com prática, seus dedos vão criar memória muscular',
      speed: 'Velocidade vem naturalmente com a prática, foque na precisão primeiro',
    },
    notation: {
      title: 'Notação Básica',
      R: 'R = Direita 90° horário',
      RPrime: "R' = Direita 90° anti-horário",
      U: 'U = Cima 90° horário',
      UPrime: "U' = Cima 90° anti-horário",
      F: 'F = Frente 90° horário',
      FPrime: "F' = Frente 90° anti-horário",
      L: 'L = Esquerda 90° horário',
      LPrime: "L' = Esquerda 90° anti-horário",
      D: 'D = Baixo 90° horário',
      DPrime: "D' = Baixo 90° anti-horário",
      number2: '2 = 180° (ex: R2, U2)',
    },
  },
  tutorialGuide: {
    title: 'Tutorial CFOP com cubo 3D',
    subtitle: 'Aprenda Cross, F2L, OLL e PLL com casos visuais e foco em consistência.',
    progress: {
      stage: 'Etapa {current} de {total}',
      lesson: 'Lição {current} de {total}',
    },
    method: {
      title: 'Método de estudo',
      focus: 'Foco do método',
      estimatedTime: 'Tempo sugerido',
      ariaLabel: 'Selecionar método de estudo',
    },
    stage: {
      title: 'Etapas do método',
      objective: 'Objetivo da etapa',
      ariaLabel: 'Selecionar etapa do método',
    },
    lesson: {
      title: 'Lições práticas',
      recognition: 'Como reconhecer o caso',
      algorithm: 'Algoritmo recomendado',
      checklist: 'Checklist de treino',
      tip: 'Dica rápida',
      cubeHint:
        'O cubo 3D reproduz o caso automaticamente. Use "Reproduzir caso" para revisar quantas vezes quiser.',
      replay: 'Reproduzir caso',
      next: 'Próxima lição',
      finished: 'CFOP concluído por enquanto',
    },
    methods: {
      cfop: {
        label: 'CFOP',
        description:
          'Fluxo clássico em quatro blocos para sair do básico e ganhar consistência com decisões mais rápidas.',
        focus: 'Reduzir pausas entre etapas mantendo reconhecimento ativo.',
        estimatedTime: '12 a 20 minutos por sessão guiada',
        stages: {
          cross: {
            label: 'Cross',
            description: 'Monte a cruz branca e alinhe as arestas com os centros laterais.',
            objective: 'Fechar a cruz em poucos movimentos e já observar a primeira dupla de F2L.',
            lessons: [
              {
                title: 'Da Daisy para a Cross',
                summary: 'Converta a daisy em cruz completa sem perder orientação da camada de cima.',
                recognition:
                  'Quatro adesivos brancos ficam na face U formando uma margarida ao redor do centro amarelo.',
                checklist: [
                  'Escolha uma aresta branca por vez.',
                  'Alinhe a cor lateral da aresta com o centro correspondente.',
                  'Gire 180° para descer a aresta na face branca.',
                ],
                tip: 'Procure resolver a última aresta já pensando em onde está o primeiro par de F2L.',
              },
              {
                title: 'Cross com alinhamento final',
                summary:
                  'Ajuste a cruz para que todas as cores laterais fiquem corretas antes de iniciar F2L.',
                recognition:
                  'A cruz branca está montada, mas uma ou duas arestas laterais não coincidem com o centro.',
                checklist: [
                  'Identifique qual aresta precisa trocar de posição.',
                  'Use U e um pequeno gatilho para reposicionar sem quebrar a cruz.',
                  'Finalize com todas as laterais alinhadas.',
                ],
                tip: 'Evite giros completos do cubo; use apenas U para reorganizar rapidamente.',
              },
            ],
          },
          f2l: {
            label: 'F2L',
            description: 'Resolva pares canto+aresta da primeira e segunda camadas em conjunto.',
            objective: 'Reconhecer pares prontos e inserir com menos pausas entre os slots.',
            lessons: [
              {
                title: 'Par frontal básico',
                summary: 'Monte um par simples e insira no slot frontal direito de forma controlada.',
                recognition:
                  'Canto e aresta da mesma cor estão separados na camada superior, prontos para emparelhar.',
                checklist: [
                  'Faça setup com U para aproximar canto e aresta.',
                  'Use o gatilho para montar o par.',
                  'Insira o par sem desmontar a cross.',
                ],
                tip: 'Mantenha o cubo levemente inclinado para enxergar o slot durante toda a inserção.',
              },
              {
                title: 'Inserção no slot traseiro',
                summary: 'Pratique a entrada de pares no slot de trás sem precisar girar o cubo.',
                recognition:
                  'O par está formado, mas o slot alvo fica no lado oposto à sua visão principal.',
                checklist: [
                  'Posicione o par sobre o slot traseiro correto.',
                  'Use algoritmo espelhado para inserção sem rotação global.',
                  'Confira se as duas camadas seguem intactas.',
                ],
                tip: 'Treinar slots traseiros reduz muito o tempo perdido com rotações desnecessárias.',
              },
            ],
          },
          oll: {
            label: 'OLL',
            description: 'Oriente a última camada para deixar toda a face superior amarela.',
            objective: 'Reconhecer padrões rápidos e aplicar o algoritmo correto sem hesitar.',
            lessons: [
              {
                title: 'Sune',
                summary: 'Caso clássico para orientar cantos quando apenas um já está correto.',
                recognition:
                  'Existe um “farol” (dois stickers amarelos adjacentes) e apenas um canto orientado.',
                checklist: [
                  'Posicione o farol no lado esquerdo/frente.',
                  "Execute R U R' U R U2 R'.",
                  'Confirme se a face amarela ficou completa.',
                ],
                tip: 'Conte o ritmo em blocos curtos: gatilho, ajuste, gatilho duplo.',
              },
              {
                title: 'Anti-Sune',
                summary: 'Versão espelhada do Sune para casos invertidos de orientação.',
                recognition:
                  'Padrão muito parecido com Sune, mas o farol aparece no lado oposto.',
                checklist: [
                  'Ajuste o cubo para manter o caso espelhado à frente.',
                  "Execute R' U' R U' R' U2 R.",
                  'Reavalie a camada superior antes de avançar para PLL.',
                ],
                tip: 'Treine Sune e Anti-Sune em sequência para acelerar o reconhecimento.',
              },
            ],
          },
          pll: {
            label: 'PLL',
            description: 'Permute as peças da última camada mantendo a orientação já concluída.',
            objective:
              'Finalizar o cubo com leitura de blocos laterais e execução contínua dos perms.',
            lessons: [
              {
                title: 'T-Perm',
                summary: 'Permuta dois cantos e duas arestas adjacentes, ideal para muitos finais.',
                recognition:
                  'Um bloco 2x1 já está resolvido em uma lateral e o restante forma troca em “T”.',
                checklist: [
                  'Coloque o bloco resolvido na face esquerda.',
                  "Execute R U R' U' R' F R2 U' R' U' R U R' F'.",
                  'Finalize com AUF (ajuste de U) se necessário.',
                ],
                tip: 'Foque na transição para o trecho com F/F’ sem travar a mão direita.',
              },
              {
                title: 'Y-Perm',
                summary:
                  'Permuta diagonal de cantos com troca de arestas, ótimo para fechar solves difíceis.',
                recognition:
                  'Nenhum bloco lateral completo e cantos parecem trocar em diagonal.',
                checklist: [
                  'Confirme que é caso de troca diagonal de cantos.',
                  "Execute F R U' R' U' R U R' F' R U R' U' R' F R F'.",
                  'Aplique AUF final para encerrar o solve.',
                ],
                tip: 'Mantenha os olhos nas arestas durante o algoritmo para prever o AUF final.',
              },
            ],
          },
        },
      },
    },
  },
  pwa: {
    update: {
      title: 'Nova atualização disponível!',
      description:
        'Uma nova versão do Klick está disponível. Atualize para obter as últimas melhorias.',
      updateNow: 'Atualizar agora',
      later: 'Depois',
    },
    offline: {
      title: 'App pronto para uso offline!',
      description: 'O Klick agora pode funcionar offline!',
      understood: 'Entendi',
    },
    close: 'Fechar',
  },
} as const;
