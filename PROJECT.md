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

**Documentação organizada em múltiplos arquivos:**

- `PROJECT.md` - Especificação técnica e regras de desenvolvimento
- `README.md` - Guia de uso e características do produto
- `docs/` - Documentação técnica detalhada:
  - `docs/changelog.md` - Histórico de implementação
  - `docs/architecture.md` - Estrutura e organização do código
  - `docs/performance.md` - Otimizações de bundle e performance
  - `docs/components.md` - Componentes disponíveis
  - `docs/features.md` - Funcionalidades implementadas

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

- **Space**: segurar para "armar", soltar inicia; apertar novamente para parar.
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

Veja documentação completa em [docs/architecture.md](./docs/architecture.md).

Estrutura resumida:

```
/src
  /app              # Configuração principal (router, app, main)
  /features         # Features auto-contidas (home, history, stats, etc)
  /shared           # Código compartilhado
    /components     # UI components reutilizáveis
    /lib            # Utilitários (animations, sounds, formatters)
    /store          # Zustand stores
    /config         # i18n e configurações
    /hooks          # Custom hooks compartilhados
    /types          # TypeScript types
    /layouts        # Page layouts
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
- Documentação técnica em `/docs/`
- **PWA:** manifest + service worker para instalação e offline.

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

## Status do Projeto

✅ **Projeto Completo e em Produção**

Todas as funcionalidades especificadas foram implementadas e testadas. O aplicativo está pronto para uso.

### Recursos Principais Implementados

- ✅ Timer funcional com inspeção automática
- ✅ Gerador de scrambles 3×3 válidos
- ✅ Sistema completo de estatísticas (Single, ao5, ao12, best ao5, best ao12)
- ✅ Estatísticas avançadas (gráficos, consistência, performance)
- ✅ Sistema de sessões com gerenciamento completo
- ✅ Histórico de solves com filtros
- ✅ Internacionalização (pt-BR, en-US, es-ES)
- ✅ Tema claro e escuro
- ✅ PWA instalável com funcionalidade offline
- ✅ Sistema de sons com Web Audio API
- ✅ Export/Import de dados em JSON
- ✅ Onboarding interativo para novos usuários
- ✅ Tutorial layer-by-layer para iniciantes
- ✅ Modo de treino (PLL, OLL, F2L)
- ✅ Biblioteca de UI reutilizável (Button, Card, Modal)
- ✅ Routing com React Router (6 páginas)
- ✅ **Bundle otimizado:** Main bundle reduzido de 904 KB para 135 KB (~70%)
- ✅ **Code splitting:** Lazy loading de rotas e separação de vendors

### Documentação

Para informações detalhadas, consulte:
- **[docs/changelog.md](./docs/changelog.md)** - Histórico completo de todas as fases
- **[docs/architecture.md](./docs/architecture.md)** - Arquitetura e estrutura do projeto
- **[docs/performance.md](./docs/performance.md)** - Otimizações de bundle e performance
- **[README.md](./README.md)** - Guia de uso e características

### Próximas Melhorias (Opcional)

- [ ] Sincronização opcional na nuvem (Supabase)
- [ ] Temas customizáveis pelo usuário
- [ ] Suporte a outros tamanhos de cubo (2×2, 4×4, 5×5)

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

### Feature-Based Organization

Código organizado por features auto-contidas em `/src/features/`:

```
/src/features
  /home              # Timer principal
    /components      # Componentes da feature
    /lib             # Lógica de negócio
    home.tsx         # Página
    index.ts         # Barrel export
```

### Componentes Compartilhados

Apenas componentes **verdadeiramente reutilizáveis** em `/src/shared/components/`.

### Estrutura de Componentes com Collocation

**SEMPRE organize componentes complexos em pastas próprias:**

```
/componentName
  ├── ComponentName.tsx       # Componente principal
  ├── useComponentName.ts     # Hook customizado (se necessário)
  └── index.ts                # Export barrel (sempre)
```

### Critérios para Criar Pasta de Componente

Crie uma pasta quando o componente tiver:

1. **Hook customizado associado** (lógica complexa)
2. **Múltiplos arquivos relacionados** (types, utils, hooks)
3. **Sub-componentes** usados apenas por ele
4. **Testes específicos** do componente

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

# 13) Comandos

```bash
pnpm i          # Instalar dependências
pnpm dev        # Servidor de desenvolvimento
pnpm build      # Build de produção
pnpm test       # Executar testes
pnpm check      # Lint e format com Biome
```

Veja [README.md](./README.md) para mais detalhes.
