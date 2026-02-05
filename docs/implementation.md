# Implementação

## Componentes UI Base

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

## Componentes Core

| Componente | Path | Descrição |
|------------|------|-----------|
| `RouteLoader` | `/route-loader/` | Tela de loading para lazy routes com animações |
| `Logo` | `/logo/` | Logo do app |
| `PageHeader` | `/page-header/` | Header de página |
| `Toast` | `/toast/` | Notificações temporárias |

---

## Componentes por Feature

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

## Navegação

| Componente | Descrição |
|------------|-----------|
| `Navbar` | Navegação desktop (links horizontais) |
| `MobileNav` | Menu hamburger mobile (drawer lateral) |

---

## Dropdowns

| Componente | Path | Descrição |
|------------|------|-----------|
| `LanguageSelector` | `/language-selector/` | Seletor de idioma com flags |
| `SessionSwitcher` | `/session-switcher/` | Troca e gerenciamento de sessões |

---

## Modais

| Componente | Path | Descrição |
|------------|------|-----------|
| `ConfirmDialog` | `/confirm-dialog/` | Diálogo de confirmação genérico |
| `ScrambleGuideModal` | `/scramble-guide-modal/` | Guia de embaralhamento para iniciantes |

---

## Onboarding

| Componente | Descrição |
|------------|-----------|
| `Onboarding` | Container principal do sistema de onboarding |
| `Spotlight` | Highlight radial de elementos com borda |
| `OnboardingTooltip` | Tooltip com navegação e progresso |

---

## Utilitários

| Componente | Path | Descrição |
|------------|------|-----------|
| `PWAUpdatePrompt` | `/pwa-update-prompt/` | Prompt de atualização do PWA |
| `CubeVisualizer` | `/cube-visualizer/` | Visualização 2D do cubo |

---

## Padrões de Componentes

### Estrutura

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

---

# Features Implementadas

## Timer

### Estados

```
idle → inspection → running → stopped
```

### Controles

| Atalho | Ação |
|--------|------|
| `Space` | Segurar para armar → soltar inicia inspeção → pressionar para iniciar/parar |
| `N` | Novo scramble |
| `P` | Toggle +2 |
| `D` | Toggle DNF |

### Inspeção

- **0-15s:** Válido
- **15-17s:** +2 automático (se habilitado)
- **>17s:** DNF automático (se habilitado)

---

## Scramble

### Gerador 3×3

- 25 movimentos: `R L U D F B` com sufixos `'`, `2`, ou vazio
- Sem repetição de face consecutiva
- Compatível com leitores WCA

---

## Estatísticas

### Métricas Básicas

| Métrica | Descrição |
|---------|-----------|
| Single | Melhor tempo individual |
| ao5 | Average of 5 (descarta melhor e pior) |
| ao12 | Average of 12 (descarta melhor e pior) |
| Best ao5 | Melhor ao5 histórico |
| Best ao12 | Melhor ao12 histórico |

### Regras DNF

- **2+ DNFs na janela** → média = DNF
- **+2** já embutido em `effectiveMs`

### Métricas Avançadas

| Métrica | Descrição |
|---------|-----------|
| Desvio Padrão | Variação dos tempos |
| CV (%) | Coeficiente de variação relativo |
| TPS | Turns Per Second (25 movimentos) |
| Distribuição | Histograma de tempos |

---

## Onboarding

Tour interativo em 7 passos:

1. **Welcome:** Introdução
2. **Scramble:** Como gerar e entender
3. **Timer:** Barra de espaço
4. **Stats:** Single, ao5, ao12
5. **Shortcuts:** Atalhos de teclado
6. **Sessions:** Gerenciamento
7. **Complete:** Conclusão

---

## Training

### Categorias

| Categoria | Casos |
|-----------|-------|
| PLL | Permutação da última camada |
| OLL | Orientação da última camada |
| F2L | First Two Layers |

### Progresso

- Repetições contadas
- Meta numérica
- Status: Aprendendo → Ajustando → Automático
- Notas rápidas por caso

---

## Tutorial

Tutorial layer-by-layer com 7 etapas:

1. **Cruz Branca:** 4 aristas brancas
2. **Esquinas Brancas:** R U R'
3. **Segunda Camada:** Algoritmos esq/dir
4. **Cruz Amarela:** F R U R' U' F'
5. **Alinhar Aresta:** R U R' U R U2 R'
6. **Posicionar Esquinas:** U R U' L' U R' U' L
7. **Resolver Cubo:** R' D' R D

---

## Sistema de Sons

Eventos sonoros via Web Audio API:

| Evento | Descrição |
|--------|-----------|
| Timer Ready | Som ao segurar espaço |
| Timer Start | Beep ao iniciar |
| Timer Stop | Confirmação ao parar |
| Inspection Warning | Aviso aos 15s |
| Inspection Critical | Beep duplo aos 17s |
| Success | Ações bem-sucedidas |
| Error | Feedback de erro |

---

## Cube 3D

Visualizador 3D interativo do cubo de Rubik usando Three.js.

### Controles

| Atalho | Ação |
|--------|------|
| `R, L, U, D, F, B` | Movimentos clockwise |
| `Shift + tecla` | Movimentos counter-clockwise (') |
| Mouse drag | Rotacionar câmera |
| Scroll | Zoom in/out |

### Arquitetura

- **Estado:** `use-cube-state.ts` - Fila de movimentos e estado lógico
- **Animação:** `rubiks-cube.tsx` - Rotações via pivot groups + easing
- **Renderização:** `cubie.tsx` - Peças individuais com clearcoat material
- **Áudio:** `use-cube-sound.ts` - Sintetizador procedural via Web Audio API
- **Sincronização:** Integrado com `scramble-store` global

### Melhorias Implementadas

#### Visual & Interação
- ✅ Easing cubic ease-out (0.25s)
- ✅ Cursores interativos (grab)
- ✅ Sombras de contato realistas
- ✅ Layout imersivo "Overlay"

#### Funcionalidades
- ✅ **Histórico de Movimentos:** Lista completa com scroll automático + Undo ilimitado
- ✅ **Sons Procedurais:** Cliques percussivos sintetizados em tempo real (sem assets)
- ✅ **Temas de Cores:** Presets (Standard, Pastel, Ocean, Neon...) + Customização por face

---

## Export/Import

- **Exportar:** JSON da sessão atual ou todas
- **Importar:** Merge ou replace
- Validação de estrutura do JSON
