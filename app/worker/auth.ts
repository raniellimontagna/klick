// O login (spec 7): o Better Auth com as tabelas no D1, o código por e-mail (6 dígitos, 10 minutos, 5 tentativas, guardado em hash) e a
// passkey. Um por pedido: o env e o ctx são do pedido.
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';
import type { Env } from './env';
import type { Mailer } from './mail';

export const SESSION_DAYS = 90; // spec 7.3; renova com o uso (updateAge)

// O log do Better Auth (spec 8.5: nunca e-mail nem código nos logs). O padrão da biblioteca escreve a mensagem e os argumentos inteiros no
// console, e daí nos Workers Logs: o objeto de um erro interno (o do banco, que pode citar um valor), o de uma tarefa em segundo plano, e
// mensagens com o e-mail (o cadastro por senha avisa "Sign-up attempt for existing email: ..."; a rota está fechada no router, mas uma
// versão nova pode abrir outra). Este guarda só o nível, a mensagem sem e-mail e sem código de 6 dígitos, e de cada erro o nome e o status.
const EMAIL = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+/g;
const CODE = /\b\d{6}\b/g;
const redact = (text: string): string => text.replace(EMAIL, '[e-mail]').replace(CODE, '[código]').slice(0, 200);
function errorOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('name' in value)) return null;
  const { name, status, statusCode } = value as { name?: unknown; status?: unknown; statusCode?: unknown };
  if (typeof name !== 'string' || !/^\w{1,60}$/.test(name)) return null;
  const parts = [name];
  if (typeof status === 'string' && /^[A-Z_]{1,40}$/.test(status)) parts.push(status);
  for (const code of [status, statusCode]) if (Number.isInteger(code)) parts.push(String(code));
  return parts.join(' ');
}
export function authLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  const errors = args.map(errorOf).filter((e): e is string => e !== null);
  const entry = JSON.stringify({ evt: 'auth-log', level, message: redact(String(message)), ...(errors.length > 0 ? { errors } : {}) });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

// Sem o segredo, o Better Auth assina sessões e tokens com uma constante pública (ele só recusa com NODE_ENV=production, que o workerd
// não define). O router responde 503 antes de chegar aqui; createAuth recusa também, por garantia.
export const authSecretOk = (env: Env): boolean => typeof env.BETTER_AUTH_SECRET === 'string' && env.BETTER_AUTH_SECRET.length >= 32;

export function createAuth(env: Env, ctx: ExecutionContext, mailer: Mailer) {
  if (!authSecretOk(env)) throw new Error('auth-secret-missing');
  const origin = env.APP_ORIGIN;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    basePath: '/api/auth',
    trustedOrigins: [origin],
    telemetry: { enabled: false },
    logger: { level: 'warn', log: authLog },
    rateLimit: { enabled: false }, // os limites são os de abuse.ts, no D1: o do Better Auth fica em memória, por isolate
    session: { expiresIn: SESSION_DAYS * 86_400, updateAge: 86_400 },
    advanced: {
      useSecureCookies: origin.startsWith('https://'),
      // A sessão não guarda o IP (spec 10): o Better Auth o gravaria em claro por 90 dias, e nada o usa. Os limites de abuse.ts leem o IP
      // do pedido, e o limite do Better Auth está desligado.
      ipAddress: { disableIpTracking: true },
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        // Sem esperar o envio (a resposta não denuncia nada pelo tempo); o waitUntil segura o Worker até o e-mail sair. O log leva só o nome
        // do erro e, se houver, o status HTTP: a mensagem de um serviço de e-mail pode trazer o destinatário.
        async sendVerificationOTP({ email, otp }) {
          const failed = (err: unknown) => {
            const status = (err as { status?: unknown } | null)?.status;
            const entry = { evt: 'mail-failed', error: err instanceof Error ? err.name : 'unknown', ...(typeof status === 'number' ? { status } : {}) };
            console.error(JSON.stringify(entry));
          };
          ctx.waitUntil(mailer.sendCode(email, otp).catch(failed));
        },
      }),
      passkey({ rpID: new URL(origin).hostname, rpName: 'Klick', origin }),
    ],
  });
}

export interface User {
  id: string;
  email: string;
}

export async function sessionUser(request: Request, env: Env, ctx: ExecutionContext, mailer: Mailer): Promise<User | null> {
  const session = await createAuth(env, ctx, mailer).api.getSession({ headers: request.headers });
  return session ? { id: session.user.id, email: session.user.email } : null;
}
