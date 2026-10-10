import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupFileName, folderSupported, pickFolder, saveToFolder, type DirHandleLike } from '../../src/data/folder';

function fakeDir(permission: PermissionState = 'granted', grant: PermissionState = 'granted') {
  const files: Record<string, string> = {};
  const h: DirHandleLike = {
    queryPermission: async () => permission,
    requestPermission: async () => grant,
    getFileHandle: async (name) => ({
      createWritable: async () => {
        let buf = '';
        return { write: async (d: string) => { buf += d; }, close: async () => { files[name] = buf; } };
      },
    }),
  };
  return { h, files };
}

describe('pasta de cópias', () => {
  it('detecta suporte', () => {
    expect(folderSupported({ showDirectoryPicker: () => null })).toBe(true);
    expect(folderSupported({})).toBe(false);
  });
  it('escolher a pasta devolve null quando a pessoa cancela', async () => {
    const abort = Object.assign(new Error('cancelado'), { name: 'AbortError' });
    expect(await pickFolder({ showDirectoryPicker: async () => { throw abort; } })).toBeNull();
  });
  it('salva o arquivo com permissão', async () => {
    const { h, files } = fakeDir();
    expect(await saveToFolder(h, 'a.json', '{"x":1}')).toBe(true);
    expect(files['a.json']).toBe('{"x":1}');
  });
  it('sem permissão e sem pedir, não salva', async () => {
    const { h, files } = fakeDir('prompt', 'denied');
    expect(await saveToFolder(h, 'a.json', '{}')).toBe(false);
    expect(files).toEqual({});
  });
  it('nome do arquivo com data e hora local', () => {
    const ts = new Date(2026, 9, 9, 7, 5).getTime();
    expect(backupFileName(ts)).toBe('klick-2026-10-09-0705.json');
  });
});

// --- Acréscimos além do plano ---

afterEach(() => vi.unstubAllGlobals());

describe('pasta de cópias: permissão', () => {
  it('pedindo a permissão (ask), salva quando a pessoa concede', async () => {
    const { h, files } = fakeDir('prompt', 'granted');
    expect(await saveToFolder(h, 'a.json', '{"x":2}', { ask: true })).toBe(true);
    expect(files['a.json']).toBe('{"x":2}');
  });

  it('pedindo a permissão e a pessoa negando, não salva e devolve false', async () => {
    const { h, files } = fakeDir('prompt', 'denied');
    expect(await saveToFolder(h, 'a.json', '{}', { ask: true })).toBe(false);
    expect(files).toEqual({});
  });

  it('permissão negada de antemão e pedido recusado: false', async () => {
    const { h, files } = fakeDir('denied', 'denied');
    expect(await saveToFolder(h, 'a.json', '{}', { ask: true })).toBe(false);
    expect(files).toEqual({});
  });

  it('sem ask, nunca abre o pedido de permissão (só a pessoa, num gesto, pode abrir)', async () => {
    const { h } = fakeDir('prompt', 'granted');
    const request = vi.fn(h.requestPermission!);
    h.requestPermission = request;
    expect(await saveToFolder(h, 'a.json', '{}')).toBe(false);
    expect(await saveToFolder(h, 'a.json', '{}', { ask: false })).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('com a permissão já concedida, não pergunta de novo mesmo com ask', async () => {
    const { h } = fakeDir('granted');
    const request = vi.fn(h.requestPermission!);
    h.requestPermission = request;
    expect(await saveToFolder(h, 'a.json', '{}', { ask: true })).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('consulta e pede a permissão no modo de escrita', async () => {
    const { h } = fakeDir('prompt', 'granted');
    const query = vi.fn(h.queryPermission!);
    const request = vi.fn(h.requestPermission!);
    h.queryPermission = query;
    h.requestPermission = request;
    await saveToFolder(h, 'a.json', '{}', { ask: true });
    expect(query).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(request).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('chama a consulta no próprio handle (o do navegador exige o this)', async () => {
    const seen: unknown[] = [];
    const files: Record<string, string> = {};
    const h: DirHandleLike = {
      async queryPermission() { seen.push(this); return 'granted'; },
      async requestPermission() { seen.push(this); return 'granted'; },
      async getFileHandle(name) {
        seen.push(this);
        return { createWritable: async () => ({ write: async (d: string) => { files[name] = d; }, close: async () => {} }) };
      },
    };
    expect(await saveToFolder(h, 'a.json', '{}')).toBe(true);
    expect(seen).toHaveLength(2); // a consulta e o getFileHandle
    for (const who of seen) expect(who).toBe(h);
  });

  it('handle sem queryPermission (nada a consultar): tenta gravar do mesmo jeito', async () => {
    const { h, files } = fakeDir();
    delete h.queryPermission;
    expect(await saveToFolder(h, 'a.json', '{"ok":true}')).toBe(true);
    expect(files['a.json']).toBe('{"ok":true}');
  });

  it('sem permissão e sem como pedir (sem requestPermission), devolve false', async () => {
    const { h, files } = fakeDir('prompt');
    delete h.requestPermission;
    expect(await saveToFolder(h, 'a.json', '{}', { ask: true })).toBe(false);
    expect(files).toEqual({});
  });
});

describe('pasta de cópias: gravação', () => {
  it('cria o arquivo pelo nome pedido', async () => {
    const asked: Array<[string, unknown]> = [];
    const { h } = fakeDir();
    const inner = h.getFileHandle;
    h.getFileHandle = async (name, o) => { asked.push([name, o]); return inner(name, o); };
    await saveToFolder(h, 'klick-2026-10-09-0705.json', '{}');
    expect(asked).toEqual([['klick-2026-10-09-0705.json', { create: true }]]);
  });

  it('erro ao gravar não vira false: rejeita, para a pessoa ficar sabendo', async () => {
    const { h } = fakeDir();
    h.getFileHandle = async () => ({
      createWritable: async () => ({ write: async () => { throw new Error('disco cheio'); }, close: async () => {} }),
    });
    await expect(saveToFolder(h, 'a.json', '{}')).rejects.toThrow('disco cheio');
  });

  it('só diz true depois de fechar o arquivo (é o close que confirma a gravação)', async () => {
    const order: string[] = [];
    const { h } = fakeDir();
    h.getFileHandle = async () => ({
      createWritable: async () => ({
        write: async () => { order.push('write'); },
        close: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); order.push('close'); },
      }),
    });
    expect(await saveToFolder(h, 'a.json', '{}')).toBe(true);
    expect(order).toEqual(['write', 'close']);
  });
});

describe('pasta de cópias: seletor', () => {
  it('escolher a pasta devolve o handle e abre o seletor em leitura e escrita', async () => {
    const { h } = fakeDir();
    const picker = vi.fn(async () => h);
    expect(await pickFolder({ showDirectoryPicker: picker })).toBe(h);
    expect(picker).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('chama o seletor no próprio objeto (o do navegador exige o this)', async () => {
    const { h } = fakeDir();
    const win = {
      seen: null as unknown,
      async showDirectoryPicker(this: { seen: unknown }) { this.seen = this; return h; },
    };
    expect(await pickFolder(win)).toBe(h);
    expect(win.seen).toBe(win);
  });

  it('outro erro do seletor não é engolido', async () => {
    const denied = Object.assign(new Error('sem gesto'), { name: 'SecurityError' });
    await expect(pickFolder({ showDirectoryPicker: async () => { throw denied; } })).rejects.toBe(denied);
  });

  it('sem seletor no navegador, devolve null (quem chama consulta folderSupported antes)', async () => {
    expect(await pickFolder({})).toBeNull();
  });

  it('sem argumentos olha o globalThis', async () => {
    expect(folderSupported()).toBe(false); // o jsdom não tem showDirectoryPicker
    expect(await pickFolder()).toBeNull();
    const { h } = fakeDir();
    vi.stubGlobal('showDirectoryPicker', async () => h);
    expect(folderSupported()).toBe(true);
    expect(await pickFolder()).toBe(h);
  });

  it('showDirectoryPicker que não é função não conta como suporte', () => {
    expect(folderSupported({ showDirectoryPicker: null })).toBe(false);
    expect(folderSupported({ showDirectoryPicker: 'sim' })).toBe(false);
  });
});

describe('nome do arquivo de cópia', () => {
  it('completa com zeros mês, dia, hora e minuto', () => {
    expect(backupFileName(new Date(2026, 0, 3, 4, 9).getTime())).toBe('klick-2026-01-03-0409.json');
  });

  it('usa a hora local de 24 horas, sem separador entre hora e minuto', () => {
    expect(backupFileName(new Date(2026, 11, 31, 23, 59, 59, 999).getTime())).toBe('klick-2026-12-31-2359.json');
    expect(backupFileName(new Date(2026, 5, 15, 0, 0).getTime())).toBe('klick-2026-06-15-0000.json');
  });
});
