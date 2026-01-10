# CubeVisualizer - Componente Reutilizável

## 📦 Localização
`/src/components/cubeVisualizer/`

## 🎯 Propósito
Componente modular e reutilizável para visualizar estados do cubo mágico, algoritmos e configurações de treino em qualquer parte da aplicação.

## 🏗️ Estrutura

```
/components/cubeVisualizer/
├── CubeVisualizer.tsx      # Componente principal
├── CubeFace.tsx            # Renderiza uma face do cubo (3x3)
├── AlgorithmMove.tsx       # Exibe um movimento de algoritmo
├── types.ts                # Types e constantes
└── index.ts                # Barrel export
```

## 🎨 Uso Básico

```tsx
import { CubeVisualizer, CUBE_COLORS } from '@/components/cubeVisualizer';
import type { CubeVisualizationConfig } from '@/components/cubeVisualizer';

const config: CubeVisualizationConfig = {
  title: '🎯 Meu Caso',
  subtitle: "R U R'",
  gradient: 'from-blue-500/10 to-purple-500/10',
  faces: [
    {
      colors: [
        CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW,
        CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW,
        CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW,
      ],
      label: 'Topo',
    },
  ],
  algorithms: [
    { move: 'R', description: '90° horário' },
    { move: 'U', description: 'Topo horário' },
    { move: "R'", description: '90° anti-horário' },
  ],
  tip: 'Dica importante sobre este caso',
};

// Renderizar
<CubeVisualizer config={config} />
```

## 📐 API do Componente

### CubeVisualizer

| Prop | Tipo | Descrição |
|------|------|-----------|
| `config` | `CubeVisualizationConfig` | Configuração da visualização |
| `className` | `string` (opcional) | Classes CSS adicionais |

### CubeVisualizationConfig

```typescript
interface CubeVisualizationConfig {
  title?: string;           // Título principal
  subtitle?: string;        // Subtítulo (geralmente o algoritmo)
  icon?: string;           // Emoji/ícone
  gradient?: string;       // Classes do gradient (ex: 'from-blue-500/10 to-purple-500/10')
  faces?: CubeFaceData[];  // Faces do cubo a exibir
  algorithms?: AlgorithmData[];  // Lista de movimentos
  tip?: string;            // Dica/observação
  content?: React.ReactNode;  // Conteúdo customizado adicional
}
```

### CubeFaceData

```typescript
interface CubeFaceData {
  colors: CubeColor[];  // Array de 9 cores (ordem: linha por linha)
  label?: string;       // Label da face (ex: 'Topo', 'Face Branca')
}
```

### AlgorithmData

```typescript
interface AlgorithmData {
  move: string;         // Movimento (ex: 'R', "U'", 'R2')
  description?: string; // Descrição do movimento
}
```

### CUBE_COLORS

```typescript
const CUBE_COLORS = {
  WHITE: '#f0f0f0',
  YELLOW: '#ffd500',
  RED: '#ff3838',
  BLUE: '#0051ba',
  ORANGE: '#ff8c00',
  GREEN: '#00d800',
  GRAY: '#404040',
}
```

## 🎭 Exemplos de Uso

### 1. Exibir apenas faces

```tsx
const config = {
  title: '🎯 Cruz Branca',
  faces: [
    {
      colors: [
        CUBE_COLORS.GRAY, CUBE_COLORS.WHITE, CUBE_COLORS.GRAY,
        CUBE_COLORS.WHITE, CUBE_COLORS.WHITE, CUBE_COLORS.WHITE,
        CUBE_COLORS.GRAY, CUBE_COLORS.WHITE, CUBE_COLORS.GRAY,
      ],
      label: 'Face Branca',
    },
  ],
  tip: 'Alinhe cada aresta branca com o centro correspondente',
};
```

### 2. Exibir algoritmo

```tsx
const config = {
  title: 'T-Perm',
  subtitle: "R U R' U' R' F R2 U' R' U' R U R' F'",
  gradient: 'from-purple-500/10 to-blue-500/10',
  algorithms: [
    { move: 'R', description: 'Direita horário' },
    { move: 'U', description: 'Topo horário' },
    { move: "R'", description: 'Direita anti-horário' },
  ],
};
```

### 3. Conteúdo customizado

```tsx
const config = {
  title: '📦 Segunda Camada',
  content: (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-surface/50 rounded-lg p-3">
        <div className="text-xs font-semibold mb-2">ESQUERDA</div>
        <code className="text-xs">U' L' U L U F U' F'</code>
      </div>
      <div className="bg-surface/50 rounded-lg p-3">
        <div className="text-xs font-semibold mb-2">DIREITA</div>
        <code className="text-xs">U R U' R' U' F' U F</code>
      </div>
    </div>
  ),
};
```

## 🔧 Componentes Individuais

### CubeFace

Renderiza uma única face do cubo 3x3.

```tsx
import { CubeFace, CUBE_COLORS } from '@/components/cubeVisualizer';

<CubeFace
  colors={[
    CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW,
    CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW,
    CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW, CUBE_COLORS.YELLOW,
  ]}
  label="Topo"
  size="md"  // 'sm' | 'md' | 'lg'
/>
```

### AlgorithmMove

Exibe um movimento de algoritmo com ícone de rotação.

```tsx
import { AlgorithmMove } from '@/components/cubeVisualizer';

<AlgorithmMove
  move="R"
  description="90° horário"
  compact={false}  // true = versão compacta sem descrição
/>
```

## 🎬 Uso na Aplicação

### Tutorial (já implementado)
`/src/pages/tutorialPage/components/cubeVisualizer/tutorialConfigs.tsx`

Configurações pré-definidas para cada passo do tutorial.

### Treino (exemplo)
`/src/features/training/visualizations.tsx`

Configurações para casos de PLL, OLL, F2L.

```tsx
import { getTrainingVisualization } from '@/features/training/visualizations';
import { CubeVisualizer } from '@/components/cubeVisualizer';

// Uso:
const config = getTrainingVisualization('pll-t-perm');
if (config) {
  return <CubeVisualizer config={config} />;
}
```

## 🎨 Personalização de Gradientes

Gradientes disponíveis (Tailwind):
- `from-blue-500/10 to-purple-500/10` - Azul → Roxo
- `from-green-500/10 to-blue-500/10` - Verde → Azul
- `from-orange-500/10 to-red-500/10` - Laranja → Vermelho
- `from-yellow-500/10 to-orange-500/10` - Amarelo → Laranja
- `from-purple-500/10 to-pink-500/10` - Roxo → Rosa
- `from-teal-500/10 to-cyan-500/10` - Teal → Cyan

## 🚀 Benefícios

✅ **Reutilizável**: Mesmo componente usado em tutorial, treino, e qualquer outra feature  
✅ **Modular**: Componentes pequenos e composáveis (CubeFace, AlgorithmMove)  
✅ **Tipado**: TypeScript completo com interfaces claras  
✅ **Flexível**: Suporta faces, algoritmos, conteúdo customizado, ou combinação de todos  
✅ **Consistente**: Visual unificado em toda a aplicação  
✅ **Animado**: Transições suaves com Framer Motion  
✅ **Responsivo**: Adapta-se a mobile e desktop

## 📝 Próximos Passos

1. ✅ Componente base criado e funcionando
2. ✅ Integrado no Tutorial
3. ⏳ Integrar no Treino (TrainingCaseCard)
4. ⏳ Criar galeria de configurações pré-definidas
5. ⏳ Adicionar mais variações de cores/gradientes
6. ⏳ Suporte a animações de rotação (futuro)
