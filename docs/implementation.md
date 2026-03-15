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
| `CubePlatform` | `/cube-platform/` | Plataforma compartilhada do cubo 3D com modos static/autoplay/step-by-step |
| `CubePlaybackControls` | `/cube-platform/` | Controles reutilizáveis de play/pause/step/speed para experiências guiadas |
| `LearningSurfaceActions` | `/learning-surface-actions/` | Atalhos cruzados entre treino, tutorial e workspace 3D no header das superfícies de aprendizado |

---

## Componentes por Feature

Componentes específicos de features ficam em `/src/features/[feature]/components/`:

| Componente | Feature | Descrição |
|------------|---------|-----------|
| `HomeTimerPanel` | home | Painel dominante do timer com status, feedback e ações rápidas |
| `HomeScramblePanel` | home | Painel de scramble com troca 3D/2D e visualização compacta |
| `HomeControls` | home | Ações primárias da sessão priorizadas para mobile |
| `HomeStatsGrid` | home | Resumo rápido de Single, ao5, ao12 e melhores médias |
| `HomeProgressPanel` | home | Camada secundária de progresso, streak e desafios |
| `HomeSolveFeed` | home | Histórico rápido com layout responsivo orientado a cards |
| `SolveTable` | history | Lista/tabela responsiva de solves com filtros segmentados e detalhes acionáveis |
| `SolveDetailsModal` | history | Detalhe do solve que vira bottom sheet no mobile e modal no desktop |
| `AdvancedStatsContent` | stats | Módulos analíticos com filtros por período/métrica e gráficos mobile-first |
| `TrainingDrillPanel` | training | Drill ativo com visualização 3D passo-a-passo, coaching e ações rápidas de progresso |
| `TrainingDrillList` | training | Catálogo da trilha com progresso por drill e seleção mobile-first |
| `CubeActionBar` | cube-3d | Ações rápidas do workspace 3D para scramble, reset, áudio e alinhamento |
| `MoveHistory` | cube-3d | Histórico de movimentos sob demanda para revisão e undo no mobile |

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

## Visualizador 3D

- `CubePlatform` aceita `initialAlgorithm` para montar o caso e `algorithm` para a reprodução didática.
- Modos disponíveis:
  - `static`: preview final estável, usado na home.
  - `autoplay`: reprodução automática com controles, usado no `/cube-3d`.
  - `step-by-step`: fluxo guiado com play/pause/next/previous, usado em tutorial e treino.
- Presets de câmera compartilhados evitam hacks por tela e permitem override por metadados de lição/drill.
- `prefers-reduced-motion` reduz autoplay automático e prioriza visual estático/pausado.

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

Laboratório reorganizado em torno do drill ativo, progresso da trilha e próximo passo recomendado.

### Trilhas

| Categoria | Casos |
|-----------|-------|
| PLL | Permutação da última camada |
| OLL | Orientação da última camada |
| F2L | First Two Layers |

### Progresso

- Card hero com foco da trilha, progresso geral e próxima recomendação
- Drill ativo com `CubePlatform` em `step-by-step`
- Meta por drill, confiança (`starting` → `building` → `ready`) e ações rápidas `+1`, `+5`, `+10`
- Catálogo lateral/mobile-first com progresso por drill e seleção direta

---

## Tutorial

Jornada guiada em CFOP com roadmap de estágios, lista de lições e viewer 3D integrado.

### Estágios

1. **Cross**
2. **F2L**
3. **OLL**
4. **PLL**

### Jornada

- Header com progresso do método, próxima lição e tempo estimado
- Viewer `CubePlatform` em `step-by-step` com algoritmo, reconhecimento e checklist
- Roadmap lateral com seleção de estágio e lista de lições por etapa
- Navegação direta para replay da lição ou avanço para a próxima

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

Workspace 3D integrado ao shell principal, com HUD de status, leitura de progresso e ações rápidas consistentes com treino/tutorial.

### Controles

| Atalho | Ação |
|--------|------|
| `R, L, U, D, F, B` | Movimentos clockwise |
| `Shift + tecla` | Movimentos counter-clockwise (') |
| Mouse drag | Rotacionar câmera |
| Scroll | Zoom in/out |

### Arquitetura

- **Orquestração:** `use-cube-workspace.ts` - Consolida scramble, playback, status, som e histórico para a página
- **Animação:** `rubiks-cube.tsx` - Rotações via pivot groups + easing
- **Renderização:** `cubie.tsx` - Peças individuais com clearcoat material
- **Áudio:** `use-cube-sound.ts` - Sintetizador procedural via Web Audio API
- **Sincronização:** Integrado com `scramble-store` global

### Melhorias Implementadas

#### Workspace
- ✅ Overview card com scramble ativo, status da cena, progresso do playback e próximo passo
- ✅ Cena principal com HUD de embaralhamento e controles compartilhados de playback
- ✅ Histórico de movimentos recolhível para preservar a primeira dobra no mobile

#### Funcionalidades
- ✅ **Ações rápidas:** Novo scramble, undo, reset, realinhamento da câmera e toggle de áudio
- ✅ **Sons procedurais:** Cliques percussivos sintetizados em tempo real (sem assets)
- ✅ **Temas de cores:** Presets (Standard, Pastel, Ocean, Neon...) + customização por face

---

## Export/Import

- **Exportar:** JSON da sessão atual ou todas
- **Importar:** Merge ou replace
- Validação de estrutura do JSON
