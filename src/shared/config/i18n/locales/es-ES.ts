export const esES = {
  app: {
    title: 'Klick',
    tagline: 'gira, haz clic, evoluciona.',
  },
  navigation: {
    home: 'Inicio',
    history: 'Historial',
    stats: 'Estadísticas',
    training: 'Entrenamiento',
    tutorial: 'Tutorial',
    settings: 'Configuración',
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
    training: {
      description: 'Practica casos específicos con metas, checkpoints y notas rápidas.',
    },
    tutorial: {
      description: 'Aprende el método CFOP paso a paso.',
    },
    settings: {
      description: 'Personaliza Klick a tu manera.',
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
    average: 'Promedio',
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
  training: {
    title: 'Modo de Entrenamiento',
    description: 'Enfócate en casos puntuales y registra tus repeticiones con metas y checkpoints.',
    categories: {
      pll: {
        label: 'PLL',
        description: 'Permutar esquinas y aristas de la última capa.',
      },
      oll: {
        label: 'OLL',
        description: 'Orientar todas las piezas de la última capa.',
      },
      f2l: {
        label: 'F2L',
        description: 'Formar e insertar pares para las dos primeras capas.',
      },
    },
    statuses: {
      learning: 'Aprendiendo',
      refining: 'Puliendo',
      mastered: 'Automático',
    },
    actions: {
      repetitionLabel: 'Repeticiones',
      add1: '+1',
      add5: '+5',
      add10: '+10',
      reset: 'Reiniciar',
      goalLabel: 'Meta',
      goalPlaceholder: 'ej: 50',
      statusLabel: 'Checkpoint',
      algorithmLabel: 'Algoritmo',
      noteLabel: 'Notas rápidas',
      notePlaceholder: 'Anota gatillos, finger tricks o recordatorios personales.',
      copyAlgorithm: 'Copiar algoritmo',
      copiedAlgorithm: '¡Algoritmo copiado!',
    },
    progress: {
      target: '{current} de {goal} repeticiones',
      noGoal: '{current} repeticiones registradas',
      goalReached: '¡Meta alcanzada! Sigue reforzando.',
    },
    cases: {
      pll: {
        tPerm: {
          title: 'T-Perm',
          description: 'Intercambia dos aristas adyacentes manteniendo el resto resuelto.',
          tip: 'Usa movimientos R amplios y mantén el agarre relajado para evitar pausas.',
        },
        jPerm: {
          title: 'J-Perm (derecha)',
          description: 'Intercambia dos esquinas adyacentes y dos aristas opuestas.',
          tip: 'El inicio con F\' prepara el bloque; planifica el último U con anticipación.',
        },
        zPerm: {
          title: 'Z-Perm',
          description: 'Intercambia dos pares de aristas opuestas sin mover las esquinas.',
          tip: 'Prioriza cortes M suaves y un ritmo constante.',
        },
      },
      oll: {
        sune: {
          title: 'Sune',
          description:
            'Caso clásico con una esquina orientada; orienta las piezas amarillas restantes.',
          tip: 'Practica el gatillo R U R\' y mantén el codo fijo para ganar velocidad.',
        },
        antisune: {
          title: 'Anti-Sune',
          description: 'Versión espejada del Sune iniciando con movimientos antihorarios.',
          tip: 'Estabiliza con el pulgar izquierdo y visualiza el patrón antes de ejecutar.',
        },
        hPattern: {
          title: 'Patrón H',
          description: 'Todas las esquinas orientadas con aristas invertidas en pares opuestos.',
          tip: 'Ejecuta el bloque F...f\' como dos mitades fluidas sin detenerte.',
        },
      },
      f2l: {
        basicPair: {
          title: 'Par Frontal Básico',
          description: 'Esquina y arista forman par e ingresan en el hueco frontal derecho.',
          tip: 'Usa un movimiento U antes de insertar para alinear el par y evitar giros extra.',
        },
        backSlot: {
          title: 'Inserción Hueco Trasero',
          description: 'Esquina y arista listas para el hueco trasero derecho.',
          tip: 'Observa el hueco mientras ejecutas R U\' R\'; mantén la muñeca relajada.',
        },
        edgeOver: {
          title: 'Arista sobre el Hueco',
          description: 'Arista colocada encima del hueco formando par con un giro frontal.',
          tip: 'Usa U\' F\' para formar el par y devuelve la cara frontal con control.',
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
      navigation: {
        previous: 'Anterior',
        next: 'Siguiente',
        finish: 'Finalizar',
      },
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
