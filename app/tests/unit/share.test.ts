import { describe, expect, it, vi } from 'vitest';
import { shareFile } from '../../src/ui/share';

type Nav = Parameters<typeof shareFile>[3];

describe('shareFile', () => {
  it('sem canShare, ou sem suporte a arquivo, devolve unsupported e não abre nada', async () => {
    const share = vi.fn();
    expect(await shareFile('a.json', '{}', 'application/json', { share } as Nav)).toBe('unsupported');
    expect(await shareFile('a.json', '{}', 'application/json', { share, canShare: () => false } as Nav)).toBe('unsupported');
    expect(share).not.toHaveBeenCalled();
  });

  it('compartilhado devolve shared, com o arquivo no nome e no tipo dados', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    const outcome = await shareFile('klick-x.json', '{"a":1}', 'application/json', { share, canShare: () => true } as Nav);
    expect(outcome).toBe('shared');
    const file = share.mock.calls[0][0].files![0];
    expect(file.name).toBe('klick-x.json');
    expect(file.type).toBe('application/json');
    expect(await file.text()).toBe('{"a":1}');
  });

  it('a pessoa fechou a folha (AbortError): devolve cancelled', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('cancelado', 'AbortError');
    });
    expect(await shareFile('a.json', '{}', 'application/json', { share, canShare: () => true } as Nav)).toBe('cancelled');
  });

  it('outra recusa (sem o gesto da pessoa, por exemplo) devolve unsupported, para quem chama tentar o download', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('sem gesto', 'NotAllowedError');
    });
    expect(await shareFile('a.json', '{}', 'application/json', { share, canShare: () => true } as Nav)).toBe('unsupported');
  });
});
