export const esES = {
  app: {
    title: 'Klick',
    tagline: 'gira, haz clic, evoluciona.',
  },
  navigation: {
    home: 'Inicio',
    history: 'Historial',
    stats: 'Estadísticas',
    leaderboard: 'Ranking',
    training: 'Entrenamiento',
    friends: 'Amigos',
    tutorial: 'Tutorial',
    settings: 'Configuración',
    cube3d: 'Cubo 3D',
  },
  pages: {
    home: {
      description: 'Practica tus solves con inspección guiada y estadísticas instantáneas.',
    },
    history: {
      description: 'Revisa todos tus solves y sigue tu progreso.',
    },
    stats: {
      description: 'Análisis detallado de rendimiento y evolución.',
    },
    leaderboard: {
      description: 'Compara resultados semanales y mensuales con amigos y jugadores públicos.',
    },
    training: {
      description: 'Practica casos específicos con metas, checkpoints y notas rápidas.',
    },
    friends: {
      description: 'Envía invitaciones, acepta amistades y gestiona tu red social de práctica.',
    },
    tutorial: {
      description: 'Aprende el método CFOP paso a paso.',
    },
    settings: {
      description: 'Personaliza Klick a tu manera.',
    },
  },
  homeRevamp: {
    badge: 'Timer Lab',
    title: 'Cronometraje claro, foco total y feedback inmediato.',
    subtitle:
      'La nueva home reúne timer, mezcla y métricas en un solo flujo. Cambia entre vista 3D y 2D sin romper tu ritmo de sesión.',
    highlights: {
      inspectionTitle: 'Inspección Guiada',
      inspectionDescription: 'Cuenta regresiva con señales visuales para iniciar a tiempo.',
      visualTitle: 'Mezcla Visual',
      visualDescription: 'Alterna entre cubo 3D y mapa 2D para revisar el estado inicial.',
      statsTitle: 'Métricas Esenciales',
      statsDescription: 'Single, ao5, ao12 y mejores medias siempre visibles.',
    },
    timer: {
      sectionLabel: 'Panel principal del cronómetro',
      inspectionLabel: 'Inspección activa',
      runningLabel: 'Solve en progreso',
      personalBest: 'Nuevo PB',
      plusTwoApplied: '+2 aplicado',
      dnfApplied: 'DNF aplicado',
      modeLabel: 'Atajo principal',
      spaceHint: 'Mantén y suelta ESPACIO',
      inspectionCountdown: 'Cuenta regresiva de inspección',
      finishLabel: 'Finalizar solve',
      finishHint: 'Presiona ESPACIO otra vez para detener.',
      feedbackLabel: 'Feedback',
      feedbackHint: 'Ajusta +2/DNF y revisa tu consistencia.',
    },
    scramble: {
      sectionLabel: 'Panel de mezcla',
      title: 'Mezcla Actual',
      subtitle: 'Copia, regenera y revisa el estado antes del solve.',
      viewModeLabel: 'Modo de visualización de mezcla',
      view3d: 'Vista 3D',
      view2d: 'Vista 2D',
      focusModeMessage:
        'La visualización se pausa durante el solve para mantener el rendimiento del timer.',
      visualUnavailable: 'Visualización 2D no disponible para esta mezcla.',
    },
    controls: {
      sectionLabel: 'Acciones rápidas de sesión',
      plusTwo: 'Marcar +2',
      dnf: 'Marcar DNF',
      undo: 'Deshacer último',
      helper: 'Los atajos del teclado funcionan cuando no hay modal abierto.',
    },
    statsTitle: 'Panel de estadísticas',
    solveFeed: {
      title: 'Historial Rápido',
      subtitle: 'Revisa tus últimos solves sin salir de la home.',
      last: 'Últimos {count}',
      empty: 'Todavía no hay solves registrados en esta sesión.',
      shortcutsLabel: 'Atajos:',
    },
  },
  progressHub: {
    title: 'Progreso y Desafíos',
    subtitle: 'Sigue streak, XP y metas semanales sin salir del flujo del timer.',
    streakLabel: 'Racha actual',
    streakValue: '{count} días',
    bestStreakLabel: 'Mejor racha: {count} días',
    levelLabel: 'Nivel',
    xpLabel: 'XP',
    weeklyGoalLabel: 'Meta semanal',
    weeklyGoalStatusDone: 'Meta semanal completada.',
    weeklyGoalStatusPending: 'Faltan {remaining} solves para completar la meta.',
    challengesTitle: 'Desafíos de hoy',
    empty: 'No hay desafíos diarios disponibles por ahora.',
    challengeDone: 'Completado',
    challengeInProgress: 'En progreso',
    progressText: '{current}/{target}',
    challengeTypes: {
      solveCount: {
        title: 'Completa {target} solves hoy',
        description: 'Volumen diario para mantener consistencia de entrenamiento.',
      },
      cleanStreak: {
        title: 'Logra una racha limpia de {target}',
        description: 'Encadena solves consecutivos sin DNF.',
      },
      ao5Target: {
        title: 'Consigue ao5 de {targetTime}',
        description: 'Supera tu meta de ao5 al menos una vez hoy.',
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
    title: 'Mezcla',
    copy: 'Copiar',
    new: 'Nueva',
    generating: 'Generando mezcla...',
    copySuccess: '¡Copiado!',
    guide: 'Cómo leer las mezclas',
    guideModal: {
      title: 'Guía de Mezcla',
      toggleVisualizer: 'Alternar Vista 3D',
      description:
        'Aprende a interpretar la notación del Cubo de Rubik 3×3 y ejecutar las mezclas correctamente.',
      faces: {
        title: 'Caras del Cubo',
        description: 'Cada letra representa una cara del cubo:',
        R: 'R - Derecha (Right)',
        L: 'L - Izquierda (Left)',
        U: 'U - Superior (Up)',
        D: 'D - Inferior (Down)',
        F: 'F - Frontal (Front)',
        B: 'B - Trasera (Back)',
      },
      modifiers: {
        title: 'Modificadores',
        description: 'Símbolos que modifican el movimiento:',
        none: 'Sin símbolo - 90° en sentido horario',
        prime: "' (prima) - 90° en sentido antihorario",
        double: '2 - 180° (giro doble)',
      },
      examples: {
        title: 'Ejemplos Prácticos',
        R: 'R = Gira la cara derecha 90° en sentido horario',
        RPrime: "R' = Gira la cara derecha 90° en sentido antihorario",
        R2: 'R2 = Gira la cara derecha 180°',
        sequence:
          "Secuencia: R U R' U' = Derecha, Superior, Derecha antihorario, Superior antihorario",
      },
      tips: {
        title: 'Consejos Importantes',
        tip1: '• Ejecuta los movimientos en el orden exacto mostrado',
        tip2: '• Siempre mira la misma cara (frontal) durante toda la mezcla',
        tip3: '• Practica los movimientos básicos antes de mezclas completas',
        tip4: '• Una mezcla oficial de la WCA tiene 25 movimientos',
      },
    },
  },
  cubeViewer: {
    controls: {
      title: 'Controles del cubo',
      progress: 'Paso {current} de {total}',
      play: 'Reproducir',
      pause: 'Pausar',
      previous: 'Paso anterior',
      next: 'Siguiente paso',
      restart: 'Reiniciar',
      finish: 'Ir al final',
      speed: 'Velocidad',
      reducedMotion: 'El movimiento reducido está activo, así que el autoplay queda en pausa hasta que lo inicies.',
      modes: {
        autoplay: 'Modo autoplay: el cubo puede continuar solo cuando pulses reproducir.',
        'step-by-step': 'Modo guiado: avanza, retrocede o pausa a tu propio ritmo.',
        static: 'Modo estático: solo vista final del estado del cubo.',
      },
      speeds: {
        slow: 'Lenta',
        normal: 'Normal',
        fast: 'Rápida',
      },
    },
  },
  timer: {
    inspection: 'Inspección',
    ready: 'Listo',
    running: 'Ejecutando',
    stopped: 'Detenido',
    pressSpace: 'Presiona ESPACIO',
    holdSpace: 'Mantén ESPACIO para comenzar inspección',
  },
  shortcuts: {
    title: 'Atajos',
    space: 'Iniciar/Detener',
    newScramble: 'Nueva mezcla',
    togglePlus2: 'Alternar +2',
    toggleDNF: 'Alternar DNF',
    undo: 'Deshacer',
  },
  penalties: {
    none: 'Sin penalización',
    plus2: '+2 segundos',
    dnf: 'DNF (Did Not Finish)',
    warning: 'Advertencia',
    critical: 'Crítico',
  },
  stats: {
    single: 'Mejor Tiempo',
    ao5: 'Promedio de 5',
    ao12: 'Promedio de 12',
    bestAo5: 'Mejor ao5',
    bestAo12: 'Mejor ao12',
    current: 'Actual',
    best: 'Mejor',
    worst: 'Peor',
    average: 'Promedio',
    deviation: 'Desviación Estándar',
    clear: 'Limpiar Estadísticas',
    clearConfirmTitle: '¿Limpiar todos los solves?',
    clearConfirmMessage:
      'Esta acción eliminará permanentemente todos los solves de la sesión actual. Esta acción no se puede deshacer.',
    clearSuccess: '¡Estadísticas limpiadas con éxito!',
    help: 'Ayuda',
    learnMore: 'Aprende más',
    advanced: 'Estadísticas Avanzadas',
    info: {
      title: 'Entendiendo las Estadísticas',
      single: {
        title: 'Single (Mejor Tiempo)',
        description: 'Tu tiempo más rápido en un solo solve. Muestra lo mejor que has logrado.',
        example: 'Si hiciste solves de 15s, 12s y 18s, tu single es 12s.',
      },
      ao5: {
        title: 'ao5 (Promedio de 5)',
        description:
          'Promedio de tus últimos 5 solves, descartando el mejor y el peor tiempo. Esto da una visión más precisa de tu rendimiento consistente.',
        example:
          'Tiempos: 15s, 12s, 18s, 14s, 16s\nDescarta: 12s (mejor) y 18s (peor)\nPromedio: (15 + 14 + 16) ÷ 3 = 15s',
        rule: 'Si hay 2 o más DNFs en los últimos 5 solves, el promedio es DNF.',
      },
      ao12: {
        title: 'ao12 (Promedio de 12)',
        description:
          'Funciona igual que ao5, pero con los últimos 12 solves. Aún más preciso para medir consistencia.',
        example:
          'Toma los últimos 12 tiempos, elimina el mejor y el peor, y calcula el promedio de los 10 restantes.',
        rule: 'Si hay 2 o más DNFs en los últimos 12 solves, el promedio es DNF.',
      },
      bestAo5: {
        title: 'Best ao5 (Mejor ao5)',
        description:
          'El mejor promedio de 5 consecutivos que has hecho. Es tu récord personal de ao5.',
        example:
          'Entre todas las secuencias de 5 solves consecutivos, esta es la que tuvo el mejor promedio.',
      },
      bestAo12: {
        title: 'Best ao12 (Mejor ao12)',
        description:
          'El mejor promedio de 12 consecutivos que has hecho. Es tu récord personal de ao12.',
        example:
          'Entre todas las secuencias de 12 solves consecutivos, esta es la que tuvo el mejor promedio.',
      },
      penalties: {
        title: 'Penalizaciones',
        plus2: '+2: Añade 2 segundos al tiempo (ajuste incorrecto del cubo al final)',
        dnf: 'DNF (Did Not Finish): Solve inválido (no resuelto, violó reglas de inspección, etc.)',
      },
    },
  },
  actions: {
    save: 'Guardar',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    export: 'Exportar',
    import: 'Importar',
    edit: 'Editar',
    create: 'Crear',
    confirm: 'Confirmar',
    close: 'Cerrar',
    viewDetails: 'Ver Detalles',
    back: 'Volver',
  },
  sessions: {
    title: 'Sesiones',
    current: 'Sesión Actual',
    create: 'Nueva Sesión',
    rename: 'Renombrar Sesión',
    delete: 'Eliminar Sesión',
    switch: 'Cambiar Sesión',
    manage: 'Gestionar Sesiones',
    name: 'Nombre de la Sesión',
    namePlaceholder: 'Ingresa el nombre de la sesión',
    createSuccess: '¡Sesión creada con éxito!',
    renameSuccess: '¡Sesión renombrada con éxito!',
    deleteSuccess: '¡Sesión eliminada con éxito!',
    deleteConfirm: {
      title: '¿Eliminar sesión?',
      message:
        'Todos los solves de esta sesión se perderán permanentemente. Esta acción no se puede deshacer.',
    },
    cannotDeleteLast: 'No se puede eliminar la última sesión',
    solveCount: 'solves',
    solveCountSingular: 'solve',
    active: 'Activa',
  },
  solveTable: {
    title: 'Historial de Solves',
    empty: 'Aún no hay solves registrados',
    columns: {
      number: '#',
      time: 'Tiempo',
      scramble: 'Mezcla',
      date: 'Fecha',
      penalty: 'Penalización',
      actions: 'Acciones',
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
      title: '¿Eliminar solve?',
      message: 'Esta acción no se puede deshacer.',
    },
    details: {
      title: 'Detalles del Solve',
      solveNumber: 'Solve',
      time: 'Tiempo',
      penalty: 'Penalización',
      scramble: 'Mezcla',
      date: 'Fecha',
      finalTime: 'Tiempo Final',
      baseTime: 'Tiempo Base',
      visualizationUnavailable: 'Visualización no disponible',
    },
  },
  history: {
    description: 'Revisa todos tus solves y sigue tu progreso.',
    sessionProgress: 'Progreso de la Sesión',
    charts: {
      noData: {
        title: 'No hay datos disponibles',
        description: 'Completa solves para visualizar el progreso',
      },
      insufficientData: {
        title: 'Datos Insuficientes',
        description: 'Completa más solves para generar el gráfico',
      },
      tooltip: {
        solve: 'Solve #',
        penaltyApplied: 'Penalización aplicada',
      },
    },
  },
  inspection: {
    warningTime: '¡Tiempo de advertencia!',
    penaltyPlus2: '+2 será aplicado',
    penaltyDNF: 'DNF será aplicado',
  },
  settings: {
    title: 'Configuración',
    inspectionDuration: {
      label: 'Duración de Inspección',
      description: 'Tiempo disponible para inspeccionar el cubo antes de comenzar',
      seconds: 'segundos',
    },
    soundsEnabled: {
      label: 'Sonidos Habilitados',
      description: 'Activar sonidos de retroalimentación durante el cronómetro',
    },
    autoInspectionPenalty: {
      label: 'Penalización Automática de Inspección',
      description: '+2 entre 15-17s, DNF después de 17s (siguiendo reglas oficiales de la WCA)',
    },
    theme: {
      label: 'Tema',
      description: 'Apariencia visual de la aplicación',
      dark: 'Oscuro',
      light: 'Claro',
    },
    exportImport: {
      title: 'Exportar/Importar Datos',
      exportCurrent: 'Exportar Sesión Actual',
      exportAll: 'Exportar Todas las Sesiones',
      import: 'Importar Sesiones',
      importMode: 'Modo de Importación',
      merge: 'Combinar con sesiones existentes',
      replace: 'Reemplazar todas las sesiones',
      exportSuccess: '¡Datos exportados con éxito!',
      importSuccess: '¡Datos importados con éxito!',
      importError: 'Error al importar datos. Por favor verifica el formato del archivo.',
    },
    cloudSync: {
      title: 'Cuenta y Sincronización',
      description:
        'Conecta tu cuenta para mantener sesiones y solves sincronizados entre dispositivos.',
      statusLabel: 'Estado de la nube',
      statusLocalOnly: 'Solo local',
      statusAnonymous: 'Sin conexión',
      statusChecking: 'Validando sesión',
      statusConnected: 'Conectado',
      statusSyncing: 'Sincronizando',
      statusMigrating: 'Migrando datos locales',
      statusError: 'Error de sincronización',
      lastSyncLabel: 'Última sincronización',
      lastSyncNever: 'Aún sin sincronizar',
      connectedAs: 'Conectado como',
      googleSignIn: 'Entrar con Google',
      magicLinkLabel: 'O usa magic link por correo',
      magicLinkPlaceholder: 'tu@ejemplo.com',
      magicLinkSend: 'Enviar enlace',
      magicLinkRequired: 'Ingresa un correo válido para enviar el enlace.',
      magicLinkSent: 'Revisa tu bandeja para completar el acceso.',
      syncNow: 'Sincronizar ahora',
      syncingAction: 'Sincronizando...',
      syncSuccess: 'Sincronización completada.',
      syncError: 'No se pudo sincronizar ahora.',
      signOut: 'Cerrar sesión',
      signOutSuccess: 'Sesión cerrada correctamente.',
      notConfiguredTitle: 'Supabase no configurado',
      notConfiguredDescription:
        'Define variables de entorno para habilitar login y sincronización en la nube.',
      errorPrefix: 'Detalle:',
      errorFallback: 'No se pudo completar esta acción. Inténtalo nuevamente.',
    },
    sharing: {
      title: 'Compartir Social',
      description: 'Crea enlaces públicos con solo los datos que decidas mostrar.',
      notConfiguredTitle: 'Supabase no configurado',
      notConfiguredDescription:
        'Activa las variables de entorno de Supabase para habilitar enlaces públicos.',
      loginRequiredTitle: 'Inicia sesión para compartir',
      loginRequiredDescription:
        'Conecta tu cuenta en el bloque superior para crear enlaces y revocar accesos cuando quieras.',
      loading: 'Cargando...',
      controls: {
        enableSharing: 'Habilitar compartición pública',
        enableSharingHint: 'Al desactivar esta opción, todos los enlaces activos se revocan al instante.',
        profileVisibility: 'Visibilidad del perfil',
        profilePublic: 'Tu perfil aparece como público en los snapshots compartidos.',
        profileFriends: 'Tu perfil solo es visible para amistades aceptadas.',
        profilePrivate: 'Tu perfil permanece privado y solo se muestra el snapshot.',
        rankingVisibility: 'Visibilidad del ranking',
        rankingPublic: 'Tu entrada de ranking es visible para cualquier usuario autenticado.',
        rankingFriends: 'Tu entrada de ranking solo es visible para amistades aceptadas.',
        rankingPrivate: 'Tu entrada de ranking es privada (solo tú puedes verla).',
        shareSingle: 'Compartir single',
        shareSingleHint: 'Incluye tu mejor single actual en el enlace público.',
        shareAverages: 'Compartir promedios (ao5/ao12)',
        shareAveragesHint:
          'Incluye ao5, ao12, best ao5 y best ao12 de la sesión activa.',
        shareProgress: 'Compartir progresión',
        shareProgressHint: 'Incluye nivel, XP, racha y meta semanal.',
      },
      visibility: {
        public: 'Público',
        friends: 'Amigos',
        private: 'Privado',
      },
      privacyTitle: 'Privacidad y revocación inmediata',
      privacyDescription:
        'Solo los enlaces marcados como públicos son visibles. Al desactivar compartir, todos los enlaces activos se invalidan.',
      actions: {
        createLink: 'Crear enlace público',
        copy: 'Copiar enlace',
        revoke: 'Revocar enlace',
        revokeAll: 'Revocar todos',
      },
      listTitle: 'Enlaces compartidos',
      listItemTitle: 'Enlace compartido',
      empty: 'Todavía no hay enlaces creados.',
      createdAt: 'Creado el',
      status: {
        active: 'Activo',
        revoked: 'Revocado',
      },
      messages: {
        created: 'Enlace público creado correctamente.',
        createdAndCopied: 'Enlace público creado y copiado al portapapeles.',
        copied: 'Enlace copiado al portapapeles.',
        revoked: 'Enlace revocado correctamente.',
        revokedAll: 'Todos los enlaces públicos fueron revocados.',
        updated: 'Preferencias de compartición actualizadas.',
      },
      errors: {
        generic: 'No se pudo completar la acción de compartición.',
        noData: 'Selecciona al menos un bloque (single, promedios o progresión) para compartir.',
        sharingDisabled: 'Activa la compartición pública antes de crear un enlace.',
        copy: 'No fue posible copiar el enlace automáticamente.',
      },
    },
  },
  auth: {
    callback: {
      title: 'Conectando tu cuenta...',
      description: 'Estamos validando tu acceso y preparando la primera sincronización.',
      processing: 'Procesando autenticación',
      errorPrefix: 'Falló el callback:',
      errorUnknown: 'No fue posible completar el acceso.',
    },
  },
  sharePage: {
    badge: 'Snapshot compartido',
    loadingLabel: 'Cargando compartición',
    loadingDescription: 'Buscando los datos públicos de este enlace.',
    generatedAt: 'Generado el',
    puzzleType: 'Puzzle',
    notFoundTitle: 'Enlace no disponible',
    notFoundDescription:
      'Este enlace no existe, fue revocado o está privado. Pide un nuevo enlace al propietario.',
    metrics: {
      single: 'Single',
      ao5: 'ao5',
      ao12: 'ao12',
      bestAo5: 'Best ao5',
      bestAo12: 'Best ao12',
    },
    progressTitle: 'Progresión compartida',
    progress: {
      level: 'Nivel',
      xp: 'XP total',
      currentStreak: 'Racha actual',
      bestStreak: 'Mejor racha',
      weeklyGoal: 'Meta semanal',
    },
  },
  socialHub: {
    friends: {
      notConfiguredTitle: 'Supabase no configurado',
      notConfiguredDescription:
        'Activa Supabase para habilitar invitaciones de amistad y sincronización social.',
      loginRequiredTitle: 'Inicia sesión para gestionar amigos',
      loginRequiredDescription:
        'Conecta tu cuenta en configuración para enviar y recibir invitaciones.',
      labels: {
        loading: 'Cargando amistades...',
        invitedAt: 'Invitado el',
        friendsSince: 'Amigos desde',
      },
      invite: {
        title: 'Enviar invitación',
        description: 'Ingresa un ID de usuario para enviar una invitación de amistad.',
        inputLabel: 'ID de usuario',
        placeholder: 'UUID del usuario',
      },
      incoming: {
        title: 'Invitaciones recibidas',
        empty: 'No tienes invitaciones recibidas pendientes.',
      },
      outgoing: {
        title: 'Invitaciones enviadas',
        empty: 'No tienes invitaciones enviadas pendientes.',
      },
      list: {
        title: 'Lista de amigos',
        empty: 'Aún no tienes amistades activas.',
      },
      actions: {
        sendInvite: 'Enviar invitación',
        accept: 'Aceptar',
        reject: 'Rechazar',
        cancel: 'Cancelar',
        removeFriend: 'Eliminar amistad',
      },
      messages: {
        targetRequired: 'Ingresa un ID de usuario antes de enviar la invitación.',
        invalidTarget: 'No se puede enviar invitación a ese usuario.',
        alreadyFriends: 'Esta amistad ya existe.',
        pendingInvite: 'Ya existe una invitación pendiente para este par de usuarios.',
        inviteSent: 'Invitación enviada correctamente.',
        inviteAccepted: 'Invitación aceptada y amistad creada.',
        inviteRejected: 'Invitación rechazada.',
        inviteCancelled: 'Invitación cancelada.',
        friendRemoved: 'Amistad eliminada.',
        errorGeneric: 'No se pudo completar esta acción social ahora.',
      },
    },
    leaderboard: {
      notConfiguredTitle: 'Supabase no configurado',
      notConfiguredDescription:
        'Configura Supabase para habilitar ranking semanal/mensual y comparación social.',
      loginRequiredTitle: 'Inicia sesión para ver el ranking',
      loginRequiredDescription: 'Conecta tu cuenta en configuración para acceder al leaderboard.',
      period: {
        title: 'Período del ranking',
        weekly: 'Semanal',
        monthly: 'Mensual',
      },
      actions: {
        refresh: 'Actualizar ranking',
        syncing: 'Sincronizando...',
      },
      labels: {
        loading: 'Cargando ranking...',
        periodKey: 'Período',
        visibilityNote: 'La visibilidad respeta tus flags: privado, amigos o público.',
        yourSnapshot: 'Tu snapshot del período',
        solveCount: 'Cantidad de solves',
        you: 'Tú',
      },
      table: {
        title: 'Clasificación',
        empty: 'Todavía no hay entradas visibles para este período.',
        columns: {
          rank: 'Pos.',
          user: 'Usuario',
          single: 'Single',
          ao5: 'ao5',
          ao12: 'ao12',
          consistency: 'Consistencia',
          solves: 'Solves',
        },
      },
      messages: {
        errorGeneric: 'No se pudo cargar el ranking ahora.',
      },
    },
  },
  advancedStats: {
    title: 'Estadísticas Avanzadas',
    tabs: {
      evolution: 'Evolución',
      consistency: 'Consistencia',
      performance: 'Rendimiento',
    },
    evolution: {
      title: 'Evolución Temporal',
      description: 'Sigue la progresión de tus tiempos a lo largo de las sesiones',
      chartTitle: 'Historial de Tiempos',
      single: 'Single',
      ao5: 'ao5',
      ao12: 'ao12',
      solveNumber: 'Solve #',
      time: 'Tiempo (ms)',
      noData: 'No hay datos suficientes para gráficos',
      tip: 'Completa al menos 12 solves para visualizar la evolución completa',
    },
    consistency: {
      title: 'Análisis de Consistencia',
      description:
        'Descubre cuánto fluctúan tus tiempos y cómo eso impacta tu confiabilidad en solves reales.',
      standardDeviation: {
        title: 'Desviación Estándar',
        description:
          'Indica cuánto se aleja cada solve, en promedio, de tu tiempo medio. Números altos revelan solves "pico"; intenta reducirlos tras prácticas de ejecución controlada.',
        value: 'ms',
      },
      coefficientOfVariation: {
        title: 'Coeficiente de Variación',
        description:
          'Porcentaje del desvío estándar respecto a la media. Menos del 10% es consistencia de competencia; más del 20% señala inestabilidad que conviene trabajar.',
        value: '%',
        excellent: 'Excelente (< 10%)',
        good: 'Bueno (10-15%)',
        average: 'Promedio (15-20%)',
        needsWork: 'Necesita mejorar (> 20%)',
      },
      interpretation: {
        title: 'Interpretación',
        description:
          'La consistencia es tan importante como la velocidad. Revisa si tus variaciones disminuyen con el tiempo para validar entrenamientos de control e inspección.',
      },
    },
    performance: {
      title: 'Análisis de Rendimiento',
      description:
        'Sigue tu ritmo promedio y cómo se agrupan tus solves para ajustar bloques de entrenamiento.',
      averageTPS: {
        title: 'TPS Promedio',
        description:
          'Turns Per Second - cantidad promedio de movimientos por segundo. Ideal para ver mejoras después de practicar algoritmos o finger tricks.',
        value: 'movimientos/s',
        note: 'Se calcula considerando 25 movimientos por solve (longitud estándar de mezcla 3x3).',
      },
      distribution: {
        title: 'Distribución de Tiempos',
        description:
          'Muestra en qué rangos aparecen la mayoría de tus solves. Las colas largas evidencian outliers o caídas de concentración a investigar.',
        chartTitle: 'Histograma de Tiempos',
        xAxis: 'Rango de Tiempo',
        yAxis: 'Cantidad de Solves',
      },
    },
    close: 'Cerrar',
  },
  onboarding: {
    skip: 'Saltar tour',
    previous: 'Anterior',
    next: 'Siguiente',
    finish: 'Finalizar',
    progress: 'Paso {current} de {total}',
    startTour: 'Iniciar tour',
    welcome: {
      title: '¡Bienvenido a Klick! 🎉',
      description:
        '¡Hagamos un tour rápido para mostrarte las principales características de la aplicación. ¡Solo toma 1 minuto!',
    },
    scramble: {
      title: 'Mezcla del Cubo',
      description:
        'Aquí aparece la mezcla (scramble) del cubo mágico. Haz clic en "Nuevo" para generar otro o en "?" para aprender a leer la notación.',
    },
    timer: {
      title: 'Cronómetro',
      description:
        'Mantén presionada la barra de ESPACIO para armar el cronómetro. Suelta para iniciar la inspección (15s). Presiona ESPACIO nuevamente para iniciar/detener el cronómetro.',
    },
    stats: {
      title: 'Estadísticas',
      description:
        'Sigue tu rendimiento con métricas como Single (mejor tiempo), ao5 y ao12 (promedios). ¡Haz clic en "📈" para ver estadísticas avanzadas!',
    },
    shortcuts: {
      title: 'Atajos de Teclado',
      description:
        'Usa atajos para ser más rápido: ESPACIO (cronómetro), N (nueva mezcla), P (+2), D (DNF). ¡Trabaja sin quitar las manos del cubo!',
    },
    sessions: {
      title: 'Sesiones',
      description:
        'Organiza tus solves en diferentes sesiones. Útil para separar entrenamientos, competiciones o diferentes métodos.',
    },
    complete: {
      title: '¡Todo listo! 🎊',
      description:
        '¡Ahora conoces Klick! Comienza a resolver y sigue tu progreso. Puedes revisar este tour en cualquier momento haciendo clic en el botón "?" en el encabezado.',
    },
  },
  trainingLab: {
    title: 'Laboratorio de Entrenamiento',
    subtitle: 'Practica bloques cortos de CFOP con soporte visual 3D y progreso por caso.',
    method: {
      label: 'Método activo',
      value: 'CFOP - Base progresiva',
      description: 'Empieza con un paquete compacto de casos y sube dificultad por etapa.',
    },
    labels: {
      trackTabs: 'Seleccionar pista de entrenamiento',
      trackFocus: 'Foco de la pista',
      trackProgress: 'Volumen de la pista',
      catalogTitle: 'Catálogo de drills',
      drill: 'Drill',
      attempts: 'Intentos',
      target: 'Meta',
      focus: 'Foco técnico',
      difficulty: 'Dificultad',
      setup: 'Setup visual',
      algorithm: 'Algoritmo de ejecución',
      recognition: 'Reconocimiento',
      coaching: 'Coaching rápido',
      confidence: 'Confianza actual',
      cubeHint: 'El cubo arma el caso y te deja controles para reproducirlo, pausarlo o avanzar a tu ritmo.',
    },
    actions: {
      replay: 'Repetir animación',
      add1: '+1 intento',
      add5: '+5 intentos',
      add10: '+10 intentos',
      reset: 'Reiniciar drill',
    },
    progress: {
      trackSummary: '{attempts} de {target} intentos completados en esta pista.',
    },
    confidence: {
      starting: 'Calentando',
      building: 'Ganando ritmo',
      ready: 'Listo para velocidad',
    },
    focusTags: {
      recognition: 'Reconocimiento',
      lookahead: 'Lookahead',
      execution: 'Ejecución',
    },
    difficulty: {
      starter: 'Inicial',
      core: 'Base CFOP',
      stretch: 'Reto controlado',
    },
    tracks: {
      f2l: {
        label: 'F2L',
        description: 'Construye fluidez de pares antes de acelerar.',
        focus: 'Par + slot con pausas mínimas.',
        drills: {
          f2lPairInsertRight: {
            title: 'Inserción frontal derecha',
            summary: 'Inserción base para consolidar el lookahead.',
            recognition: 'Busca par esquina-arista conectable sobre un slot frontal libre.',
            coaching: "Mantén la cámara mental en el slot mientras haces U R U' R'.",
          },
          f2lPairInsertLeft: {
            title: 'Inserción frontal izquierda',
            summary: 'Versión espejo para equilibrar ambas manos.',
            recognition: 'Alinea el par sobre el slot frontal izquierdo antes de entrar.',
            coaching: "Ejecuta U' L' U L con tempo uniforme y sin bloquear el giro U.",
          },
        },
      },
      oll: {
        label: 'OLL',
        description: 'Orienta la última capa con lectura limpia de patrones.',
        focus: 'Primero leer, luego ejecutar.',
        drills: {
          ollSuneFlow: {
            title: 'Flujo Sune',
            summary: 'Caso de entrada para ritmo continuo en OLL.',
            recognition: 'Una esquina orientada y bloque amarillo diagonal en la cara U.',
            coaching: "Encadena dos gatillos R U R' sin acelerar el U2.",
          },
          ollHeadlights: {
            title: 'Headlights',
            summary: 'Patrón para estabilizar transiciones de OLL.',
            recognition: 'Dos esquinas adyacentes mirando al frente como faros.',
            coaching: 'Confirma los faros antes del algoritmo para reducir regrips.',
          },
        },
      },
      pll: {
        label: 'PLL',
        description: 'Cierra la última capa con permutaciones confiables.',
        focus: 'Ejecución limpia con lectura de ciclo.',
        drills: {
          pllTPermFlow: {
            title: 'T-Perm en flujo',
            summary: 'Permutación clásica para cerrar solves con confianza.',
            recognition: 'Dos esquinas traseras resueltas y patrón de intercambio frontal.',
            coaching: "Ancla el bloque con F y conserva el ritmo hasta el F' final.",
          },
          pllUaPermFlow: {
            title: 'Ua-Perm controlado',
            summary: 'Ciclo de tres aristas con ritmo continuo.',
            recognition: 'Una barra resuelta y ciclo horario de tres aristas en U.',
            coaching: 'Haz U compactos y anticipa el R2 de cierre.',
          },
        },
      },
    },
  },
  tutorial: {
    title: 'Tutorial para Principiantes',
    subtitle: 'Aprende a resolver el cubo de Rubik 3×3 paso a paso',
    open: '¿Cómo resolver?',
    steps: {
      title: 'Paso {step} de {total}',
      progress: 'Paso {current} de {total}',
      navigation: {
        previous: 'Anterior',
        next: 'Siguiente',
        finish: 'Finalizar',
      },
      labels: {
        goal: 'Objetivo',
        algorithm: 'Algoritmo',
        steps: 'Pasos',
        tip: 'Consejo',
        important: 'Importante',
      },
    },
    completion: {
      title: '¡Felicitaciones!',
      description:
        'Has completado el tutorial para principiantes. ¡Ahora es hora de practicar y mejorar tu tiempo de resolución!',
      goToTimer: 'Empezar a Resolver',
      restart: 'Reiniciar Tutorial',
    },
    intro: {
      title: '¡Bienvenido al Método para Principiantes! 🎓',
      description:
        'Vamos a aprender el método de capas (Layer by Layer) para resolver el cubo de Rubik 3×3. ¡Es el método más simple e intuitivo para empezar!',
      whatYouWillLearn: 'Lo que aprenderás:',
      topics: [
        'Cruz blanca (primera capa)',
        'Esquinas blancas (completar primera capa)',
        'Segunda capa (capa media)',
        'Cruz amarilla (cruz última capa)',
        'Orientar esquinas (OLL)',
        'Permutar esquinas y aristas (PLL)',
      ],
      timeEstimate: 'Tiempo estimado: 10-15 minutos',
      difficulty: 'Dificultad: Principiante',
    },
    whiteCross: {
      title: '1. Cruz Blanca',
      description: 'Resuelve las 4 aristas blancas formando una cruz en la cara blanca',
      goal: 'Objetivo: Cruz blanca alineada con los centros laterales',
      tips: [
        'Elige una cara para ser la base (recomendamos blanco)',
        'Encuentra las 4 aristas con blanco (piezas con 2 colores)',
        'Posiciona cada arista alineando el color lateral con el centro correspondiente',
        'La cruz debe estar correcta tanto en la cara blanca como en los laterales',
      ],
      intuitive: '¡Este paso es intuitivo! Practica moviendo las aristas sin algoritmos.',
    },
    whiteCorners: {
      title: '2. Esquinas Blancas',
      description: 'Completa la primera capa insertando las 4 esquinas blancas',
      goal: 'Objetivo: Primera capa completamente resuelta',
      algorithm: "Algoritmo R U R': Repite hasta que la esquina encaje",
      steps: [
        'Posiciona la esquina blanca en la capa inferior',
        'Alinea la esquina debajo de donde debe ir',
        "Ejecuta R U R' de 1 a 5 veces hasta que encaje",
        'Repite para las 4 esquinas',
      ],
      tip: "¡El algoritmo R U R' saca la esquina, gira y la recoloca. Es como un 'ascensor' para la esquina!",
    },
    secondLayer: {
      title: '3. Segunda Capa',
      description: 'Resuelve las 4 aristas de la capa media',
      goal: 'Objetivo: Dos capas completas (blanca y media)',
      algorithms: {
        title: 'Algoritmos de la Segunda Capa:',
        left: "Para la izquierda: U' L' U L U F U' F'",
        right: "Para la derecha: U R U' R' U' F' U F",
      },
      steps: [
        'Encuentra una arista sin amarillo en la capa superior',
        'Posiciona la arista encima de donde debe ir',
        'Usa el algoritmo correcto (izquierda o derecha)',
        'Repite para las 4 aristas',
      ],
      tip: 'Si una arista está en la posición incorrecta de la 2ª capa, usa el algoritmo para sacarla primero.',
    },
    yellowCross: {
      title: '4. Cruz Amarilla',
      description: 'Forma una cruz en la cara amarilla (no necesita estar alineada)',
      goal: 'Objetivo: Cruz amarilla en la cara superior',
      algorithm: "F R U R' U' F'",
      patterns: {
        title: 'Patrones posibles:',
        dot: 'Punto (ninguna arista) → Ejecuta el algoritmo 3×',
        line: 'Línea → Alinea horizontal y ejecuta 2×',
        L: 'Forma de L → Posiciona la L en la esquina superior izquierda y ejecuta 1×',
        cross: '¡Cruz → Ya está listo!',
      },
      tip: '¡No te preocupes por los centros laterales todavía, enfócate solo en la cruz amarilla!',
    },
    yellowEdges: {
      title: '5. Alinear Aristas Amarillas',
      description: 'Alinea las aristas amarillas con los centros laterales',
      goal: 'Objetivo: Cruz amarilla alineada con todos los colores laterales',
      algorithm: "R U R' U R U2 R'",
      steps: [
        'Busca un lado donde el color de la arista ya coincida con el centro',
        'Posiciona ese lado en la parte trasera (lejos de ti)',
        'Ejecuta el algoritmo',
        'Repite si es necesario',
      ],
      tip: 'Si ningún lado está correcto, ejecuta el algoritmo en cualquier posición y luego busca nuevamente.',
    },
    yellowCorners: {
      title: '6. Posicionar Esquinas Amarillas',
      description: 'Coloca las esquinas amarillas en las posiciones correctas (aún no orientadas)',
      goal: 'Objetivo: Esquinas en las posiciones correctas, independientemente de la orientación',
      algorithm: "U R U' L' U R' U' L",
      steps: [
        'Encuentra una esquina ya en la posición correcta (los colores coinciden)',
        'Posiciona esa esquina en la esquina superior derecha',
        'Ejecuta el algoritmo',
        'Repite hasta que todas las esquinas estén en las posiciones correctas',
      ],
      tip: 'Las esquinas pueden estar giradas, pero sus colores deben coincidir con las caras circundantes.',
    },
    solveCorners: {
      title: '7. Orientar Esquinas (Finalizar)',
      description: 'Orienta las últimas esquinas para resolver el cubo',
      goal: '¡Objetivo: Cubo completamente resuelto! 🎉',
      algorithm: "R' D' R D",
      steps: [
        'Sostén el cubo con la cara amarilla hacia arriba',
        'Posiciona una esquina no resuelta en la esquina superior derecha',
        "Ejecuta R' D' R D de 2 a 4 veces hasta que la esquina quede amarilla arriba",
        'Gira SOLO la cara superior (U) para traer la siguiente esquina no resuelta',
        'Repite hasta que todas las esquinas estén orientadas',
      ],
      important: '¡IMPORTANTE: No gires el cubo! Solo gira la cara U entre esquinas.',
      congratulations: '¡Felicitaciones! ¡Has resuelto el cubo de Rubik! 🎊',
    },
    tips: {
      title: 'Consejos Importantes',
      practice: 'Practica cada paso por separado antes de intentar el cubo completo',
      algorithms: 'Memoriza los algoritmos gradualmente, comenzando por los más usados',
      patience: '¡Ten paciencia! Al principio puede tomar 5-10 minutos por paso',
      muscle: 'Con la práctica, tus dedos desarrollarán memoria muscular',
      speed: 'La velocidad viene naturalmente con la práctica, enfócate primero en la precisión',
    },
    notation: {
      title: 'Notación Básica',
      R: 'R = Derecha 90° horario',
      RPrime: "R' = Derecha 90° antihorario",
      U: 'U = Arriba 90° horario',
      UPrime: "U' = Arriba 90° antihorario",
      F: 'F = Frente 90° horario',
      FPrime: "F' = Frente 90° antihorario",
      L: 'L = Izquierda 90° horario',
      LPrime: "L' = Izquierda 90° antihorario",
      D: 'D = Abajo 90° horario',
      DPrime: "D' = Abajo 90° antihorario",
      number2: '2 = 180° (ej: R2, U2)',
    },
  },
  tutorialGuide: {
    title: 'Tutorial CFOP con cubo 3D',
    subtitle: 'Aprende Cross, F2L, OLL y PLL con casos visuales y enfoque en consistencia.',
    progress: {
      stage: 'Etapa {current} de {total}',
      lesson: 'Lección {current} de {total}',
    },
    method: {
      title: 'Método de entrenamiento',
      focus: 'Enfoque del método',
      estimatedTime: 'Tiempo sugerido',
      ariaLabel: 'Seleccionar método de entrenamiento',
    },
    stage: {
      title: 'Etapas del método',
      objective: 'Objetivo de la etapa',
      ariaLabel: 'Seleccionar etapa del método',
    },
    lesson: {
      title: 'Lecciones prácticas',
      recognition: 'Cómo reconocer el caso',
      algorithm: 'Algoritmo recomendado',
      checklist: 'Checklist de práctica',
      tip: 'Consejo rápido',
      cubeHint:
        'El cubo 3D arma el caso y deja listos los controles paso a paso para revisar cada movimiento a tu ritmo.',
      replay: 'Repetir caso',
      next: 'Siguiente lección',
      finished: 'CFOP completado por ahora',
    },
    methods: {
      cfop: {
        label: 'CFOP',
        description:
          'Flujo clásico de cuatro bloques para pasar del nivel inicial con mayor consistencia y decisiones más rápidas.',
        focus: 'Reducir pausas entre etapas manteniendo reconocimiento activo.',
        estimatedTime: '12 a 20 minutos por sesión guiada',
        stages: {
          cross: {
            label: 'Cross',
            description: 'Construye la cruz blanca y alinea aristas laterales con sus centros.',
            objective: 'Cerrar la cross en pocos movimientos y detectar pronto tu primer par F2L.',
            lessons: [
              {
                title: 'De Daisy a Cross',
                summary:
                  'Convierte la daisy en una cross completa sin perder orientación de la capa superior.',
                recognition:
                  'Cuatro stickers blancos están en U alrededor del centro amarillo, formando una margarita.',
                checklist: [
                  'Elige una arista blanca por vez.',
                  'Alinea el color lateral de la arista con su centro.',
                  'Gira 180° para bajar la arista a la cara blanca.',
                ],
                tip: 'Intenta ubicar tu primer par F2L mientras cierras la última arista de la cross.',
              },
              {
                title: 'Alineación final de Cross',
                summary:
                  'Corrige la alineación para que todos los colores laterales estén listos antes de F2L.',
                recognition:
                  'La cross blanca está hecha, pero una o dos aristas no coinciden con sus centros.',
                checklist: [
                  'Identifica qué arista debe intercambiarse.',
                  'Usa U con un gatillo corto sin romper la cross.',
                  'Confirma que todos los laterales quedaron alineados.',
                ],
                tip: 'Evita rotaciones completas del cubo; usa solo giros U para reorganizar.',
              },
            ],
          },
          f2l: {
            label: 'F2L',
            description: 'Resuelve pares esquina+arista de primera y segunda capa en conjunto.',
            objective: 'Reconocer patrones de pares más rápido e insertar con menos pausas.',
            lessons: [
              {
                title: 'Par básico frontal',
                summary: 'Forma un par simple e insértalo en el slot frontal derecho con control.',
                recognition:
                  'Esquina y arista de los mismos colores están separadas en la capa superior.',
                checklist: [
                  'Haz setup con U para acercar esquina y arista.',
                  'Aplica el gatillo para formar el par.',
                  'Inserta sin romper la cross resuelta.',
                ],
                tip: 'Inclina un poco el cubo para mantener visible el slot objetivo.',
              },
              {
                title: 'Inserción en slot trasero',
                summary: 'Practica inserciones en el slot trasero sin rotar todo el cubo.',
                recognition:
                  'El par está armado, pero el slot objetivo queda al lado opuesto de tu vista principal.',
                checklist: [
                  'Coloca el par sobre el slot trasero correcto.',
                  'Usa el algoritmo espejado sin rotación global.',
                  'Verifica que las dos primeras capas sigan intactas.',
                ],
                tip: 'Dominar slots traseros elimina muchas rotaciones innecesarias.',
              },
            ],
          },
          oll: {
            label: 'OLL',
            description: 'Orienta la última capa hasta dejar toda la cara superior amarilla.',
            objective: 'Leer patrones rápido y ejecutar el algoritmo correcto sin dudar.',
            lessons: [
              {
                title: 'Sune',
                summary: 'Caso clásico de orientación cuando solo una esquina ya está orientada.',
                recognition:
                  'Se observa un faro y solo una esquina parece correctamente orientada.',
                checklist: [
                  'Coloca el faro en el lado izquierdo/frontal.',
                  "Ejecuta R U R' U R U2 R'.",
                  'Confirma la cara amarilla completa.',
                ],
                tip: 'Cuenta el ritmo en bloques cortos: gatillo, ajuste, gatillo doble.',
              },
              {
                title: 'Anti-Sune',
                summary: 'Versión espejada del Sune para patrones invertidos de orientación.',
                recognition:
                  'Se parece al Sune, pero el faro aparece en el lado contrario.',
                checklist: [
                  'Mantén el caso espejado al frente.',
                  "Ejecuta R' U' R U' R' U2 R.",
                  'Revisa la orientación antes de pasar a PLL.',
                ],
                tip: 'Entrena Sune y Anti-Sune seguidos para acelerar reconocimiento.',
              },
            ],
          },
          pll: {
            label: 'PLL',
            description: 'Permuta piezas de la última capa manteniendo la orientación resuelta.',
            objective: 'Cerrar solves con lectura de bloques laterales y perms continuas.',
            lessons: [
              {
                title: 'T-Perm',
                summary:
                  'Intercambia dos esquinas y dos aristas adyacentes, muy común en finales.',
                recognition:
                  'Un bloque lateral 2x1 ya está resuelto y el resto forma un intercambio tipo T.',
                checklist: [
                  'Coloca el bloque resuelto en la izquierda.',
                  "Ejecuta R U R' U' R' F R2 U' R' U' R U R' F'.",
                  'Haz AUF final si hace falta.',
                ],
                tip: 'Mantén fluidez en el tramo con F/F’ para evitar bloqueos de mano.',
              },
              {
                title: 'Y-Perm',
                summary:
                  'Intercambio diagonal de esquinas con ciclo de aristas para cierres complejos.',
                recognition:
                  'No hay bloques laterales completos y las esquinas parecen cruzarse en diagonal.',
                checklist: [
                  'Confirma patrón de esquinas en diagonal.',
                  "Ejecuta F R U' R' U' R U R' F' R U R' U' R' F R F'.",
                  'Finaliza con AUF para cerrar el solve.',
                ],
                tip: 'Sigue las aristas durante la ejecución para anticipar el AUF final.',
              },
            ],
          },
        },
      },
    },
  },
  pwa: {
    update: {
      title: '¡Nueva actualización disponible!',
      description:
        'Una nueva versión de Klick está disponible. Actualiza para obtener las últimas mejoras.',
      updateNow: 'Actualizar ahora',
      later: 'Después',
    },
    offline: {
      title: '¡App lista para uso sin conexión!',
      description: '¡Klick ahora puede funcionar sin conexión!',
      understood: 'Entendido',
    },
    close: 'Cerrar',
  },
} as const;
