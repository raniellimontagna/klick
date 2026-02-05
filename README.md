# Klick

**Tagline:** gire, clique, evolua.

## 🎯 Características

- ⏱️ **Timer funcional** com suporte a inspeção de 15 segundos
- 🔄 **Scrambles 3×3 válidos** gerados automaticamente (25 movimentos)
- ⌨️ **Controle por teclado** com atalhos intuitivos
- 📊 **Estatísticas completas** (Single, ao5, ao12, best ao5, best ao12)
- � **Estatísticas avançadas** - Gráficos de evolução, consistência e performance
- �💾 **Persistência automática** em localStorage
- 📁 **Sistema de sessões** - Organize seus solves em múltiplas sessões
- 🎨 **Tema claro e escuro** - Alterne entre temas com um clique
- 🌐 **Suporte a 3 idiomas** - pt-BR, en-US, es-ES
- 🎵 **Sistema de sons** - Feedback sonoro para eventos do timer
- 📚 **Guia para iniciantes** - Aprenda a ler scrambles de cubo mágico
- 📤 **Exportar/Importar** - Backup e migração de dados em JSON
- � **Onboarding interativo** - Tour guiado em 7 passos para novos usuários
- �🎯 **Ícones modernos** com Solar Icons
- ✨ **Animações fluidas** com Framer Motion
- 📱 **PWA** - Instalável e funciona offline
- ♿ **Interface moderna** com alto contraste e acessibilidade

## 🚀 Como executar

### Pré-requisitos

- Node.js 18+
- pnpm 8+

### Instalação e execução

```bash
# Instalar dependências
pnpm i

# Iniciar servidor de desenvolvimento
pnpm dev

# Build para produção
pnpm build

# Preview da build de produção
pnpm preview

# Executar testes
pnpm test
```

## 📱 PWA (Progressive Web App)

O Klick é um Progressive Web App completo, permitindo:

- **Instalação**: Clique em "Instalar" no navegador ou use o menu "Adicionar à tela inicial" no mobile
- **Offline**: Funciona mesmo sem conexão com internet após o primeiro acesso
- **Atualizações**: Notificação automática quando uma nova versão está disponível
- **Performance**: Assets em cache para carregamento instantâneo

### Como instalar no celular

1. Acesse o Klick pelo navegador (Chrome/Safari)
2. No **Android**: Toque no menu (⋮) → "Instalar app" ou "Adicionar à tela inicial"
3. No **iOS**: Toque no ícone de compartilhar → "Adicionar à Tela de Início"
4. O app abrirá em tela cheia, como um app nativo!

## ⚡ Performance

### Otimizações de Bundle

O Klick utiliza **code splitting** e **lazy loading** para otimizar o carregamento:

- **Main bundle:** 135 KB (gzipped: 40 KB) - ~70% menor que a versão inicial
- **Route chunks:** 6-16 KB cada - carregados sob demanda
- **Vendor chunks:** Bibliotecas grandes isoladas para melhor caching

**Benefícios:**
- ✅ Carregamento inicial ~40% mais rápido
- ✅ Vendor chunks em cache separado (não re-baixam em updates)
- ✅ Rotas carregadas apenas quando necessário

Para detalhes técnicos completos, veja [docs/performance.md](./docs/performance.md).

## 🎮 Como usar

### Controles básicos

- **ESPAÇO**: Segurar para armar → soltar inicia inspeção → pressionar inicia/para o timer
- **N**: Gerar novo scramble
- **P**: Alternar penalidade +2 no último solve
- **D**: Alternar DNF no último solve

### Sessões

- Organize seus solves em **múltiplas sessões** independentes
- Cada sessão mantém suas próprias estatísticas e histórico
- Use o dropdown no header para:
  - **Trocar entre sessões** com um clique
  - **Criar novas sessões** com nomes personalizados
  - **Renomear sessões** existentes
  - **Deletar sessões** (com proteção para última sessão)

### Configurações

Acesse o menu de **Configurações** (⚙️) no header para personalizar:

- **Duração da inspeção**: 5 a 30 segundos (padrão: 15s)
- **Sons**: Ativar/desativar feedback sonoro
- **Penalidade automática**: +2 entre 15-17s, DNF após 17s (regras WCA)
- **Tema**: Alternar entre claro ☀️ e escuro 🌙
- **Exportar/Importar**:
  - Exportar sessão atual ou todas as sessões em JSON
  - Importar sessões com opção de mesclar ou substituir dados

### Idiomas

Selecione seu idioma preferido no dropdown do header:
- 🇧🇷 Português (pt-BR)
- 🇺🇸 English (en-US)
- 🇪🇸 Español (es-ES)

### Guia de Embaralhamento

Novo no speedcubing? Clique no ícone **?** ao lado do scramble para aprender:
- O que significam as letras (R, L, U, D, F, B)
- Como funcionam os modificadores (', 2)
- Exemplos práticos de movimentos
- Dicas importantes para iniciantes

### Onboarding Interativo

Na primeira visita ao Klick, você será guiado por um **tour interativo em 7 passos**:

1. **Boas-vindas**: Introdução ao app e sua filosofia
2. **Embaralhamento**: Como gerar e entender scrambles 3×3
3. **Cronômetro**: Como usar o timer (barra de espaço)
4. **Estatísticas**: Entenda Single, ao5, ao12 e suas métricas
5. **Atalhos**: Aprenda os comandos de teclado disponíveis
6. **Sessões**: Organize seus solves em múltiplas sessões
7. **Conclusão**: Finalização com opção de revisitar o tour

**Recursos:**
- ✨ **Spotlight visual**: Destaque dos elementos na tela
- 💬 **Tooltips explicativos**: Informações contextuais em cada passo
- ⏭️ **Navegação flexível**: Avançar, voltar ou pular o tour
- 🔄 **Revisitar a qualquer momento**: Botão "Tour" (🧭) no header
- 🌐 **Traduzido**: Disponível em pt-BR, en-US, es-ES
- 💾 **Persistente**: Progresso salvo automaticamente

**Como usar:**
- **Primeira visita**: Tour inicia automaticamente após 1 segundo
- **Revisitar**: Clique no botão "Tour" (🧭) no header a qualquer momento
- **Pular**: Clique no X ou em "Pular" durante o tour
- **Navegar**: Use os botões "Anterior" e "Próximo" para controlar o ritmo

Perfeito para iniciantes que nunca usaram um cronômetro de cubo mágico!

### Estatísticas Avançadas

Clique no botão **Estatísticas Avançadas** (📈) no header para acessar:

**Tab Evolução:**
- Gráfico de linha mostrando progressão de Single, ao5 e ao12 ao longo do tempo
- Visualize sua melhora em cada sessão

**Tab Consistência:**
- **Desvio Padrão**: Mede a variação dos seus tempos (quanto menor, mais consistente)
- **Coeficiente de Variação (CV)**: Métrica relativa de consistência
  - Excelente: < 10%
  - Bom: 10-15%
  - Médio: 15-20%
  - Precisa melhorar: > 20%

**Tab Performance:**
- **TPS Médio**: Turns Per Second - velocidade média de execução de movimentos
- **Distribuição de Tempos**: Histograma mostrando como seus solves estão distribuídos por faixas de tempo

### Fluxo de uso

1. Ao abrir a aplicação, um scramble 3×3 é gerado automaticamente
2. Pressione e segure **ESPAÇO** para começar
3. Solte **ESPAÇO** para iniciar a **inspeção de 15 segundos**
4. Durante a inspeção, pressione **ESPAÇO** para iniciar o cronômetro
5. Resolva o cubo
6. Pressione **ESPAÇO** novamente para parar o timer
7. O solve é salvo automaticamente e um novo scramble é gerado

### Inspeção

- **0-15s**: Válido
- **15-17s**: +2 automático (se habilitado nas configurações)
- **>17s**: DNF automático (se habilitado nas configurações)

## 🏗️ Stack Tecnológica

- **React** 19 + **TypeScript**
- **Vite** (build tool ultrarrápido)
- **Tailwind CSS v4** (estilização com CSS nativo e CSS variables)
- **Zustand** (gerenciamento de estado com persistência)
- **Solar Icons** (biblioteca de ícones moderna)
- **Framer Motion** (animações fluidas e performáticas)
- **Recharts** (gráficos responsivos e customizáveis)
- **Web Audio API** (sistema de sons sintetizados)
- **Biome** (linter e formatter rápido)
- **Vitest** + **React Testing Library** (testes unitários)
- **Sistema de i18n** customizado com 3 idiomas
- **Vite PWA Plugin** (Progressive Web App completo)

## 📁 Estrutura do Projeto

**Arquitetura baseada em features** - Cada feature é auto-contida com seus componentes, lógica e testes:

```
src/
├── features/                      # Features completas e independentes
│   ├── home/                     # Timer principal e dashboard
│   │   ├── components/           # Componentes da feature
│   │   │   ├── timer-display/
│   │   │   ├── scramble-box/
│   │   │   ├── inspection-display/
│   │   │   ├── stat-card/
│   │   │   └── home-page-components/
│   │   ├── lib/                  # Lógica de negócio
│   │   │   ├── useTimer.ts
│   │   │   ├── scramble/
│   │   │   └── onboarding/
│   │   ├── __tests__/            # Testes da feature
│   │   ├── home.tsx              # Componente principal
│   │   └── index.ts              # Barrel export
│   │
│   ├── history/                  # Histórico de solves
│   ├── stats/                    # Estatísticas avançadas
│   ├── training/                 # Treinamento (OLL/PLL/F2L)
│   ├── settings/                 # Configurações
│   └── tutorial/                 # Tutorial para iniciantes
│
├── shared/                       # Código compartilhado entre features
│   ├── components/               # Componentes UI reutilizáveis
│   │   ├── ui/                   # Sistema de design (Button, Card, etc)
│   │   ├── navigation/           # Navbar e MobileNav
│   │   ├── logo/
│   │   ├── page-header/
│   │   ├── session-switcher/
│   │   ├── language-selector/
│   │   ├── cube-visualizer/
│   │   ├── onboarding/
│   │   └── ...
│   ├── lib/                      # Utilitários (formatters, animations, sounds)
│   ├── store/                    # Zustand stores
│   │   └── stores/
│   │       ├── sessionsStore.ts
│   │       ├── settingsStore.ts
│   │       ├── i18nStore.ts
│   │       ├── onboardingStore.ts
│   │       ├── trainingStore.ts
│   │       └── tutorialStore.ts
│   ├── config/                   # Configurações globais
│   │   └── i18n/                # Internacionalização
│   │       └── locales/
│   │           ├── pt-BR.ts
│   │           ├── en-US.ts
│   │           └── es-ES.ts
│   ├── hooks/                    # Hooks compartilhados
│   │   └── hooks/
│   │       ├── useTranslation.ts
│   │       └── useTheme.ts
│   └── index.ts                  # Barrel export principal
│
├── layouts/                      # Layouts da aplicação
│   └── MainLayout.tsx
├── AppRouter.tsx                 # Configuração de rotas
├── App.tsx                       # Componente raiz
└── main.tsx                      # Entry point
```

### Benefícios da arquitetura

- **Coesão**: Cada feature agrupa componentes, lógica e testes relacionados
- **Escalabilidade**: Adicionar features é simples - basta criar nova pasta
- **Reutilização**: `shared/` contém apenas código verdadeiramente compartilhado
- **Manutenibilidade**: Fácil localizar e modificar código de uma feature específica

## 💻 Code Standards

- **Comments**: Minimal, only when necessary to explain complex/non-obvious logic. Always in **English**.
- **Clean Code**: Self-documenting code preferred over excessive comments
- **TypeScript**: Strict mode enabled for type safety
- **Testing**: Comprehensive tests for business logic

## ✅ Status de Implementação

### ✨ Concluído

#### Core Features
- [x] Configuração base do projeto (Vite + React + TypeScript + Tailwind v4)
- [x] Gerador de scrambles 3×3 válidos (25 movimentos, sem repetição de faces)
- [x] Hook useTimer com máquina de estados (idle → inspection → running → stopped)
- [x] Sistema de penalidades (+2, DNF) com atalhos de teclado
- [x] Persistência automática em localStorage
- [x] Atalhos de teclado (Space, N, P, D)
- [x] Modo de treino por casos (PLL, OLL, F2L)
- [x] Tutorial de resolução para iniciantes

#### UI/UX
- [x] Componentes responsivos (TimerDisplay, ScrambleBox, InspectionDisplay, StatCard da Home, Toast)
- [x] Animações fluidas com Framer Motion
- [x] Design mobile-first com breakpoints responsivos
- [x] Feedback visual aprimorado (toasts, animações, transições)
- [x] **Tema claro e escuro** com toggle no Settings
- [x] Ícones modernos com Solar Icons

#### Estatísticas
- [x] Cálculo de Single, ao5, ao12, best ao5, best ao12
- [x] Cards de estatísticas animados com regras de DNF/+2
- [x] 20+ testes abrangentes para cálculo de médias
- [x] Modal educativo explicando estatísticas para iniciantes
- [x] Botão para limpar estatísticas com confirmação
- [x] **Estatísticas avançadas** com modal completo:
  - [x] Gráfico de evolução (Single, ao5, ao12 ao longo do tempo)
  - [x] Métricas de consistência (desvio padrão, coeficiente de variação)
  - [x] Análise de performance (TPS médio, distribuição de tempos)
  - [x] Recharts integrado com tema dark/light
  - [x] 3 tabs (Evolução, Consistência, Performance)

#### Histórico & Sessões
- [x] Tabela de histórico de solves com filtros (últimos 5/12/50/100 ou todos)
- [x] Modal de detalhes do solve com scramble copiável
- [x] Deletar solves individuais com confirmação
- [x] **Sistema de sessões** - criar, renomear, deletar e trocar entre sessões
- [x] Gerenciador de sessões com modal completo
- [x] Cada sessão com estatísticas e histórico independentes

#### Internacionalização
- [x] Sistema i18n customizado com 3 idiomas
- [x] 🇧🇷 Português (pt-BR) - padrão
- [x] 🇺🇸 English (en-US)
- [x] 🇪🇸 Español (es-ES)
- [x] Seletor de idioma no header com persistência

#### Configurações
- [x] Modal de configurações completo
- [x] Duração da inspeção ajustável (5-30s)
- [x] Toggle de sons (on/off)
- [x] Penalidade automática de inspeção (regras WCA)
- [x] **Exportar/Importar JSON** (sessão atual ou todas)
- [x] Modos de importação (merge/replace) com validação

#### Sistema de Sons
- [x] Web Audio API com beeps sintetizados
- [x] 7 eventos sonoros (ready, start, stop, warnings, success, error)
- [x] Compatibilidade cross-browser (AudioContext + webkitAudioContext)
- [x] Lazy initialization para performance

#### Guia para Iniciantes
- [x] **Modal de guia de embaralhamento** com 4 seções
- [x] Explicação de faces (R/L/U/D/F/B) com cores visuais
- [x] Explicação de modificadores (', 2)
- [x] Exemplos práticos e dicas
- [x] Botão de ajuda (?) no ScrambleBox
- [x] Traduzido para os 3 idiomas

#### Onboarding Interativo
- [x] **Sistema de onboarding em 7 passos** para novos usuários
- [x] Spotlight visual destacando elementos da interface
- [x] Tooltips com navegação (anterior/próximo/pular/finalizar)
- [x] Passos: Welcome → Scramble → Timer → Stats → Shortcuts → Sessions → Complete
- [x] **Botão "Tour"** (🧭) no header para revisitar
- [x] Trigger automático na primeira visita
- [x] Persistência com Zustand (hasCompletedOnboarding)
- [x] Traduzido para os 3 idiomas
- [x] Responsivo e acessível

#### PWA (Progressive Web App)
- [x] Service Worker configurado
- [x] Manifest com ícones e metadados
- [x] Funciona offline após primeiro acesso
- [x] Instalável em dispositivos móveis
- [x] Notificação de atualizações disponíveis

#### Testes
- [x] Testes do gerador de scramble
- [x] Testes de cálculo de estatísticas (20+ cenários)
- [x] Configuração Vitest + React Testing Library

### 🚧 Próximos passos
- [ ] Sincronização opcional na nuvem

## 🧪 Testes

```bash
# Executar todos os testes
pnpm test

# Executar testes em modo watch
pnpm test:watch

# Executar testes com UI
pnpm test:ui

# Executar testes com coverage
pnpm test:coverage
```

### Cobertura de testes

- ✅ Gerador de scrambles (validação de 25 movimentos, sem repetição)
- ✅ Cálculo de estatísticas (20+ cenários incluindo DNF/+2)
- ✅ Regras de descarte (melhor e pior tempo)
- ✅ Edge cases (arrays vazios, múltiplos DNFs, etc.)

## 🎨 Temas

O Klick suporta **tema claro** e **tema escuro** com:

- 🌙 **Tema Escuro** (padrão): Fundo `#0D1117`, cores suaves para os olhos
- ☀️ **Tema Claro**: Fundo branco, contraste otimizado para ambientes claros
- 🎨 **CSS Variables**: Sistema baseado em variáveis CSS para fácil customização
- ⚡ **Transições suaves**: Animações de 0.2s ao alternar temas
- 💾 **Persistência**: Preferência salva em localStorage

Alterne entre temas no menu **Configurações** (⚙️).

## 🔊 Sistema de Sons

Feedback sonoro para eventos importantes:

- 🎵 **Timer Ready**: Som suave ao segurar espaço
- ▶️ **Timer Start**: Beep ao iniciar cronômetro
- ⏹️ **Timer Stop**: Beep de confirmação ao parar
- ⚠️ **Inspection Warning**: Aviso aos 15s
- 🚨 **Inspection Critical**: Beep duplo urgente aos 17s
- ✅ **Success**: Feedback para ações bem-sucedidas
- ❌ **Error**: Feedback para erros

Ative/desative sons no menu **Configurações**.

## 📊 Sistema de Estatísticas

### Métricas calculadas

- **Single**: Melhor tempo individual
- **ao5** (Average of 5): Média dos últimos 5 solves, descartando melhor e pior
- **ao12** (Average of 12): Média dos últimos 12 solves, descartando melhor e pior
- **Best ao5**: Melhor ao5 de todas as janelas
- **Best ao12**: Melhor ao12 de todas as janelas

### Regras especiais

- **2+ DNFs** na janela → média = DNF
- **+2** já incluído no tempo efetivo
- **Descarte** automático de melhor e pior tempo (exceto DNFs)

Clique no ícone **?** ao lado de "Estatísticas" para ver o guia completo!

## � Estatísticas Avançadas

Acesse gráficos detalhados e métricas de performance clicando no botão **Estatísticas Avançadas** (📈) no header.

### Tab Evolução

Visualize sua progressão ao longo do tempo com gráficos de linha interativos:

- **Single**: Seus tempos individuais solve a solve
- **ao5**: Evolução das médias de 5
- **ao12**: Evolução das médias de 12
- **Eixo X**: Número do solve
- **Eixo Y**: Tempo em segundos

Identifique tendências, picos de performance e períodos de melhora!

### Tab Consistência

Métricas que mostram o quão consistente você é:

#### Desvio Padrão
- Mede a variação dos seus tempos
- **Quanto menor, mais consistente** você é
- Útil para identificar oscilações de performance

#### Coeficiente de Variação (CV)
- Variação relativa em porcentagem
- Normalizado pela média (permite comparar consistência entre speedcubers de níveis diferentes)
- **Classificação:**
  - 🟢 **Excelente**: < 10% (muito consistente)
  - 🔵 **Bom**: 10-15% (consistência boa)
  - 🟡 **Médio**: 15-20% (pode melhorar)
  - 🔴 **Precisa melhorar**: > 20% (inconsistente)

### Tab Performance

Análise de velocidade e distribuição:

#### TPS Médio (Turns Per Second)
- Velocidade média de execução de movimentos
- Baseado em **25 movimentos** por scramble (padrão 3×3)
- Quanto maior, mais rápida sua execução
- **Exemplo**: 5 TPS = 5 movimentos por segundo

#### Distribuição de Tempos
- **Histograma** mostrando como seus solves se distribuem por faixas de tempo
- 10 faixas entre seu tempo mínimo e máximo
- Identifique onde você resolve mais frequentemente
- Útil para estabelecer metas realistas

### Quando usar?

- **Após 12+ solves** para visualização completa
- **Competições**: Avalie sua consistência antes de competir
- **Evolução**: Acompanhe seu progresso semanal/mensal
- **Identificar fraquezas**: CV alto? Foque em consistência. TPS baixo? Pratique execução.

## �📝 Licença

MIT

---

**Desenvolvido com ❤️ para a comunidade de speedcubing**

## 📚 Documentação

Documentação técnica completa disponível em `/docs/`:

- **[changelog.md](./docs/changelog.md)** - Histórico de implementação e mudanças
- **[architecture.md](./docs/architecture.md)** - Estrutura do projeto e padrões de código
- **[performance.md](./docs/performance.md)** - Otimizações de bundle e métricas
- **[components.md](./docs/components.md)** - Componentes disponíveis e como usar
- **[features.md](./docs/features.md)** - Funcionalidades detalhadas
- **[i18n.md](./docs/i18n.md)** - Sistema de internacionalização
- **[stores.md](./docs/stores.md)** - Gerenciamento de estado com Zustand
- **[pwa.md](./docs/pwa.md)** - Configuração do Progressive Web App
