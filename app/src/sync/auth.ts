// O login (spec 7): o cliente do Better Auth, carregado só quando a pessoa mexe na conta (fica fora do código da abertura). O resto do app
// fala com AuthClientLike, e os testes passam um falso. Só as rotas que o Worker deixa passar (worker/router.ts): pedir e conferir o
// código, a sessão (get-session), sair, sair de todos os aparelhos e as da passkey. Nenhum método lança: a falha vira o resultado dele.
import { CAPTCHA_HEADER } from '../core/sync/types';

export interface AuthUser {
  id: string;
  email: string;
}

// 'limited': o limite de pedidos (429); 'mail-cap': o teto de e-mails do dia ou do mês (429 MAIL_CAP); 'captcha': o Turnstile recusou o
// token (403 CAPTCHA, worker/abuse.ts). Os três têm mensagem própria.
export type SendResult = 'sent' | 'limited' | 'mail-cap' | 'captcha' | 'failed';
export type VerifyResult = { ok: true; user: AuthUser } | { ok: false; reason: 'bad-code' | 'expired' | 'too-many' | 'failed' };

export interface PasskeyInfo {
  id: string;
  name: string | null;
  createdAt: number;
}

export interface AuthClientLike {
  sendCode(email: string, captchaToken: string): Promise<SendResult>; // o código de 6 dígitos por e-mail (spec 7.2)
  verifyCode(email: string, code: string): Promise<VerifyResult>;
  passkeySignIn(): Promise<AuthUser | null>; // null: cancelado ou sem passkey neste aparelho
  addPasskey(): Promise<boolean>;
  listPasskeys(): Promise<PasskeyInfo[]>; // sem resposta, a lista vazia
  removePasskey(id: string): Promise<boolean>;
  signOut(): Promise<boolean>; // false: o servidor não confirmou (sem rede, erro), e a sessão dele continua até expirar
  signOutEverywhere(): Promise<boolean>; // revoga todas as sessões da conta (spec 7.7)
  renewSession(): Promise<void>; // a sessão de 90 dias só renova o cookie por get-session (spec 7.3); a falha não muda nada
}

type Failure = { status?: number; code?: string } | null | undefined;

// OTP_DEVICE: o código foi pedido em outro aparelho (worker/abuse.ts, guardVerifyCode); a saída é a mesma do vencido, pedir outro aqui.
const verifyFailure = (error: Failure): VerifyResult => {
  const code = error?.code;
  const reason = code === 'INVALID_OTP' ? 'bad-code' : code === 'OTP_EXPIRED' || code === 'OTP_DEVICE' ? 'expired' : code === 'TOO_MANY_ATTEMPTS' ? 'too-many' : 'failed';
  return { ok: false, reason };
};

// Os códigos que o guarda do Worker devolve no pedido do código (worker/abuse.ts).
const sendFailure = (error: Failure): SendResult => {
  if (error?.status === 429) return error.code === 'MAIL_CAP' ? 'mail-cap' : 'limited';
  if (error?.status === 403 && error.code === 'CAPTCHA') return 'captcha';
  return 'failed';
};

const userOf = (data: unknown): AuthUser | null => {
  const user = (data as { user?: { id?: unknown; email?: unknown } } | null)?.user;
  return typeof user?.id === 'string' && typeof user.email === 'string' ? { id: user.id, email: user.email } : null;
};

export async function loadAuthClient(): Promise<AuthClientLike> {
  const [{ createAuthClient }, { emailOTPClient }, { passkeyClient }] = await Promise.all([
    import('better-auth/client'),
    import('better-auth/client/plugins'),
    import('@better-auth/passkey/client'),
  ]);
  // Sem pedir a sessão sozinho ao voltar à janela: o app pede uma vez ao abrir (renewSession), e os outros pedidos saem da pessoa.
  const client = createAuthClient({
    basePath: '/api/auth',
    plugins: [emailOTPClient(), passkeyClient()],
    sessionOptions: { refetchOnWindowFocus: false },
  });
  return {
    async sendCode(email, captchaToken) {
      try {
        const { error } = await client.emailOtp.sendVerificationOtp({ email, type: 'sign-in', fetchOptions: { headers: { [CAPTCHA_HEADER]: captchaToken } } });
        return error ? sendFailure(error) : 'sent';
      } catch {
        return 'failed';
      }
    },
    async verifyCode(email, code) {
      try {
        const { data, error } = await client.signIn.emailOtp({ email, otp: code });
        const user = userOf(data);
        return !error && user ? { ok: true, user } : verifyFailure(error);
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
    // generate-authenticate-options e verify-authentication (o Worker não abre /sign-in/passkey).
    async passkeySignIn() {
      try {
        const { data, error } = await client.signIn.passkey();
        if (error) return null;
        return userOf(data) ?? userOf((await client.getSession()).data);
      } catch {
        return null;
      }
    },
    async addPasskey() {
      try {
        const result = await client.passkey.addPasskey({ name: 'Klick' });
        return !result?.error;
      } catch {
        return false;
      }
    },
    async listPasskeys() {
      try {
        const { data } = await client.passkey.listUserPasskeys();
        const list: { id: string; name?: string | null; createdAt: Date | string }[] = Array.isArray(data) ? data : [];
        return list.map((p) => ({ id: p.id, name: p.name ?? null, createdAt: new Date(p.createdAt).getTime() }));
      } catch {
        return [];
      }
    },
    async removePasskey(id) {
      try {
        const { error } = await client.passkey.deletePasskey({ id });
        return !error;
      } catch {
        return false;
      }
    },
    async signOut() {
      try {
        const { error } = await client.signOut();
        return !error;
      } catch {
        return false; // sem rede: a sessão daqui acaba mesmo assim, mas a do servidor (e o cookie) continua até expirar
      }
    },
    async signOutEverywhere() {
      try {
        const { error } = await client.revokeSessions();
        return !error;
      } catch {
        return false;
      }
    },
    async renewSession() {
      try {
        await client.getSession();
      } catch {
        // sem rede: a sessão continua até expirar, e a próxima abertura renova
      }
    },
  };
}
