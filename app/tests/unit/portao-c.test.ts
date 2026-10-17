import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// O script do Portão C (scripts/portao-c.sh) coloca os segredos no Worker. Aqui ele roda de verdade, mas com um `npx` falso na frente do PATH:
// nenhuma chamada chega ao Cloudflare. O `npx` falso anota o argv de cada chamada e o que recebeu no stdin, e o teste confere que cada
// segredo chegou pelo stdin e nunca apareceu num argv nem na saída do script. O wrangler.jsonc editado é uma cópia (KLICK_WRANGLER_CONFIG).
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(app, 'scripts/portao-c.sh');
const realConfig = join(app, 'wrangler.jsonc');
// A cópia de teste parte das chaves de teste do Turnstile nos dois ambientes, mesmo depois que a chave de verdade entrar no arquivo.
const TEST_KEY = '1x00000000000000000000BB';
const baseline = readFileSync(realConfig, 'utf8').replace(/("TURNSTILE_SITE_KEY":\s*")[^"]*"/g, `$1${TEST_KEY}"`);

const has = (cmd: string, args: string[]) => spawnSync(cmd, args, { stdio: 'ignore' }).status === 0;
const tools = has('bash', ['-c', 'exit 0']) && has('openssl', ['version']) && has('node', ['--version']);

const FAKE_NPX = `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
const put = argv[0] === 'wrangler' && argv[1] === 'secret' && argv[2] === 'put';
const stdin = put ? fs.readFileSync(0, 'utf8') : null;
fs.appendFileSync(process.env.FAKE_NPX_LOG, JSON.stringify({ argv, stdin }) + '\\n');
if (argv[0] === 'wrangler' && argv[1] === 'whoami') { console.log('fake-user'); process.exit(0); }
if (argv[0] === 'wrangler' && argv[1] === 'secret' && argv[2] === 'list') {
  const names = (process.env.FAKE_SECRETS || '').split(',').filter(Boolean);
  console.log(JSON.stringify(names.map((name) => ({ name, type: 'secret_text' }))));
  process.exit(0);
}
if (put) process.exit(0);
process.exit(99);
`;

const RESEND = 're_TESTE_resend_9f8e7d6c5b4a';
const TURNSTILE = 'segredo-do-turnstile-1a2b3c4d5e6f';
const SITE_KEY = '0x4AAAAAAATESTE_site-key';
const FED = [RESEND, TURNSTILE];

interface Call {
  argv: string[];
  stdin: string | null;
}
interface Run {
  status: number | null;
  output: string;
  calls: Call[];
  puts: Call[];
  config: string;
}

describe.skipIf(!tools)('scripts/portao-c.sh', () => {
  let dir: string;
  let fakeBin: string;
  let seq = 0;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'klick-portao-c-'));
    fakeBin = join(dir, 'bin');
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, 'npx'), FAKE_NPX);
    chmodSync(join(fakeBin, 'npx'), 0o755);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  function run(args: string[], input: string, opts: { secrets?: string; cwd?: string; useConfig?: boolean } = {}): Run {
    const work = join(dir, `run-${++seq}`);
    mkdirSync(work);
    const config = join(work, 'wrangler.jsonc');
    writeFileSync(config, baseline);
    const log = join(work, 'npx.log');
    writeFileSync(log, '');
    const env: Record<string, string> = {
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      HOME: work,
      FAKE_NPX_LOG: log,
      FAKE_SECRETS: opts.secrets ?? '',
    };
    if (opts.useConfig !== false) env.KLICK_WRANGLER_CONFIG = config;
    const r = spawnSync('bash', [script, ...args], { cwd: opts.cwd ?? app, env, input, encoding: 'utf8', timeout: 30_000 });
    const calls: Call[] = readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Call);
    return {
      status: r.status,
      output: `${r.stdout}\n${r.stderr}`,
      calls,
      puts: calls.filter((c) => c.argv[2] === 'put'),
      config: readFileSync(config, 'utf8'),
    };
  }

  const siteKeys = (config: string) => [...config.matchAll(/"TURNSTILE_SITE_KEY":\s*"([^"]*)"/g)].map((m) => m[1]);
  const names = (r: Run) => r.puts.map((c) => c.argv[3]);
  // O argv de uma chamada inteira, em texto: nenhum valor secreto pode estar nele.
  const argvText = (r: Run) => r.calls.map((c) => c.argv.join(' ')).join('\n');

  function expectNoLeak(r: Run) {
    for (const value of [...FED, ...r.puts.map((c) => c.stdin ?? '')]) {
      expect(value.length).toBeGreaterThan(0);
      expect(argvText(r)).not.toContain(value);
      expect(r.output).not.toContain(value);
    }
  }

  // "s" confirma; depois vêm a chave do Resend, a site key e a secret do Turnstile (o BETTER_AUTH_SECRET o script sorteia).
  const ALL = ['s', RESEND, SITE_KEY, TURNSTILE].join('\n') + '\n';

  it('beta: três secret put, sem flag de ambiente, tudo pelo stdin, e só a site key do beta muda', () => {
    const r = run(['beta'], ALL);
    expect(r.status).toBe(0);
    expect(names(r)).toEqual(['RESEND_API_KEY', 'TURNSTILE_SECRET', 'BETTER_AUTH_SECRET']);
    for (const c of r.puts) {
      expect(c.argv).toEqual(['wrangler', 'secret', 'put', c.argv[3]]);
      expect(c.stdin?.length ?? 0).toBeGreaterThan(0);
    }
    expect(r.puts[0].stdin).toBe(RESEND);
    expect(r.puts[1].stdin).toBe(TURNSTILE);
    expect(r.puts[2].stdin).toMatch(/^[A-Za-z0-9+/]{43}=$/); // 32 bytes em base64, sem quebra de linha
    expectNoLeak(r);
    // Só o beta (o primeiro, nas vars do topo) ganhou a chave de verdade.
    expect(siteKeys(r.config)).toEqual([SITE_KEY, TEST_KEY]);
    // Nada além de whoami, secret list e secret put foi chamado.
    expect(r.calls.map((c) => c.argv.slice(0, 3).join(' '))).toEqual([
      'wrangler whoami',
      'wrangler secret list',
      'wrangler secret put',
      'wrangler secret put',
      'wrangler secret put',
      'wrangler secret list',
    ]);
    expect(r.output).toContain('klick-app-beta');
    expect(r.output).toContain('commitar o wrangler.jsonc');
  });

  it('production: --env production em todas as chamadas, e só a site key da produção muda', () => {
    const r = run(['production'], ALL);
    expect(r.status).toBe(0);
    expect(names(r)).toEqual(['RESEND_API_KEY', 'TURNSTILE_SECRET', 'BETTER_AUTH_SECRET']);
    for (const c of r.calls.filter((x) => x.argv[1] !== 'whoami')) expect(c.argv.slice(-2)).toEqual(['--env', 'production']);
    for (const c of r.puts) expect(c.stdin?.length ?? 0).toBeGreaterThan(0);
    expectNoLeak(r);
    expect(siteKeys(r.config)).toEqual([TEST_KEY, SITE_KEY]);
    expect(r.output).toContain('klick-app,');
  });

  it('o BETTER_AUTH_SECRET sorteado é diferente a cada rodada e a cada ambiente', () => {
    const a = run(['beta', '--only', 'auth'], 's\n');
    const b = run(['production', '--only', 'auth'], 's\n');
    expect(a.puts[0].stdin).not.toBe(b.puts[0].stdin);
    expectNoLeak(a);
    expectNoLeak(b);
  });

  it('--only resend: só a RESEND_API_KEY, e o wrangler.jsonc não muda', () => {
    for (const env of ['beta', 'production']) {
      const r = run([env, '--only', 'resend'], `s\n${RESEND}\n`);
      expect(r.status).toBe(0);
      expect(names(r)).toEqual(['RESEND_API_KEY']);
      expect(r.puts[0].stdin).toBe(RESEND);
      expect(r.puts[0].argv.slice(4)).toEqual(env === 'production' ? ['--env', 'production'] : []);
      expectNoLeak(r);
      expect(r.config).toBe(baseline);
    }
  });

  it('--only turnstile: a site key e a TURNSTILE_SECRET; --only auth: só o BETTER_AUTH_SECRET', () => {
    const t = run(['beta', '--only', 'turnstile'], `s\n${SITE_KEY}\n${TURNSTILE}\n`);
    expect(names(t)).toEqual(['TURNSTILE_SECRET']);
    expect(siteKeys(t.config)[0]).toBe(SITE_KEY);
    expectNoLeak(t);
    const a = run(['production', '--only', 'auth'], 's\n');
    expect(names(a)).toEqual(['BETTER_AUTH_SECRET']);
    expect(a.config).toBe(baseline);
  });

  it('um segredo que já existe só é trocado se a resposta for s', () => {
    const keep = run(['beta', '--only', 'auth'], 's\nn\n', { secrets: 'BETTER_AUTH_SECRET' });
    expect(keep.status).toBe(0);
    expect(keep.puts).toHaveLength(0);
    expect(keep.output).toContain('já existe');
    const swap = run(['beta', '--only', 'auth'], 's\ns\n', { secrets: 'BETTER_AUTH_SECRET' });
    expect(names(swap)).toEqual(['BETTER_AUTH_SECRET']);
  });

  it('uma site key de teste (1x...) é recusada; com uma boa na sequência, segue', () => {
    const bad = run(['beta', '--only', 'turnstile'], 's\n1x00000000000000000000BB\n');
    expect(bad.status).not.toBe(0);
    expect(bad.puts).toHaveLength(0);
    expect(bad.config).toBe(baseline);
    expect(bad.output).toContain('não parece uma site key');
    const retry = run(['beta', '--only', 'turnstile'], `s\n1x00000000000000000000BB\nlixo\n${SITE_KEY}\n${TURNSTILE}\n`);
    expect(retry.status).toBe(0);
    expect(siteKeys(retry.config)[0]).toBe(SITE_KEY);
  });

  it('um segredo vazio é recusado (nenhum put); uma RESEND_API_KEY sem o prefixo re_ também', () => {
    const empty = run(['beta', '--only', 'resend'], 's\n\n');
    expect(empty.status).not.toBe(0);
    expect(empty.puts).toHaveLength(0);
    const noPrefix = run(['beta', '--only', 'resend'], 's\nsk_errada_123\n');
    expect(noPrefix.status).not.toBe(0);
    expect(noPrefix.puts).toHaveLength(0);
    expect(noPrefix.output).not.toContain('sk_errada_123');
    const retry = run(['beta', '--only', 'resend'], `s\nsk_errada_123\n${RESEND}\n`);
    expect(retry.status).toBe(0);
    expect(retry.puts.map((c) => c.stdin)).toEqual([RESEND]);
    expect(retry.output).not.toContain('sk_errada_123');
  });

  it('sem confirmar o "Continuar?", nada roda', () => {
    const r = run(['beta'], 'n\n');
    expect(r.status).not.toBe(0);
    expect(r.calls).toHaveLength(0);
  });

  it('argumentos inválidos terminam com o código 2 e o uso, sem chamar nada', () => {
    for (const args of [[], ['staging'], ['beta', 'production'], ['beta', '--only'], ['beta', '--only', 'tudo'], ['beta', '--x']]) {
      const r = run(args, '');
      expect(r.status).toBe(2);
      expect(r.output).toContain('uso:');
      expect(r.calls).toHaveLength(0);
    }
  });

  it('fora da pasta app/ (sem wrangler.jsonc) explica e não chama nada', () => {
    const r = run(['beta'], 's\n', { cwd: dir, useConfig: false });
    expect(r.status).toBe(1);
    expect(r.output).toContain('cd app');
    expect(r.calls).toHaveLength(0);
  });

  it('--dry-run: nenhuma chamada ao npx, nenhum segredo pedido, o wrangler.jsonc intacto e a diferença mostrada', () => {
    const r = run(['production', '--dry-run'], `s\n${SITE_KEY}\n`);
    expect(r.status).toBe(0);
    expect(r.calls).toHaveLength(0);
    expect(r.config).toBe(baseline);
    expect(r.output).toContain('<segredo> | npx wrangler secret put RESEND_API_KEY --env production');
    expect(r.output).toContain('<segredo> | npx wrangler secret put TURNSTILE_SECRET --env production');
    expect(r.output).toContain('BETTER_AUTH_SECRET --env production');
    expect(r.output).toContain(`+        "TURNSTILE_SITE_KEY": "${SITE_KEY}"`);
  });

  it('o wrangler.jsonc de verdade tem uma site key em cada ambiente, onde o script espera', () => {
    expect(existsSync(realConfig)).toBe(true);
    expect(siteKeys(readFileSync(realConfig, 'utf8'))).toHaveLength(2);
  });
});
