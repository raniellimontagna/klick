import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from '../../src/ui/download';

// O jsdom não tem URL.createObjectURL: cada teste põe a sua e tira depois.
const urlApi = URL as unknown as Record<string, unknown>;
const realWindowTop = Object.getOwnPropertyDescriptor(window, 'top');

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete urlApi.createObjectURL;
  delete urlApi.revokeObjectURL;
  if (realWindowTop) Object.defineProperty(window, 'top', realWindowTop);
});

// Os cliques em links não navegam no jsdom: o clique só é gravado.
function recordClicks(): HTMLAnchorElement[] {
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  return clicked;
}

describe('downloadText', () => {
  it('cria um link com URL de blob, clica nele e revoga a URL depois', () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:klick-1');
    const revokeObjectURL = vi.fn();
    urlApi.createObjectURL = createObjectURL;
    urlApi.revokeObjectURL = revokeObjectURL;
    const clicked = recordClicks();

    expect(downloadText('klick-2026-10-10.json', '{"solves":[]}', 'application/json')).toBe(true);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as unknown as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toContain('application/json');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].href).toBe('blob:klick-1');
    expect(clicked[0].download).toBe('klick-2026-10-10.json');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:klick-1');
  });

  it('devolve false quando o navegador recusa o download', () => {
    urlApi.createObjectURL = vi.fn(() => {
      throw new Error('sem blob');
    });
    urlApi.revokeObjectURL = vi.fn();
    const clicked = recordClicks();
    expect(downloadText('klick.json', '{}')).toBe(false);
    expect(clicked).toHaveLength(0);
  });

  it('dentro de iframe devolve false sem criar nada (quem chama abre o texto para copiar)', () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    urlApi.createObjectURL = createObjectURL;
    urlApi.revokeObjectURL = vi.fn();
    const clicked = recordClicks();
    // Um iframe: o topo da janela é outra janela.
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    expect(downloadText('klick.json', '{}')).toBe(false);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(0);
  });
});
