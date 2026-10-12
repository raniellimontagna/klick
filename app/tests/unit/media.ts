// matchMedia de mentira: responde que sim só às consultas dadas, como '(pointer: coarse)' ou '(display-mode: standalone)'.
// Devolve a função que põe a original de volta.
export function mockMedia(matching: readonly string[]): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}
