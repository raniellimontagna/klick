// O e-mail com o código (spec 7.4, visual na spec 4 do "visual da conta"): o código, a validade e "se não foi você, ignore". Vai em texto puro
// (é o que o iPhone e os clientes leem para sugerir o código) mais um HTML de e-mail de verdade: tabelas e estilos inline, sem imagem, fonte da web,
// script nem link. Envio pelo Resend. Nos testes, um carteiro falso; no ponta a ponta local, a caixa do E2E_MAILBOX.

// Uma falha de sendCode vai para o log só pelo nome do erro e, se houver, o status HTTP (auth.ts): nunca o e-mail nem o código (spec 8.5).
export interface Mailer {
  sendCode(email: string, code: string): Promise<void>;
}

// As cores do app (tema claro, tokens.css): o e-mail é sempre claro, porque cliente nenhum lê os tokens.
const PAPER = '#f3f0e9';
const SURFACE = '#fbfaf7';
const INK = '#17171a';
const MUTED = '#6f6a60';
const RED = '#d93d42';
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Uma peça colorida: célula de tabela, no lugar de imagem. O bgcolor é para o Outlook, que ignora o background do style.
function cell(attr: string, size: [number, number], radius: number, color: string, content: string, extra = ''): string {
  const [w, h] = size;
  return (
    `<td ${attr} style="width:${w}px;height:${h}px;border-radius:${radius}px;background-color:${color};${extra}" ` +
    `width="${w}" height="${h}" bgcolor="${color}" align="center">${content}</td>`
  );
}

const gap = (px: number) => `<td width="${px}" style="width:${px}px;font-size:0;line-height:0">&nbsp;</td>`;

// O cubo do logo: grade 3×3 (14 px, cantos 4 px, vão 3 px), o centro vermelho.
function cubeTable(): string {
  const piece = (i: number) =>
    cell(`data-cube-piece="${i}"`, [14, 14], 4, i === 4 ? RED : INK, '&nbsp;', 'font-size:0;line-height:0;');
  const row = (a: number) => `<tr>${piece(a)}${gap(3)}${piece(a + 1)}${gap(3)}${piece(a + 2)}</tr>`;
  const spacer = '<tr><td height="3" colspan="5" style="height:3px;font-size:0;line-height:0">&nbsp;</td></tr>';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate">${row(0)}${spacer}${row(3)}${spacer}${row(6)}</table>`;
}

// As seis peças do código, em dois grupos de três; a quinta (a do meio do segundo grupo) é vermelha, como o centro do cubo.
function digitsTable(code: string): string {
  const piece = (d: string, i: number) =>
    cell(
      `data-digit="${escapeHtml(d)}"`,
      [40, 48],
      10,
      i === 4 ? RED : INK,
      escapeHtml(d),
      `color:${SURFACE};font-family:${MONO};font-size:26px;font-weight:700;line-height:48px;text-align:center;`,
    );
  const cells = [...code].map((d, i) => piece(d, i));
  const between = (i: number) => (i === 0 ? '' : i === 3 ? gap(12) : gap(6));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate"><tr>${cells.map((c, i) => between(i) + c).join('')}</tr></table>`;
}

export function codeEmail(code: string): { subject: string; text: string; html: string } {
  const line = (size: number, color: string, extra = '') =>
    `font-family:${SANS};font-size:${size}px;color:${color};text-align:center;${extra}`;
  return {
    subject: `Seu código do Klick: ${code}`,
    text: `Seu código para entrar no Klick: ${code}\n\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.\n`,
    html:
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
      '<title>Seu código do Klick</title></head>' +
      `<body style="margin:0;padding:0;background-color:${PAPER}" bgcolor="${PAPER}">` +
      // O pré-cabeçalho: o que a lista de e-mails mostra ao lado do assunto. Escondido no corpo.
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px">Vale por 10 minutos.</div>' +
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER}"><tr><td align="center" style="padding:28px 18px">` +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px"><tr><td align="center">' +
      `<div aria-hidden="true" style="padding-bottom:14px">${cubeTable()}</div>` +
      `<div style="${line(20, INK, 'font-weight:700;letter-spacing:-0.3px;line-height:26px;padding-bottom:4px')}">Seu código do Klick</div>` +
      `<div style="${line(13, MUTED, 'line-height:18px;padding-bottom:20px')}">Vale por 10 minutos.</div>` +
      `<div aria-hidden="true">${digitsTable(code)}</div>` +
      `<div style="font-family:${MONO};font-size:12px;letter-spacing:1px;color:${MUTED};text-align:center;line-height:18px;padding-top:16px">Código: ${escapeHtml(code)}</div>` +
      `<div style="${line(11, MUTED, 'line-height:17px;padding-top:22px')}">Se não foi você, ignore este e-mail.</div>` +
      `<div style="${line(11, MUTED, 'line-height:17px')}">Klick · timer de cubo mágico</div>` +
      '</td></tr></table></td></tr></table></body></html>',
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
