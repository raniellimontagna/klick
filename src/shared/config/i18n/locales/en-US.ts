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
    cube3d: '3D Cube',
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
  homeRevamp: {
    badge: 'Timer Lab',
    title: 'Clear timing, full focus, instant feedback.',
    subtitle:
      'The new home keeps timer, scramble, and metrics in one flow. Switch between 3D and 2D views without breaking your session rhythm.',
    highlights: {
      inspectionTitle: 'Guided Inspection',
      inspectionDescription: 'Countdown with clear visual cues to start on time.',
      visualTitle: 'Visual Scramble',
      visualDescription: 'Switch between 3D cube and 2D net to inspect the start state.',
      statsTitle: 'Essential Metrics',
      statsDescription: 'Single, ao5, ao12, and best averages always visible.',
    },
    timer: {
      sectionLabel: 'Main timer panel',
      inspectionLabel: 'Inspection active',
      runningLabel: 'Solve in progress',
      personalBest: 'New PB',
      plusTwoApplied: '+2 applied',
      dnfApplied: 'DNF applied',
      modeLabel: 'Main shortcut',
      spaceHint: 'Hold and release SPACE',
      inspectionCountdown: 'Inspection countdown',
      finishLabel: 'Finish solve',
      finishHint: 'Press SPACE again to stop.',
      feedbackLabel: 'Feedback',
      feedbackHint: 'Adjust +2/DNF and monitor consistency.',
    },
    scramble: {
      sectionLabel: 'Scramble panel',
      title: 'Current Scramble',
      subtitle: 'Copy, regenerate, and review state before solving.',
      viewModeLabel: 'Scramble view mode',
      view3d: '3D View',
      view2d: '2D View',
      focusModeMessage: 'Visualization is paused while solving to preserve timer performance.',
      visualUnavailable: '2D visualization unavailable for this scramble.',
    },
    controls: {
      sectionLabel: 'Quick session actions',
      plusTwo: 'Mark +2',
      dnf: 'Mark DNF',
      undo: 'Undo last',
      helper: 'Keyboard shortcuts are active whenever no modal is open.',
    },
    statsTitle: 'Statistics panel',
    solveFeed: {
      title: 'Quick History',
      subtitle: 'Review your latest solves without leaving home.',
      last: 'Last {count}',
      empty: 'No solves recorded in this session yet.',
      shortcutsLabel: 'Shortcuts:',
    },
  },
  progressHub: {
    title: 'Progress and Challenges',
    subtitle: 'Track streak, XP, and weekly goals without leaving the timer flow.',
    streakLabel: 'Current streak',
    streakValue: '{count} days',
    bestStreakLabel: 'Best streak: {count} days',
    levelLabel: 'Level',
    xpLabel: 'XP',
    weeklyGoalLabel: 'Weekly goal',
    weeklyGoalStatusDone: 'Weekly goal completed.',
    weeklyGoalStatusPending: '{remaining} solves left to complete the goal.',
    challengesTitle: 'Today challenges',
    empty: 'No daily challenges available right now.',
    challengeDone: 'Done',
    challengeInProgress: 'In progress',
    progressText: '{current}/{target}',
    challengeTypes: {
      solveCount: {
        title: 'Complete {target} solves today',
        description: 'Daily volume to keep your practice consistency.',
      },
      cleanStreak: {
        title: 'Build a clean streak of {target}',
        description: 'Get consecutive solves without DNF.',
      },
      ao5Target: {
        title: 'Hit ao5 at {targetTime}',
        description: 'Beat your ao5 target at least once today.',
      },
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
      toggleVisualizer: 'Toggle 3D View',
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
    worst: 'Worst',
    average: 'Average',
    deviation: 'Standard Deviation',
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
    active: 'Active',
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
      finalTime: 'Final Time',
      baseTime: 'Base Time',
      visualizationUnavailable: 'Visualization unavailable',
    },
  },
  history: {
    description: 'Review every solve and track your progress over time.',
    sessionProgress: 'Session Progress',
    charts: {
      noData: {
        title: 'No data available',
        description: 'Complete solves to visualize progress',
      },
      insufficientData: {
        title: 'Insufficient Data',
        description: 'Complete more solves to generate the chart',
      },
      tooltip: {
        solve: 'Solve #',
        penaltyApplied: 'Penalty applied',
      },
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
    cloudSync: {
      title: 'Account and Sync',
      description: 'Connect your account to keep sessions and solves synced across devices.',
      statusLabel: 'Cloud status',
      statusLocalOnly: 'Local only',
      statusAnonymous: 'Not connected',
      statusChecking: 'Checking session',
      statusConnected: 'Connected',
      statusSyncing: 'Syncing',
      statusMigrating: 'Migrating local data',
      statusError: 'Sync error',
      lastSyncLabel: 'Last sync',
      lastSyncNever: 'Not synced yet',
      connectedAs: 'Connected as',
      googleSignIn: 'Sign in with Google',
      magicLinkLabel: 'Or use email magic link',
      magicLinkPlaceholder: 'you@example.com',
      magicLinkSend: 'Send link',
      magicLinkRequired: 'Enter a valid email to send the link.',
      magicLinkSent: 'Check your inbox to finish sign in.',
      syncNow: 'Sync now',
      syncingAction: 'Syncing...',
      syncSuccess: 'Sync completed successfully.',
      syncError: 'Unable to sync right now.',
      signOut: 'Sign out',
      signOutSuccess: 'Signed out successfully.',
      notConfiguredTitle: 'Supabase not configured',
      notConfiguredDescription:
        'Set environment variables to enable cloud login and synchronization.',
      errorPrefix: 'Details:',
      errorFallback: 'Could not complete this action. Please try again.',
    },
  },
  auth: {
    callback: {
      title: 'Connecting your account...',
      description: 'We are validating your login and preparing the first sync.',
      processing: 'Processing authentication',
      errorPrefix: 'Callback failed:',
      errorUnknown: 'Could not complete sign in.',
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
  trainingLab: {
    title: 'Training Lab',
    subtitle: 'Drill compact CFOP blocks with 3D guidance and per-case progress tracking.',
    method: {
      label: 'Active method',
      value: 'CFOP - Progressive base',
      description: 'Start with a lean case pack and scale difficulty by track.',
    },
    labels: {
      trackTabs: 'Select training track',
      trackFocus: 'Track focus',
      trackProgress: 'Track volume',
      catalogTitle: 'Drill catalog',
      drill: 'Drill',
      attempts: 'Attempts',
      target: 'Target',
      focus: 'Technical focus',
      difficulty: 'Difficulty',
      setup: 'Visual setup',
      algorithm: 'Execution algorithm',
      recognition: 'Recognition',
      coaching: 'Quick coaching',
      confidence: 'Current confidence',
      cubeHint: 'The cube applies setup + algorithm so you can see the full case cycle.',
    },
    actions: {
      replay: 'Replay animation',
      add1: '+1 attempt',
      add5: '+5 attempts',
      add10: '+10 attempts',
      reset: 'Reset drill',
    },
    progress: {
      trackSummary: '{attempts} of {target} attempts completed in this track.',
    },
    confidence: {
      starting: 'Warming up',
      building: 'Building rhythm',
      ready: 'Speed-ready',
    },
    focusTags: {
      recognition: 'Recognition',
      lookahead: 'Lookahead',
      execution: 'Execution',
    },
    difficulty: {
      starter: 'Starter',
      core: 'CFOP core',
      stretch: 'Controlled stretch',
    },
    tracks: {
      f2l: {
        label: 'F2L',
        description: 'Build pair flow before pushing speed.',
        focus: 'Pair + slot with minimal pauses.',
        drills: {
          f2lPairInsertRight: {
            title: 'Front-right pair insert',
            summary: 'Base insert to lock lookahead timing.',
            recognition: 'Spot a connectable corner-edge pair above a free front-right slot.',
            coaching: "Keep your mental camera on the slot while executing U R U' R'.",
          },
          f2lPairInsertLeft: {
            title: 'Front-left pair insert',
            summary: 'Mirror insert to balance both hands.',
            recognition: 'Align the pair above the front-left slot before committing.',
            coaching: "Run U' L' U L with even tempo and avoid sticky U turns.",
          },
        },
      },
      oll: {
        label: 'OLL',
        description: 'Orient the last layer with clean pattern reads.',
        focus: 'Read first, execute second.',
        drills: {
          ollSuneFlow: {
            title: 'Sune flow',
            summary: 'Entry OLL drill for smooth trigger rhythm.',
            recognition: 'One oriented corner with a diagonal yellow block on top.',
            coaching: "Chain two R U R' triggers and keep U2 controlled.",
          },
          ollHeadlights: {
            title: 'Headlights',
            summary: 'Pattern drill to stabilise OLL transitions.',
            recognition: 'Two adjacent corners facing you like headlights.',
            coaching: 'Confirm headlights before execution to reduce regrips.',
          },
        },
      },
      pll: {
        label: 'PLL',
        description: 'Close last-layer solves with reliable permutations.',
        focus: 'Clean execution plus cycle reading.',
        drills: {
          pllTPermFlow: {
            title: 'T-perm flow',
            summary: 'Classic finishing permutation for confidence under pace.',
            recognition: 'Two solved back corners and front-edge swap pattern.',
            coaching: "Anchor the F block and keep tempo until the final F'.",
          },
          pllUaPermFlow: {
            title: 'Ua-perm control',
            summary: 'Three-edge cycle drill with continuous rhythm.',
            recognition: 'One solved bar and a clockwise three-edge cycle on U.',
            coaching: 'Keep U turns compact and pre-load the closing R2.',
          },
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
      progress: 'Step {current} of {total}',
      navigation: {
        previous: 'Previous',
        next: 'Next',
        finish: 'Finish',
      },
      labels: {
        goal: 'Goal',
        algorithm: 'Algorithm',
        steps: 'Steps',
        tip: 'Tip',
        important: 'Important',
      },
    },
    completion: {
      title: 'Congratulations!',
      description:
        "You've completed the beginner's tutorial. Now it's time to practice and improve your solving time!",
      goToTimer: 'Start Solving',
      restart: 'Restart Tutorial',
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
  tutorialGuide: {
    title: 'CFOP Tutorial with 3D Cube',
    subtitle: 'Learn Cross, F2L, OLL, and PLL through visual cases focused on consistency.',
    progress: {
      stage: 'Stage {current} of {total}',
      lesson: 'Lesson {current} of {total}',
    },
    method: {
      title: 'Training method',
      focus: 'Method focus',
      estimatedTime: 'Suggested time',
      ariaLabel: 'Select training method',
    },
    stage: {
      title: 'Method stages',
      objective: 'Stage objective',
      ariaLabel: 'Select method stage',
    },
    lesson: {
      title: 'Practice lessons',
      recognition: 'How to recognize the case',
      algorithm: 'Recommended algorithm',
      checklist: 'Practice checklist',
      tip: 'Quick tip',
      cubeHint:
        'The 3D cube plays the case automatically. Use "Replay case" whenever you need another pass.',
      replay: 'Replay case',
      next: 'Next lesson',
      finished: 'CFOP currently completed',
    },
    methods: {
      cfop: {
        label: 'CFOP',
        description:
          'Classic four-block flow to move beyond beginner solving with stronger consistency and faster decisions.',
        focus: 'Reduce pauses between stages while keeping recognition active.',
        estimatedTime: '12 to 20 minutes per guided session',
        stages: {
          cross: {
            label: 'Cross',
            description: 'Build the white cross and align side edges with their centers.',
            objective: 'Finish cross in few moves while spotting your first F2L pair early.',
            lessons: [
              {
                title: 'Daisy into Cross',
                summary: 'Convert daisy to a full cross without losing top-layer orientation.',
                recognition:
                  'Four white stickers are on U around the yellow center, forming a daisy pattern.',
                checklist: [
                  'Pick one white edge at a time.',
                  'Match the edge side color with its center.',
                  'Turn 180° to place the edge on the white face.',
                ],
                tip: 'Try to locate your first F2L pair while finishing the final cross edge.',
              },
              {
                title: 'Cross final alignment',
                summary:
                  'Fix cross alignment so every side color is correct before entering F2L.',
                recognition:
                  'The white cross is done, but one or two side colors do not match their centers.',
                checklist: [
                  'Identify which edge needs to swap.',
                  'Use U plus a short trigger without breaking the cross.',
                  'Confirm all side colors are aligned.',
                ],
                tip: 'Avoid full cube rotations; use U turns to reorganize quickly.',
              },
            ],
          },
          f2l: {
            label: 'F2L',
            description: 'Solve corner+edge pairs from first and second layers together.',
            objective: 'Recognize pair patterns faster and insert with fewer pauses.',
            lessons: [
              {
                title: 'Basic front slot pair',
                summary: 'Build a simple pair and insert it in the front-right slot cleanly.',
                recognition:
                  'Corner and edge with matching colors are separated in the top layer, ready to pair.',
                checklist: [
                  'Use a U setup to bring corner and edge together.',
                  'Apply the trigger to form the pair.',
                  'Insert while preserving the solved cross.',
                ],
                tip: 'Tilt the cube slightly to keep the target slot visible during insertion.',
              },
              {
                title: 'Back slot insertion',
                summary: 'Practice inserting pairs into the back slot without rotating the cube.',
                recognition:
                  'The pair is formed, but the target slot is on the opposite side of your main view.',
                checklist: [
                  'Place the pair above the correct back slot.',
                  'Use the mirrored insertion algorithm with no global rotation.',
                  'Check both layers remain solved.',
                ],
                tip: 'Back-slot confidence removes many unnecessary rotations from solves.',
              },
            ],
          },
          oll: {
            label: 'OLL',
            description: 'Orient the last layer until the top face turns fully yellow.',
            objective: 'Read fast patterns and execute the right algorithm without hesitation.',
            lessons: [
              {
                title: 'Sune',
                summary: 'Classic orientation case when only one corner is already oriented.',
                recognition:
                  'You can see a headlight and only one corner appears correctly oriented.',
                checklist: [
                  'Place the headlight on the left/front side.',
                  "Execute R U R' U R U2 R'.",
                  'Confirm yellow top completion.',
                ],
                tip: 'Count rhythm in short chunks: trigger, adjust, double trigger.',
              },
              {
                title: 'Anti-Sune',
                summary: 'Mirrored Sune used when the orientation pattern is reversed.',
                recognition: 'Looks like Sune, but the headlight appears on the opposite side.',
                checklist: [
                  'Hold the mirrored case facing you.',
                  "Execute R' U' R U' R' U2 R.",
                  'Re-check top-layer orientation before PLL.',
                ],
                tip: 'Drill Sune and Anti-Sune back to back to speed up recognition.',
              },
            ],
          },
          pll: {
            label: 'PLL',
            description: 'Permute last-layer pieces while keeping orientation already solved.',
            objective: 'Finish solves using side-block recognition and uninterrupted perms.',
            lessons: [
              {
                title: 'T-Perm',
                summary: 'Swaps two adjacent corners and two adjacent edges, a common finisher.',
                recognition: 'One 2x1 side block is solved and remaining pieces form a T-style swap.',
                checklist: [
                  'Keep the solved block on the left side.',
                  "Execute R U R' U' R' F R2 U' R' U' R U R' F'.",
                  'Apply final AUF if needed.',
                ],
                tip: 'Stay smooth through the F/F’ section to avoid right-hand locks.',
              },
              {
                title: 'Y-Perm',
                summary: 'Diagonal corner swap plus edge cycle, useful for awkward endings.',
                recognition:
                  'No side block is solved and corners look like they swap diagonally.',
                checklist: [
                  'Confirm diagonal corner swap pattern.',
                  "Execute F R U' R' U' R U R' F' R U R' U' R' F R F'.",
                  'Finish with AUF to close the solve.',
                ],
                tip: 'Track edges while executing so the final AUF is immediate.',
              },
            ],
          },
        },
      },
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
