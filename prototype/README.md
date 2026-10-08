# Protótipo do Klick v2

Protótipo interativo do sub-projeto 1 (spec: `../docs/superpowers/specs/2026-10-08-klick-design.md`). HTML, CSS e JS puros, sem build.

## Rodar

    cd prototype
    python3 -m http.server 4173 --bind 127.0.0.1

Abra http://localhost:4173/. Precisa ser por HTTP (ES modules não abrem via `file://`).

## Testar

    cd prototype
    npm test

86 testes com o runner nativo do Node (≥ 20), sem dependências.

## O que é de mentira

- Os 212 solves de exemplo são fictícios (`scripts/data.js`); "Ajustes → Começar do zero" apaga tudo.
- Os embaralhamentos vêm de uma lista fixa de 40 (random-state, gerados com cubing.js 0.63.4). O gerador real entra no sub-projeto 2.
- Os dados ficam no `localStorage` deste navegador, só por conveniência.
