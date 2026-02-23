# Próximas Melhorias: Cubo 3D

Roadmap de melhorias para integração completa do Cubo 3D no app.

---

## 0. Melhorias de Base (Refatoração e UX)

**Objetivo:** Preparar o código existente para ser reutilizável, desacoplado e mais performático antes de adicionar novas features.

### Estrutura e Desacoplamento
- **Extrair `CubeEngine` (Logic Layer):** Isolar toda a lógica de estado do cubo (matrizes, rotações, scrambles) em uma classe/hook puro, separando-o da lógica de animação (`moveQueue`).
- **Criar `GenericCubeCanvas`:** Componentizar o setup do Three.js (Canvas, Lights, Environment) para que possamos instanciar o cubo em qualquer lugar (Home, Modal) sem duplicar código.
- **Desacoplar Interação:** Refatorar `useCubeInteraction` para emitir eventos de "gesto" em vez de chamar `applyMove` diretamente. Isso facilita criar tutoriais que "ouvem" movimentos específicos.

### Simplificação e Performance
- **Otimizar Snapping:** Adicionar animação suave de retorno ("snap back") quando o usuário solta uma camada antes de completar o giro (hoje ele reseta instantaneamente).
- **Controle de Velocidade:** Implementar um multiplicador de velocidade global para a `moveQueue`, permitindo scrambles super-rápidos ou tutoriais em câmera lenta.
- **Lazy Loading de Assets:** Garantir que texturas e sons pesados só carreguem quando o componente 3D for montado.

---

## 1. Integração do Cubo 3D na Tela Principal

**Objetivo:** Permitir visualizar o embaralhamento sendo executado em 3D sem precisar navegar para a tela dedicada do Cubo 3D.

### Implementação
- Adicionar um toggle opcional na tela Home para exibir um cubo 3D compacto ao lado do scramble
- Sincronizar automaticamente com o scramble gerado
- Animação do scramble acontece em tempo real quando um novo scramble é gerado
- Modo compacto e responsivo para não interferir com o timer

### Benefícios
- Melhor visualização do scramble para iniciantes
- Mais imersivo e didático
- Não prejudica speedcubers que preferem o modo tradicional (toggle opcional)

---

## 2. Refatoração Completa de Treinos e Tutorial com 3D

**Objetivo:** Transformar as abas de Training e Tutorial em experiências totalmente 3D e interativas.

### Training (PLL/OLL/F2L)
- Substituir visualizações 2D estáticas por cubo 3D real
- Animação automática dos algoritmos ao clicar em um caso
- Controles de velocidade (slow-motion, passo-a-passo)
- Destaque de peças relevantes (highlight apenas as peças que mudam)
- Modo "Compare": executar lado a lado diferentes variações de um algoritmo

### Tutorial (Layer-by-Layer)
- Cada etapa mostra o cubo 3D em vez de diagramas 2D
- **Step highlighting:** iluminar apenas as peças relevantes para a etapa atual
- Navegação passo-a-passo visual
- Feedback interativo: mostrar onde o usuário está no processo de resolução

### Benefícios
- Aprendizado muito mais visual e intuitivo
- Reduz a barreira de entrada para iniciantes
- Aproveitamento máximo da infraestrutura 3D já construída

---

## 3. Cubo 2x2x2 3D

**Objetivo:** Expandir o visualizador para suportar cubos 2x2x2.

### Implementação
- Refatorar `createSolvedCube()` para aceitar tamanho como parâmetro
- Ajustar lógica de movimentos (sem middle layers M, E, S)
- Adaptação de `applyMoveToState` e `rotateFace` para 2x2
- Gerador de scramble específico para 2x2
- Seletor de tamanho na UI (2x2 / 3x3)

### Benefícios
- Atende praticantes de 2x2
- Base para futura expansão (4x4, 5x5...)
- Reutilização de toda a arquitetura visual existente

---

## Priorização Sugerida

1. **Cubo 3D na Home** (impacto imediato, baixa complexidade)
2. **Tutorial 3D** (alto valor para iniciantes)
3. **Training 3D** (valor para treino avançado)
4. **Cubo 2x2** (expansão de funcionalidade)

---

## Melhorias Futuras (Brainstorming)

_Esta seção pode ser usada para anotar novas ideias conforme surgem:_

- 
