# Changelog

All notable changes and implementation milestones for the Klick project.

## 2026-01-09

### Performance Optimization
- **Bundle Size Reduction:** Main bundle reduced from 904 KB to 135 KB (~70% reduction)
- **Route-based Code Splitting:** Implemented lazy loading for all route components
- **Vendor Chunk Separation:** Split React, recharts, framer-motion
- **RouteLoader Component:** Created animated loading screen with cube theme and progress indicators

### Bug Fixes
- **Accessibility:** Fixed "Static Elements should not be interactive" lint error in ScrambleGuideModal
  - Removed `onKeyDown` handler from non-interactive div element
  - Modal component now handles Escape key internally
- **Deprecated API:** Updated `motion()` to `motion.create()` in scramble-box component
  - Fixes deprecation warning from framer-motion

### Build
- **Vite Configuration:** Added manual chunks configuration for optimal code splitting
- **TypeScript Compatibility:** Fixed rolldown-vite type issues with function-based manualChunks

## Phase 10 - Routing & Navigation

### Implemented
- **React Router DOM Integration:** Client-side routing with clean URLs
- **Page Structure:**
  - HomePage (/) - Timer principal
  - HistoryPage (/history) - Tabela de solves
  - StatsPage (/stats) - Estatísticas avançadas
  - TrainingPage (/training) - Modo de treino
  - TutorialPage (/tutorial) - Tutorial layer-by-layer
  - SettingsPage (/settings) - Configurações
- **MainLayout:** Header with navigation, logo, language selector
- **Navigation Components:**
  - Navbar (desktop) - Horizontal links with active state
  - MobileNav (mobile) - Hamburger menu with drawer
- **Translations:** Navigation labels in 3 languages

### Performance
- Build: ~816 KB (gzip: ~245 KB)
- React Router adds ~21 KB to bundle

## Phase 9 - Tutorial System

### Implemented
- **Complete Layer-by-Layer Tutorial:**
  - Intro + 7 solving steps
  - White cross → White corners → Second layer → Yellow cross → Align edges → Position corners → Solve cube
- **Components:**
  - TutorialModal with progress bar and step navigation
  - TutorialStepContent with dynamic rendering
  - useTutorialModal hook
  - tutorialStore (Zustand)
- **Educational Content:**
  - Detailed algorithms for each step
  - Visual patterns (dot, line, L, cross)
  - Tips and warnings
  - Notation guide (R, R', U, U', F, F', L, L', D, D', 2)
- **UX:**
  - Tutorial button in header (BookOpen icon)
  - Responsive modal with scroll
  - Animated transitions between steps
  - Color-coded cards for objectives, tips, warnings
- **Translations:** Complete content in pt-BR, en-US, es-ES

## Phase 8 - Onboarding & Training

### Onboarding System
- **7-Step Interactive Tour:**
  - Welcome → Scramble → Timer → Stats → Shortcuts → Sessions → Complete
- **Components:**
  - Onboarding container
  - Spotlight with radial gradient
  - OnboardingTooltip with navigation
  - onboardingStore (Zustand with persist)
- **Features:**
  - Auto-trigger for new users
  - Tour button for revisiting (Compass icon)
  - data-onboarding attributes on target elements
  - Responsive positioning (top/bottom/left/right)
  - Progress indicator
- **Translations:** All 7 steps in 3 languages

### Training Mode
- **Dedicated `/training` page**
- **Collections:** PLL, OLL, F2L with representative cases
- **Features:**
  - Case cards with algorithms
  - Progress tracking (repetitions, meta, status)
  - Quick notes per case
  - Copy algorithm buttons
  - Progress bar with auto-alert when goal reached
- **Persistence:** trainingStore with localStorage

## Phase 7 - Advanced Statistics

### Implemented
- **AdvancedStatsModal with 3 tabs:**
  - Evolution: Line chart (Single, ao5, ao12 over time)
  - Consistency: Standard deviation, Coefficient of Variation
  - Performance: TPS average, time distribution histogram
- **Charts:**
  - EvolutionChart (LineChart from recharts)
  - DistributionChart (BarChart from recharts)
  - Theme-aware colors
  - Responsive design
- **Metrics:**
  - Rolling averages for each solve
  - Standard deviation
  - CV (Coefficient of Variation) with interpretation
  - TPS (Turns Per Second) based on 25 moves
  - Time distribution in 10 bins
- **Access:** TrendingUp button in header
- **Translations:** 3 languages with tooltips and interpretations

### Performance
- Recharts integration: ~746 KB total (gzip: ~223 KB)
- Memoized calculations with useMemo
- Lazy rendering (only active tab)

## Phase 6.1 - Reusable UI Library

### Implemented
- **Button Component:**
  - Variants: primary, secondary, ghost, danger, success, warning
  - Sizes: sm, md, lg, icon
  - Full TypeScript support
- **Card Component:**
  - Variants: surface, background, overlay
  - Configurable spacing
- **Migration:**
  - All buttons migrated to use Button component
  - Settings, Advanced Stats, Solve Details using Card
- **Centralized Exports:** src/components/ui/index.ts

## Phase 6 - Light Theme

### Implemented
- **Complete Theme System:**
  - CSS variables for dark and light themes
  - Semantic colors (background, surface, text, borders)
  - Smooth transitions (0.2s ease)
- **useTheme Hook:**
  - toggleTheme, isDark, isLight methods
  - Integrated with settingsStore
  - Applies class to root element
- **Settings Integration:**
  - Animated toggle button (Sun/Moon icons)
  - Persisted preference

## Phase 5.2 - Scramble Guide

### Implemented
- **ScrambleGuideModal:**
  - 4 educational sections (Faces, Modifiers, Examples, Tips)
  - Visual face colors (R=red, L=orange, U=white, D=yellow, F=green, B=blue)
  - Responsive design with scroll
  - Accessible (Escape to close)
- **Integration:**
  - Help button (?) in ScrambleBox
  - useScrambleGuideModal hook
- **Translations:** Complete guide in 3 languages

## Phase 5.1 - Sound System

### Implemented
- **Web Audio API Integration:**
  - Generated beeps (no external files)
  - Cross-browser compatibility
- **7 Sound Events:**
  - Timer Ready, Start, Stop
  - Inspection Warning (15s), Critical (17s)
  - Success, Error
- **Settings Integration:**
  - soundsEnabled toggle
  - shouldPlaySound() check
- **Performance:**
  - Lazy AudioContext initialization
  - Silent error handling

## Phase 5 - Settings & Export/Import

### Settings Modal
- **Configuration Options:**
  - Inspection duration (5-30s slider)
  - Sounds enabled (toggle)
  - Auto-inspection penalty (toggle) - +2 at 15-17s, DNF >17s
  - Theme (dark/light)
- **Settings Button:** Gear icon in header
- **Persistence:** settingsStore with localStorage

### Export/Import
- **Export:**
  - Current session JSON
  - All sessions JSON
  - Downloaded as .json file
- **Import:**
  - File upload
  - Merge or Replace modes
  - Complete validation (structure, required fields)
  - Error/success feedback with toasts

## Phase 4.5 - Internationalization

### Implemented
- **3 Languages:**
  - Portuguese (pt-BR) - default
  - English (en-US)
  - Spanish (es-ES)
- **Structure:**
  - `/src/i18n/locales/` with translation files
  - Barrel export in index.ts
- **LanguageSelector:**
  - Dropdown with flags and names
  - Active indicator (✓)
  - Responsive (flag only in mobile)
- **Shared Components:**
  - HeaderDropdownButton
  - HeaderDropdownMenu
- **Complete Translations:**
  - All app sections, modals, tooltips
  - Settings, stats, sessions, scramble guide
- **Persistence:** i18nStore with localStorage

## Phase 4 - Sessions System

### Implemented
- **SessionSwitcher in Header:**
  - Dropdown with all sessions
  - Active session indicator
  - Solve count per session
- **SessionManager Modal:**
  - Create sessions with custom names
  - Rename (inline edit)
  - Delete with confirmation
  - Protection (can't delete last session)
  - Switch active session
- **Zustand Integration:**
  - Multiple sessions in localStorage
  - Independent solves and stats per session
  - Active session preserved
- **Feedback:**
  - Success/error toasts
  - Smooth animations
  - Keyboard shortcuts blocked when modal open

## Phase 3 - Solve History Table

### Implemented
- **SolveTable Component:**
  - Columns: #, Time, Scramble, Date, Penalty, Actions
  - Filters: All, Last 5/12/50/100
  - Delete individual solves
- **SolveDetailsModal:**
  - Full time with penalty
  - Copyable scramble
  - Formatted date
  - Color-coded penalty info
- **Responsive Design:**
  - Mobile: hide scramble column
  - Tablet: hide date column
- **Animations:** Framer Motion
- **Empty State:** Handled gracefully

## Phase 2.5 - Management & Education

### Implemented
- **Clear Solves Button:** With confirmation dialog
- **StatsInfoModal:**
  - Explains Single, ao5, ao12
  - DNF rules (2+ DNFs = DNF average)
  - +2 penalty handling
  - Discard rules (best and worst)
- **Reusable Components:**
  - ConfirmDialog
  - StatsInfoModal
- **Feedback:**
  - Success toast after clear
  - Help button (?) in stats section

## Phase 2 - Statistics System

### Implemented
- **Metrics Calculation:**
  - Single (best time)
  - ao5 (average of 5)
  - ao12 (average of 12)
  - Best ao5, Best ao12
- **Rules:**
  - 2+ DNFs in window → average is DNF
  - Discard best and worst
  - +2 penalties included in effectiveMs
- **UI:**
  - 5 animated stat cards
  - Hover effects and scale animations
- **Testing:**
  - 20+ comprehensive tests
  - All edge cases covered

## Phase 1 - Core Timer & Scramble

### Implemented
- **Base Stack:**
  - Vite + React 19 + TypeScript
  - Tailwind CSS v4 (CSS variables)
  - Zustand with localStorage persist
  - Biome (linter)
  - Vitest + React Testing Library
  - Lucide React (icons)
  - Framer Motion (animations)
- **Timer:**
  - States: idle → inspection → running → stopped
  - Space bar control
  - 15s inspection counter
  - Auto-penalties on inspection time
  - Visual feedback with icons
- **Scramble Generator:**
  - Valid 3×3 scrambles (25 moves)
  - No consecutive face repetition
  - Comprehensive tests
- **Mobile-First:**
  - Responsive breakpoints (sm, md, lg)
  - Touch-friendly buttons
  - Scalable typography
- **Animations:**
  - Reusable variants (fadeIn, slideUp, slideDown, scale)
  - AnimatePresence for transitions
  - Micro-interactions (whileHover, whileTap)
- **i18n System:**
  - Custom implementation
  - pt-BR translations
  - useTranslation hook
- **Keyboard Shortcuts:**
  - Space: start/stop
  - N: new scramble
  - P: toggle +2
  - D: toggle DNF
- **PWA:**
  - Installable
  - Offline support
  - Asset caching
  - Update notifications
