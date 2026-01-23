# 3D Cube Feature Documentation

## ✅ Status: Concluído (v1.0)
Feature de visualização 3D completa e integrada ao app.

- **Visualização**: Implementada com geometria composta (Premium Look).
- **Lógica**: Motor de rotação implementado e verificado. Cubo responde a comandos (R, U, F, etc).
- **Integração**: Conectado ao store global de scramble. Mostra estado real da sessão.

## 🏗️ Arquitetura Implementada

### Estrutura de Pastas
```
src/features/cube-3d/
├── components/
│   ├── cube-scene.tsx      # Canvas e Luzes (Stateless)
│   ├── rubiks-cube.tsx     # Renderiza a lista de Cubies (Lifted State)
│   └── cubie.tsx           # Peça individual (Geometria Composta: Núcleo + Tiles)
├── lib/
│   ├── types.ts            # Cores (WCA), Tipos de Estado
│   ├── moves.ts            # Definição WCA dos movimentos
│   └── cube-utils.ts       # Lógica matemática (rotação vetorial)
├── cube-3d.tsx             # Página principal (Controller View)
├── use-cube-state.ts       # Hook de lógica de estado do cubo
└── index.ts                # Public API
```

### Store Global
- `src/shared/store/scramble-store.ts`: Zustand store criado para compartilhar o scramble atual entre `Home` e `Cube3D`.
- **Fluxo**:
  1. `Home` gera novo scramble -> Atualiza `scramble-store`.
  2. Usuário navega para `/cube-3d`.
  3. `Cube3D` lê `scramble-store` -> Chama `applyScramble(scramble)` do hook do cubo.
  4. Cubo inicializa resolvido e aplica os movimentos instantaneamente.

### Decisões Técnicas

#### 1. Geometria Composta (Visual)
- **Base**: `RoundedBox` preto (0.92)
- **Tiles**: Placas coloridas (0.86 x 0.04) renderizadas sobre o núcleo.
- Solução robusta para controle de materiais e estética "stickerless".

#### 2. Orientação (WCA Standard)
- **Topo**: BRANCO
- **Frente**: VERDE
- Conforme WCA Regulation 4d1.

#### 3. Motor de Rotação
- Algoritmo de rotação vetorial 3D aplicado a coordenadas e matriz de cores.
- Suporta movimentos básicos, primos e duplos.

## 🚀 Melhorias Futuras

### Fase 2: Animação
- [ ] Animar a transição entre estados (interpolação de rotação).
- [ ] Adicionar fila de movimentos para execução suave.

### Fase 3: Interação
- [ ] Permitir girar o cubo com o mouse (gestos).
- [ ] Resolver cubo passo-a-passo (Integração com Solver).
