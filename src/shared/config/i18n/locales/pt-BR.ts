export const ptBR = {
  app: {
    title: 'Klick',
    tagline: 'gire, clique, evolua.',
  },
  navigation: {
    home: 'Início',
    history: 'Histórico',
    stats: 'Estatísticas',
    leaderboard: 'Ranking',
    learn: 'Aprender',
    more: 'Mais',
    training: 'Treino',
    friends: 'Amigos',
    tutorial: 'Tutorial',
    settings: 'Configurações',
    cube3d: 'Cubo 3D',
    groups: {
      core: 'Fluxo principal',
      learn: 'Aprender',
      community: 'Comunidade',
      workspace: 'Ferramentas',
    },
    sheet: {
      learnDescription: 'Abra treino e tutorial sem perder o caminho principal do app.',
      moreDescription: 'Acesse áreas sociais, ferramentas e configurações em um só lugar.',
    },
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
    leaderboard: {
      description: 'Compare seu desempenho semanal e mensal com amigos e público.',
    },
    training: {
      description: 'Pratique algoritmos por caso com metas e notas rápidas.',
    },
    friends: {
      description: 'Envie convites, aceite amigos e controle sua rede social de treino.',
    },
    tutorial: {
      description: 'Aprenda o método CFOP passo a passo.',
    },
    cube3d: {
      description: 'Visualize algoritmos, rotações e movimentos do cubo em um ambiente guiado.',
    },
    settings: {
      description: 'Personalize o Klick do seu jeito.',
    },
  },
  homeRevamp: {
    badge: 'Timer Lab',
    title: 'Cronometragem clara, foco total e feedback instantâneo.',
    subtitle:
      'A nova home coloca timer, scramble e métricas no mesmo fluxo. Você alterna entre visualização 3D e 2D sem perder ritmo durante a sessão.',
    highlights: {
      inspectionTitle: 'Inspeção Guiada',
      inspectionDescription: 'Contagem regressiva com alerta visual para iniciar no momento certo.',
      visualTitle: 'Scramble Visual',
      visualDescription: 'Troque entre cubo 3D e mapa 2D para entender o estado inicial.',
      statsTitle: 'Métricas Essenciais',
      statsDescription: 'Single, ao5, ao12 e melhores médias visíveis o tempo todo.',
    },
    timer: {
      sectionLabel: 'Painel principal do cronômetro',
      inspectionLabel: 'Inspeção ativa',
      runningLabel: 'Solve em andamento',
      personalBest: 'Novo PB',
      plusTwoApplied: '+2 aplicado',
      dnfApplied: 'DNF aplicado',
      modeLabel: 'Atalho principal',
      spaceHint: 'Segure e solte ESPAÇO',
      inspectionCountdown: 'Contagem de inspeção',
      finishLabel: 'Finalizar solve',
      finishHint: 'Pressione ESPAÇO novamente para parar.',
      feedbackLabel: 'Feedback',
      feedbackHint: 'Ajuste +2/DNF e acompanhe consistência.',
    },
    scramble: {
      sectionLabel: 'Painel de embaralhamento',
      title: 'Scramble Atual',
      subtitle: 'Copie, regenere e revise o estado antes do solve.',
      viewModeLabel: 'Modo de visualização do scramble',
      view3d: 'Ver em 3D',
      view2d: 'Ver em 2D',
      viewHint: 'Use 3D para orientação espacial e 2D para conferir stickers com rapidez.',
      focusModeMessage:
        'Visualização pausada durante a execução para manter performance máxima do timer.',
      visualUnavailable: 'Visualização 2D indisponível para este scramble.',
    },
    controls: {
      sectionLabel: 'Ações rápidas da sessão',
      plusTwo: 'Marcar +2',
      dnf: 'Marcar DNF',
      undo: 'Desfazer último',
      helper: 'Atalhos também funcionam pelo teclado quando nenhum modal está aberto.',
    },
    statsTitle: 'Painel de estatísticas',
    solveFeed: {
      title: 'Histórico Rápido',
      subtitle: 'Revise os últimos solves sem sair da home.',
      last: 'Últimos {count}',
      empty: 'Nenhum solve registrado nesta sessão ainda.',
      shortcutsLabel: 'Atalhos:',
    },
  },
  progressHub: {
    title: 'Progressão e Desafios',
    subtitle: 'Acompanhe streak, XP e metas semanais sem sair do fluxo do timer.',
    streakLabel: 'Streak atual',
    streakValue: '{count} dias',
    bestStreakLabel: 'Melhor sequência: {count} dias',
    levelLabel: 'Nível',
    xpLabel: 'XP',
    weeklyGoalLabel: 'Meta semanal',
    weeklyGoalStatusDone: 'Meta semanal concluída.',
    weeklyGoalStatusPending: 'Faltam {remaining} solves para fechar a meta.',
    challengesTitle: 'Desafios de hoje',
    empty: 'Nenhum desafio diário disponível no momento.',
    challengeDone: 'Concluído',
    challengeInProgress: 'Em andamento',
    progressText: '{current}/{target}',
    challengeTypes: {
      solveCount: {
        title: 'Complete {target} solves hoje',
        description: 'Volume diário para manter consistência de treino.',
      },
      cleanStreak: {
        title: 'Faça streak limpa de {target}',
        description: 'Conquiste solves consecutivos sem DNF.',
      },
      ao5Target: {
        title: 'Feche ao5 em {targetTime}',
        description: 'Bata a meta de ao5 pelo menos uma vez no dia.',
      },
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
  cubeViewer: {
    controls: {
      title: 'Controles do cubo',
      progress: 'Passo {current} de {total}',
      play: 'Reproduzir',
      pause: 'Pausar',
      previous: 'Passo anterior',
      next: 'Próximo passo',
      restart: 'Reiniciar',
      finish: 'Ir ao fim',
      speed: 'Velocidade',
      reducedMotion: 'Movimento reduzido ativo: o cubo evita autoplay até você iniciar a reprodução.',
      modes: {
        autoplay: 'Autoplay ativo: o cubo pode seguir sozinho quando você apertar reproduzir.',
        'step-by-step': 'Modo guiado: avance, volte ou pause cada etapa no seu ritmo.',
        static: 'Modo estático: apenas preview final do estado do cubo.',
      },
      speeds: {
        slow: 'Lenta',
        normal: 'Normal',
        fast: 'Rápida',
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
    cloudSync: {
      title: 'Conta e Sincronização',
      description: 'Conecte sua conta para manter sessões e solves sincronizados entre dispositivos.',
      statusLabel: 'Status da nuvem',
      statusLocalOnly: 'Local apenas',
      statusAnonymous: 'Não conectado',
      statusChecking: 'Validando sessão',
      statusConnected: 'Conectado',
      statusSyncing: 'Sincronizando',
      statusMigrating: 'Migrando dados locais',
      statusError: 'Erro de sincronização',
      lastSyncLabel: 'Última sincronização',
      lastSyncNever: 'Ainda não sincronizado',
      connectedAs: 'Conectado como',
      googleSignIn: 'Entrar com Google',
      magicLinkLabel: 'Ou use magic link por e-mail',
      magicLinkPlaceholder: 'voce@exemplo.com',
      magicLinkSend: 'Enviar link',
      magicLinkRequired: 'Informe um e-mail válido para enviar o link.',
      magicLinkSent: 'Verifique sua caixa de entrada para concluir o login.',
      syncNow: 'Sincronizar agora',
      syncingAction: 'Sincronizando...',
      syncSuccess: 'Sincronização concluída com sucesso.',
      syncError: 'Não foi possível sincronizar agora.',
      signOut: 'Sair da conta',
      signOutSuccess: 'Sessão encerrada com sucesso.',
      notConfiguredTitle: 'Supabase não configurado',
      notConfiguredDescription:
        'Defina as variáveis de ambiente para ativar login e sincronização na nuvem.',
      errorPrefix: 'Detalhe:',
      errorFallback: 'Não foi possível completar a ação. Tente novamente.',
    },
    sharing: {
      title: 'Compartilhamento Social',
      description: 'Crie links públicos com os dados que você escolher para mostrar sua evolução.',
      notConfiguredTitle: 'Supabase não configurado',
      notConfiguredDescription:
        'Ative as variáveis de ambiente do Supabase para liberar links públicos de compartilhamento.',
      loginRequiredTitle: 'Faça login para compartilhar',
      loginRequiredDescription:
        'Conecte sua conta no bloco acima para criar links públicos e revogar acessos quando quiser.',
      loading: 'Carregando...',
      controls: {
        enableSharing: 'Habilitar compartilhamento público',
        enableSharingHint:
          'Quando desligado, todos os links existentes são revogados imediatamente.',
        profileVisibility: 'Visibilidade do perfil',
        profilePublic: 'Seu perfil aparece como público no snapshot compartilhado.',
        profileFriends: 'Seu perfil fica visível apenas para amizades aceitas.',
        profilePrivate: 'Seu perfil fica privado e só o snapshot é exibido.',
        rankingVisibility: 'Visibilidade do ranking',
        rankingPublic: 'Seu ranking fica visível para qualquer usuário autenticado.',
        rankingFriends: 'Seu ranking fica visível apenas para amizades aceitas.',
        rankingPrivate: 'Seu ranking fica privado (apenas você visualiza).',
        shareSingle: 'Compartilhar single',
        shareSingleHint: 'Inclui seu melhor tempo atual no link público.',
        shareAverages: 'Compartilhar médias (ao5/ao12)',
        shareAveragesHint: 'Inclui ao5, ao12, best ao5 e best ao12 da sessão ativa.',
        shareProgress: 'Compartilhar progresso',
        shareProgressHint: 'Inclui nível, XP, streak e meta semanal.',
      },
      visibility: {
        public: 'Público',
        friends: 'Amigos',
        private: 'Privado',
      },
      privacyTitle: 'Privacidade e revogação imediata',
      privacyDescription:
        'Somente links marcados como públicos ficam acessíveis. Ao desativar o compartilhamento, todos os links ativos são invalidados.',
      actions: {
        createLink: 'Gerar link público',
        copy: 'Copiar link',
        revoke: 'Revogar link',
        revokeAll: 'Revogar todos',
      },
      listTitle: 'Links de compartilhamento',
      listItemTitle: 'Link compartilhado',
      empty: 'Nenhum link criado ainda.',
      createdAt: 'Criado em',
      status: {
        active: 'Ativo',
        revoked: 'Revogado',
      },
      messages: {
        created: 'Link público criado com sucesso.',
        createdAndCopied: 'Link público criado e copiado para a área de transferência.',
        copied: 'Link copiado para a área de transferência.',
        revoked: 'Link revogado com sucesso.',
        revokedAll: 'Todos os links públicos foram revogados.',
        updated: 'Preferências de compartilhamento atualizadas.',
      },
      errors: {
        generic: 'Não foi possível completar a ação de compartilhamento.',
        noData: 'Selecione pelo menos um bloco (single, médias ou progresso) para compartilhar.',
        sharingDisabled: 'Ative o compartilhamento público antes de gerar um link.',
        copy: 'Não foi possível copiar o link automaticamente.',
      },
    },
  },
  auth: {
    callback: {
      title: 'Conectando sua conta...',
      description: 'Estamos validando seu login e preparando a sincronização inicial.',
      processing: 'Processando autenticação',
      errorPrefix: 'Falha no callback:',
      errorUnknown: 'Não foi possível concluir o login.',
    },
  },
  sharePage: {
    badge: 'Snapshot compartilhado',
    loadingLabel: 'Carregando compartilhamento',
    loadingDescription: 'Buscando os dados públicos deste link.',
    generatedAt: 'Gerado em',
    puzzleType: 'Puzzle',
    notFoundTitle: 'Link indisponível',
    notFoundDescription:
      'Este link não existe, foi revogado ou está privado. Peça um novo link ao dono do compartilhamento.',
    metrics: {
      single: 'Single',
      ao5: 'ao5',
      ao12: 'ao12',
      bestAo5: 'Best ao5',
      bestAo12: 'Best ao12',
    },
    progressTitle: 'Progressão compartilhada',
    progress: {
      level: 'Nível',
      xp: 'XP total',
      currentStreak: 'Streak atual',
      bestStreak: 'Melhor streak',
      weeklyGoal: 'Meta semanal',
    },
  },
  socialHub: {
    friends: {
      notConfiguredTitle: 'Supabase não configurado',
      notConfiguredDescription:
        'Ative o Supabase para liberar convites de amizade e sincronização social.',
      loginRequiredTitle: 'Faça login para gerenciar amigos',
      loginRequiredDescription: 'Conecte sua conta nas configurações para enviar e receber convites.',
      labels: {
        loading: 'Carregando amizades...',
        invitedAt: 'Convite em',
        friendsSince: 'Amigos desde',
      },
      invite: {
        title: 'Enviar convite',
        description: 'Informe o ID do usuário para enviar o convite de amizade.',
        inputLabel: 'ID do usuário',
        placeholder: 'UUID do usuário',
      },
      incoming: {
        title: 'Convites recebidos',
        empty: 'Nenhum convite pendente recebido.',
      },
      outgoing: {
        title: 'Convites enviados',
        empty: 'Nenhum convite pendente enviado.',
      },
      list: {
        title: 'Lista de amigos',
        empty: 'Você ainda não tem amizades ativas.',
      },
      actions: {
        sendInvite: 'Enviar convite',
        accept: 'Aceitar',
        reject: 'Recusar',
        cancel: 'Cancelar',
        removeFriend: 'Remover amizade',
      },
      messages: {
        targetRequired: 'Informe um ID de usuário para enviar o convite.',
        invalidTarget: 'Não é possível enviar convite para esse usuário.',
        alreadyFriends: 'Esta amizade já existe.',
        pendingInvite: 'Já existe um convite pendente para este par de usuários.',
        inviteSent: 'Convite enviado com sucesso.',
        inviteAccepted: 'Convite aceito e amizade criada.',
        inviteRejected: 'Convite recusado.',
        inviteCancelled: 'Convite cancelado.',
        friendRemoved: 'Amizade removida.',
        errorGeneric: 'Não foi possível concluir a ação social agora.',
      },
    },
    leaderboard: {
      notConfiguredTitle: 'Supabase não configurado',
      notConfiguredDescription:
        'Configure o Supabase para ativar ranking semanal/mensal e comparação social.',
      loginRequiredTitle: 'Faça login para ver o ranking',
      loginRequiredDescription: 'Conecte sua conta nas configurações para acessar o leaderboard.',
      period: {
        title: 'Período do ranking',
        weekly: 'Semanal',
        monthly: 'Mensal',
      },
      actions: {
        refresh: 'Atualizar ranking',
        syncing: 'Sincronizando...',
      },
      labels: {
        loading: 'Carregando ranking...',
        periodKey: 'Período',
        visibilityNote:
          'A visibilidade segue suas flags de privacidade: privado, amigos ou público.',
        yourSnapshot: 'Seu snapshot no período',
        solveCount: 'Quantidade de solves',
        you: 'Você',
      },
      table: {
        title: 'Classificação',
        empty: 'Ainda não há entradas visíveis para este período.',
        columns: {
          rank: 'Pos.',
          user: 'Usuário',
          single: 'Single',
          ao5: 'ao5',
          ao12: 'ao12',
          consistency: 'Consistência',
          solves: 'Solves',
        },
      },
      messages: {
        errorGeneric: 'Não foi possível carregar o ranking agora.',
      },
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
  trainingLab: {
    title: 'Laboratório de Treino',
    subtitle: 'Treine blocos curtos do CFOP com apoio visual em 3D e progresso por caso.',
    method: {
      label: 'Método ativo',
      value: 'CFOP - Base progressiva',
      description: 'Comece com um pacote enxuto de casos e aumente a dificuldade por etapa.',
    },
    labels: {
      trackTabs: 'Selecionar trilha de treino',
      trackFocus: 'Foco da trilha',
      trackProgress: 'Volume da trilha',
      catalogTitle: 'Catálogo de drills',
      drill: 'Drill',
      attempts: 'Tentativas',
      target: 'Meta',
      focus: 'Foco técnico',
      difficulty: 'Dificuldade',
      setup: 'Setup visual',
      algorithm: 'Algoritmo de execução',
      recognition: 'Reconhecimento',
      coaching: 'Coaching rápido',
      confidence: 'Confiança atual',
      cubeHint: 'O cubo monta o caso e libera controles para reproduzir, pausar ou avançar no seu ritmo.',
    },
    actions: {
      replay: 'Repetir animação',
      add1: '+1 tentativa',
      add5: '+5 tentativas',
      add10: '+10 tentativas',
      reset: 'Resetar drill',
    },
    progress: {
      trackSummary: '{attempts} de {target} tentativas concluídas nesta trilha.',
    },
    confidence: {
      starting: 'Aquecendo',
      building: 'Ganhando ritmo',
      ready: 'Pronto para velocidade',
    },
    focusTags: {
      recognition: 'Reconhecimento',
      lookahead: 'Lookahead',
      execution: 'Execução',
    },
    difficulty: {
      starter: 'Iniciante',
      core: 'Base CFOP',
      stretch: 'Desafio controlado',
    },
    tracks: {
      f2l: {
        label: 'F2L',
        description: 'Construa pares com fluidez antes de acelerar.',
        focus: 'Par + slot sem pausas longas.',
        drills: {
          f2lPairInsertRight: {
            title: 'Par frontal à direita',
            summary: 'Inserção básica para consolidar lookahead.',
            recognition: 'Procure canto e aresta conectáveis no topo com slot frontal livre.',
            coaching: "Mantenha a câmera mental no slot enquanto executa U R U' R'.",
          },
          f2lPairInsertLeft: {
            title: 'Par frontal à esquerda',
            summary: 'Espelho da inserção direita para equilíbrio das mãos.',
            recognition: 'Identifique o par no topo e alinhe para entrada no slot frontal esquerdo.',
            coaching: "Use U' L' U L com ritmo uniforme e sem travar o giro U.",
          },
        },
      },
      oll: {
        label: 'OLL',
        description: 'Oriente a última camada com reconhecimento limpo.',
        focus: 'Ler padrão antes de executar.',
        drills: {
          ollSuneFlow: {
            title: 'Fluxo Sune',
            summary: 'Caso de entrada para ritmo contínuo de OLL.',
            recognition: 'Um canto orientado e bloco amarelo em diagonal no topo.',
            coaching: "Conecte dois gatilhos R U R' sem acelerar o U2.",
          },
          ollHeadlights: {
            title: 'Headlights',
            summary: 'Treino de padrão com faróis para transição segura.',
            recognition: 'Dois cantos adjacentes com amarelo voltado para frente.',
            coaching: 'Cheque os faróis antes do algoritmo para reduzir regrips.',
          },
        },
      },
      pll: {
        label: 'PLL',
        description: 'Finalize a última camada com permutações estáveis.',
        focus: 'Execução limpa com leitura de ciclo.',
        drills: {
          pllTPermFlow: {
            title: 'T-Perm em fluxo',
            summary: 'Permutação clássica para construir confiança na finalização.',
            recognition: 'Dois cantos resolvidos no fundo e troca de arestas na frente.',
            coaching: "Ancore o bloco com F e mantenha o ritmo até o F' final.",
          },
          pllUaPermFlow: {
            title: 'Ua-Perm controlado',
            summary: 'Treino de ciclo de três arestas com ritmo contínuo.',
            recognition: 'Uma barra resolvida e três arestas da U em ciclo horário.',
            coaching: 'Mantenha os U curtos e antecipe o R2 para fechar sem pausa.',
          },
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
        'O cubo 3D monta o caso e deixa os controles passo a passo prontos para revisar cada movimento no seu ritmo.',
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
