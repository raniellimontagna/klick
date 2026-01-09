# Klick

Tagline: gire, clique, evolua.

Essência: cronômetro de cubo mágico com IU limpa, explicando métricas (ao5/ao12) de forma visual e com feedback instantâneo.

Proposta de valor:

- Clareza primeiro: tempos, médias e PB sem poluição.
- Aprenda jogando: dicas curtas sobre ao5/ao12 e TPS após cada sessão.
- Aconchego visual: contraste alto, tipografia grande, zero distração.

# 0) Contexto & Objetivo

Você é um **engenheiro front-end sênior**. Gere uma aplicação web tipo **csTimer** com funções **básicas**, porém com **UI mais amigável e fácil de entender**.

**Stack desejada:** React + TypeScript + Vite + Tailwind CSS  
**Estado:** Zustand (ou Context + Reducer, preferir Zustand)  
**Persistência:** localStorage (ou IndexedDB se necessário)  
**Qualidade:** Biome + Vitest + React Testing Library (testes de médias e penalidades)

---

## ⚠️ REGRA IMPORTANTE DE DOCUMENTAÇÃO

**NUNCA crie arquivos `.md` adicionais para documentar fases, mudanças ou progresso.**

- ✅ **Use apenas**: `PROJECT.md` e `README.md`
- ❌ **NÃO crie**: `FASE1.md`, `FASE2.md`, `CHANGELOG.md`, `UPDATES.md`, etc.
- Toda documentação de progresso deve estar na seção **"Status do Projeto"** deste arquivo
- Atualizações devem ser refletidas no **README.md** conforme necessário

---

# 1) Escopo do Produto

Implemente um timer de cubo mágico para iniciantes que atenda:

1. Scrambles 3×3 (25 movimentos, sem repetir face consecutiva).
2. **Inspeção de 15s** com aviso visual/sonoro.
3. Cronômetro com **barra de espaço** (armar → iniciar/parar).
4. Registro de solves com **+2** e **DNF** por solve.
5. Cálculo de **Single, ao5 e ao12** (descarta melhor e pior, regras DNF/+2).
6. Histórico com filtros e **exportar/importar JSON**.
7. **Onboarding** curto (tooltips/coach-marks).
8. **pt-BR** como idioma padrão.

---

# 2) Diretrizes de UI/UX

- **Tema dark-first (Soft Slate):**
  - Fundo `#0D1117`, cinzas neutros, primário `#7C4DFF`, acento opcional `#39FF88`.
- Cards com **rounded-2xl**, sombras suaves, tipografia legível, espaçamento generoso.
- Responsivo (desktop e mobile).
- Acessibilidade: foco visível, ARIA onde necessário, contraste AA.
- **Onboarding iniciante:** tooltips que explicam Space, Scramble e Estatísticas.
- **Modo iniciante:** inspeção automática + avisos grandes.

---

# 3) Páginas & Seções

## / (Home/Timer)

- Header com título e menu: **Configurações**, **Sessões**, **Exportar/Importar**.
- **Scramble atual** grande e legível (copiável).
- **Timer** grande + contador de inspeção (barra/anel).
- Botões: **Novo scramble**, **Marcar +2**, **Marcar DNF**, **Desfazer último**.
- **Atalhos:**
  - `Space` iniciar/parar
  - `N` novo scramble
  - `P` togglar +2 último
  - `D` togglar DNF último
  - `U` desfazer
- Mini-cards: **Single**, **ao5**, **ao12**, **Best ao5**, **Best ao12**.
- **Tabela de solves** (tempo, data, scramble, +2/DNF), filtro por últimos 5/12/50.

## /settings (Configurações)

- Duração da inspeção (default 15s).
- Sons (on/off).
- Colunas visíveis na tabela.
- Tema (dark padrão).
- **Regra automática de inspeção** (ON/OFF): +2 entre 15–17s, DNF >17s.

## /sessions (Sessões)

- Criar/renomear/deletar sessão.
- Trocar sessão ativa (cada sessão tem solves e stats próprios).

## Exportar/Importar

- Exportar **JSON** da sessão/geral.
- Importar **JSON** (merge ou substituir).

---

# 4) Modelo de Dados

```ts
type Penalty = "NONE" | "+2" | "DNF";

type Solve = {
  id: string; // uuid
  timeMs: number; // tempo bruto em ms
  penalty: Penalty; // penalidade aplicada
  effectiveMs: number; // timeMs ajustado (+2) ou Infinity se DNF
  scramble: string; // notação 3x3
  createdAt: string; // ISO
};

type Session = {
  id: string;
  name: string;
  solves: Solve[];
};
```

---

# 5) Lógica de Negócio

## Inspeção

- 0–15s: válido.
- 15–17s: **+2** automático (se regra estiver ON).
- > 17s: **DNF** automático (se regra estiver ON).
- Permitir desligar essa regra em Configurações.

## Cálculo de ao5/ao12

- Dado array de `effectiveMs`:
  - **≥2 DNFs** (Infinity) na janela → média = **DNF**.
  - Caso contrário, **descarte 1 melhor** e **1 pior** e tire a média do restante.
- `+2` já embutido em `effectiveMs` (timeMs + 2000).

## Interações

- **Space**: segurar para “armar”, soltar inicia; apertar novamente para parar.
- Ignorar atalhos quando foco estiver em inputs/modais.

---

# 6) Gerador de Scramble 3×3

Requisitos mínimos:

- 25 movimentos dentre `R L U D F B` com sufixos `'', 2, '`.
- **Não repetir a mesma face consecutiva**.
- Evitar padrões degenerados simples (priorize a regra de não repetir face).

Implementação atual:

- `generate3x3.ts` mantém listas imutáveis (`FACES`, `MODIFIERS`) e sorteia cada passo.
- `getRandomFace(lastFace)` filtra a face anterior, garantindo que nenhuma face se repita em sequência.
- O modificador (`'', 2, '`) é escolhido de forma uniforme e concatenado antes de inserir no array final.
- Ao final, os 25 movimentos são unidos por espaço, mantendo compatibilidade com leitores de scramble da WCA.
- Regras adicionais (ex.: bloqueio de padrões inversos) podem ser adicionadas sem alterar a API exposta ao restante da aplicação.
- **Explicação para iniciantes (implementado):** tooltip no `ScrambleBox` descrevendo faces (`R/L/U/D/F/B`), modificadores (`'`, `2`) e orientações para executar o embaralhamento antes do solve.

---

# 7) Arquitetura & Pastas

```
/src
  /components
    TimerDisplay.tsx
    ScrambleBox.tsx
    SolveTable.tsx
    SessionSwitcher.tsx
    Toast.tsx
  /features
    timer/
      useTimer.ts     // máquina de estados: idle → inspection → running → stopped
    scramble/
      generate3x3.ts
    stats/
      averages.ts     // single/ao5/ao12; regras de DNF/+2
    storage/
      sessions.ts     // persistência local
  /stores
    sessionsStore.ts  // Zustand
    settingsStore.ts
    trainingStore.ts
  /pages
    homePage/
      HomePage.tsx
      components/
        StatCard.tsx
        StatsInfoModal.tsx
    trainingPage/
      TrainingPage.tsx
      components/
        TrainingCaseCard.tsx
  /hooks
  /utils
  /styles
```

---

# 8) Testes (Vitest)

- `averages.test.ts`:

  - (a) sem penalidade
  - (b) 1 DNF
  - (c) 2 DNFs
  - (d) um `+2`
  - (e) múltiplos `+2`
  - Validar descarte min/max.

- `generate3x3.test.ts`:

  - Tamanho 25
  - Não repetir face consecutiva

- `useTimer.test.ts`:
  - Transições de estado
  - Aplicação da penalidade por inspeção

---

# 9) Entregáveis

- Projeto completo com `README.md` explicando:
  - `pnpm i && pnpm dev`
  - `pnpm build`
- `design.md` com decisões de UX e acessibilidade.
- **PWA (opcional):** manifest + service worker simples.

---

# 10) Aceite / Checklist

- [x] Timer funcional com Space (idle/inspection/running/stop).
- [x] Scramble 3×3 válido a cada solve.
- [x] **+2** e **DNF** por botão/atalho e regra de inspeção (opcional).
- [x] Cálculo correto de **ao5/ao12** (com regras de DNF).
- [x] Sessões separadas e persistentes.
- [x] Exportar/Importar JSON.
- [x] UI clara, responsiva e acessível (dark-first).
- [x] Testes principais passando.
- [x] **PWA:** manifest + service worker para instalação e uso offline.

---

## Status do Projeto - Fase 2 Concluída ✅

### Implementado

1. **Base tecnológica completa:**

   - Vite + React 19 + TypeScript
   - Tailwind CSS v4 configurado (tema dark-first com CSS nativo)
   - Zustand com persistência em localStorage
   - Biome para linting
   - Vitest + React Testing Library
   - Lucide React para ícones
   - Framer Motion para animações fluidas
   - Sistema de i18n customizado

2. **Timer funcional:**

   - Estados: idle → inspection → running → stopped
   - Controle via Space bar (segurar/soltar/pressionar)
   - Contador de inspeção de 15s com avisos visuais
   - Aplicação automática de penalidades por tempo de inspeção
   - Ícones e animações para feedback visual
   - Animações suaves entre estados

3. **Gerador de scrambles:**

   - Scrambles 3×3 válidos (25 movimentos)
   - Sem repetição de faces consecutivas
   - Testes completos passando
   - Animação ao gerar novo scramble
   - Tooltip educativo explicando notação e execução do embaralhamento para iniciantes

4. **Componentes UI (Mobile-First):**

   - TimerDisplay (responsivo, animado, com ícones)
   - ScrambleBox (adaptativo mobile/desktop, feedback ao copiar)
   - InspectionDisplay (animações de pulse, avisos visuais)
   - StatCard (HomePage) - hover effects, animações scale
   - Toast (responsivo, animação slide-in)

5. **Sistema de animações:**

   - Variantes reutilizáveis (fadeIn, slideUp, slideDown, scale, etc.)
   - AnimatePresence para transições suaves
   - Micro-interações (whileHover, whileTap)
   - Animações baseadas em estado

6. **Design Mobile-First:**

   - Breakpoints responsivos (sm, md, lg)
   - Touch-friendly (botões maiores em mobile)
   - Tipografia escalável
   - Layout adaptativo
   - Performance otimizada para mobile

7. **Sistema de penalidades:**

   - Atalhos P e D para alternar +2 e DNF
   - Salvamento automático de solves
   - Cálculo de effectiveMs considerando penalidades

8. **Internacionalização:**

   - Sistema i18n completo
   - Traduções em pt-BR
   - Hook useTranslation para fácil acesso
   - Store dedicada para gerenciar idioma

9. **Atalhos de teclado:**

   - Space: iniciar/parar timer
   - N: novo scramble
   - P: toggle +2
   - D: toggle DNF

10. **PWA (Progressive Web App):**

    - Instalável em dispositivos móveis
    - Funciona offline com Service Worker
    - Cache de assets para performance
    - Notificação de atualizações disponíveis
    - Ícones e manifest configurados

11. **Sistema de Estatísticas (Fase 2):**
    - Cálculo de **Single** (melhor tempo)
    - Cálculo de **ao5** (average of 5)
    - Cálculo de **ao12** (average of 12)
    - Cálculo de **Best ao5** (melhor ao5 entre todas janelas)
    - Cálculo de **Best ao12** (melhor ao12 entre todas janelas)
    - Regras de DNF: 2+ DNFs na janela → média DNF
    - Descarte de melhor e pior tempo na janela
    - Penalidades +2 consideradas no cálculo
    - 20 testes abrangentes cobrindo todos os cenários
    - Interface com 5 cards de estatísticas animados

### Antes da Fase 3 - Melhorias necessárias:

- **Fase 2.5: Gerenciamento e Educação** ✅
  - [x] Botão para limpar todos os solves da sessão atual (com confirmação)
  - [x] Modal/tooltip explicativo sobre as estatísticas para iniciantes:
    - O que é **Single** (melhor tempo individual)
    - O que é **ao5** (média de 5, descarta melhor e pior)
    - O que é **ao12** (média de 12, descarta melhor e pior)
    - Como funcionam as regras de DNF (2+ DNFs = média DNF)
    - Como funcionam as penalidades +2
    - Botão de ajuda "?" na seção de estatísticas
  - [x] Confirmação antes de limpar dados (modal danger)
  - [x] Feedback visual após limpar (toast de sucesso)
  - [x] Componentes reutilizáveis (ConfirmDialog, StatsInfoModal)

12. **Tabela de Histórico (Fase 3):** ✅

    - Componente **SolveTable** responsivo
    - Colunas: #, Tempo, Scramble, Data, Penalidade, Ações
    - **Filtros**: Todos, Últimos 5/12/50/100
    - Botão de deletar por solve individual
    - **Modal de detalhes** (SolveDetailsModal):
      - Tempo completo com penalidade
      - Scramble copiável
      - Data completa formatada
      - Informações de penalidade com cores
    - Design responsivo (mobile hide scramble, tablet hide date)
    - Animações com Framer Motion
    - Estado vazio tratado

13. **Sistema de Sessões (Fase 4):** ✅
    - Componente **SessionSwitcher** no header
    - Dropdown com lista de todas as sessões
    - Indicador visual da sessão ativa
    - Contagem de solves por sessão
    - **Modal SessionManager** completo:
      - Criar novas sessões com nome personalizado
      - Renomear sessões existentes (modo inline edit)
      - Deletar sessões com confirmação
      - Proteção contra deletar a última sessão
      - Trocar sessão ativa com um clique
    - **Persistência no Zustand Store:**
      - Múltiplas sessões em localStorage
      - Cada sessão independente (solves e stats)
      - Sessão ativa preservada entre reloads
    - **Feedback visual:**
      - Toasts de sucesso para criar/renomear/deletar
      - Toast de erro ao tentar deletar última sessão
      - Animações suaves em modais e transições
    - **Integração completa:**
      - Estatísticas atualizam ao trocar sessão
      - Tabela de solves reflete sessão ativa
      - Atalhos bloqueados quando modal aberto

14. **Internacionalização (Fase 4.5):** ✅
    - **Sistema i18n completo** com 3 idiomas:
      - Português (pt-BR) - padrão
      - English (en-US)
      - Español (es-ES)
    - **Arquivos de tradução organizados:**
      - `/src/i18n/locales/pt-BR.ts`
      - `/src/i18n/locales/en-US.ts`
      - `/src/i18n/locales/es-ES.ts`
      - Barrel export em `/src/i18n/locales/index.ts`
    - **LanguageSelector** no header:
      - Dropdown com bandeiras e nomes dos idiomas
      - Indicador visual do idioma ativo (✓)
      - Responsivo (flag apenas em mobile, flag + nome em desktop)
    - **Traduções completas** para todas as seções:
      - App (título, tagline)
      - Timer e inspeção
      - Scramble
      - Estatísticas (incluindo modal de ajuda)
      - Sessões
      - Tabela de solves
      - Atalhos de teclado
      - Penalidades
      - Ações genéricas
    - **Componentes compartilhados para dropdowns:**
      - `HeaderDropdownButton` - botão padrão para dropdowns
      - `HeaderDropdownMenu` - menu dropdown com backdrop e animações
      - Usado por `LanguageSelector` e `SessionSwitcher`
    - **Mobile-first design:**
      - Header responsivo (stack em mobile, 3 colunas em desktop)
      - Dropdowns adaptados para touch
      - Animações suaves (slideDown, chevron rotation)
    - **Persistência:** Idioma salvo em `localStorage` via `i18nStore`

15. **Configurações e Export/Import (Fase 5):** ✅
    - **Modal de Configurações** (SettingsModal):
      - Duração da inspeção (slider 5-30s, padrão 15s)
      - Sons habilitados (toggle on/off)
      - Penalidade automática de inspeção (toggle on/off)
        - +2 entre 15-17s
        - DNF após 17s
        - Segue regras oficiais da WCA
      - Tema (dark padrão, light coming soon)
    - **Botão Settings no header:**
      - Ícone de engrenagem
      - Integrado ao lado do LanguageSelector
      - Responsivo (ícone em mobile, ícone + texto em desktop)
    - **Export/Import JSON:**
      - **Exportar Sessão Atual:** baixa JSON com sessão ativa
      - **Exportar Todas as Sessões:** baixa JSON com todas as sessões
      - **Importar Sessões:** upload de arquivo JSON
        - Modo **Merge:** adiciona às sessões existentes
        - Modo **Replace:** substitui todas as sessões
      - **Validação completa:**
        - Verifica estrutura do JSON
        - Valida campos obrigatórios (id, name, solves)
        - Retorna erro descritivo se inválido
      - **Feedback visual:**
        - Mensagens de sucesso (verde) e erro (vermelho)
        - Animação de entrada/saída
        - Auto-dismiss após 3-5s
    - **Traduções completas** para settings e export/import
    - **Integração com settingsStore:**
      - Persistência automática em localStorage
      - Atualizações em tempo real
      - Controles responsivos e acessíveis

16. **Sistema de Sons (Fase 5.1):** ✅
    - **Utilitário de sons** (`/src/utils/sounds.ts`):
      - Geração de beeps via Web Audio API
      - Sons sintetizados (sem arquivos externos)
      - Compatibilidade com navegadores (AudioContext + webkitAudioContext)
    - **Eventos sonoros implementados:**
      - **Timer Ready:** som suave ao segurar espaço (pronto para começar)
      - **Timer Start:** beep baixo ao iniciar cronômetro
      - **Timer Stop:** beep de confirmação ao parar
      - **Inspection Warning:** beep suave aos 15s (fim do tempo de inspeção)
      - **Inspection Critical:** beep duplo urgente aos 17s (penalidade DNF iminente)
      - **Success:** beep duplo ascendente (copiar scramble, ações bem-sucedidas)
      - **Error:** beep grave (feedback de erro)
    - **Integração com settings:**
      - Toggle de sons em SettingsModal
      - Verificação `shouldPlaySound()` antes de reproduzir
      - Sons só tocam se `soundsEnabled === true`
    - **Locais de reprodução:**
      - `useTimer`: ready, start, stop, inspection warnings
      - `useScrambleBox`: success ao copiar scramble
      - Preparado para futuras ações (delete, save, etc.)
    - **Performance:**
      - Sons sintetizados (leves, sem download)
      - Lazy initialization do AudioContext
      - Tratamento de erros silencioso (console.warn)

17. **Guia de Embaralhamento para Iniciantes (Fase 5.2):** ✅
    - **Modal ScrambleGuideModal:**
      - 4 seções educativas: Faces, Modificadores, Exemplos, Dicas
      - Design visual com cores específicas por face (R=vermelho, L=laranja, U=branco, D=amarelo, F=verde, B=azul)
      - Animações suaves (AnimatePresence, Framer Motion)
      - Responsivo (mobile-first, scroll interno)
      - Acessível (Escape para fechar, keyboard navigation)
    - **Integração no ScrambleBox:**
      - Botão de ajuda (?) ao lado do título "Embaralhamento"
      - Ícone HelpCircle com hover azul
      - Hook `useScrambleGuideModal` para controle de estado
    - **Traduções completas em 3 idiomas:**
      - `scramble.guide`: "Como ler o embaralhamento"
      - `scramble.guideModal.title`: "Guia de Embaralhamento"
      - **Faces**: Descrições detalhadas (R/L/U/D/F/B) com orientação espacial
      - **Modificadores**: explicação clara das rotações (nenhum = 90° horário, ' = anti-horário, 2 = 180°)
      - **Exemplos**: casos práticos (R, R', R2, sequência completa)
      - **Dicas**: 4 recomendações chave (ordem, orientação, prática, padrão WCA de 25 movimentos)
    - **Componentes criados:**
      - `/src/components/scrambleGuideModal/ScrambleGuideModal.tsx`
      - `/src/components/scrambleGuideModal/useScrambleGuideModal.ts`
      - Barrel export em `index.ts`

18. **Tema Claro (Fase 6):** ✅
    - **Sistema de temas completo:**
      - CSS variables para dark e light themes em `/src/styles/index.css`
      - Cores semânticas definidas (background, surface, text, borders)
      - Transições suaves entre temas (0.2s ease)
    - **Hook useTheme:**
      - Controle centralizado de tema em `/src/hooks/useTheme.ts`
      - Aplica classe 'light' ou 'dark' no elemento raiz
      - Métodos: toggleTheme, isDark, isLight
      - Integrado com settingsStore para persistência
    - **Toggle de tema no SettingsModal:**
      - Botão animado com ícones Sun (claro) / Moon (escuro)

19. **Biblioteca de UI Reutilizável (Fase 6.1):** ✅
    - **Componente base `Button`:** variantes `primary`, `secondary`, `ghost`, `danger`, `success`, `warning` e tamanhos `sm`, `md`, `lg`, `icon`, com helper interno `cn` e tipo forte `ButtonProps`.
    - **Migração total dos botões:** substituição de todos os `<button>` da aplicação por `Button` (modais, dropdowns, toasts, histórico, home, tutorial, configurações), preservando comportamentos especiais via `className`.
    - **Compatibilidade com casos específicos:** toggles deslizantes, botões ícone-only, abas com borda customizada e estados desativados.
    - **Card reutilizável:** componente `Card` com variantes (`surface`, `background`, `overlay`) e espaçamentos configuráveis, aplicado em Settings, Advanced Stats e Solve Details para unificar bordas, preenchimento e cores de superfície.
    - **Refatoração de contêineres:** remoção de duplicação de classes utilitárias em painéis de configurações, métricas avançadas e modal de solves, migrando para `Card`.
    - **Export centralizado:** `src/components/ui/index.ts` agrega componentes reutilizáveis.
    - **Build validado:** `pnpm build` executado com sucesso após a migração.

19. **Estatísticas Avançadas (Fase 7):** ✅
    - **Métricas avançadas** (`/src/features/stats/advanced.ts`):
      - **Rolling Averages:** Cálculo de ao5 e ao12 para cada solve (janelas deslizantes)
      - **Desvio Padrão:** Mede variação dos tempos (quanto menor, mais consistente)
      - **Coeficiente de Variação (CV):** Métrica relativa de consistência (%)
        - Excelente: < 10% | Bom: 10-15% | Médio: 15-20% | Precisa melhorar: > 20%
      - **TPS Médio:** Turns Per Second - velocidade média de execução (baseado em 25 movimentos)
      - **Distribuição de Tempos:** Histograma com 10 faixas de tempo
    - **Modal AdvancedStatsModal** com 3 tabs:
      - **Evolução:** Gráfico de linha (recharts) com Single, ao5, ao12 ao longo do tempo
      - **Consistência:** Cards com desvio padrão, CV e interpretação visual
      - **Performance:** TPS médio e histograma de distribuição de tempos
    - **Componentes de gráficos:**
      - `EvolutionChart`: LineChart responsivo com 3 linhas (Single, ao5, ao12)
      - `DistributionChart`: BarChart responsivo mostrando distribuição por faixas
      - Tema-aware (cores adaptadas para dark/light)
      - Tooltips informativos e legendas traduzidas
    - **Botão de acesso:**
      - Ícone TrendingUp no header ao lado de Settings
      - Cor primária para destacar (bg-primary/10, border-primary/50)
      - Responsivo (ícone em mobile, ícone + texto em desktop)
    - **Traduções completas:**
      - 3 idiomas (pt-BR, en-US, es-ES)
      - Seção `advancedStats` com tabs, métricas, descrições, interpretações
      - Tooltips educativos sobre cada métrica
    - **Performance:**
      - Recharts integrado (~746 KB total, gzip: ~223 KB)
      - Cálculos memoizados (useMemo) para evitar recalculações
      - Lazy rendering de gráficos (apenas tab ativa)
    - **Validações:**
      - Estado vazio tratado (mensagem + dica: "Execute ao menos 12 solves")
      - Gráficos só aparecem com dados suficientes (≥ 5 solves)

20. **Modo de Treino por Casos (Fase 8):** ✅
    - **Página dedicada `/training`:** acessível via navegação com ícone Dumbbell e header `Training Mode`.
    - **Coleções focadas:** categorias PLL, OLL e F2L, cada uma com descrição traduzida e três casos representativos.
    - **Cards de casos reutilizando `Card`:** título, descrição, dica contextual, lista de algoritmos com botão de copiar e feedback visual.
    - **Progresso persistido (`useTrainingStore`):** repetições, meta numérica, status (Aprendendo → Ajustando → Automático) e notas rápidas, salvos em `localStorage`.
    - **Ferramentas de treino:** botões de incremento (+1/+5/+10), barra de progresso contra meta, alerta quando meta atingida, reset individual.
    - **Traduções:** labels, descrições de categorias, dicas e textos de ação em pt-BR, en-US e es-ES com placeholders parametrizados para progresso.

20. **Onboarding Interativo (Fase 8):** ✅
    - **Sistema completo de onboarding em 7 passos:**
      - **Welcome:** Boas-vindas e introdução ao app
      - **Scramble:** Explica o embaralhamento e como gerar novos
      - **Timer:** Como usar o cronômetro (barra de espaço)
      - **Stats:** Entendendo as estatísticas (Single, ao5, ao12)
      - **Shortcuts:** Atalhos de teclado disponíveis
      - **Sessions:** Sistema de sessões e gerenciamento
      - **Complete:** Conclusão com opção de revisitar o tour
    - **Arquitetura e componentes:**
      - **onboardingStore.ts:** Estado global com Zustand + persist
        - isActive, currentStep, hasCompletedOnboarding
        - Métodos: startOnboarding, nextStep, previousStep, skipOnboarding, completeOnboarding
      - **config.ts:** Configuração de cada passo (seletores CSS, posição do tooltip, permissões)
      - **Spotlight.tsx:** Componente de backdrop com highlight radial
        - Posicionamento dinâmico com getBoundingClientRect
        - Borda colorida (primary) ao redor do elemento target
        - Escuta resize/scroll para atualização em tempo real
        - z-index 9998/9999 para overlay
      - **OnboardingTooltip.tsx:** Tooltip com conteúdo e navegação
        - Posicionamento inteligente (top/bottom/left/right)
        - Progress indicator (Passo X de Y)
        - Botões: Previous, Next, Finish (com ícones Lucide)
        - Close button (X) quando permitido
        - z-index 10000 (acima do spotlight)
      - **Onboarding.tsx:** Container que orquestra Spotlight + Tooltip
        - AnimatePresence para transições suaves
    - **Integração no App.tsx:**
      - **data-onboarding attributes** nos elementos-alvo:
        - `data-onboarding="scramble"` - ScrambleBox
        - `data-onboarding="timer"` - TimerDisplay
        - `data-onboarding="stats"` - Cards de estatísticas
        - `data-onboarding="shortcuts"` - Seção de atalhos
        - `data-onboarding="sessions"` - SessionSwitcher
      - **Trigger automático:** Inicia onboarding para novos usuários (hasCompletedOnboarding = false)
      - **Botão "Tour"** no header:
        - Ícone Compass para reiniciar onboarding manualmente
        - Visível sempre para revisitar o tour
        - Responsivo (ícone em mobile, ícone + texto em desktop)
    - **Traduções completas em 3 idiomas:**
      - Seção `onboarding` em pt-BR, en-US, es-ES
      - Todos os 7 passos traduzidos (title + description)
      - Navegação (skip, previous, next, finish)
      - Progress template traduzido
    - **UX e animações:**
      - Backdrop com radial gradient suave
      - Animações com Framer Motion (slideDown, fadeIn)
      - Highlight colorido ao redor do elemento target
      - Tooltips centralizados (welcome/complete) ou posicionados (outros passos)
      - Responsivo e adaptado para mobile/desktop
    - **Persistência:**
      - Estado salvo em localStorage via Zustand persist
      - hasCompletedOnboarding preservado entre sessões
      - Usuário pode pular ou completar onboarding a qualquer momento
    - **Performance:**
      - Build: ~757 KB (gzip: ~227 KB)
      - Lazy rendering (apenas quando isActive = true)
      - Event listeners limpos no unmount

21. **Tutorial para Principiantes (Fase 9):** ✅
    - **Sistema completo de tutorial layer-by-layer:**
      - **Intro:** Boas-vindas ao método camada por camada
      - **Passo 1 - Cruz Branca:** Resolver 4 aristas brancas
      - **Passo 2 - Esquinas Brancas:** Completar primeira camada (algoritmo R U R')
      - **Passo 3 - Segunda Camada:** 4 aristas da camada média (algoritmos esq/dir)
      - **Passo 4 - Cruz Amarela:** Formar cruz na última camada (F R U R' U' F')
      - **Passo 5 - Alinhar Aristas Amarelas:** Alinhar cruz com centros
      - **Passo 6 - Posicionar Esquinas:** Colocar esquinas nas posições corretas
      - **Passo 7 - Resolver Cubo:** Orientar últimas esquinas e finalizar! 🎉
    - **Componentes criados:**
      - **tutorialStore.ts:** Estado global com Zustand
        - isOpen, currentStep (intro → solveCorners)
        - Métodos: openTutorial, closeTutorial, nextStep, previousStep, goToStep
        - 8 passos no total (intro + 7 etapas de resolução)
      - **TutorialModal.tsx:** Modal com navegação entre passos
        - Barra de progresso animada
        - Renderização dinâmica de conteúdo por passo
        - Botões Previous/Next com estados (primeiro/último)
        - Close button e Finish ao completar
        - Animações de transição entre passos (Framer Motion)
      - **useTutorialModal.ts:** Hook com lógica do modal
        - Cálculo de índice, progresso, estados de navegação
        - Handlers para close, next, previous
      - **TutorialStepContent:** Componente de renderização de passos
        - Exibe intro com lista de tópicos
        - Exibe passos com: título, descrição, objetivo, algoritmo, dicas
        - Suporte para múltiplos algoritmos (esquerda/direita)
        - Padrões (dot, line, L, cross)
        - Cards coloridos para alertas (importante, parabéns)
    - **Integração no App.tsx:**
      - **Botão "Tutorial"** no header (ícone BookOpen)
        - Trigger: abre modal com openTutorial()
        - Responsivo (ícone em mobile, ícone + texto em desktop)
      - **TutorialModal** renderizado condicionalmente (isOpen)
    - **Traduções completas em 3 idiomas:**
      - Seção `tutorial` em pt-BR, en-US, es-ES (~130 linhas por idioma)
      - Conteúdo educativo detalhado:
        - Intro: topics array, timeEstimate, difficulty
        - Cada passo: title, description, goal, algorithm(s), steps, tips
        - Notação: R, R', U, U', F, F', L, L', D, D', 2
      - Algoritmos traduzidos e formatados
      - Dicas e avisos específicos por passo
    - **Conteúdo educacional:**
      - **Cruz Branca:** Intuitivo, sem algoritmos
      - **Esquinas Brancas:** R U R' (repetir 1-5×)
      - **Segunda Camada:** U' L' U L U F U' F' (esquerda) | U R U' R' U' F' U F (direita)
      - **Cruz Amarilla:** F R U R' U' F' (padrões: ponto, linha, L, cruz)
      - **Alinhar Aristas:** R U R' U R U2 R'
      - **Posicionar Esquinas:** U R U' L' U R' U' L
      - **Resolver Cubo:** R' D' R D (2-4× por esquina, girar apenas U entre esquinas)
    - **UX e design:**
      - Modal responsivo (max-w-2xl, max-h-90vh)
      - Scroll interno para conteúdo longo
      - Cards visuais com cores (objetivo=azul, dica=verde, importante=vermelho)
      - Algoritmos em `<code>` com font-mono
      - Barra de progresso animada no topo
      - Footer com navegação clara (Ant./Próx. em mobile)
    - **Performance:**
      - Build: ~765 KB (gzip: ~230 KB)
      - Lazy rendering (modal apenas quando isOpen)
      - AnimatePresence com mode="wait" para transições suaves
    - **Validação de visualizações:**
      - **whiteCross:** Corrigida para mostrar 4 centros laterais (R, F, L, B)
      - **yellowCross:** Corrigida progressão Ponto → Linha → L → Cruz (padrões válidos do cubo)
      - Todas as faces e algoritmos validados conforme regras do método de camadas

22. **Routing & Estrutura de Páginas (Fase 10):** ✅
    - **React Router DOM integrado:**
      - Navegação client-side entre páginas
      - URLs descritivas e limpas
      - BrowserRouter com routes aninhadas
    - **Estrutura de Pastas:**
      - **/src/pages/**: Páginas principais
        - `HomePage.tsx` - Timer, scramble, stats resumidas
        - `HistoryPage.tsx` - Tabela completa de solves
        - `StatsPage.tsx` - Dashboard de estatísticas avançadas
        - `TutorialPage.tsx` - Tutorial completo layer-by-layer
        - `SettingsPage.tsx` - Configurações do app
      - **/src/layouts/**: Layouts compartilhados
        - `MainLayout.tsx` - Header + navegação + Outlet para pages
      - **/src/components/navigation/**: Componentes de navegação
        - `Navbar.tsx` - Navegação desktop (links horizontais)
        - `MobileNav.tsx` - Menu hamburger para mobile (drawer lateral)
    - **Sistema de Navegação:**
      - **Navbar (Desktop):**
        - Links: Início, Histórico, Estatísticas, Tutorial, Configurações
        - Estilo NavLink com estado ativo (bg-primary quando ativo)
        - Ícones Lucide (Home, History, TrendingUp, BookOpen, Settings)
        - Oculto em mobile (hidden md:flex)
      - **MobileNav (Mobile):**
        - Botão hamburger (Menu/X icon)
        - Drawer lateral com animação (Framer Motion)
        - Backdrop com overlay escuro
        - Auto-close ao clicar em link
        - Visible apenas em mobile (md:hidden)
    - **MainLayout:**
      - Header sticky com navegação
      - Logo + título do app
      - LanguageSelector integrado
      - Container responsivo para conteúdo (Outlet)
      - Componentes globais (Onboarding, PWAUpdatePrompt)
    - **Páginas Implementadas:**
      - **HomePage:** Timer funcional, scramble, stats cards, atalhos
      - **HistoryPage:** SolveTable com filtros e ações
      - **StatsPage:** AdvancedStatsModal com gráficos
      - **TutorialPage:** Sistema de tutorial completo
      - **SettingsPage:** Configurações do aplicativo
    - **Traduções:**
      - Seção `navigation` em 3 idiomas (pt-BR, en-US, es-ES)
      - Labels: home, history, stats, training, tutorial, settings
    - **Performance:**
      - Build: ~816 KB (gzip: ~245 KB)
      - React Router adiciona ~21 KB ao bundle
      - Code splitting preparado para futuras otimizações
    - **Benefícios:**
      - ✅ **Organização:** Cada feature em página dedicada
      - ✅ **UX:** Navegação clara e URLs descritivas
      - ✅ **Manutenibilidade:** Código modular e desacoplado
      - ✅ **Escalabilidade:** Fácil adicionar novas páginas
      - ✅ **Mobile-first:** Menu hamburger responsivo

### Próximas fases

- **Biblioteca de UI compartilhada:** consolidar padrões (botões, chips, toggles, modais-base) em `src/components/ui/*`, padronizando tokens, estados de foco e níveis de elevação para acelerar novas telas.
- **Sincronização opcional:** investigar integração com armazenamento na nuvem (ex.: Supabase) mantendo local-first, incluindo merge de sessões e autenticação leve.

---

# 11) Notas de Implementação

- Priorize rótulos e mensagens **em pt-BR**.
- **Comentários**: mínimo possível, apenas quando absolutamente necessário para explicar lógica complexa ou não-óbvia. Sempre em **inglês**.
- Trate key repeat da barra de espaço.
- Bloqueie atalhos enquanto um modal/entrada de texto estiver focado.

---

# 12) Regras de Código e Arquitetura

## Separação de Responsabilidades

### Componentes vs Hooks Customizados

**SEMPRE separe lógica de apresentação:**

- ✅ **Componentes (.tsx)**: Foco exclusivo em renderização e UI
  - Estrutura JSX/TSX
  - Estilização (classes Tailwind)
  - Animações (Framer Motion)
  - Event handlers simples (onClick, onChange)
- ✅ **Hooks customizados (.ts)**: Toda a lógica de negócio
  - Estado local (useState, useReducer)
  - Efeitos colaterais (useEffect)
  - Cálculos e transformações de dados
  - Integrações com APIs/stores
  - Callbacks complexos

**Exemplo prático:**

```tsx
// ❌ ERRADO: Lógica misturada no componente
export function MyModal({ data }) {
  const [copied, setCopied] = useState(false);

  const formatDate = (iso) => {
    /* ... */
  };
  const getPenalty = () => {
    /* ... */
  };
  const copyText = () => {
    /* ... */
  };

  return <div>{/* JSX */}</div>;
}

// ✅ CORRETO: Lógica extraída para hook
// hooks/useMyModal.ts
export function useMyModal(data) {
  const [copied, setCopied] = useState(false);

  const formatDate = useCallback((iso) => {
    /* ... */
  }, []);
  const getPenalty = useCallback(() => {
    /* ... */
  }, [data]);
  const copyText = useCallback(() => {
    /* ... */
  }, [data]);

  return { copied, formatDate, getPenalty, copyText };
}

// components/MyModal.tsx
export function MyModal({ data }) {
  const { copied, formatDate, getPenalty, copyText } = useMyModal(data);

  return <div>{/* JSX limpo */}</div>;
}
```

## Nomenclatura de Hooks

- **Padrão**: `use[ComponentName][Responsibility].ts`
- Exemplos:
  - `useSolveDetailsModal.ts` - Lógica do SolveDetailsModal
  - `useSessionManager.ts` - Lógica do SessionManager
  - `useTimerControls.ts` - Controles do timer

## Organização de Pastas

### Estrutura de Componentes com Collocation

**SEMPRE organize componentes complexos em pastas próprias:**

```
/src
  /components
    /solveDetailsModal          # Componente com pasta própria
      ├── SolveDetailsModal.tsx # Componente de UI
      ├── useSolveDetailsModal.ts # Lógica/hook
      └── index.ts              # Export barrel
    /sessionManager
      ├── SessionManager.tsx
      ├── useSessionManager.ts
      └── index.ts
    TimerDisplay.tsx            # Componentes simples ficam na raiz
    ScrambleBox.tsx
    Logo.tsx
  /hooks                        # Apenas hooks genéricos/compartilhados
  /features                     # Lógica de domínio específica
  /stores                       # Estado global (Zustand)
  /utils                        # Funções utilitárias puras
```

### Critérios para Criar Pasta de Componente

Crie uma pasta quando o componente tiver:

1. **Hook customizado associado** (lógica complexa)
2. **Múltiplos arquivos relacionados** (types, utils, hooks)
3. **Sub-componentes** usados apenas por ele
4. **Testes específicos** do componente

### Estrutura de Pasta de Componente

```
/componentName
  ├── ComponentName.tsx       # Componente principal
  ├── useComponentName.ts     # Hook customizado (se necessário)
  ├── ComponentName.types.ts  # Types específicos (opcional)
  ├── ComponentName.utils.ts  # Utilitários (opcional)
  ├── SubComponent.tsx        # Sub-componentes (opcional)
  └── index.ts                # Export barrel (sempre)
```

### Export Barrel Pattern

**SEMPRE crie um `index.ts` para facilitar imports:**

```typescript
// index.ts
export { ComponentName } from "./ComponentName";
export { useComponentName } from "./useComponentName";
export type { ComponentNameProps } from "./ComponentName.types";
```

**Benefícios:**

- Imports limpos: `import { Component } from './components/component'`
- Flexibilidade: Trocar implementação sem mudar imports
- Encapsulamento: Controle sobre o que é exportado

## Quando Criar um Hook Customizado

Crie um hook customizado quando o componente tiver:

1. **Múltiplas funções auxiliares** (formatters, calculators, validators)
2. **Estado local complexo** (mais de 2-3 useState)
3. **Lógica de efeitos colaterais** (useEffect, timers, subscriptions)
4. **Cálculos derivados** que dependem de props/state
5. **Integrações com stores/APIs** além de simples leitura

## Benefícios

- ✅ **Testabilidade**: Hooks podem ser testados isoladamente
- ✅ **Reutilização**: Lógica pode ser compartilhada entre componentes
- ✅ **Legibilidade**: Componentes focam em estrutura visual
- ✅ **Manutenibilidade**: Mudanças de lógica não afetam UI
- ✅ **Performance**: Memoização adequada com useCallback/useMemo

---

# 13) Comandos (esperado no README)

```
pnpm i
pnpm dev
pnpm test
pnpm build
```
