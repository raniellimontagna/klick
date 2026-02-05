# Features

## Timer (`/src/features/timer/`)

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

## Scramble (`/src/features/scramble/`)

### Gerador 3×3

- 25 movimentos: `R L U D F B` com sufixos `'`, `2`, ou vazio
- Sem repetição de face consecutiva
- Compatível com leitores WCA

---

## Estatísticas (`/src/features/stats/`)

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

## Onboarding (`/src/features/onboarding/`)

Tour interativo em 7 passos:

1. **Welcome:** Introdução
2. **Scramble:** Como gerar e entender
3. **Timer:** Barra de espaço
4. **Stats:** Single, ao5, ao12
5. **Shortcuts:** Atalhos de teclado
6. **Sessions:** Gerenciamento
7. **Complete:** Conclusão

---

## Training (`/src/features/training/`)

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
5. **Alinhar Aristas:** R U R' U R U2 R'
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

## Cube 3D (`/src/features/cube-3d/`)

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
- **Estado:** `use-cube-state.ts` - Gerencia lógica, fila, histórico e undo
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
