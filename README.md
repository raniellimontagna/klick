# Klick

**Tagline:** gire, clique, evolua.

Cronômetro de cubo mágico com UI limpa, métricas visuais e feedback instantâneo.

## 🎯 Features Principais

- ⏱️ Timer com inspeção de 15s e controle por teclado
- 🔄 Scrambles 3×3 válidos (25 movimentos)
- 📊 Estatísticas completas (Single, ao5, ao12) + gráficos avançados
- 📁 Sistema de sessões independentes
- 🌐 Suporte a 3 idiomas (pt-BR, en-US, es-ES)
- 🎨 Tema claro e escuro
- 📱 PWA - Instalável e funciona offline
- 📤 Exportar/Importar dados em JSON
- 🎓 Onboarding interativo + Tutorial layer-by-layer
- 🎵 Sistema de sons com Web Audio API

## 🚀 Quick Start

### Pré-requisitos
- Node.js 18+
- pnpm 8+

### Instalação

```bash
pnpm i           # Instalar dependências
pnpm dev         # Servidor de desenvolvimento
pnpm build       # Build de produção
pnpm test        # Executar testes
```

## 🎮 Como Usar

### Controles Básicos
- **ESPAÇO**: Segurar → soltar inicia inspeção → pressionar inicia/para timer
- **N**: Novo scramble
- **P**: Toggle +2 no último solve
- **D**: Toggle DNF no último solve

### Sessões
Organize solves em múltiplas sessões independentes:
- Trocar entre sessões
- Criar/renomear/deletar sessões
- Estatísticas separadas por sessão

### Configurações (⚙️)
- Duração da inspeção (5-30s)
- Sons on/off
- Penalidade automática (regras WCA)
- Tema claro/escuro
- Exportar/Importar JSON

### Idiomas
Selecione no dropdown: 🇧🇷 pt-BR | 🇺🇸 en-US | 🇪🇸 es-ES

### Onboarding
Tour interativo em 7 passos na primeira visita. Revisitar a qualquer momento clicando no botão "Tour" (🧭).

### Estatísticas Avançadas (📈)
- **Evolução**: Gráfico de progressão (Single, ao5, ao12)
- **Consistência**: Desvio padrão e coeficiente de variação
- **Performance**: TPS médio e distribuição de tempos

## 📱 PWA

Instalável em dispositivos móveis:
- **Android**: Menu (⋮) → "Instalar app"
- **iOS**: Compartilhar → "Adicionar à Tela de Início"

Funciona offline após primeiro acesso.

## ⚡ Performance

- Main bundle: **135 KB** (gzipped: 40 KB)
- Route chunks: 6-16 KB cada (lazy loading)
- ~70% menor que versão inicial

Veja [docs/performance.md](./docs/performance.md) para detalhes.

## 🏗️ Stack

React 19 • TypeScript • Vite • Tailwind CSS v4 • Zustand • Framer Motion • Recharts • Solar Icons • Vitest

## 📁 Arquitetura

Feature-based organization - cada feature é auto-contida:

```
src/
├── features/     # home, history, stats, training, tutorial, settings
├── shared/       # components, lib, store, config, hooks
└── layouts/      # MainLayout
```

Veja [docs/technical.md](./docs/technical.md) para arquitetura completa.

## 📚 Documentação

- **[technical.md](./docs/technical.md)** - Arquitetura e stack
- **[implementation.md](./docs/implementation.md)** - Componentes e features
- **[changelog.md](./docs/changelog.md)** - Histórico de mudanças
- **[performance.md](./docs/performance.md)** - Otimizações
- **[i18n.md](./docs/i18n.md)** - Internacionalização
- **[stores.md](./docs/stores.md)** - State management
- **[pwa.md](./docs/pwa.md)** - Progressive Web App

## 📝 Licença

MIT

---

**Desenvolvido com ❤️ para a comunidade de speedcubing**
