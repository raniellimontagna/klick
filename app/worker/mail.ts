// O e-mail com o código (spec 7.4): só o código, a validade e "se não foi você, ignore", em texto simples com uma versão HTML mínima. Envio
// pelo Resend. Nos testes, um carteiro falso; no ponta a ponta local, a caixa do E2E_MAILBOX.

// Uma falha de sendCode vai para o log só pelo nome do erro e, se houver, o status HTTP (auth.ts): nunca o e-mail nem o código (spec 8.5).
export interface Mailer {
  sendCode(email: string, code: string): Promise<void>;
}

export function codeEmail(code: string): { subject: string; text: string; html: string } {
  return {
    subject: `Seu código do Klick: ${code}`,
    text: `Seu código para entrar no Klick: ${code}\n\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.\n`,
    html:
      '<p>Seu código para entrar no Klick:</p>' +
      `<p style="font-size:24px;font-weight:600;letter-spacing:4px">${code}</p>` +
      '<p>Ele vale por 10 minutos.</p><p>Se não foi você, ignore este e-mail.</p>',
  };
}

// O fetch, trocável nos testes: nada sai da máquina.
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

// Um erro do Resend vira uma exceção com um nome fixo e o status HTTP; a resposta dele, que pode trazer o destinatário, não é lida.
export function resendMailer(apiKey: string, from: string, fetcher: FetchLike = (i, o) => fetch(i, o)): Mailer {
  return {
    async sendCode(email, code) {
      const message = codeEmail(code);
      const res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!res.ok) throw Object.assign(new Error(`resend ${res.status}`), { name: 'ResendFailed', status: res.status });
    },
  };
}

// A caixa do ponta a ponta local: o último código de cada e-mail. Só existe com E2E_MAILBOX=true (o router recusa o resto).
export const e2eMailbox = new Map<string, string>();
export const e2eMailer: Mailer = {
  async sendCode(email, code) {
    e2eMailbox.set(email.toLowerCase(), code);
  },
};

export const missingMailer: Mailer = {
  async sendCode() {
    const err = new Error('mail-not-configured');
    err.name = 'MailNotConfigured';
    throw err;
  },
};
