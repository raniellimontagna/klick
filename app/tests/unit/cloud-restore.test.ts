import { describe, expect, it } from 'vitest';
import { gzipJson } from '../../src/core/gzip';
import type { CopyManifest, CopyPart } from '../../src/core/sync/copy-parts';
import type { KlickExport } from '../../src/data/repository';
import { ApiError } from '../../src/sync/api';
import { downloadCopy } from '../../src/sync/cloud-restore';

const whole = (): KlickExport => ({ format: 'klick', version: 1, exportedAt: 1_700_000_000_000, sessions: [], solves: [], profile: null, practice: [], duels: [] });
const manifest = (n: number): CopyManifest => ({
  format: 'klick-parts', version: 1, exportedAt: 1_700_000_000_000, day: '2026-10-20', profile: null, solves: 2,
  parts: Array.from({ length: n }, (_, i) => ({ last: ['solves', `s${i + 1}`] as const, records: 1 })),
});
const session = (id: string) => ({ id, name: id, event: '333' as const, order: 0, createdAt: 1, updatedAt: 1, deletedAt: null });
const solve = (id: string) => ({ id, sessionId: 's1', event: '333' as const, ms: 9000, penalty: null, at: 1, scramble: 'R', note: '', createdAt: 1, updatedAt: 1, deletedAt: null });
const part = (sessions: string[], solves: string[]): CopyPart => ({ sessions: sessions.map(session), solves: solves.map(solve), practice: [], duels: [] });

// A API falsa: o que cada índice devolve (os bytes, ou o erro) e os pedidos que chegaram, na ordem.
function fake(objects: (unknown | Error)[]) {
  const asked: number[] = [];
  let inFlight = 0;
  let overlap = false;
  return {
    asked,
    overlapped: () => overlap,
    api: {
      async copyPart(_name: string, index: number, account: string): Promise<ArrayBuffer> {
        expect(account).toBe('conta-1');
        asked.push(index);
        inFlight++;
        overlap ||= inFlight > 1;
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        const o = objects[index];
        if (o instanceof Error) throw o;
        if (o instanceof ArrayBuffer) return o;
        return gzipJson(o);
      },
    },
  };
}

describe('downloadCopy', () => {
  it('arquivo só: devolve o KlickExport', async () => {
    const f = fake([whole()]);
    expect(await downloadCopy(f.api, '2026-10-15', 'conta-1')).toEqual(whole());
    expect(f.asked).toEqual([0]);
  });

  it('manifesto: baixa 1..N em ordem, uma de cada vez, e junta', async () => {
    const f = fake([manifest(3), part(['s1'], ['a']), part([], ['b']), part([], ['c'])]);
    const copy = await downloadCopy(f.api, '2026-10-15', 'conta-1');
    expect(f.asked).toEqual([0, 1, 2, 3]);
    expect(f.overlapped()).toBe(false);
    expect(copy).toMatchObject({ format: 'klick', version: 1, exportedAt: 1_700_000_000_000, profile: null });
    expect(copy.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(copy.solves.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('parte torta ou 404 rejeita', async () => {
    // Uma parte que não é uma parte.
    await expect(downloadCopy(fake([manifest(2), part([], ['a']), { sessions: 'x' }]).api, 'd', 'conta-1')).rejects.toThrow();
    // Um objeto 0 que não é manifesto nem cópia inteira.
    await expect(downloadCopy(fake([{ format: 'klick-parts', version: 1 }]).api, 'd', 'conta-1')).rejects.toThrow();
    await expect(downloadCopy(fake([{ qualquer: 'coisa' }]).api, 'd', 'conta-1')).rejects.toThrow();
    // Bytes que não são gzip.
    await expect(downloadCopy(fake([new TextEncoder().encode('oi').buffer as ArrayBuffer]).api, 'd', 'conta-1')).rejects.toThrow();
    // O 404 do objeto 0 e o de uma parte chegam como estão (quem chama decide: "gone").
    await expect(downloadCopy(fake([new ApiError('client', 404)]).api, 'd', 'conta-1')).rejects.toMatchObject({ status: 404 });
    const f = fake([manifest(3), part([], ['a']), new ApiError('client', 404), part([], ['c'])]);
    await expect(downloadCopy(f.api, 'd', 'conta-1')).rejects.toMatchObject({ status: 404 });
    expect(f.asked).toEqual([0, 1, 2]); // parou na que falhou
  });
});
