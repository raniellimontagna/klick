# Componentes

## UI Base (`/src/shared/components/ui/`)

### Button

Botão reutilizável com variantes.

```tsx
<Button variant="primary" size="md">
  Salvar
</Button>
```

| Variante | Uso |
|----------|-----|
| `primary` | Ação principal |
| `secondary` | Ação secundária |
| `ghost` | Botão sutil |
| `danger` | Ação destrutiva |
| `success` | Confirmação |
| `warning` | Alerta |

| Tamanho | Descrição |
|---------|-----------| | `sm` | Pequeno |
| `md` | Médio (padrão) |
| `lg` | Grande |
| `icon` | Apenas ícone |

### Card

Container reutilizável.

```tsx
<Card variant="surface" padding="md">
  Conteúdo
</Card>
```

---

## Core Components (`/src/shared/components/`)

| Componente | Path | Descrição |
|------------|------|-----------| | `RouteLoader` | `/route-loader/` | Tela de loading para lazy routes com animações |
| `Logo` | `/logo/` | Logo do app |
| `PageHeader` | `/page-header/` | Header de página |
| `Toast` | `/toast/` | Notificações temporárias |

---

## Feature Components

Componentes específicos de features ficam em `/src/features/[feature]/components/`:

| Componente | Feature | Descrição |
|------------|---------|-----------|
| `TimerDisplay` | home | Display do cronômetro com estados |
| `ScrambleBox` | home | Box do scramble copiável |
| `InspectionDisplay` | home | Contagem regressiva de inspeção |
| `StatCard` | home | Card de estatísticas animado |
| `SolveTable` | history | Tabela de solves com filtros |
| `AdvancedStatsModal` | stats | Modal com gráficos e métricas |
| `TutorialModal` | tutorial | Tutorial layer-by-layer |

---

## Navegação (`/src/shared/components/navigation/`)

| Componente | Descrição |
|------------|-----------|
| `Navbar` | Navegação desktop (links horizontais) |
| `MobileNav` | Menu hamburger mobile (drawer lateral) |

---

## Dropdowns (`/src/shared/components/`)

| Componente | Path | Descrição |
|------------|------|-----------| | `LanguageSelector` | `/language-selector/` | Seletor de idioma com flags |
| `SessionSwitcher` | `/session-switcher/` | Troca e gerenciamento de sessões |

---

## Modais (`/src/shared/components/`)

| Componente | Path | Descrição |
|------------|------|-----------| | `ConfirmDialog` | `/confirm-dialog/` | Diálogo de confirmação genérico |
| `ScrambleGuideModal` | `/scramble-guide-modal/` | Guia de embaralhamento para iniciantes |

---

## Onboarding (`/src/shared/components/onboarding/`)

| Componente | Descrição |
|------------|-----------|
| `Onboarding` | Container principal do sistema de onboarding |
| `Spotlight` | Highlight radial de elementos com borda |
| `OnboardingTooltip` | Tooltip com navegação e progresso |

---

## Utilitários (`/src/shared/components/`)

| Componente | Path | Descrição |
|------------|------|-----------| | `PWAUpdatePrompt` | `/pwa-update-prompt/` | Prompt de atualização do PWA |
| `CubeVisualizer` | `/cube-visualizer/` | Visualização 2D do cubo |

---

## Padrões

### Estrutura de Componente

```
/componentName/
├── ComponentName.tsx    # Componente principal
├── useComponentName.ts  # Hook com lógica (se necessário)
└── index.ts             # Barrel export
```

### Separação de Responsabilidades

- **Componentes (.tsx):** Apenas renderização e UI
- **Hooks (.ts):** Toda a lógica de negócio

### Animações

Usar variantes de `/src/shared/lib/animations.ts`:
- `fadeIn`, `slideUp`, `slideDown`, `scale`
- `AnimatePresence` para enter/exit
- `whileHover`, `whileTap` para micro-interações

### RouteLoader

Componente especial para Suspense boundaries em rotas lazy-loaded:

```tsx
<Suspense fallback={<RouteLoader />}>
  <LazyComponent />
</Suspense>
```

**Features:**
- Cubo animado com rotação infinita
- Barra de progresso deslizante
- Texto "Carregando..." com dots animados
- Design consistente com tema do app (roxo/cinza)
- Transições suaves com Framer Motion
