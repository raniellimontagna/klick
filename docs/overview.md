# Visão Geral

## Proposta de Valor

| Pilar | Descrição |
|-------|-----------|
| **Clareza primeiro** | Tempos, médias e PB sem poluição visual |
| **Aprenda jogando** | Dicas sobre ao5/ao12 e TPS após cada sessão |
| **Aconchego visual** | Contraste alto, tipografia grande, zero distração |

## Stack Tecnológica

| Tecnologia | Versão | Propósito |
|------------|--------|-----------|
| React | 19 | UI declarativa |
| TypeScript | 5.9 | Type safety |
| Vite | rolldown-vite | Build ultrarrápido |
| Tailwind CSS | 4 | Estilização com CSS variables |
| Zustand | 5 | Estado global com persistência |
| Framer Motion | 12 | Animações fluidas |
| React Router | 7 | Navegação client-side |
| Recharts | 3 | Gráficos responsivos |
| Solar Icons | 1.0.1 | Biblioteca de ícones |
| Vitest | 4 | Testes unitários |
| Biome | 2 | Linting e formatting |
| vite-plugin-pwa | 1 | PWA support |

## Requisitos

- Node.js 18+
- pnpm 8+

## Scripts

```bash
pnpm dev       # Servidor de desenvolvimento
pnpm build     # Build de produção
pnpm preview   # Preview do build
pnpm test      # Executar testes
pnpm lint      # Linting com ESLint
pnpm format    # Formatting com Biome
pnpm check     # Check com Biome
```

## Temas

- **Dark (padrão):** Fundo `#0D1117`, primário `#7C4DFF`, acento `#39FF88`
- **Light:** Fundo branco, contraste otimizado

CSS variables para fácil customização em `/src/styles/index.css`.
