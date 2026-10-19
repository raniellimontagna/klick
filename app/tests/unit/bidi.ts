import { expect } from 'vitest';

// Um nome do desafio isolado na tela (a revisão final): todo texto da página que tem o nome está num <bdi> que é só ele. Um nome da direita
// para a esquerda (ou com números colados) não reordena o texto em volta. A região de anúncios fica de fora: ela não aparece, só é lida.
// Devolve quantas vezes o nome apareceu, para o teste conferir que a tela o mostrou.
export function expectIsolated(name: string, root: Element = document.body): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.includes(name) || node.parentElement?.closest('[data-live]')) continue;
    const parent = node.parentElement!;
    expect(parent.tagName, parent.parentElement?.outerHTML).toBe('BDI');
    expect(parent.textContent).toBe(name);
    seen++;
  }
  return seen;
}
