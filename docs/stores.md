# Stores (Zustand)

Todas as stores usam persistência em `localStorage`.

## sessionsStore

**Path:** `/src/stores/sessionsStore.ts`

Gerencia sessões e solves.

```ts
interface SessionsState {
  sessions: Session[];
  activeSessionId: string;
  
  // Sessões
  createSession(name: string): void;
  renameSession(id: string, name: string): void;
  deleteSession(id: string): void;
  setActiveSession(id: string): void;
  
  // Solves
  addSolve(solve: Solve): void;
  updateSolve(id: string, updates: Partial<Solve>): void;
  deleteSolve(id: string): void;
  clearSolves(): void;
  
  // Export/Import
  exportSession(id?: string): string;
  importSessions(json: string, mode: 'merge' | 'replace'): void;
}
```

---

## settingsStore

**Path:** `/src/stores/settingsStore.ts`

Preferências do usuário.

```ts
interface SettingsState {
  inspectionDuration: number;  // 5-30s (padrão: 15)
  soundsEnabled: boolean;
  autoInspectionPenalty: boolean;
  theme: 'dark' | 'light';
}
```

---

## i18nStore

**Path:** `/src/stores/i18nStore.ts`

Idioma selecionado.

```ts
interface I18nState {
  locale: 'pt-BR' | 'en-US' | 'es-ES';
  setLocale(locale: string): void;
}
```

---

## onboardingStore

**Path:** `/src/stores/onboardingStore.ts`

Estado do tour de onboarding.

```ts
interface OnboardingState {
  isActive: boolean;
  currentStep: number;
  hasCompletedOnboarding: boolean;
  
  startOnboarding(): void;
  nextStep(): void;
  previousStep(): void;
  skipOnboarding(): void;
  completeOnboarding(): void;
}
```

---

## tutorialStore

**Path:** `/src/stores/tutorialStore.ts`

Estado do tutorial layer-by-layer.

```ts
interface TutorialState {
  isOpen: boolean;
  currentStep: string;
  
  openTutorial(): void;
  closeTutorial(): void;
  nextStep(): void;
  previousStep(): void;
  goToStep(step: string): void;
}
```

---

## trainingStore

**Path:** `/src/stores/trainingStore.ts`

Progresso de treino de casos.

```ts
interface TrainingProgress {
  reps: number;
  goal: number;
  status: 'learning' | 'adjusting' | 'automatic';
  notes: string;
}

interface TrainingState {
  progress: Record<string, TrainingProgress>;
  
  incrementReps(caseId: string, amount: number): void;
  setGoal(caseId: string, goal: number): void;
  setNotes(caseId: string, notes: string): void;
  resetCase(caseId: string): void;
}
```
