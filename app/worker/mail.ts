// O e-mail com o código (spec 7.4): só o código, a validade e "se não foi você, ignore", em texto simples com uma versão HTML mínima. Nos
// testes, um carteiro falso; no ponta a ponta local, a caixa do E2E_MAILBOX; o envio de verdade (Resend) entra com a conta dele.

// O erro de sendCode vai para o log (auth.ts): a mensagem não leva o e-mail nem o código (spec 8.5).
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

// A caixa do ponta a ponta local: o último código de cada e-mail. Só existe com E2E_MAILBOX=true (o router recusa o resto).
export const e2eMailbox = new Map<string, string>();
export const e2eMailer: Mailer = {
  async sendCode(email, code) {
    e2eMailbox.set(email.toLowerCase(), code);
  },
};

export const missingMailer: Mailer = {
  async sendCode() {
    throw new Error('mail-not-configured');
  },
};
