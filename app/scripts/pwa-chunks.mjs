// Os pedaços do login (a revisão final, M4). O cliente do Better Auth, o da passkey e o que eles dividem só carregam quando alguém abre o
// fluxo de entrar (src/sync/auth.ts, import dinâmico); no pré-cache do service worker, todo mundo baixaria uns 70 KB a cada versão, também
// quem nunca entra. O nome que o bundler dá a esses pedaços ("client", "plugins", "config") não diz de onde eles vêm: o vite.config.ts os
// nomeia pelos módulos que eles têm, com o prefixo "auth-", e o pré-cache deixa esse prefixo de fora (AUTH_CHUNKS).

// Os pacotes do login no navegador: o Better Auth e o que só ele usa (better-call, better-fetch, nanostores, defu) e o SimpleWebAuthn da
// passkey. Um deles que o app passe a usar no código da abertura cai num pedaço com módulos do app, e esse fica no pré-cache.
const AUTH_PACKAGES = /\/node_modules\/(?:better-auth|@better-auth\/[^/]+|better-call|@better-fetch\/[^/]+|nanostores|@nanostores\/[^/]+|defu|@simplewebauthn\/[^/]+)\//;

export const AUTH_CHUNKS = '**/assets/auth-*.js';

/**
 * Um pedaço é do login quando todos os módulos dele (fora os virtuais do bundler) são desses pacotes. Um módulo do app, ou de outro pacote,
 * deixa o pedaço no pré-cache: na dúvida, ele fica.
 * @param {readonly string[]} moduleIds
 * @returns {boolean}
 */
export function isAuthChunk(moduleIds) {
  const real = moduleIds.filter((id) => !id.startsWith('\0'));
  return real.length > 0 && real.every((id) => AUTH_PACKAGES.test(id.replaceAll('\\', '/')));
}

/**
 * O nome do arquivo de um pedaço (build.rolldownOptions.output.chunkFileNames): o mesmo padrão do Vite, com "auth-" na frente dos do login.
 * @param {{ moduleIds: readonly string[] }} chunk
 * @returns {string}
 */
export function chunkFileName(chunk) {
  return isAuthChunk(chunk.moduleIds) ? 'assets/auth-[name]-[hash].js' : 'assets/[name]-[hash].js';
}
