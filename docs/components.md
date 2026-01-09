# Componentes

## UI Base (`/src/components/ui/`)

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
|---------|-----------|
| `sm` | Pequeno |
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

## Core Components

| Componente | Path | Descrição |
|------------|------|-----------|
| `TimerDisplay` | `/timerDisplay/` | Display do cronômetro |
| `ScrambleBox` | `/scrambleBox/` | Box do scramble copiável |
| `InspectionDisplay` | `/inspectionDisplay/` | Contagem regressiva |
| `Toast` | `/toast/` | Notificações temporárias |
| `Logo` | `/logo/` | Logo do app |

---

## Navegação

| Componente | Path | Descrição |
|------------|------|-----------|
| `Navbar` | `/navigation/` | Navegação desktop |
| `MobileNav` | `/navigation/` | Menu hamburger mobile |
| `PageHeader` | `/pageHeader/` | Header de página |

---

## Dropdowns

| Componente | Path | Descrição |
|------------|------|-----------|
| `HeaderDropdownButton` | `/headerDropdownButton/` | Botão padrão para dropdowns |
| `HeaderDropdownMenu` | `/headerDropdownMenu/` | Menu dropdown com animations |
| `LanguageSelector` | `/languageSelector/` | Seletor de idioma |
| `SessionSwitcher` | `/sessionSwitcher/` | Troca de sessões |

---

## Modais

| Componente | Path | Descrição |
|------------|------|-----------|
| `ConfirmDialog` | `/confirmDialog/` | Diálogo de confirmação |
| `SessionManagerModal` | `/sessionManagerModal/` | Gerenciador de sessões |
| `ScrambleGuideModal` | `/scrambleGuideModal/` | Guia de embaralhamento |

---

## Onboarding

| Componente | Path | Descrição |
|------------|------|-----------|
| `Onboarding` | `/onboarding/` | Container principal |
| `Spotlight` | `/onboarding/` | Highlight de elementos |
| `OnboardingTooltip` | `/onboarding/` | Tooltip com navegação |

---

## Utilitários

| Componente | Path | Descrição |
|------------|------|-----------|
| `PWAUpdatePrompt` | `/pwaUpdatePrompt/` | Prompt de atualização |
| `CubeVisualizer` | `/cubeVisualizer/` | Visualização do cubo |

---

## Padrões

### Estrutura de Componente

```
/componentName/
├── ComponentName.tsx    # Componente principal
├── useComponentName.ts  # Hook com lógica (se necessário)
└── index.ts             # Barrel export
```

### Animações

Usar variantes de `/src/utils/animations/`:
- `fadeIn`, `slideUp`, `slideDown`, `scale`
- `AnimatePresence` para enter/exit
- `whileHover`, `whileTap` para micro-interações
