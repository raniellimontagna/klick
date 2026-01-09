export const enUS = {
  app: {
    title: 'Klick',
    tagline: 'spin, click, evolve.',
  },
  navigation: {
    home: 'Home',
    history: 'History',
    stats: 'Statistics',
    training: 'Training',
    tutorial: 'Tutorial',
    settings: 'Settings',
  },
  pages: {
    home: {
      description: 'Practice solves with guided inspection and instant statistics.',
    },
    history: {
      description: 'Review every solve and track your progress over time.',
    },
    stats: {
      description: 'Dive into detailed performance analytics and trends.',
    },
    training: {
      description: 'Drill specific cases with goals, checkpoints, and quick notes.',
    },
    tutorial: {
      description: 'Learn the CFOP method step by step.',
    },
    settings: {
      description: 'Make Klick behave exactly the way you like.',
    },
  },
  language: {
    title: 'Language',
    'pt-BR': 'Português (BR)',
    'en-US': 'English (US)',
    'es-ES': 'Español (ES)',
  },
  scramble: {
    title: 'Scramble',
    copy: 'Copy',
    new: 'New',
    generating: 'Generating scramble...',
    copySuccess: 'Copied!',
    guide: 'How to read scrambles',
    guideModal: {
      title: 'Scramble Guide',
      description:
        "Learn how to interpret Rubik's Cube 3×3 notation and execute scrambles correctly.",
      faces: {
        title: 'Cube Faces',
        description: 'Each letter represents a face of the cube:',
        R: 'R - Right',
        L: 'L - Left',
        U: 'U - Up',
        D: 'D - Down',
        F: 'F - Front',
        B: 'B - Back',
      },
      modifiers: {
        title: 'Modifiers',
        description: 'Symbols that modify the movement:',
        none: 'No symbol - 90° clockwise',
        prime: "' (prime) - 90° counterclockwise",
        double: '2 - 180° (double turn)',
      },
      examples: {
        title: 'Practical Examples',
        R: 'R = Turn right face 90° clockwise',
        RPrime: "R' = Turn right face 90° counterclockwise",
        R2: 'R2 = Turn right face 180°',
        sequence: "Sequence: R U R' U' = Right, Up, Right counterclockwise, Up counterclockwise",
      },
      tips: {
        title: 'Important Tips',
        tip1: '• Execute moves in the exact order shown',
        tip2: '• Always look at the same face (front) during the entire scramble',
        tip3: '• Practice basic moves before full scrambles',
        tip4: '• An official WCA scramble has 25 moves',
      },
    },
  },
  timer: {
    inspection: 'Inspection',
    ready: 'Ready',
    running: 'Running',
    stopped: 'Stopped',
    pressSpace: 'Press SPACE',
    holdSpace: 'Hold SPACE to start inspection',
  },
  shortcuts: {
    title: 'Shortcuts',
    space: 'Start/Stop',
    newScramble: 'New scramble',
    togglePlus2: 'Toggle +2',
    toggleDNF: 'Toggle DNF',
    undo: 'Undo',
  },
  penalties: {
    none: 'No penalty',
    plus2: '+2 seconds',
    dnf: 'DNF (Did Not Finish)',
    warning: 'Warning',
    critical: 'Critical',
  },
  stats: {
    single: 'Best Time',
    ao5: 'Average of 5',
    ao12: 'Average of 12',
    bestAo5: 'Best ao5',
    bestAo12: 'Best ao12',
    current: 'Current',
    best: 'Best',
    average: 'Average',
    clear: 'Clear Statistics',
    clearConfirmTitle: 'Clear all solves?',
    clearConfirmMessage:
      'This action will permanently delete all solves from the current session. This cannot be undone.',
    clearSuccess: 'Statistics cleared successfully!',
    help: 'Help',
    learnMore: 'Learn more',
    advanced: 'Advanced Statistics',
    info: {
      title: 'Understanding Statistics',
      single: {
        title: 'Single (Best Time)',
        description: 'Your fastest time in a single solve. Shows the best you have ever achieved.',
        example: 'If you did solves of 15s, 12s and 18s, your single is 12s.',
      },
      ao5: {
        title: 'ao5 (Average of 5)',
        description:
          'Average of your last 5 solves, discarding the best and worst times. This gives a more accurate view of your consistent performance.',
        example:
          'Times: 15s, 12s, 18s, 14s, 16s\nDiscard: 12s (best) and 18s (worst)\nAverage: (15 + 14 + 16) ÷ 3 = 15s',
        rule: 'If there are 2 or more DNFs in the last 5 solves, the average is DNF.',
      },
      ao12: {
        title: 'ao12 (Average of 12)',
        description:
          'Works the same as ao5, but with the last 12 solves. Even more accurate for measuring consistency.',
        example:
          'Takes the last 12 times, removes the best and worst, and calculates the average of the remaining 10.',
        rule: 'If there are 2 or more DNFs in the last 12 solves, the average is DNF.',
      },
      bestAo5: {
        title: 'Best ao5',
        description:
          'The best average of 5 consecutive solves you have ever done. This is your personal ao5 record.',
        example:
          'Among all sequences of 5 consecutive solves, this is the one that had the best average.',
      },
      bestAo12: {
        title: 'Best ao12',
        description:
          'The best average of 12 consecutive solves you have ever done. This is your personal ao12 record.',
        example:
          'Among all sequences of 12 consecutive solves, this is the one that had the best average.',
      },
      penalties: {
        title: 'Penalties',
        plus2: '+2: Adds 2 seconds to the time (incorrect cube adjustment at the end)',
        dnf: "DNF (Did Not Finish): Invalid solve (didn't solve, violated inspection rules, etc.)",
      },
    },
  },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    export: 'Export',
    import: 'Import',
    edit: 'Edit',
    create: 'Create',
    confirm: 'Confirm',
    close: 'Close',
    viewDetails: 'View Details',
    back: 'Back',
  },
  sessions: {
    title: 'Sessions',
    current: 'Current Session',
    create: 'New Session',
    rename: 'Rename Session',
    delete: 'Delete Session',
    switch: 'Switch Session',
    manage: 'Manage Sessions',
    name: 'Session Name',
    namePlaceholder: 'Enter session name',
    createSuccess: 'Session created successfully!',
    renameSuccess: 'Session renamed successfully!',
    deleteSuccess: 'Session deleted successfully!',
    deleteConfirm: {
      title: 'Delete session?',
      message:
        'All solves from this session will be permanently lost. This action cannot be undone.',
    },
    cannotDeleteLast: 'Cannot delete the last session',
    solveCount: 'solves',
    solveCountSingular: 'solve',
  },
  solveTable: {
    title: 'Solve History',
    empty: 'No solves recorded yet',
    columns: {
      number: '#',
      time: 'Time',
      scramble: 'Scramble',
      date: 'Date',
      penalty: 'Penalty',
      actions: 'Actions',
    },
    filter: {
      label: 'Show',
      all: 'All',
      last5: 'Last 5',
      last12: 'Last 12',
      last50: 'Last 50',
      last100: 'Last 100',
    },
    deleteConfirm: {
      title: 'Delete solve?',
      message: 'This action cannot be undone.',
    },
    details: {
      title: 'Solve Details',
      solveNumber: 'Solve',
      time: 'Time',
      penalty: 'Penalty',
      scramble: 'Scramble',
      date: 'Date',
    },
  },
  inspection: {
    warningTime: 'Warning time!',
    penaltyPlus2: '+2 will be applied',
    penaltyDNF: 'DNF will be applied',
  },
  settings: {
    title: 'Settings',
    inspectionDuration: {
      label: 'Inspection Duration',
      description: 'Time available to inspect the cube before starting',
      seconds: 'seconds',
    },
    soundsEnabled: {
      label: 'Sounds Enabled',
      description: 'Enable feedback sounds during the timer',
    },
    autoInspectionPenalty: {
      label: 'Auto Inspection Penalty',
      description: '+2 between 15-17s, DNF after 17s (following official WCA rules)',
    },
    theme: {
      label: 'Theme',
      description: 'Visual appearance of the app',
      dark: 'Dark',
      light: 'Light',
    },
    exportImport: {
      title: 'Export/Import Data',
      exportCurrent: 'Export Current Session',
      exportAll: 'Export All Sessions',
      import: 'Import Sessions',
      importMode: 'Import Mode',
      merge: 'Merge with existing sessions',
      replace: 'Replace all sessions',
      exportSuccess: 'Data exported successfully!',
      importSuccess: 'Data imported successfully!',
      importError: 'Error importing data. Please check the file format.',
    },
  },
  advancedStats: {
    title: 'Advanced Statistics',
    tabs: {
      evolution: 'Evolution',
      consistency: 'Consistency',
      performance: 'Performance',
    },
    evolution: {
      title: 'Time Evolution',
      description: 'Track your times progression across sessions',
      chartTitle: 'Time History',
      single: 'Single',
      ao5: 'ao5',
      ao12: 'ao12',
      solveNumber: 'Solve #',
      time: 'Time (ms)',
      noData: 'Not enough data for charts',
      tip: 'Complete at least 12 solves to visualize full evolution',
    },
    consistency: {
      title: 'Consistency Analysis',
      description:
        'See how much your times fluctuate and how that affects your reliability in real solves.',
      standardDeviation: {
        title: 'Standard Deviation',
        description:
          'Shows how far, on average, each solve deviates from your mean time. Higher numbers reveal "spike" solves; target reductions after focused execution practice.',
        value: 'ms',
      },
      coefficientOfVariation: {
        title: 'Coefficient of Variation',
        description:
          'Percentage of standard deviation over the mean. Under 10% is competition-ready consistency; above 20% signals instability worth addressing.',
        value: '%',
        excellent: 'Excellent (< 10%)',
        good: 'Good (10-15%)',
        average: 'Average (15-20%)',
        needsWork: 'Needs work (> 20%)',
      },
      interpretation: {
        title: 'Interpretation',
        description:
          'Consistency matters as much as raw speed. Track whether your variation shrinks over sessions to confirm inspection and control drills are working.',
      },
    },
    performance: {
      title: 'Performance Analysis',
      description:
        'Monitor execution pace and how your solves cluster so you can fine-tune training blocks.',
      averageTPS: {
        title: 'Average TPS',
        description:
          'Turns Per Second - average number of moves you perform each second. Great for spotting gains after algorithm drills or finger-trick work.',
        value: 'turns/s',
        note: 'Assumes 25 turns per solve (standard 3x3 scramble length).',
      },
      distribution: {
        title: 'Time Distribution',
        description:
          'Highlights where most solves land. Long tails expose outliers or focus drops you may want to investigate.',
        chartTitle: 'Time Histogram',
        xAxis: 'Time Range',
        yAxis: 'Number of Solves',
      },
    },
    close: 'Close',
  },
  onboarding: {
    skip: 'Skip tour',
    previous: 'Previous',
    next: 'Next',
    finish: 'Finish',
    progress: 'Step {current} of {total}',
    startTour: 'Start tour',
    welcome: {
      title: 'Welcome to Klick! 🎉',
      description:
        "Let's take a quick tour to show you the main features of the app. It only takes 1 minute!",
    },
    scramble: {
      title: 'Cube Scramble',
      description:
        'Here you see the scramble for the magic cube. Click "New" to generate another one or "?" to learn how to read the notation.',
    },
    timer: {
      title: 'Timer',
      description:
        'Hold the SPACE bar to arm the timer. Release to start inspection (15s). Press SPACE again to start/stop the timer.',
    },
    stats: {
      title: 'Statistics',
      description:
        'Track your performance with metrics like Single (best time), ao5 and ao12 (averages). Click "📈" to see advanced statistics!',
    },
    shortcuts: {
      title: 'Keyboard Shortcuts',
      description:
        'Use shortcuts to be faster: SPACE (timer), N (new scramble), P (+2), D (DNF). Work without taking your hands off the cube!',
    },
    sessions: {
      title: 'Sessions',
      description:
        'Organize your solves into different sessions. Useful for separating training, competitions, or different methods.',
    },
    complete: {
      title: 'All set! 🎊',
      description:
        'Now you know Klick! Start solving and track your progress. You can revisit this tour anytime by clicking the "?" button in the header.',
    },
  },
  training: {
    title: 'Training Mode',
    description: 'Focus on specific cases and track your reps with goals and checkpoints.',
    categories: {
      pll: {
        label: 'PLL',
        description: 'Permute last-layer corners and edges.',
      },
      oll: {
        label: 'OLL',
        description: 'Orient every piece on the last layer.',
      },
      f2l: {
        label: 'F2L',
        description: 'Pair up and insert pieces for the first two layers.',
      },
    },
    statuses: {
      learning: 'Learning',
      refining: 'Polishing',
      mastered: 'Automatic',
    },
    actions: {
      repetitionLabel: 'Repetitions',
      add1: '+1',
      add5: '+5',
      add10: '+10',
      reset: 'Reset',
      goalLabel: 'Goal',
      goalPlaceholder: 'e.g. 50',
      statusLabel: 'Checkpoint',
      algorithmLabel: 'Algorithm',
      noteLabel: 'Quick notes',
      notePlaceholder: 'Capture triggers, finger tricks, or reminders.',
      copyAlgorithm: 'Copy algorithm',
      copiedAlgorithm: 'Algorithm copied!',
    },
    progress: {
      target: '{current} of {goal} reps',
      noGoal: '{current} reps logged',
      goalReached: 'Goal reached! Keep reinforcing.',
    },
    cases: {
      pll: {
        tPerm: {
          title: 'T-Perm',
          description: 'Swaps two adjacent edges while keeping everything else solved.',
          tip: 'Use wide R moves and keep your grip relaxed to avoid pauses.',
        },
        jPerm: {
          title: 'J-Perm (right)',
          description: 'Swaps two adjacent corners and two opposite edges.',
          tip: 'The opening F\' sets the block; plan the final U move ahead of time.',
        },
        zPerm: {
          title: 'Z-Perm',
          description: 'Swaps two pairs of opposite edges without moving the corners.',
          tip: 'Prioritise smooth M slices and maintain a steady rhythm.',
        },
      },
      oll: {
        sune: {
          title: 'Sune',
          description: 'Classic case with one oriented corner; orients the remaining yellows.',
          tip: 'Drill the R U R\' trigger and keep the elbow anchored for speed.',
        },
        antisune: {
          title: 'Anti-Sune',
          description: 'Mirror version of Sune starting with anti-clockwise moves.',
          tip: 'Stabilise with the left thumb and visualise the pattern before executing.',
        },
        hPattern: {
          title: 'H-Pattern',
          description: 'All corners oriented with edges flipped in opposite pairs.',
          tip: 'Run the F...f\' block as two smooth halves without stopping.',
        },
      },
      f2l: {
        basicPair: {
          title: 'Basic Front Pair',
          description: 'Corner and edge form a pair inserted in the front-right slot.',
          tip: 'Use a setup U to align the pair before insertion to avoid extra rotations.',
        },
        backSlot: {
          title: 'Back Slot Insertion',
          description: 'Corner and edge ready for the back-right slot.',
          tip: 'Watch the slot while performing R U\' R\'; keep the wrist relaxed.',
        },
        edgeOver: {
          title: 'Edge Over Slot',
          description: 'Edge hovering above the slot forming a pair with a frontal turn.',
          tip: 'Use U\' F\' to pair and restore the front face with control.',
        },
      },
    },
  },
  tutorial: {
    title: "Beginner's Tutorial",
    subtitle: "Learn to solve the 3×3 Rubik's Cube step by step",
    open: 'How to solve?',
    steps: {
      title: 'Step {step} of {total}',
      navigation: {
        previous: 'Previous',
        next: 'Next',
        finish: 'Finish',
      },
    },
    intro: {
      title: "Welcome to the Beginner's Method! 🎓",
      description:
        "Let's learn the Layer by Layer method to solve the 3×3 Rubik's Cube. It's the simplest and most intuitive method to start!",
      whatYouWillLearn: 'What you will learn:',
      topics: [
        'White cross (first layer)',
        'White corners (complete first layer)',
        'Second layer (middle layer)',
        'Yellow cross (last layer cross)',
        'Orient corners (OLL)',
        'Permute corners and edges (PLL)',
      ],
      timeEstimate: 'Estimated time: 10-15 minutes',
      difficulty: 'Difficulty: Beginner',
    },
    whiteCross: {
      title: '1. White Cross',
      description: 'Solve the 4 white edges forming a cross on the white face',
      goal: 'Goal: White cross aligned with side centers',
      tips: [
        'Choose a face to be the base (we recommend white)',
        'Find the 4 edges with white (2-color pieces)',
        'Position each edge aligning the side color with the corresponding center',
        'The cross must be correct on both white face and sides',
      ],
      intuitive: 'This step is intuitive! Practice moving edges without algorithms.',
    },
    whiteCorners: {
      title: '2. White Corners',
      description: 'Complete the first layer by inserting the 4 white corners',
      goal: 'Goal: First layer fully solved',
      algorithm: "Algorithm R U R': Repeat until the corner fits",
      steps: [
        'Position the white corner on the bottom layer',
        'Align the corner below where it should go',
        "Execute R U R' from 1 to 5 times until it fits",
        'Repeat for all 4 corners',
      ],
      tip: "The R U R' algorithm takes the corner out, rotates and puts it back. It's like an 'elevator' for the corner!",
    },
    secondLayer: {
      title: '3. Second Layer',
      description: 'Solve the 4 edges of the middle layer',
      goal: 'Goal: Two complete layers (white and middle)',
      algorithms: {
        title: 'Second Layer Algorithms:',
        left: "To the left: U' L' U L U F U' F'",
        right: "To the right: U R U' R' U' F' U F",
      },
      steps: [
        'Find an edge without yellow on the top layer',
        'Position the edge above where it should go',
        'Use the correct algorithm (left or right)',
        'Repeat for all 4 edges',
      ],
      tip: 'If an edge is in the wrong position on the 2nd layer, use the algorithm to bring it up first.',
    },
    yellowCross: {
      title: '4. Yellow Cross',
      description: "Form a cross on the yellow face (doesn't need to be aligned)",
      goal: 'Goal: Yellow cross on the top face',
      algorithm: "F R U R' U' F'",
      patterns: {
        title: 'Possible patterns:',
        dot: 'Dot (no edges) → Execute the algorithm 3×',
        line: 'Line → Align horizontal and execute 2×',
        L: 'L shape → Position the L in the top left corner and execute 1×',
        cross: 'Cross → Already done!',
      },
      tip: "Don't worry about the side centers yet, focus only on the yellow cross!",
    },
    yellowEdges: {
      title: '5. Align Yellow Edges',
      description: 'Align the yellow edges with the side centers',
      goal: 'Goal: Yellow cross aligned with all side colors',
      algorithm: "R U R' U R U2 R'",
      steps: [
        'Look for a side where the edge color already matches the center',
        'Position that side at the back (away from you)',
        'Execute the algorithm',
        'Repeat if necessary',
      ],
      tip: 'If no side is correct, execute the algorithm in any position and then look again.',
    },
    yellowCorners: {
      title: '6. Position Yellow Corners',
      description: 'Place the yellow corners in the correct positions (not oriented yet)',
      goal: 'Goal: Corners in the right positions, regardless of orientation',
      algorithm: "U R U' L' U R' U' L",
      steps: [
        'Find a corner already in the correct position (colors match)',
        'Position that corner in the top right corner',
        'Execute the algorithm',
        'Repeat until all corners are in the correct positions',
      ],
      tip: 'The corners may be twisted, but their colors must match the surrounding faces.',
    },
    solveCorners: {
      title: '7. Orient Corners (Finish)',
      description: 'Orient the last corners to solve the cube',
      goal: 'Goal: Cube completely solved! 🎉',
      algorithm: "R' D' R D",
      steps: [
        'Hold the cube with the yellow face up',
        'Position an unsolved corner in the top right corner',
        "Execute R' D' R D from 2 to 4 times until the corner is yellow on top",
        'Turn ONLY the top face (U) to bring the next unsolved corner',
        'Repeat until all corners are oriented',
      ],
      important: 'IMPORTANT: Do not turn the cube! Only turn the U face between corners.',
      congratulations: "Congratulations! You've solved the Rubik's Cube! 🎊",
    },
    tips: {
      title: 'Important Tips',
      practice: 'Practice each step separately before attempting the full cube',
      algorithms: 'Memorize algorithms gradually, starting with the most used ones',
      patience: 'Be patient! At first it may take 5-10 minutes per step',
      muscle: 'With practice, your fingers will develop muscle memory',
      speed: 'Speed comes naturally with practice, focus on accuracy first',
    },
    notation: {
      title: 'Basic Notation',
      R: 'R = Right 90° clockwise',
      RPrime: "R' = Right 90° counterclockwise",
      U: 'U = Up 90° clockwise',
      UPrime: "U' = Up 90° counterclockwise",
      F: 'F = Front 90° clockwise',
      FPrime: "F' = Front 90° counterclockwise",
      L: 'L = Left 90° clockwise',
      LPrime: "L' = Left 90° counterclockwise",
      D: 'D = Down 90° clockwise',
      DPrime: "D' = Down 90° counterclockwise",
      number2: '2 = 180° (e.g., R2, U2)',
    },
  },
  pwa: {
    update: {
      title: 'New update available!',
      description: 'A new version of Klick is available. Update to get the latest improvements.',
      updateNow: 'Update now',
      later: 'Later',
    },
    offline: {
      title: 'App ready for offline use!',
      description: 'Klick can now work offline!',
      understood: 'Got it',
    },
    close: 'Close',
  },
} as const;
